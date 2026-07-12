import { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import { createRenderStats } from '#rendering/RenderStats';
import { WebGl2RetainedGroupResources } from '#rendering/webgl2/WebGl2RetainedGroupResources';

import { createFakeWebGl2Context, GlRecorder } from '../perf/rendering/fakeWebGl2';

const wordsOf = (...values: number[]): Uint32Array => Uint32Array.from(values);

describe('WebGl2RetainedGroupResources: CPU-side capture store (Task 6)', () => {
  test('appended batch words land at sequential byte offsets and are copied, not aliased', () => {
    const bundle = new WebGl2RetainedGroupResources();

    bundle._beginCapture();

    const source = wordsOf(1, 2, 3);
    const offsetA = bundle._appendInstanceWords(source);
    const offsetB = bundle._appendInstanceWords(wordsOf(4, 5));

    expect(offsetA).toBe(0);
    expect(offsetB).toBe(12); // 3 words * 4 bytes
    expect(bundle.usedWords).toBe(5);
    expect(Array.from(bundle.instanceWords.subarray(0, 5))).toEqual([1, 2, 3, 4, 5]);

    // Copied: mutating the source after the append must not change the store.
    source[0] = 99;

    expect(bundle.instanceWords[0]).toBe(1);

    bundle.destroy();
  });

  test('instance store growth preserves previously appended words', () => {
    const bundle = new WebGl2RetainedGroupResources();

    bundle._beginCapture();
    bundle._appendInstanceWords(wordsOf(7, 8, 9));

    // Force growth beyond the initial capacity.
    bundle._appendInstanceWords(new Uint32Array(4096).fill(1));

    expect(Array.from(bundle.instanceWords.subarray(0, 3))).toEqual([7, 8, 9]);
    expect(bundle.usedWords).toBe(3 + 4096);

    bundle.destroy();
  });

  test('every capture rewrite bumps the generation and resets the write cursor (S3-D3)', () => {
    const bundle = new WebGl2RetainedGroupResources();
    const initial = bundle.generation;

    bundle._beginCapture();
    bundle._appendInstanceWords(wordsOf(1, 2));

    expect(bundle.generation).toBe(initial + 1);

    bundle._beginCapture();

    expect(bundle.generation).toBe(initial + 2);
    expect(bundle.usedWords).toBe(0);

    bundle.destroy();
  });

  test('transform rows copy rebased to row 0; texture is reused below capacity and recreated on growth', () => {
    const bundle = new WebGl2RetainedGroupResources();
    // Shared-buffer layout: 12 floats per row. Rows 2..3 carry markers.
    const shared = new Float32Array(8 * 12);

    shared[2 * 12] = 42; // row 2, float 0
    shared[3 * 12 + 5] = 7; // row 3, float 5 (translation y)

    bundle._beginCapture();
    bundle._storeTransformRows(shared, 2, 2);

    const texture = bundle.transformTexture;

    expect(texture).not.toBeNull();
    expect(bundle.transformRowCount).toBe(2);
    expect(texture!.buffer[0]).toBe(42); // row 2 rebased to row 0
    expect(texture!.buffer[12 + 5]).toBe(7); // row 3 rebased to row 1

    // Same capacity class: the texture object is reused.
    bundle._beginCapture();
    bundle._storeTransformRows(shared, 0, 4);

    expect(bundle.transformTexture).toBe(texture);

    // Growth past capacity recreates the texture (its buffer is fixed-size).
    const bigShared = new Float32Array(64 * 12);

    bundle._beginCapture();
    bundle._storeTransformRows(bigShared, 0, 64);

    expect(bundle.transformTexture).not.toBe(texture);
    expect(bundle.transformTexture!.height).toBeGreaterThanOrEqual(64);

    bundle.destroy();
  });
});

describe('WebGl2RetainedGroupResources: device resources (Task 6)', () => {
  const createDevice = () => {
    const recorder = new GlRecorder();
    const gl = createFakeWebGl2Context(recorder);
    const stats = createRenderStats();
    const accountant = new GpuResourceAccountant(stats);

    return { recorder, gl, stats, accountant };
  };

  test('instance upload creates the persistent buffer once and books it with the accountant (S3-D9)', () => {
    const { recorder, gl, stats, accountant } = createDevice();
    const bundle = new WebGl2RetainedGroupResources();

    bundle._beginCapture();
    bundle._appendInstanceWords(new Uint32Array(16).fill(3)); // two 8-word instances
    bundle._connectDevice(gl, accountant);
    bundle._uploadInstances();

    expect(bundle.instanceBuffer).not.toBeNull();
    expect(recorder.bufferReallocations).toBe(1);
    expect(recorder.bufferUploadBytes).toBe(16 * 4);
    expect(stats.gpuMemoryBytes).toBe(16 * 4);

    // Recapture with fewer words: in-place update, storage stays booked at the high-water mark.
    const buffer = bundle.instanceBuffer;

    bundle._beginCapture();
    bundle._appendInstanceWords(new Uint32Array(8).fill(4));
    bundle._uploadInstances();

    expect(bundle.instanceBuffer).toBe(buffer);
    expect(recorder.bufferSubUpdates).toBe(1);
    expect(stats.gpuMemoryBytes).toBe(16 * 4);

    bundle.destroy();

    expect(stats.gpuMemoryBytes).toBe(0);
  });

  test('per-batch VAOs pool grow-only and are cleared for reconfiguration on reuse', () => {
    const { gl, accountant } = createDevice();
    const bundle = new WebGl2RetainedGroupResources();

    bundle._connectDevice(gl, accountant);

    const first = bundle._acquireVao(0);
    const second = bundle._acquireVao(1);

    expect(second).not.toBe(first);

    // Reused across recaptures: same object, attributes cleared.
    const reused = bundle._acquireVao(0);

    expect(reused).toBe(first);
    expect(reused.attributes).toHaveLength(0);

    bundle.destroy();
  });

  test('device invalidation (context restore) bumps the generation and frees every device resource', () => {
    const { gl, stats, accountant } = createDevice();
    const bundle = new WebGl2RetainedGroupResources();

    bundle._beginCapture();
    bundle._appendInstanceWords(new Uint32Array(9).fill(1));
    bundle._storeTransformRows(new Float32Array(4 * 12), 0, 4);
    bundle._connectDevice(gl, accountant);
    bundle._uploadInstances();
    bundle._acquireVao(0);

    const generation = bundle.generation;

    bundle._invalidateDeviceResources();

    expect(bundle.generation).toBe(generation + 1);
    expect(bundle.instanceBuffer).toBeNull();
    expect(bundle.transformTexture).toBeNull();
    expect(stats.gpuMemoryBytes).toBe(0);

    bundle.destroy();
  });

  test('destroy is idempotent and reports back exactly once', () => {
    const onDestroyed = vi.fn();
    const bundle = new WebGl2RetainedGroupResources(onDestroyed);

    bundle.destroy();
    bundle.destroy();

    expect(onDestroyed).toHaveBeenCalledTimes(1);
    expect(onDestroyed).toHaveBeenCalledWith(bundle);
  });
});
