/**
 * WebGPU partial `DataTexture` upload packing-buffer reuse.
 *
 * A partial upload has to pack the dirty sub-region out of the row-major
 * texture buffer into a contiguous array before `queue.writeTexture` can read
 * it. Allocating that packing array per sync turns every flush of a
 * barrier-heavy scene (transform + tint textures sync once per flush) into
 * fresh CPU garbage - the exact class of garbage the WebGL2 backend already
 * eliminates with a grow-only per-texture scratch.
 *
 * These tests drive the REAL `WebGpuBackend._syncTexture` against the mock
 * device and inspect the `data` view handed to `queue.writeTexture`, so they
 * assert allocation behaviour directly instead of relying on WebGPU error
 * scopes (which misreport across multiple flushes).
 */

import { DataTexture } from '#rendering/texture/DataTexture';
import type { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createMockBackend, createMockWebGpuEnvironment, type MockWebGpuEnvironment } from './webgpuMockEnvironment';

/** `_syncTexture` is the backend-internal upload entry point exercised here. */
const syncTexture = (backend: WebGpuBackend, texture: Texture): void => {
  (backend as unknown as { _syncTexture(target: Texture): unknown })._syncTexture(texture);
};

/** Distinct backing `ArrayBuffer`s behind the recorded `writeTexture` views. */
const distinctBuffers = (views: readonly ArrayBufferView[]): number => new Set(views.map(view => view.buffer)).size;

describe('WebGPU partial DataTexture upload: packing scratch reuse', () => {
  let environment: MockWebGpuEnvironment;
  let backend: WebGpuBackend;

  beforeEach(async () => {
    environment = createMockWebGpuEnvironment();
    backend = await createMockBackend(environment);
  });

  afterEach(() => {
    backend.destroy();
    environment.restore();
  });

  test('repeated same-size partial uploads reuse one packing buffer', () => {
    const texture = new DataTexture({ width: 64, height: 64, format: TextureFormat.Rgba32F });

    // First sync uploads the whole buffer (nothing packed yet).
    syncTexture(backend, texture);

    const fullUploadCount = environment.writeTextureData().length;

    for (let row = 0; row < 8; row++) {
      texture.commitRect(0, row, 16, 1);
      syncTexture(backend, texture);
    }

    const partialViews = environment.writeTextureData().slice(fullUploadCount);

    expect(partialViews).toHaveLength(8);
    expect(distinctBuffers(partialViews)).toBe(1);
  });

  test('the packing buffer is not the texture buffer itself', () => {
    const texture = new DataTexture({ width: 32, height: 32, format: TextureFormat.Rgba8 });

    syncTexture(backend, texture);

    const fullUploadCount = environment.writeTextureData().length;

    texture.commitRect(4, 4, 8, 8);
    syncTexture(backend, texture);

    const [packed] = environment.writeTextureData().slice(fullUploadCount);

    expect(packed).toBeDefined();
    expect(packed!.buffer).not.toBe(texture.buffer.buffer);
  });

  test('a shrinking region keeps the grown packing buffer instead of reallocating', () => {
    const texture = new DataTexture({ width: 64, height: 64, format: TextureFormat.R32F });

    syncTexture(backend, texture);

    const fullUploadCount = environment.writeTextureData().length;

    texture.commitRect(0, 0, 32, 32);
    syncTexture(backend, texture);
    texture.commitRect(0, 0, 4, 4);
    syncTexture(backend, texture);
    texture.commitRect(0, 0, 2, 2);
    syncTexture(backend, texture);

    const partialViews = environment.writeTextureData().slice(fullUploadCount);

    expect(partialViews).toHaveLength(3);
    expect(distinctBuffers(partialViews)).toBe(1);
    // The view is still sized to the region actually uploaded, not to the
    // grown scratch - `writeTexture` must not read past the packed region.
    expect(partialViews[2]!.byteLength).toBe(2 * 2 * Float32Array.BYTES_PER_ELEMENT);
  });

  test('two DataTextures synced in alternation keep independent packing buffers', () => {
    const first = new DataTexture({ width: 32, height: 32, format: TextureFormat.Rgba32F });
    const second = new DataTexture({ width: 32, height: 32, format: TextureFormat.Rgba32F });

    syncTexture(backend, first);
    syncTexture(backend, second);

    const fullUploadCount = environment.writeTextureData().length;

    for (let row = 0; row < 4; row++) {
      first.commitRect(0, row, 8, 1);
      syncTexture(backend, first);
      second.commitRect(0, row, 8, 1);
      syncTexture(backend, second);
    }

    const partialViews = environment.writeTextureData().slice(fullUploadCount);

    expect(partialViews).toHaveLength(8);
    // One scratch per texture - never a single shared buffer both would race
    // over, and never a fresh allocation per sync.
    expect(distinctBuffers(partialViews)).toBe(2);
  });

  test('a steady-state region size reuses one view object, not just one buffer', () => {
    const texture = new DataTexture({ width: 64, height: 64, format: TextureFormat.R32F });

    syncTexture(backend, texture);

    const fullUploadCount = environment.writeTextureData().length;

    // Grow the scratch first, so every later upload is served by a view over an
    // over-sized buffer rather than by the buffer itself.
    texture.commitRect(0, 0, 32, 32);
    syncTexture(backend, texture);

    for (let row = 0; row < 4; row++) {
      texture.commitRect(0, row, 8, 1);
      syncTexture(backend, texture);
    }

    const steadyViews = environment.writeTextureData().slice(fullUploadCount + 1);

    expect(steadyViews).toHaveLength(4);
    expect(new Set(steadyViews).size).toBe(1);
    expect(steadyViews[0]!.byteLength).toBe(8 * Float32Array.BYTES_PER_ELEMENT);
  });

  test('a region size change swaps the cached view without touching the grown buffer', () => {
    const texture = new DataTexture({ width: 64, height: 64, format: TextureFormat.R32F });

    syncTexture(backend, texture);

    const fullUploadCount = environment.writeTextureData().length;

    texture.commitRect(0, 0, 32, 32);
    syncTexture(backend, texture);
    texture.commitRect(0, 0, 8, 1);
    syncTexture(backend, texture);
    texture.commitRect(0, 0, 4, 1);
    syncTexture(backend, texture);

    const [, small, smaller] = environment.writeTextureData().slice(fullUploadCount);

    expect(small).not.toBe(smaller);
    expect(small!.buffer).toBe(smaller!.buffer);
    expect(smaller!.byteLength).toBe(4 * Float32Array.BYTES_PER_ELEMENT);
  });

  test('the packed bytes still carry the correct sub-region contents', () => {
    const texture = new DataTexture({ width: 4, height: 4, format: TextureFormat.R8 });

    for (let index = 0; index < texture.buffer.length; index++) {
      texture.buffer[index] = index;
    }

    syncTexture(backend, texture);

    const fullUploadCount = environment.writeTextureData().length;

    // Rows 1..2, columns 1..2 → source indices 5, 6, 9, 10.
    texture.commitRect(1, 1, 2, 2);
    syncTexture(backend, texture);

    const packed = environment.writeTextureData()[fullUploadCount] as Uint8Array | undefined;

    expect(packed).toBeDefined();
    expect(Array.from(packed!)).toEqual([5, 6, 9, 10]);
  });
});

