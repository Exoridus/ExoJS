/**
 * GPU byte accounting for every storage kind (R31): exact block-padded
 * totals for compressed textures - never a uniform bytes-per-pixel figure
 * multiplied by width * height, which undercounts a mip tail smaller than
 * one block - and exact booking/freeing for the depth/stencil attachment
 * WebGl2Backend/WebGpuBackend allocate outside the ordinary managed-texture
 * path. `GpuResourceAccountant` itself is deterministic and needs no GPU;
 * `WebGl2Backend` is driven for real against the recording fake context (see
 * `webgl2-compressed-texture.test.ts` for the same harness pattern), which
 * exercises the actual booking call sites rather than reimplementing their
 * arithmetic in the test.
 */
import { afterEach, describe, expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { Matrix } from '#math/Matrix';
import { Geometry } from '#rendering/geometry/Geometry';
import { estimateCompressedTextureBytes, GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import { createRenderStats } from '#rendering/RenderStats';
import { CompressedTexture } from '#rendering/texture/CompressedTexture';
import { compressedLevelByteLength, CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';
import { createWebGl2Harness, type WebGl2Harness } from '../perf/rendering/harness';
import { createMockBackend, createMockWebGpuEnvironment, type MockWebGpuEnvironment } from './webgpuMockEnvironment';

describe('estimateCompressedTextureBytes', () => {
  test('a mip tail smaller than one block reports the full block, not a fraction of it', () => {
    const format = CompressedTextureFormat.Bc1RgbaUnorm; // 4x4 blocks, 8 bytes/block

    // The old bug: bytesPerBlock / (blockWidth * blockHeight) * width * height
    // = 8 / 16 * 1 * 1 = 0.5 bytes for a 1x1 mip tail. The GPU still pads it
    // out to one whole block.
    expect(estimateCompressedTextureBytes(format, [{ width: 1, height: 1 }])).toBe(8);
  });

  test('a non-block-aligned level is padded up to whole blocks in both dimensions', () => {
    const format = CompressedTextureFormat.Bc7RgbaUnorm; // 4x4 blocks, 16 bytes/block

    // 5x5 texels needs a 2x2 block grid: ceil(5/4) = 2 in each dimension.
    // The fractional shortcut would report 5*5*(16/16) = 25, not 64.
    expect(estimateCompressedTextureBytes(format, [{ width: 5, height: 5 }])).toBe(2 * 2 * 16);
  });

  test('sums an exact mip chain the same way the real payload validator does', () => {
    const format = CompressedTextureFormat.Bc3RgbaUnorm; // 4x4 blocks, 16 bytes/block
    const levels = [
      { width: 16, height: 16 },
      { width: 8, height: 8 },
      { width: 4, height: 4 },
      { width: 2, height: 2 },
      { width: 1, height: 1 },
    ];

    const expected = levels.reduce((total, level) => total + compressedLevelByteLength(format, level.width, level.height), 0);

    expect(estimateCompressedTextureBytes(format, levels)).toBe(expected);
    // Every level below the 4x4 block size costs one full block: 16 bytes
    // each for the 4x4, 2x2 and 1x1 levels, plus 4 blocks for 8x8 and 16
    // blocks for 16x16.
    expect(expected).toBe(16 * 16 + 4 * 16 + 16 + 16 + 16);
  });
});

describe('GpuResourceAccountant', () => {
  test('repeated allocate/reallocate/free returns the tally to zero', () => {
    const accountant = new GpuResourceAccountant(createRenderStats());

    const first = accountant.reallocate(0, 1024);
    const second = accountant.reallocate(first, 4096);

    expect(accountant.liveBytes).toBe(4096);

    accountant.free(second);

    expect(accountant.liveBytes).toBe(0);
  });

  test('free is clamped at zero: a double-free or missed allocation cannot go negative', () => {
    const accountant = new GpuResourceAccountant(createRenderStats());

    accountant.allocate(100);
    accountant.free(100);
    accountant.free(100);

    expect(accountant.liveBytes).toBe(0);
  });

  test('resetLiveBytes drops the tally straight to zero, for the one case free() cannot reach', () => {
    const stats = createRenderStats();
    const accountant = new GpuResourceAccountant(stats);

    accountant.allocate(2048);
    accountant.resetLiveBytes();

    expect(accountant.liveBytes).toBe(0);
    expect(stats.gpuMemoryBytes).toBe(0);
  });
});

interface Harness {
  readonly backend: WebGl2Backend;
  destroy(): void;
}

const createHarness = (extensions: readonly string[] = []): Harness => {
  installFakeWebGl2Globals();

  const context = createFakeWebGl2Context(new GlRecorder());
  const supported = new Set(extensions);

  // The fake context is a Proxy with no `set` trap, so this lands on its
  // target and every backend call goes through the spy.
  (context as unknown as Record<string, unknown>)['getExtension'] = (name: string): object | null => (supported.has(name) ? {} : null);

  const app = {
    canvas: createFakeCanvas(64, 64, context),
    options: { canvas: { width: 64, height: 64 }, rendering: { debug: false } },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  return {
    backend,
    destroy(): void {
      backend.destroy();
    },
  };
};

const chain = (format: CompressedTextureFormat, width: number, height: number, count: number) =>
  Array.from({ length: count }, (_unused, index) => {
    const levelWidth = Math.max(width >> index, 1);
    const levelHeight = Math.max(height >> index, 1);

    return { data: new Uint8Array(compressedLevelByteLength(format, levelWidth, levelHeight)), width: levelWidth, height: levelHeight };
  });

const createTriangle = (): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, 8, 0, 4, 8]),
    stride: 8,
  });

