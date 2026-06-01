/**
 * WebGPU Graphics gradient-fill browser tests — opt-in, capability-aware.
 *
 * Graphics gradient paints rasterize the gradient to a {@link DataTexture} and
 * render each shape as a textured Mesh (bounding-box UVs, white tint), reusing
 * the existing default mesh texture path with no WebGpuMeshRenderer changes.
 * These tests assert that path issues valid GPU work on WebGPU — no validation
 * error, a draw call emitted — proving the gradient fill integrates structurally
 * with the WebGPU backend.
 *
 * Pixel colors are intentionally NOT asserted here: the WebGPU backend currently
 * samples `DataTexture` uploads (queue.writeTexture path) incorrectly — a fresh
 * gradient DataTexture reads back as a flat color where the identical mesh path
 * with a canvas-sourced Texture reads correctly. That is a pre-existing WebGPU
 * DataTexture limitation, independent of Graphics; pixel-correct WebGPU gradient
 * fills are a follow-up. WebGL2 gradient fills ARE pixel-tested (see
 * webgl2-graphics-gradient.test.ts).
 *
 * All tests skip gracefully when WebGPU is unavailable.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import { LinearGradient } from '@/rendering/gradient/LinearGradient';
import { RadialGradient } from '@/rendering/gradient/RadialGradient';
import { Graphics } from '@/rendering/primitives/Graphics';
import type { RenderNode } from '@/rendering/RenderNode';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';

import { getBackendDeviceOrSkip } from './webgpu-test-helpers';

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (ctx: { skip: (reason: string) => void }): Promise<WebGpuBackend> => {
  if (!navigator.gpu) {
    ctx.skip('WebGPU unavailable: navigator.gpu is absent');
  }

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    ctx.skip('WebGPU unavailable: requestAdapter() returned null');
  }

  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();

  return backend;
};

// The software (swiftshader) adapter can drop the device mid-test; treat that as
// an unavailable-adapter skip rather than a failure.
const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Render a scene through the real plan path inside a validation error scope and
// assert it produced valid GPU work. Returns false when the device dropped
// mid-test (the caller should bail).
const renderAndValidate = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
  const device = getBackendDeviceOrSkip(ctx, backend);

  if (!device) {
    return false;
  }

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

describe('WebGPU Graphics gradient fills', () => {
  test('a linear gradient fill issues a valid draw with no validation error', async ctx => {
    const backend = await setupBackend(ctx);
    const graphics = new Graphics();

    graphics.fillGradient = new LinearGradient(
      [
        { offset: 0, color: Color.red },
        { offset: 1, color: Color.blue },
      ],
      [0, 0],
      [1, 0],
    );
    graphics.drawRectangle(8, 8, 48, 48);

    try {
      await renderAndValidate(ctx, backend, graphics);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });

  test('a radial gradient stroke issues a valid draw with no validation error', async ctx => {
    const backend = await setupBackend(ctx);
    const graphics = new Graphics();

    graphics.lineWidth = 6;
    graphics.lineGradient = new RadialGradient(
      [
        { offset: 0, color: Color.white },
        { offset: 1, color: Color.black },
      ],
      [0.5, 0.5],
      0.5,
    );
    graphics.drawCircle(32, 32, 20);

    try {
      await renderAndValidate(ctx, backend, graphics);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });
});
