/**
 * WebGPU Graphics plain solid-fill browser tests - opt-in, capability-aware.
 *
 * The Graphics gradient/stencil suites cover gradient rasterization and
 * clipping, but not an isolated plain solid-color fill (the simplest
 * `fillStyle = Color` path, `Graphics._createSolidMesh`, rendered as a
 * textured Mesh via `Texture.white`). These tests assert that a solid-filled
 * rectangle and circle issue valid GPU work and render the exact fill color
 * inside the shape and the clear color outside it.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against SwiftShader); `renderAndValidate` only skips when the software
 * adapter drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Circle } from '#math/Circle';
import { Rectangle } from '#math/Rectangle';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';
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

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

// The software (SwiftShader) adapter can drop the device mid-test; treat that as
// an unavailable-adapter skip rather than a failure.
const isDeviceLoss = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

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

describe('WebGPU Graphics solid fill', () => {
  test('shared live rectangles refresh cached draws and survive one Graphics teardown', async ctx => {
    const backend = await setupBackend();
    const source = new Rectangle(8, 8, 16, 32);
    const first = new Graphics({ fill: Color.red });
    const second = new Graphics({ fill: Color.blue });
    const handle = first.addShape(source);
    second.addShape(source);

    try {
      for (const graphics of [first, second, first, second]) {
        if (!(await renderAndValidate(ctx, backend, graphics))) {
          return;
        }

        expectPixelNear(readWebGpuPixels(backend, canvasSize)(40, 20), [0, 0, 0, 255]);
      }

      source.width = 48;

      for (const [graphics, color] of [
        [first, [255, 0, 0, 255]],
        [second, [0, 0, 255, 255]],
      ] as const) {
        if (!(await renderAndValidate(ctx, backend, graphics))) {
          return;
        }

        expectPixelNear(readWebGpuPixels(backend, canvasSize)(40, 20), [...color]);
      }

      handle.setStyle({ fill: Color.green });
      const graphics = first;

      if (!(await renderAndValidate(ctx, backend, graphics))) {
        return;
      }

      expectPixelNear(readWebGpuPixels(backend, canvasSize)(40, 20), [0, 255, 0, 255]);
      first.destroy();
      source.width = 16;

      for (const graphics of [second, second]) {
        if (!(await renderAndValidate(ctx, backend, graphics))) {
          return;
        }

        expectPixelNear(readWebGpuPixels(backend, canvasSize)(40, 20), [0, 0, 0, 255]);
      }
    } finally {
      first.destroy();
      second.destroy();
      source.destroy();
      backend.destroy();
    }
  });

  test('cut-outs leave the clear color where the union of cuts covers a live rectangle', async ctx => {
    const backend = await setupBackend();
    const source = new Rectangle(8, 8, 48, 48);
    const hole = new Circle(28, 28, 10);
    const notch = new Rectangle(40, 40, 24, 24);
    const graphics = new Graphics({ fill: Color.green });

    graphics.addShape(source).cutShape(hole).cutShape(notch);

    try {
      if (!(await renderAndValidate(ctx, backend, graphics))) {
        return;
      }

      let readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(28, 28), [0, 0, 0, 255]);
      expectPixelNear(readPixel(50, 50), [0, 0, 0, 255]);
      expectPixelNear(readPixel(12, 12), [0, 255, 0, 255]);
      expectPixelNear(readPixel(20, 50), [0, 255, 0, 255]);
      expectPixelNear(readPixel(50, 20), [0, 255, 0, 255]);

      hole.destroy();

      if (!(await renderAndValidate(ctx, backend, graphics))) {
        return;
      }

      readPixel = readWebGpuPixels(backend, canvasSize);
      expectPixelNear(readPixel(28, 28), [0, 255, 0, 255]);
      expectPixelNear(readPixel(50, 50), [0, 0, 0, 255]);
    } finally {
      graphics.destroy();
      source.destroy();
      notch.destroy();
      backend.destroy();
    }
  });

  test('solid-color rectangle fill renders the fill color inside and the clear color outside', async ctx => {
    const backend = await setupBackend();
    const graphics = new Graphics();

    graphics.fillStyle = Color.green;
    graphics.drawRectangle(8, 8, 48, 48);

    try {
      if (!(await renderAndValidate(ctx, backend, graphics))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // Inside the rectangle: solid fill color (Color.green is the cube corner, (0, 255, 0)).
      expectPixelNear(readPixel(32, 32), [0, 255, 0, 255]);
      expectPixelNear(readPixel(10, 10), [0, 255, 0, 255]);
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

      const readPixel = readWebGpuPixels(backend, canvasSize);

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

      const readPixel = readWebGpuPixels(backend, canvasSize);

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
