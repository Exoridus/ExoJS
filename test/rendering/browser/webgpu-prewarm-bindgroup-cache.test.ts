/// <reference types="@webgpu/types" />

/**
 * WebGPU prewarm + flush-path caching for the instanced/text renderers — real
 * device (issue #277, finding F5b). Companion to the structural Node tests in
 * test/rendering/webgpu-instanced-flush-caching.test.ts and the prewarm
 * cache-key tests in test/rendering/webgpu-pipeline-prewarm.test.ts, this suite
 * exercises the actual WebGPU device to prove the caches behave on a conformant
 * implementation, not just against a mock:
 *
 * - after backend init, the nine-slice and repeating-sprite renderers have a
 *   non-empty pipeline cache (prewarm compiled the no-clip variants), and
 * - a second, byte-identical static frame creates ZERO new GPU bind groups for
 *   the nine-slice / repeating texture group(1) and issues ZERO projection
 *   (FrameUniforms) writes for text — while still drawing and passing WebGPU
 *   validation.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); each test only skips when the software adapter drops
 * the device mid-test. Run via: pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes } from '#rendering/types';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  // Register the core renderers BEFORE initialize (as Application.createBackend
  // does in production) so the init-path pipeline prewarm actually covers them —
  // wiring after initialize would run prewarm against an empty registry.
  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

/** Render one node through the real flush path inside a validation error scope. */
const renderNode = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, node: RenderNode): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    node.render(backend);
    backend.flush();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }

  expect(validationError?.message ?? null).toBeNull();

  return true;
};

/** A small solid-colour texture with nearest sampling and no mipmaps. */
const createSolidTexture = (size = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const context = src.getContext('2d')!;

  context.fillStyle = 'rgb(120, 180, 240)';
  context.fillRect(0, 0, size, size);

  return new Texture(src, { scaleMode: ScaleModes.Nearest });
};

/**
 * Count `device.createBindGroup` calls whose label starts with `prefix` while
 * running `run`, restoring the original method afterwards.
 */
const countBindGroups = async (device: GPUDevice, prefix: string, run: () => Promise<void>): Promise<number> => {
  const original = device.createBindGroup.bind(device);
  let count = 0;

  device.createBindGroup = ((descriptor: GPUBindGroupDescriptor): GPUBindGroup => {
    if ((descriptor.label ?? '').startsWith(prefix)) {
      count++;
    }

    return original(descriptor);
  }) as GPUDevice['createBindGroup'];

  try {
    await run();
  } finally {
    device.createBindGroup = original;
  }

  return count;
};

const pipelineCacheSize = (backend: WebGpuBackend, node: RenderNode): number => {
  const renderer = backend.rendererRegistry.resolve(node) as unknown as { _pipelines: Map<string, unknown> };

  return renderer._pipelines.size;
};

describe('WebGPU prewarm + flush-path caching (nine-slice / repeating / text)', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('nine-slice: prewarm fills the pipeline cache and a static re-flush builds no new texture bind group', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture();
    const sprite = new NineSliceSprite(texture, { slices: 4, border: 8, width: 40, height: 40 });

    try {
      sprite.setPosition(8, 8);

      // Prewarm ran during initialize(): the no-clip pipeline variants exist.
      expect(pipelineCacheSize(backend, sprite)).toBeGreaterThan(0);

      if (!(await renderNode(ctx, backend, sprite))) {
        return;
      }

      const device = getBackendDevice(backend);
      let drew = false;

      const created = await countBindGroups(device, 'nine-slice:texture-bind-group', async () => {
        drew = await renderNode(ctx, backend, sprite);
      });

      if (!drew) {
        return;
      }

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
      expect(created).toBe(0);
    } finally {
      sprite.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('repeating-sprite: prewarm fills the pipeline cache and a static re-flush builds no new texture bind group', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture();
    // A bare Texture source resolves to the shader (GPU-sampler-wrap) strategy.
    const sprite = new RepeatingSprite(texture, { width: 40, height: 40 });

    try {
      sprite.setPosition(8, 8);

      expect(pipelineCacheSize(backend, sprite)).toBeGreaterThan(0);

      if (!(await renderNode(ctx, backend, sprite))) {
        return;
      }

      const device = getBackendDevice(backend);
      let drew = false;

      const created = await countBindGroups(device, 'repeating-sprite:texture-bind-group', async () => {
        drew = await renderNode(ctx, backend, sprite);
      });

      if (!drew) {
        return;
      }

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
      expect(created).toBe(0);
    } finally {
      sprite.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('text: a static re-flush issues no FrameUniforms (projection) write', async ctx => {
    const backend = await setupBackend();
    const text = new Text('HELLO', { fillColor: Color.white, fontSize: 24 });

    try {
      text.setPosition(4, 20);

      if (!(await renderNode(ctx, backend, text))) {
        return;
      }

      const device = getBackendDevice(backend);
      const renderer = backend.rendererRegistry.resolve(text) as unknown as { _projBuffer: GPUBuffer | null };
      const projBuffer = renderer._projBuffer;

      expect(projBuffer).not.toBeNull();

      const originalWriteBuffer = device.queue.writeBuffer.bind(device.queue);
      let projWrites = 0;

      device.queue.writeBuffer = ((buffer: GPUBuffer, ...rest: unknown[]): void => {
        if (buffer === projBuffer) {
          projWrites++;
        }

        return (originalWriteBuffer as (...args: unknown[]) => void)(buffer, ...rest);
      }) as GPUQueue['writeBuffer'];

      let drew = false;

      try {
        drew = await renderNode(ctx, backend, text);
      } finally {
        device.queue.writeBuffer = originalWriteBuffer;
      }

      if (!drew) {
        return;
      }

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
      expect(projWrites).toBe(0);
    } finally {
      text.destroy();
      backend.destroy();
    }
  });
});