describe('WebGl2Backend compressed texture accounting', () => {
  let harness: Harness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test('books the exact block-padded chain total, not width*height*bytesPerPixel', () => {
    harness = createHarness(['WEBGL_compressed_texture_s3tc']);

    const format = CompressedTextureFormat.Bc1RgbaUnorm;
    // The base level must itself be block-aligned; the chain still bottoms
    // out below the 4x4 block size, where a fractional bytes-per-pixel
    // estimate would visibly diverge from the exact total.
    const levels = chain(format, 8, 8, 4); // 8x8, 4x4, 2x2, 1x1
    const texture = new CompressedTexture({ format, levels });

    const before = harness.backend.stats.gpuMemoryBytes;

    harness.backend.bindTexture(texture, 0);

    const booked = harness.backend.stats.gpuMemoryBytes - before;
    const expected = levels.reduce((total, level) => total + level.data.byteLength, 0);

    expect(booked).toBe(expected);
    // The 2x2 and 1x1 levels are both padded up to one full 8-byte block, so
    // this is above what width*height*bytesPerPixel over the same texel
    // counts would give (64 + 16 + 4 + 1 = 85 texels * 0.5 = 42.5 bytes).
    expect(booked).toBeGreaterThan(43);

    texture.destroy();
    expect(harness.backend.stats.gpuMemoryBytes).toBe(before);
  });
});

describe('WebGl2Backend depth/stencil attachment accounting', () => {
  let harness: Harness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test('books the exact stencil attachment size and frees it, and the target it came with, on destroy', () => {
    harness = createHarness();

    const shape = createTriangle();

    // Warm up the stencil clipper's own one-time GPU state (a shader program
    // plus a small persistent vertex buffer, connected lazily on first use and
    // kept for the backend's lifetime, not the target's) on a disposable
    // target first, so it is not mistaken for target-owned storage below.
    const warmupTarget = new RenderTexture(4, 4);

    harness.backend.setRenderTarget(warmupTarget);
    harness.backend.pushStencilClip(shape, Matrix.identity);
    harness.backend.popStencilClip();
    warmupTarget.destroy();

    const baseline = harness.backend.stats.gpuMemoryBytes;
    const target = new RenderTexture(8, 8);

    harness.backend.setRenderTarget(target);

    const beforeClip = harness.backend.stats.gpuMemoryBytes;

    harness.backend.pushStencilClip(shape, Matrix.identity);

    // DEPTH24_STENCIL8 packs depth and stencil into one 4-byte texel.
    expect(harness.backend.stats.gpuMemoryBytes - beforeClip).toBe(8 * 8 * 4);

    harness.backend.popStencilClip();
    target.destroy();
    shape.destroy();

    // Owned allocations return to exactly the pre-target baseline: nothing
    // booked for the stencil attachment, or for the target's color storage,
    // survives destroy.
    expect(harness.backend.stats.gpuMemoryBytes).toBe(baseline);
  });

  test('a resize re-books the attachment at its new size instead of accumulating both', () => {
    harness = createHarness();

    const target = new RenderTexture(8, 8);
    const shape = createTriangle();

    harness.backend.setRenderTarget(target);
    harness.backend.pushStencilClip(shape, Matrix.identity);
    harness.backend.popStencilClip();

    const afterFirstClip = harness.backend.stats.gpuMemoryBytes;

    target.setSize(16, 16);
    harness.backend.setRenderTarget(target);
    harness.backend.pushStencilClip(shape, Matrix.identity);

    // The larger stencil attachment plus the larger color attachment replace
    // the smaller ones rather than sitting alongside them: freeing the 8x8
    // stencil (256 B) and color (256 B) attachments and booking the 16x16
    // ones (1024 B each) nets a +1536 B delta, not a larger accumulation
    // (which would additionally still carry the freed 8x8 bytes).
    expect(harness.backend.stats.gpuMemoryBytes - afterFirstClip).toBe(16 * 16 * 4 - 8 * 8 * 4 + (16 * 16 * 4 - 8 * 8 * 4));

    harness.backend.popStencilClip();
    target.destroy();
    shape.destroy();
  });
});

