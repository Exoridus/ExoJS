/**
 * WebGL2 Graphics plain solid-fill browser tests.
 *
 * The Graphics gradient/stencil suites cover gradient rasterization and
 * clipping, but not an isolated plain solid-color fill (the simplest
 * `fillStyle = Color` path, `Graphics._createSolidMesh`). These tests assert
 * that a solid-filled rectangle and circle render the exact fill color
 * inside the shape and the clear color outside it.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear, type RgbaTuple } from './_pixels';

// The browser project rewrites `.vert`/`.frag` imports to empty strings, so the
// default engine shaders the backend compiles on connect must be mocked with
// valid sources. The mesh sources are the REAL instanced default path (pinned
// attribute locations 0/1/2/6, transform-texture tint), which is the path
// Graphics solid-fill meshes render through. Every default renderer is
// connected on backend.initialize() and extracts its declared attributes, so
// each default shader needs valid sources with the exact attributes its
// renderer expects.

const canvasSize = 64;
const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: defaultWebGlAttributes,
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

describe('Graphics solid fill WebGL2 browser', () => {
  test('solid-color rectangle fill renders the fill color inside and the clear color outside', async () => {
    const backend = await createBackend();
    const graphics = new Graphics();

    graphics.fillStyle = Color.green;
    graphics.drawRectangle(8, 8, 48, 48);

    try {
      render(backend, graphics);

      // Inside the rectangle: solid fill color (Color.green is (0, 128, 0)).
      expectPixelNear(readPixel(backend, 32, 32), [0, 128, 0, 255]);
      expectPixelNear(readPixel(backend, 10, 10), [0, 128, 0, 255]);
      // Outside the rectangle: clear color.
      expectPixelNear(readPixel(backend, 2, 2), [0, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 62, 62), [0, 0, 0, 255]);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });

  test('solid-color circle fill renders the fill color inside and the clear color outside', async () => {
    const backend = await createBackend();
    const graphics = new Graphics();

    graphics.fillStyle = Color.red;
    graphics.drawCircle(32, 32, 20);

    try {
      render(backend, graphics);

      // Center of the circle: solid fill color.
      expectPixelNear(readPixel(backend, 32, 32), [255, 0, 0, 255]);
      // Corner well outside the circle's radius: clear color.
      expectPixelNear(readPixel(backend, 4, 4), [0, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 60, 60), [0, 0, 0, 255]);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });

  test('transformed solid-color fill appears at the translated location', async () => {
    const backend = await createBackend();
    const graphics = new Graphics();

    graphics.fillStyle = Color.blue;
    graphics.drawRectangle(0, 0, 24, 24);
    graphics.setPosition(20, 20);

    try {
      render(backend, graphics);

      // Untouched region before the translated rectangle stays clear.
      expectPixelNear(readPixel(backend, 4, 4), [0, 0, 0, 255]);
      // Inside the translated rectangle: solid fill color.
      expectPixelNear(readPixel(backend, 32, 32), [0, 0, 255, 255]);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });
});
