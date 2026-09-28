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
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

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