/** Independent restatement of the byte formulas: one texel size per working format, a full chain summing each level. */
const TEXEL_BYTES = { rgba8: 4, rgba8srgb: 4, rgba16f: 8, rgba32f: 16 } as const;

const FLOAT_TARGETS = { EXT_color_buffer_float: {} };

const chainBytes = (width: number, height: number, texelBytes: number, levels: number): number => {
  let total = 0;

  for (let level = 0; level < levels; level++) {
    total += Math.max(width >> level, 1) * Math.max(height >> level, 1) * texelBytes;
  }

  return total;
};

const straightPayload = (width: number, height: number, alpha: number) => {
  const data = new Uint8Array(width * height * 4);

  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 200;
    data[offset + 1] = 100;
    data[offset + 2] = 50;
    data[offset + 3] = alpha;
  }

  return { colorSpace: 'srgb', alphaMode: 'straight', levels: [{ data, width, height }] } as const;
};

describe('WebGl2Backend working-format storage accounting', () => {
  let harness: WebGl2Harness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test.each([
    [TextureFormat.Rgba8, TEXEL_BYTES.rgba8],
    [TextureFormat.Rgba8Srgb, TEXEL_BYTES.rgba8srgb],
    [TextureFormat.Rgba16F, TEXEL_BYTES.rgba16f],
    [TextureFormat.Rgba32F, TEXEL_BYTES.rgba32f],
  ] as const)('a %s working target owns exactly width * height * texel bytes and frees them on destroy', (format, texelBytes) => {
    harness = createWebGl2Harness({ coreRenderers: false, extensions: FLOAT_TARGETS });

    const baseline = harness.backend.stats.gpuMemoryBytes;
    const target = new RenderTexture(96, 40, { format });

    harness.backend.setRenderTarget(target);

    expect(harness.backend.stats.gpuMemoryBytes - baseline).toBe(96 * 40 * texelBytes);

    target.destroy();

    expect(harness.backend.stats.gpuMemoryBytes).toBe(baseline);
  });

  test('a resize replaces the working storage instead of adding to it', () => {
    harness = createWebGl2Harness({ coreRenderers: false, extensions: FLOAT_TARGETS });

    const baseline = harness.backend.stats.gpuMemoryBytes;
    const target = new RenderTexture(64, 64, { format: TextureFormat.Rgba16F });

    harness.backend.setRenderTarget(target);
    target.setSize(128, 32);
    harness.backend.setRenderTarget(target);

    expect(harness.backend.stats.gpuMemoryBytes - baseline).toBe(128 * 32 * TEXEL_BYTES.rgba16f);

    target.destroy();
  });

  test('multisample storage adds width * height * samples * texel bytes on top of the resolve texture', () => {
    harness = createWebGl2Harness({ coreRenderers: false, sampleCountSupport: [1, 2, 4] });

    const baseline = harness.backend.stats.gpuMemoryBytes;
    const target = new RenderTexture(64, 48, { format: TextureFormat.Rgba8Srgb });

    target.sampleCount = 4;
    harness.backend.setRenderTarget(target);

    const resolveBytes = 64 * 48 * TEXEL_BYTES.rgba8srgb;
    const multisampleBytes = 64 * 48 * 4 * TEXEL_BYTES.rgba8srgb;

    expect(harness.backend.stats.gpuMemoryBytes - baseline).toBe(resolveBytes + multisampleBytes);

    target.destroy();

    expect(harness.backend.stats.gpuMemoryBytes).toBe(baseline);
  });

  test('a filter intermediate leased from the pool stays owned while pooled and is reused without new storage', () => {
    harness = createWebGl2Harness({ coreRenderers: false, extensions: FLOAT_TARGETS });

    const baseline = harness.backend.stats.gpuMemoryBytes;
    const first = harness.backend.acquireRenderTexture(64, 64, TextureFormat.Rgba16F);
    const second = harness.backend.acquireRenderTexture(64, 64, TextureFormat.Rgba16F);

    harness.backend.setRenderTarget(first);
    harness.backend.setRenderTarget(second);

    expect(harness.backend.stats.gpuMemoryBytes - baseline).toBe(2 * 64 * 64 * TEXEL_BYTES.rgba16f);

    harness.backend.releaseRenderTexture(first);
    harness.backend.releaseRenderTexture(second);

    // Pooled storage is retained for reuse, not returned to the device.
    expect(harness.backend.stats.gpuMemoryBytes - baseline).toBe(2 * 64 * 64 * TEXEL_BYTES.rgba16f);

    const reused = harness.backend.acquireRenderTexture(64, 64, TextureFormat.Rgba16F);

    harness.backend.setRenderTarget(reused);

    expect(harness.backend.stats.gpuMemoryBytes - baseline).toBe(2 * 64 * 64 * TEXEL_BYTES.rgba16f);

    harness.backend.setRenderTarget(null);
    first.destroy();
    second.destroy();

    expect(harness.backend.stats.gpuMemoryBytes).toBe(baseline);
  });
});

