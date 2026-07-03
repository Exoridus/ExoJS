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

  await backend.initialize();
  wireCoreRenderers(backend);

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
});
