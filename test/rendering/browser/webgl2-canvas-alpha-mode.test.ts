/**
 * WebGL2 side of the public canvas composite contract: `rendering.alphaMode`
 * must reach the real drawing buffer, not just the attribute dictionary.
 *
 * A real browser is required here - the node-level test proves what ExoJS asks
 * for, this one proves what the browser actually hands back.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application, CanvasAlphaMode } from '#core/Application';
import { Color } from '#core/Color';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

const canvasSize = 16;

const createBackend = async (alphaMode: CanvasAlphaMode): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = {
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize, pixelRatio: 1 },
      rendering: { debug: false, alphaMode, webglAttributes: { antialias: false, preserveDrawingBuffer: true } },
    },
  } as unknown as Application;
  const backend = new WebGl2Backend(app);

  await backend.initialize();

  return backend;
};

/**
 * Release the context instead of only tearing the backend down. This file needs
 * two contexts to compare the two modes, and the browser lane runs every spec in
 * one page against a hard per-page WebGL context ceiling.
 */
const disposeBackend = (backend: WebGl2Backend): void => {
  const lose = backend.context.getExtension('WEBGL_lose_context');

  backend.destroy();
  lose?.loseContext();
};

/** Alpha channel of the centre pixel, straight out of the drawing buffer. */
const readCentreAlpha = (backend: WebGl2Backend): number => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(canvasSize / 2, canvasSize / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return pixel[3]!;
};

describe('WebGL2 canvas alphaMode', () => {
  test("'opaque' yields a drawing buffer with no alpha channel", async () => {
    const backend = await createBackend('opaque');

    try {
      const attributes = backend.context.getContextAttributes()!;

      expect(attributes.alpha).toBe(false);

      // A fully transparent clear cannot survive an alpha-less drawing buffer:
      // the browser reads back 255 regardless of what was written.
      backend.clear(new Color(0, 0, 0, 0));
      backend.flush();

      expect(readCentreAlpha(backend)).toBe(255);
    } finally {
      disposeBackend(backend);
    }
  });

  test("'premultiplied' yields an alpha drawing buffer the page can show through", async () => {
    const backend = await createBackend('premultiplied');

    try {
      const attributes = backend.context.getContextAttributes()!;

      expect(attributes.alpha).toBe(true);
      // The engine writes premultiplied colour under both modes, so the canvas
      // is always told so.
      expect(attributes.premultipliedAlpha).toBe(true);

      backend.clear(new Color(0, 0, 0, 0));
      backend.flush();

      expect(readCentreAlpha(backend)).toBe(0);
    } finally {
      disposeBackend(backend);
    }
  });
});
