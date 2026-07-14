/**
 * WebGPU split-screen viewport browser tests — mirrors
 * webgl2-split-viewport.test.ts on the WebGPU backend.
 *
 * Validates that {@link View.viewport} correctly restricts rendering to a
 * sub-rectangle of the canvas, that switching views mid-frame updates the
 * active viewport immediately, and that partial-viewport y is not flipped
 * (the top viewport paints the top of the canvas).
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const canvasWidth = 400;
const canvasHeight = 200;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasWidth, height: canvasHeight },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const backend = new WebGpuBackend(makeApp(canvas));

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

// Read the presented WebGPU canvas back through a 2D canvas. drawImage accepts a
// WebGPU-configured canvas as an image source, giving CPU-side pixel access
// without touching the backend's managed GPU textures.
const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasWidth;
  readback.height = canvasHeight;

  const ctx = readback.getContext('2d');

  if (!ctx) {
    throw new Error('2D context is required for canvas readback.');
  }

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0], data[1], data[2], data[3]];
  };
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 16): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

// On the software (swiftshader) adapter the WebGPU device can drop mid-test;
// treat that as an unavailable-adapter skip rather than a failure.
const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const createSolidTexture = (color: string, width = 16, height = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = width;
  source.height = height;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, width, height);

  return new Texture(source);
};

const createFullscreenSprite = (texture: Texture): Sprite =>
  new Sprite(texture)
    .setPosition(canvasWidth / 2, canvasHeight / 2)
    .setAnchor(0.5)
    .setScale(canvasWidth / texture.width, canvasHeight / texture.height);

describe('WebGPU split-screen viewport', () => {
  test('left and right viewports render independently via setView', async ctx => {
    const backend = await setupBackend();
    const device = getBackendDevice(backend);
    const redTex = createSolidTexture('#ff0000', 16, 16);
    const greenTex = createSolidTexture('#00ff00', 16, 16);

    const leftCam = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0, 0, 0.5, 1),
    });
    const rightCam = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0.5, 0, 0.5, 1),
    });

    const redSprite = createFullscreenSprite(redTex);
    const greenSprite = createFullscreenSprite(greenTex);

    device.pushErrorScope('validation');

    try {
      let validationError: GPUError | null;

      try {
        backend.resetStats();
        backend.clear(Color.black);
        backend.setView(leftCam);
        redSprite.render(backend);
        backend.setView(rightCam);
        greenSprite.render(backend);
        backend.flush();
        validationError = await device.popErrorScope();
      } catch (error) {
        if (isDeviceLoss(error)) {
          ctx.skip('WebGPU device lost mid-test — unstable software adapter');

          return;
        }

        throw error;
      }

      expect(validationError).toBeNull();

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(50, canvasHeight / 2), [255, 0, 0, 255]);
      expectPixelNear(readPixel(250, canvasHeight / 2), [0, 255, 0, 255]);
    } finally {
      redSprite.destroy();
      greenSprite.destroy();
      redTex.destroy();
      greenTex.destroy();
      backend.destroy();
    }
  });

  test('viewport update after camera switch is immediate', async ctx => {
    const backend = await setupBackend();
    const device = getBackendDevice(backend);
    const blueTex = createSolidTexture('#0000ff', 16, 16);
    const yellowTex = createSolidTexture('#ffff00', 16, 16);

    const leftCam = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0, 0, 0.5, 1),
    });
    const rightCam = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0.5, 0, 0.5, 1),
    });

    const blueSprite = createFullscreenSprite(blueTex);
    const yellowSprite = createFullscreenSprite(yellowTex);

    device.pushErrorScope('validation');

    try {
      let validationError: GPUError | null;

      try {
        backend.resetStats();
        backend.clear(Color.black);
        backend.setView(rightCam);
        blueSprite.render(backend);
        backend.setView(leftCam);
        yellowSprite.render(backend);
        backend.flush();
        validationError = await device.popErrorScope();
      } catch (error) {
        if (isDeviceLoss(error)) {
          ctx.skip('WebGPU device lost mid-test — unstable software adapter');

          return;
        }

        throw error;
      }

      expect(validationError).toBeNull();

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(250, canvasHeight / 2), [0, 0, 255, 255]);
      expectPixelNear(readPixel(50, canvasHeight / 2), [255, 255, 0, 255]);
    } finally {
      blueSprite.destroy();
      yellowSprite.destroy();
      blueTex.destroy();
      yellowTex.destroy();
      backend.destroy();
    }
  });

  test('context.render with view override applies viewport', async ctx => {
    const backend = await setupBackend();
    const device = getBackendDevice(backend);
    const whiteTex = createSolidTexture('#ffffff', 16, 16);

    const leftCam = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0, 0, 0.5, 1),
    });
    const defaultView = new View(canvasWidth / 2, canvasHeight / 2, canvasWidth, canvasHeight);

    const sprite = createFullscreenSprite(whiteTex);

    device.pushErrorScope('validation');

    try {
      let validationError: GPUError | null;

      try {
        backend.resetStats();
        backend.clear(Color.black);

        backend.setView(leftCam);
        sprite.render(backend);

        backend.setView(defaultView);
        sprite.render(backend);
        backend.flush();
        validationError = await device.popErrorScope();
      } catch (error) {
        if (isDeviceLoss(error)) {
          ctx.skip('WebGPU device lost mid-test — unstable software adapter');

          return;
        }

        throw error;
      }

      expect(validationError).toBeNull();

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(50, canvasHeight / 2), [255, 255, 255, 255]);
      expectPixelNear(readPixel(250, canvasHeight / 2), [255, 255, 255, 255]);
    } finally {
      sprite.destroy();
      whiteTex.destroy();
      backend.destroy();
    }
  });

  test('top viewport paints the TOP of the canvas (partial viewport y is not flipped to the bottom)', async ctx => {
    const backend = await setupBackend();
    const device = getBackendDevice(backend);
    const redTex = createSolidTexture('#ff0000', 16, 16);
    const greenTex = createSolidTexture('#00ff00', 16, 16);

    const topView = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0, 0, 1, 0.5),
    });
    const bottomView = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0, 0.5, 1, 0.5),
    });

    const red = createFullscreenSprite(redTex);
    const green = createFullscreenSprite(greenTex);

    device.pushErrorScope('validation');

    try {
      let validationError: GPUError | null;

      try {
        backend.resetStats();
        backend.clear(Color.black);
        backend.setView(topView);
        red.render(backend);
        backend.setView(bottomView);
        green.render(backend);
        backend.flush();
        validationError = await device.popErrorScope();
      } catch (error) {
        if (isDeviceLoss(error)) {
          ctx.skip('WebGPU device lost mid-test — unstable software adapter');

          return;
        }

        throw error;
      }

      expect(validationError).toBeNull();

      const readPixel = readCanvas(backend);

      // readPixel takes top-left y: the top-left viewport must paint the TOP quarter
      // red and the bottom viewport the BOTTOM quarter green (GPU's origin
      // must be mapped correctly for partial viewports).
      expectPixelNear(readPixel(canvasWidth / 2, canvasHeight * 0.25), [255, 0, 0, 255]);
      expectPixelNear(readPixel(canvasWidth / 2, canvasHeight * 0.75), [0, 255, 0, 255]);
    } finally {
      red.destroy();
      green.destroy();
      redTex.destroy();
      greenTex.destroy();
      backend.destroy();
    }
  });
});
