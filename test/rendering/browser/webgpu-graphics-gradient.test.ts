/**
 * WebGPU Graphics gradient browser tests — opt-in, capability-aware.
 *
 * Graphics gradient paints rasterize the gradient to a {@link DataTexture} and
 * render each shape as a textured Mesh (bounding-box UVs, white tint), reusing
 * the existing default mesh texture path with no WebGpuMeshRenderer changes.
 * These tests assert that path issues valid GPU work on WebGPU — no validation
 * error, a draw call emitted — and that the presented pixels match the expected
 * gradient samples through the real Graphics `fillStyle` / `strokeStyle`
 * API path.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); `renderAndValidate` only skips when the software
 * adapter drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { LinearGradient } from '#rendering/gradient/LinearGradient';
import { RadialGradient } from '#rendering/gradient/RadialGradient';
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

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 4): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

describe('WebGPU Graphics gradient fills', () => {
  test('linear gradient fill renders a red-to-blue ramp across the shape', async ctx => {
    const backend = await setupBackend();
    const graphics = new Graphics();

    graphics.fillStyle = new LinearGradient(
      [
        { offset: 0, color: Color.red },
        { offset: 1, color: Color.blue },
      ],
      [0, 0],
      [1, 0],
    );
    graphics.drawRectangle(8, 8, 48, 48);

    try {
      if (!(await renderAndValidate(ctx, backend, graphics))) {
        return;
      }

      const readPixel = readCanvas(backend);
      const left = readPixel(10, 32);
      const middle = readPixel(32, 32);
      const right = readPixel(54, 32);

      // Endpoints prove the gradient is sampled across the fill, while the
      // middle allows the WebGPU texture-filtering quantization already covered
      // in webgpu-mesh-tint.test.ts.
      expect(left[0]).toBeGreaterThan(180);
      expect(left[2]).toBeLessThan(70);
      expectPixelNear(middle, [128, 0, 128, 255], 20);
      expect(right[2]).toBeGreaterThan(180);
      expect(right[0]).toBeLessThan(70);
      expect(left[3]).toBeGreaterThanOrEqual(250);
      expect(right[3]).toBeGreaterThanOrEqual(250);

      // Outside the rectangle stays the clear color.
      expectPixelNear(readPixel(2, 2), [0, 0, 0, 255]);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });

  test('radial gradient fill distinguishes center from edge', async ctx => {
    const backend = await setupBackend();
    const graphics = new Graphics();

    graphics.fillStyle = new RadialGradient(
      [
        { offset: 0, color: Color.red },
        { offset: 1, color: Color.blue },
      ],
      [0.5, 0.5],
      0.5,
    );
    graphics.drawRectangle(8, 8, 48, 48);

    try {
      if (!(await renderAndValidate(ctx, backend, graphics))) {
        return;
      }

      const readPixel = readCanvas(backend);
      const center = readPixel(32, 32);
      const edge = readPixel(10, 32);

      // Center samples the inner (red) stop, the mid-left edge the outer (blue).
      expect(center[0]).toBeGreaterThan(180);
      expect(center[2]).toBeLessThan(70);
      expect(edge[2]).toBeGreaterThan(150);
      expect(edge[0]).toBeLessThan(100);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });

  test('linear gradient stroke renders a red-to-blue ramp across the line', async ctx => {
    const backend = await setupBackend();
    const graphics = new Graphics();

    graphics.lineWidth = 8;
    graphics.strokeStyle = new LinearGradient(
      [
        { offset: 0, color: Color.red },
        { offset: 1, color: Color.blue },
      ],
      [0, 0],
      [1, 0],
    );
    graphics.drawLine(8, 32, 56, 32);

    try {
      if (!(await renderAndValidate(ctx, backend, graphics))) {
        return;
      }

      const readPixel = readCanvas(backend);
      const left = readPixel(10, 32);
      const right = readPixel(54, 32);

      expect(left[0]).toBeGreaterThan(180);
      expect(left[2]).toBeLessThan(70);
      expect(right[2]).toBeGreaterThan(180);
      expect(right[0]).toBeLessThan(70);
      expect(left[3]).toBeGreaterThanOrEqual(250);
      expect(right[3]).toBeGreaterThanOrEqual(250);
      expectPixelNear(readPixel(32, 20), [0, 0, 0, 255]);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });

  test('transformed Graphics gradient appears at the translated location', async ctx => {
    const backend = await setupBackend();
    const graphics = new Graphics();

    graphics.fillStyle = new LinearGradient(
      [
        { offset: 0, color: Color.red },
        { offset: 1, color: Color.blue },
      ],
      [0, 0],
      [1, 0],
    );
    graphics.drawRectangle(0, 0, 24, 24);
    graphics.setPosition(20, 20);

    try {
      if (!(await renderAndValidate(ctx, backend, graphics))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // Untouched region before the translated rectangle stays clear.
      expectPixelNear(readPixel(8, 8), [0, 0, 0, 255]);

      const left = readPixel(22, 30);
      const right = readPixel(42, 30);

      // The ramp still runs red-to-blue, now offset to world (20, 20)+.
      expect(left[0]).toBeGreaterThan(left[2]);
      expect(right[2]).toBeGreaterThan(right[0]);
      expect(left[3]).toBeGreaterThanOrEqual(250);
      expect(right[3]).toBeGreaterThanOrEqual(250);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });
});