describe('WebGl2Backend normalization staging accounting', () => {
  let harness: WebGl2Harness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test('a translucent upload owns its storage plus one resident staging texture that later uploads reuse', () => {
    harness = createWebGl2Harness({ coreRenderers: false });

    const baseline = harness.backend.stats.gpuMemoryBytes;
    const first = Texture.fromPixels(straightPayload(32, 16, 128), { generateMipMap: false });

    harness.backend.bindTexture(first, 0);

    const staging = 32 * 16 * TEXEL_BYTES.rgba8srgb;

    expect(harness.backend.stats.gpuMemoryBytes - baseline).toBe(32 * 16 * 4 + staging);

    const second = Texture.fromPixels(straightPayload(16, 16, 128), { generateMipMap: false });

    harness.backend.bindTexture(second, 0);

    // The 16x16 level fits inside the resident 32x16 scratch: only its own storage is added.
    expect(harness.backend.stats.gpuMemoryBytes - baseline).toBe(32 * 16 * 4 + staging + 16 * 16 * 4);

    first.destroy();
    second.destroy();

    // Destroying the textures returns their storage; the scratch stays resident.
    expect(harness.backend.stats.gpuMemoryBytes - baseline).toBe(staging);
  });

  test('an opaque payload never allocates scratch', () => {
    harness = createWebGl2Harness({ coreRenderers: false });

    const baseline = harness.backend.stats.gpuMemoryBytes;
    const texture = Texture.fromPixels(straightPayload(32, 16, 255), { generateMipMap: false });

    harness.backend.bindTexture(texture, 0);

    expect(harness.backend.stats.gpuMemoryBytes - baseline).toBe(32 * 16 * 4);

    texture.destroy();
  });

  test('a context loss returns the scratch together with every other managed resource', () => {
    harness = createWebGl2Harness({ coreRenderers: false });

    const baseline = harness.backend.stats.gpuMemoryBytes;
    const texture = Texture.fromPixels(straightPayload(32, 16, 128), { generateMipMap: false });

    harness.backend.bindTexture(texture, 0);
    (harness.backend as unknown as { _reinitializeDeviceState: () => void })._reinitializeDeviceState();

    expect(harness.backend.stats.gpuMemoryBytes).toBe(baseline);

    texture.destroy();
  });
});