/**
 * A dirty region spanning the full texture width is already contiguous and
 * tightly packed in the row-major buffer, so packing it into the scratch is a
 * pure memcpy with no effect on the bytes `writeTexture` reads. WebGL2 has
 * recognised this since the partial path was introduced; WebGPU packed every
 * region alike, which made a scrolling ring-buffer upload - the shape the
 * transform/tint rows and a spectrogram both take - pay a full copy of the
 * band per sync for nothing.
 */
describe('WebGPU partial DataTexture upload: full-width fast path', () => {
  let environment: MockWebGpuEnvironment;
  let backend: WebGpuBackend;

  beforeEach(async () => {
    environment = createMockWebGpuEnvironment();
    backend = await createMockBackend(environment);
  });

  afterEach(() => {
    backend.destroy();
    environment.restore();
  });

  test('a full-width band is uploaded straight from the texture buffer, without packing', () => {
    const texture = new DataTexture({ width: 8, height: 8, format: TextureFormat.R32F });

    syncTexture(backend, texture);

    const fullUploadCount = environment.writeTextureData().length;

    texture.commitRect(0, 3, 8, 2);
    syncTexture(backend, texture);

    const [band] = environment.writeTextureData().slice(fullUploadCount);

    expect(band).toBeDefined();
    expect(band!.buffer).toBe(texture.buffer.buffer);
    expect(band!.byteOffset).toBe(3 * 8 * Float32Array.BYTES_PER_ELEMENT);
    expect(band!.byteLength).toBe(2 * 8 * Float32Array.BYTES_PER_ELEMENT);
  });

  test('the uploaded band carries exactly the rows it covers', () => {
    const texture = new DataTexture({ width: 4, height: 4, format: TextureFormat.R8 });

    for (let index = 0; index < texture.buffer.length; index++) {
      texture.buffer[index] = index;
    }

    syncTexture(backend, texture);

    const fullUploadCount = environment.writeTextureData().length;

    // Rows 1..2 in full → source indices 4..11.
    texture.commitRect(0, 1, 4, 2);
    syncTexture(backend, texture);

    const band = environment.writeTextureData()[fullUploadCount] as Uint8Array | undefined;

    expect(band).toBeDefined();
    expect(Array.from(band!)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  });

  test('a band that keeps its position and size reuses one view object', () => {
    const texture = new DataTexture({ width: 8, height: 8, format: TextureFormat.Rgba32F });

    syncTexture(backend, texture);

    const fullUploadCount = environment.writeTextureData().length;

    for (let pass = 0; pass < 4; pass++) {
      texture.commitRect(0, 2, 8, 1);
      syncTexture(backend, texture);
    }

    const bands = environment.writeTextureData().slice(fullUploadCount);

    expect(bands).toHaveLength(4);
    expect(new Set(bands).size).toBe(1);
  });

  test('a band that moves mints a view at the new offset', () => {
    const texture = new DataTexture({ width: 8, height: 8, format: TextureFormat.R32F });

    syncTexture(backend, texture);

    const fullUploadCount = environment.writeTextureData().length;

    texture.commitRect(0, 1, 8, 1);
    syncTexture(backend, texture);
    texture.commitRect(0, 5, 8, 1);
    syncTexture(backend, texture);

    const [first, second] = environment.writeTextureData().slice(fullUploadCount);

    expect(first!.byteOffset).toBe(1 * 8 * Float32Array.BYTES_PER_ELEMENT);
    expect(second!.byteOffset).toBe(5 * 8 * Float32Array.BYTES_PER_ELEMENT);
  });

  test('a region narrower than the texture still goes through the packing scratch', () => {
    const texture = new DataTexture({ width: 8, height: 8, format: TextureFormat.R32F });

    syncTexture(backend, texture);

    const fullUploadCount = environment.writeTextureData().length;

    // Full-height but one column short - the rows are no longer contiguous.
    texture.commitRect(0, 0, 7, 8);
    syncTexture(backend, texture);

    const [packed] = environment.writeTextureData().slice(fullUploadCount);

    expect(packed).toBeDefined();
    expect(packed!.buffer).not.toBe(texture.buffer.buffer);
  });
});
