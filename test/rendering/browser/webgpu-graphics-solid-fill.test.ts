/**
 * WebGPU Graphics plain solid-fill browser tests — opt-in, capability-aware.
 *
 * The Graphics gradient/stencil suites cover gradient rasterization and
 * clipping, but not an isolated plain solid-color fill (the simplest
 * `fillStyle = Color` path, `Graphics._createSolidMesh`, rendered as a
 * textured Mesh via `Texture.white`). These tests assert that a solid-filled
 * rectangle and circle issue valid GPU work and render the exact fill color
 * inside the shape and the clear color outside it.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); `renderAndValidate` only skips when the software
 * adapter drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
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

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();
  wireCoreRenderers(backend);

  return backend;
};

// The software (swiftshader) adapter can drop the device mid-test; treat that as
// an unavailable-adapter skip rather than a failure.
const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Render a scene through the real plan path inside a validation error scope and
// assert it produced valid GPU work. Returns false when the device dropped
// mid-test (the caller should bail).
const renderAndValidate = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
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
  expect(backend.stats.drawCalls).toBeGreaterThan(0);

  return true;
};

// Read the presented WebGPU canvas back through a 2D canvas. drawImage accepts a
// WebGPU-configured canvas as an image source, matching other WebGPU pixel tests.
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

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 16): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

describe('WebGPU Graphics solid fill', () => {
  test('solid-color rectangle fill renders the fill color inside and the clear color outside', async ctx => {
    const backend = await setupBackend();
    const graphics = new Graphics();

    graphics.fillStyle = Color.green;
    graphics.drawRectangle(8, 8, 48, 48);

    try {
      if (!(await renderAndValidate(ctx, backend, graphics))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // Inside the rectangle: solid fill color (Color.green is (0, 128, 0)).
      expectPixelNear(readPixel(32, 32), [0, 128, 0, 255]);
      expectPixelNear(readPixel(10, 10), [0, 128, 0, 255]);
      // Outside the rectangle: clear color.
      expectPixelNear(readPixel(2, 2), [0, 0, 0, 255]);
      expectPixelNear(readPixel(62, 62), [0, 0, 0, 255]);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });

  test('solid-color circle fill renders the fill color inside and the clear color outside', async ctx => {
    const backend = await setupBackend();
    const graphics = new Graphics();

    graphics.fillStyle = Color.red;
    graphics.drawCircle(32, 32, 20);

    try {
      if (!(await renderAndValidate(ctx, backend, graphics))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // Center of the circle: solid fill color.
      expectPixelNear(readPixel(32, 32), [255, 0, 0, 255]);
      // Corner well outside the circle's radius: clear color.
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
      expectPixelNear(readPixel(60, 60), [0, 0, 0, 255]);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });

  test('transformed solid-color fill appears at the translated location', async ctx => {
    const backend = await setupBackend();
    const graphics = new Graphics();

    graphics.fillStyle = Color.blue;
    graphics.drawRectangle(0, 0, 24, 24);
    graphics.setPosition(20, 20);

    try {
      if (!(await renderAndValidate(ctx, backend, graphics))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // Untouched region before the translated rectangle stays clear.
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
      // Inside the translated rectangle: solid fill color.
      expectPixelNear(readPixel(32, 32), [0, 0, 255, 255]);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });
});