describe('WebGpuBackend color storage accounting', () => {
  let environment: MockWebGpuEnvironment | null = null;
  let backend: WebGpuBackend | null = null;

  afterEach(() => {
    backend?.destroy();
    environment?.restore();
    backend = null;
    environment = null;
  });

  const create = async (): Promise<WebGpuBackend> => {
    environment = createMockWebGpuEnvironment();
    backend = await createMockBackend(environment);

    return backend;
  };

  test.each([
    [TextureFormat.Rgba8Srgb, TEXEL_BYTES.rgba8srgb],
    [TextureFormat.Rgba16F, TEXEL_BYTES.rgba16f],
    [TextureFormat.Rgba32F, TEXEL_BYTES.rgba32f],
  ] as const)('a %s working target owns exactly width * height * texel bytes and frees them on destroy', async (format, texelBytes) => {
    const gpu = await create();
    const baseline = gpu.stats.gpuMemoryBytes;
    const target = new RenderTexture(96, 40, { format });

    gpu.getTextureBinding(target);

    expect(gpu.stats.gpuMemoryBytes - baseline).toBe(96 * 40 * texelBytes);

    target.destroy();

    expect(gpu.stats.gpuMemoryBytes).toBe(baseline);
  });

  test('never books multisample storage: a requested sample count collapses to one', async () => {
    const gpu = await create();
    const baseline = gpu.stats.gpuMemoryBytes;
    const target = new RenderTexture(64, 48, { format: TextureFormat.Rgba8Srgb });

    target.sampleCount = 4;
    gpu.getTextureBinding(target);
    gpu.resolveRenderTarget(target);

    expect(target.sampleCount).toBe(1);
    expect(gpu.stats.gpuMemoryBytes - baseline).toBe(64 * 48 * TEXEL_BYTES.rgba8srgb);

    target.destroy();
  });

  test('a translucent upload owns its storage plus one resident staging texture that later uploads reuse', async () => {
    const gpu = await create();
    const baseline = gpu.stats.gpuMemoryBytes;
    const first = Texture.fromPixels(straightPayload(32, 16, 128), { generateMipMap: false });

    gpu.getTextureBinding(first);

    const staging = 32 * 16 * TEXEL_BYTES.rgba8srgb;

    expect(gpu.stats.gpuMemoryBytes - baseline).toBe(32 * 16 * 4 + staging);

    const second = Texture.fromPixels(straightPayload(16, 16, 128), { generateMipMap: false });

    gpu.getTextureBinding(second);

    expect(gpu.stats.gpuMemoryBytes - baseline).toBe(32 * 16 * 4 + staging + 16 * 16 * 4);

    first.destroy();
    second.destroy();

    expect(gpu.stats.gpuMemoryBytes - baseline).toBe(staging);
  });

  test('an authored full chain books the summed level footprint plus the scratch sized for its base level', async () => {
    const gpu = await create();
    const baseline = gpu.stats.gpuMemoryBytes;
    const levels = [
      { data: new Uint8Array(8 * 8 * 4).fill(128), width: 8, height: 8 },
      { data: new Uint8Array(4 * 4 * 4).fill(128), width: 4, height: 4 },
      { data: new Uint8Array(2 * 2 * 4).fill(128), width: 2, height: 2 },
      { data: new Uint8Array(1 * 1 * 4).fill(128), width: 1, height: 1 },
    ];
    const texture = Texture.fromPixels({ colorSpace: 'srgb', alphaMode: 'straight', levels }, { generateMipMap: false });

    gpu.getTextureBinding(texture);

    expect(gpu.stats.gpuMemoryBytes - baseline).toBe(chainBytes(8, 8, 4, 4) + 8 * 8 * 4);

    texture.destroy();
  });

  test('a device teardown drops every owned byte, scratch included', async () => {
    const gpu = await create();
    const texture = Texture.fromPixels(straightPayload(32, 16, 128), { generateMipMap: false });

    gpu.getTextureBinding(texture);
    (gpu as unknown as { _teardownDeviceState: () => void })._teardownDeviceState();

    expect(gpu.stats.gpuMemoryBytes).toBe(0);
  });
});
