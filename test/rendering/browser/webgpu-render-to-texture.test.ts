/**
 * WebGPU browser tests for renderTo — opt-in, capability-aware.
 *
 * The WebGPU backend supports all operations used by renderTo
 * (setRenderTarget, clear, draw, flush) so the facade delegates correctly.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Graphics } from '#rendering/primitives/Graphics';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = 64;
  canvas.height = 64;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: 64, height: 64 },
    },
  } as unknown as Application;

  const backend = new WebGpuBackend(app);

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

describe('RenderTo WebGPU browser', () => {
  test('backend initializes and accepts render target changes', async () => {
    const backend = await setupBackend();
    const rtSize = 32;
    const target = new RenderTexture(rtSize, rtSize);

    const prevTarget = backend.renderTarget;

    backend.setRenderTarget(target);
    backend.clear(Color.red);
    backend.setRenderTarget(prevTarget);

    // Verify state restoration.
    expect(backend.renderTarget).toBe(prevTarget);

    target.destroy();
    backend.destroy();
  });

  test('renderTo pattern correctly sets and restores render target', async () => {
    const backend = await setupBackend();
    const rtSize = 32;
    const target = new RenderTexture(rtSize, rtSize);

    const prevTarget = backend.renderTarget;
    const prevView = backend.view;

    backend.setRenderTarget(target);
    backend.setView(target.view);
    backend.clear(Color.transparentBlack);
    backend.setRenderTarget(prevTarget);
    backend.setView(prevView);

    expect(backend.renderTarget).toBe(prevTarget);
    expect(backend.view).toBe(prevView);

    target.destroy();
    backend.destroy();
  });

  test('float RenderTexture targets are valid render targets on WebGPU (no validation error)', async ctx => {
    const backend = await setupBackend(ctx);
    const context = new RenderingContext(backend);
    const device = backend.device;

    try {
      // rgba16float and rgba32float are core color-renderable in WebGPU.
      expect(backend.supportsColorFormat('rgba8')).toBe(true);
      expect(backend.supportsColorFormat('rgba16f')).toBe(true);
      expect(backend.supportsColorFormat('rgba32f')).toBe(true);

      // rgba32f: clearing into the float target proves the attachment is valid.
      device.pushErrorScope('validation');
      const full = new RenderTexture(32, 32, { format: 'rgba32f' });
      backend.setRenderTarget(full);
      backend.clear(new Color(255, 0, 0));
      backend.setRenderTarget(backend.renderTarget);
      backend.flush();
      const clearError = await device.popErrorScope();
      // Surface the WebGPU message on failure instead of an opaque `GPUValidationError {}`.
      expect(clearError && `rgba32f clear: ${clearError.message}`).toBeNull();

      // rgba16f: a full engine draw exercises the real render pipeline built for a
      // float target format — the pipeline's color format must match the pass's.
      device.pushErrorScope('validation');
      const half = new RenderTexture(32, 32, { format: 'rgba16f' });
      const green = new Graphics();
      green.fillColor = new Color(0, 255, 0);
      green.drawRectangle(0, 0, 32, 32);
      context.renderTo(green, { target: half, view: half.view, clear: Color.transparentBlack });
      backend.flush();
      const drawError = await device.popErrorScope();
      expect(drawError && `rgba16f draw: ${drawError.message}`).toBeNull();

      green.destroy();
      half.destroy();
      full.destroy();
    } finally {
      backend.destroy();
    }
  });
});
