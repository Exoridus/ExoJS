/**
 * WebGPU AnimatedSprite browser test - v0.16 renderer-matrix follow-up.
 *
 * {@link AnimatedSprite} reuses the normal Sprite renderer but swaps the
 * texture-frame UV sub-region per animation frame. This asserts that swap
 * actually samples the correct sub-rect of a shared spritesheet texture: a
 * two-cell spritesheet (each cell a distinct solid color) is rendered at
 * frame 0, then advanced to frame 1, with pixel reads proving the sampled
 * color changes to match the new cell.
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
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';
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
const cellSize = 16;

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

/**
 * Builds a horizontal N-cell spritesheet texture, each cell filled with a
 * distinct solid color, so a frame swap is provably a different sub-rect
 * rather than a coincidentally-similar sample.
 */
const createSpritesheetTexture = (colors: readonly string[], size = cellSize): Texture => {
  const src = document.createElement('canvas');

  src.width = size * colors.length;
  src.height = size;

  const ctx = src.getContext('2d')!;

  colors.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(index * size, 0, size, size);
  });

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

describe('WebGPU AnimatedSprite — frame-region UV swap', () => {
  test('frame 0 samples the first spritesheet cell', async ctx => {
    const backend = await setupBackend();

    const texture = createSpritesheetTexture(['#ff0000', '#0000ff']);
    const root = new Container();
    const sprite = new AnimatedSprite(texture, {
      cells: { frames: [new Rectangle(0, 0, cellSize, cellSize), new Rectangle(cellSize, 0, cellSize, cellSize)], fps: 10 },
    });

    try {
      sprite.play('cells');
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

  test('advancing playback swaps to the second spritesheet cell', async ctx => {
    const backend = await setupBackend();

    const texture = createSpritesheetTexture(['#ff0000', '#0000ff']);
    const root = new Container();
    const sprite = new AnimatedSprite(texture, {
      cells: { frames: [new Rectangle(0, 0, cellSize, cellSize), new Rectangle(cellSize, 0, cellSize, cellSize)], fps: 10 },
    });

    try {
      sprite.play('cells');
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      let readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(16, 16), [255, 0, 0, 255]);

      // Advance exactly one frame's worth of time (fps 10 → 100ms/frame)
      sprite.update(100 / 1000);
      expect(sprite.currentFrame).toBe(1);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      readPixel = readWebGpuPixels(backend, canvasSize);

      // Same screen position now samples cell 1 (blue) - proves the UV
      // sub-rect swap, not just a re-render of the same frame.
      expectPixelNear(readPixel(16, 16), [0, 0, 255, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('play() restart returns playback to the first spritesheet cell', async ctx => {
    const backend = await setupBackend();

    const texture = createSpritesheetTexture(['#ff0000', '#0000ff']);
    const root = new Container();
    const sprite = new AnimatedSprite(texture, {
      cells: { frames: [new Rectangle(0, 0, cellSize, cellSize), new Rectangle(cellSize, 0, cellSize, cellSize)], fps: 10 },
    });

    try {
      sprite.play('cells');
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      sprite.update(100 / 1000);
      expect(sprite.currentFrame).toBe(1);

      // Restart (the default) rewinds to frame 0
      sprite.play('cells');
      expect(sprite.currentFrame).toBe(0);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(16, 16), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
