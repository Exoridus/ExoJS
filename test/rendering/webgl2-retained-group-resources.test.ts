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

describe('WebGl2RetainedGroupResources: in-place transform-row patch (Slice 4b)', () => {
  test('_storeTransformRows records the rebase base; patch overwrites one row and marks only its sub-range dirty', () => {
    const bundle = new WebGl2RetainedGroupResources();
    const shared = new Float32Array(8 * 12);

    shared[2 * 12 + 4] = 10; // row 2 -> local 0: tx
    shared[3 * 12 + 4] = 60; // row 3 -> local 1: tx

    bundle._beginCapture();
    bundle._storeTransformRows(shared, 2, 2);

    // The rebase base (range.min) is retained so a later patch can map a
    // shared/captured node index back to its group-local row.
    expect(bundle.transformRowBase).toBe(2);

    // Drain the store-time full-region dirty flag (the first bind consumes it).
    bundle.transformTexture!._consumeDirtyRegion();

    const patched = new Float32Array(12);

    patched[4] = 80; // new tx for the moved child

    bundle._patchTransformRow(1, patched);

    // The CPU store reflects the new row without touching its neighbour.
    expect(bundle.transformTexture!.buffer[1 * 12 + 4]).toBe(80);
    expect(bundle.transformTexture!.buffer[0 * 12 + 4]).toBe(10);

    // Only row 1 is marked for upload — the headline O(k) sub-range property.
    const region = bundle.transformTexture!._consumeDirtyRegion();

    expect(region).not.toBeNull();
    expect({ x: region!.x, y: region!.y, width: region!.width, height: region!.height }).toEqual({ x: 0, y: 1, width: 3, height: 1 });
  });

  test('a patch does NOT bump the generation (recorded instance bytes stay valid)', () => {
    const bundle = new WebGl2RetainedGroupResources();

    bundle._beginCapture();
    bundle._storeTransformRows(new Float32Array(4 * 12), 0, 4);

    const generation = bundle.generation;

    bundle._patchTransformRow(2, new Float32Array(12));

    expect(bundle.generation).toBe(generation);
  });

  test('patching multiple rows unions their sub-range for a single upload', () => {
    const bundle = new WebGl2RetainedGroupResources();

    bundle._beginCapture();
    bundle._storeTransformRows(new Float32Array(8 * 12), 0, 8);
    bundle.transformTexture!._consumeDirtyRegion();

    bundle._patchTransformRow(2, new Float32Array(12));
    bundle._patchTransformRow(5, new Float32Array(12));

    const region = bundle.transformTexture!._consumeDirtyRegion();

    expect({ y: region!.y, height: region!.height }).toEqual({ y: 2, height: 4 }); // rows 2..5

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
