/**
 * WebGPU group matrix — projection UBO extension browser test (Track B Slice 2,
 * S2-D2, plan D-P1).
 *
 * The group matrix joins the existing group(0) projection uniform data instead
 * of a dynamic-offset binding: `WebGpuBackend._setRenderGroupTransform` sets a
 * backend-level transform that all vertex stages compose as
 * `projection * group * (existing math)`. This is purely additive — identity
 * until a caller sets a group — so a single scenario (offset, then clear back
 * to identity) is sufficient to prove the wiring end to end through the real
 * sprite pipeline.
 *
 * WebGPU shaders are real inline WGSL — no mocks. A struct/size mismatch
 * between the TS-side buffer layout and the WGSL struct surfaces as a GPU
 * validation error inside `renderScene`'s pushErrorScope.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const createSolidTexture = (color: string, size: number): Texture => {
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

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

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

  readback.width = canvasSize;
  readback.height = canvasSize;

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

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 12): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index])).toBeLessThanOrEqual(tolerance);
  }
};

// On the software (swiftshader) adapter used in CI the WebGPU device can be
// dropped mid-test ("Instance dropped in popErrorScope"). Treat that as a
// device-lost skip rather than a failure.
const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Render a scene through the real plan path inside a validation error scope.
// Returns false when the device dropped mid-test (the caller should bail).
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

describe('WebGPU group matrix (projection UBO extension)', () => {
  test('a backend-level group transform offsets sprite output; clearing it restores identity', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ff0000', 16);
    const root = new Container();
    const sprite = new Sprite(texture);
    const groupTransform = new Matrix();

    try {
      sprite.setPosition(0, 0);
      root.addChild(sprite);

      groupTransform.x = 24;
      groupTransform.y = 24;

      backend._setRenderGroupTransform(groupTransform);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(32, 32), [255, 0, 0, 255]);
      expectPixelNear(readPixel(8, 8), [0, 0, 0, 255]);

      backend._setRenderGroupTransform(null);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      readPixel = readCanvas(backend);
      expectPixelNear(readPixel(8, 8), [255, 0, 0, 255]);
      expectPixelNear(readPixel(32, 32), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
