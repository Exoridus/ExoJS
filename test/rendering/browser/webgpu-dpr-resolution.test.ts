/**
 * WebGPU device-pixel-ratio / design-resolution browser tests — opt-in,
 * capability-aware. Mirror of the WebGL2 DPR test: when the canvas backing
 * store is larger than the logical render-target size (`pixelRatio > 1`), the
 * backend scales the root viewport to the full backing store, so logical
 * content fills every device pixel (crisp) and logical positions land at the
 * matching physical pixel.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); this only skips when the software adapter drops the
 * device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const makeApp = (canvas: HTMLCanvasElement, logical: number, pixelRatio: number): Application =>
  ({
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: logical, height: logical, pixelRatio },
    },
  }) as unknown as Application;

const setupBackend = async (logical: number, pixelRatio: number): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = logical * pixelRatio;
  canvas.height = logical * pixelRatio;

  const backend = new WebGpuBackend(makeApp(canvas, logical, pixelRatio));

  await backend.initialize();
  wireCoreRenderers(backend);

  return backend;
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const createSolidTexture = (color: string, size = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

const createLeftHalfSprite = (texture: Texture, logical: number): Sprite =>
  new Sprite(texture)
    .setPosition(logical / 4, logical / 2)
    .setAnchor(0.5)
    .setScale(logical / 2 / texture.width, logical / texture.height);

const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = source.width;
  readback.height = source.height;

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

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 6): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

describe('WebGPU device-pixel-ratio resolution', () => {
  test('pixelRatio 2 scales the root viewport to fill the full backing store', async ctx => {
    const logical = 64;
    const backend = await setupBackend(logical, 2);
    const device = getBackendDevice(backend);

    const white = createSolidTexture('#ffffff');
    const sprite = createLeftHalfSprite(white, logical);

    try {
      expect((backend.context.canvas as HTMLCanvasElement).width).toBe(128);
      expect(backend.renderTarget.width).toBe(64);

      device.pushErrorScope('validation');

      let validationError: GPUError | null;

      try {
        backend.resetStats();
        backend.clear(Color.black);
        sprite.render(backend);
        backend.flush();
        validationError = await device.popErrorScope();
      } catch (error) {
        if (isDeviceLoss(error)) {
          // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
          ctx.skip('WebGPU device lost mid-test — unstable software adapter');

          return;
        }

        throw error;
      }

      expect(validationError).toBeNull();

      const read = readCanvas(backend);

      // The logical left-half edge (x=32) must land at physical x=64.
      expectPixelNear(read(60, 64), [255, 255, 255, 255]); // just left of the edge → white
      expectPixelNear(read(68, 64), [0, 0, 0, 255]); // just right of the edge → black
      // Content fills the full physical height — not stuck in a logical corner.
      expectPixelNear(read(32, 4), [255, 255, 255, 255]); // top
      expectPixelNear(read(32, 124), [255, 255, 255, 255]); // bottom
      expectPixelNear(read(124, 64), [0, 0, 0, 255]); // far right → background
    } finally {
      sprite.destroy();
      white.destroy();
      backend.destroy();
    }
  });
});
