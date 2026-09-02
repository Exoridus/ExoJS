/**
 * WebGPU Sprite browser test - v0.16 renderer-matrix proof entry.
 *
 * The simplest possible matrix case: a single opaque {@link Sprite} over a
 * solid-color {@link Texture}, asserting pixel colour inside the sprite's
 * bounds, outside its bounds, and after a tint is applied. Establishes the
 * paired webgl2/webgpu pixel-assertion pattern for the drawable-matrix test
 * suite.
 *
 * All WebGPU renderers use inline WGSL - no shader file mocks are needed.
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); `renderScene` only skips when the software adapter
 * drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

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

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const createSolidTexture = (color: string, size = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(src);
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const renderScene = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }

  expect(validationError).toBeNull();

  return true;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGPU Sprite — solid color', () => {
  test('solid-color texture fills sprite bounds, clear color remains outside', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ff0000', 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('single-pixel ImageBitmap texture fills scaled sprite bounds', async ctx => {
    const backend = await setupBackend();
    const sourceCanvas = document.createElement('canvas');

    sourceCanvas.width = 1;
    sourceCanvas.height = 1;

    const sourceContext = sourceCanvas.getContext('2d')!;

    sourceContext.fillStyle = '#ff0000';
    sourceContext.fillRect(0, 0, 1, 1);

    const source = await createImageBitmap(sourceCanvas);
    const texture = new Texture(source);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      sprite.width = 16;
      sprite.height = 16;
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      source.close();
      backend.destroy();
    }
  });

  test('container redraws a sprite after its deferred texture loads', async ctx => {
    const backend = await setupBackend();
    const texture = new Texture();

    texture._loadState.begin();

    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setAnchor(0.5).setScale(2).setPosition(32, 32);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const source = document.createElement('canvas');

      source.width = 16;
      source.height = 16;

      const sourceContext = source.getContext('2d')!;

      sourceContext.fillStyle = '#ff0000';
      sourceContext.fillRect(0, 0, 16, 16);
      texture.setSource(source);
      texture._loadState.settle(texture);
      await texture.loaded;
      await Promise.resolve();
      sprite.setRotation(30);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(32, 32), [255, 0, 0, 255]);
      expectPixelNear(readPixel(40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('tint is applied to rendered output', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ffffff', 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      sprite.tint = new Color(0, 255, 0);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(16, 16), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
