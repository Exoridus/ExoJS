/**
 * WebGPU side of the public canvas composite contract: `rendering.alphaMode`
 * must reach `GPUCanvasConfiguration.alphaMode` and produce the same
 * browser-side composite behaviour the WebGL2 backend produces from the same
 * option.
 *
 * The frame is sampled through a 2D canvas, which is the browser's own
 * composite of the presented canvas — exactly the step a framebuffer readback
 * (and therefore the parity matrix) cannot see.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application, CanvasAlphaMode } from '#core/Application';
import { Color } from '#core/Color';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';

const canvasSize = 16;

const setupBackend = async (alphaMode: CanvasAlphaMode): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = {
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
      rendering: { alphaMode },
    },
  } as unknown as Application;
  const backend = new WebGpuBackend(app);

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

/** Alpha of the centre pixel as the browser composites the presented canvas. */
const readCentreAlpha = (backend: WebGpuBackend): number => readWebGpuPixels(backend, canvasSize)(canvasSize / 2, canvasSize / 2)[3];

describe('WebGPU canvas alphaMode', () => {
  test("'opaque' composites a transparent frame as fully opaque", async () => {
    const backend = await setupBackend('opaque');

    try {
      backend.clear(new Color(0, 0, 0, 0));
      backend.flush();

      expect(readCentreAlpha(backend)).toBe(255);
    } finally {
      backend.destroy();
    }
  });

  test("'premultiplied' keeps the frame's alpha for the page composite", async () => {
    const backend = await setupBackend('premultiplied');

    try {
      backend.clear(new Color(0, 0, 0, 0));
      backend.flush();

      expect(readCentreAlpha(backend)).toBe(0);
    } finally {
      backend.destroy();
    }
  });
});
