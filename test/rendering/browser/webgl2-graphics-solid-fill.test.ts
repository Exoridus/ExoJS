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
import { Circle } from '#math/Circle';
import { Rectangle } from '#math/Rectangle';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

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
  antialias: false,
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

describe('Graphics solid fill WebGL2 browser', () => {
  test('shared live rectangles refresh cached draws and survive one Graphics teardown', async () => {
    const backend = await createBackend();
    const source = new Rectangle(8, 8, 16, 32);
    const first = new Graphics({ fill: Color.red });
    const second = new Graphics({ fill: Color.blue });
    const handle = first.addShape(source);
    second.addShape(source);

    try {
      for (const graphics of [first, second, first, second]) {
        render(backend, graphics);
        expectPixelNear(readWebGl2Pixel(backend, 40, 20), [0, 0, 0, 255]);
      }

      source.width = 48;

      for (const [graphics, color] of [
        [first, [255, 0, 0, 255]],
        [second, [0, 0, 255, 255]],
      ] as const) {
        render(backend, graphics);
        expectPixelNear(readWebGl2Pixel(backend, 40, 20), [...color]);
      }

      handle.setStyle({ fill: Color.green });
      const graphics = first;
      render(backend, graphics);
      expectPixelNear(readWebGl2Pixel(backend, 40, 20), [0, 255, 0, 255]);
      first.destroy();
      source.width = 16;

      for (const graphics of [second, second]) {
        render(backend, graphics);
        expectPixelNear(readWebGl2Pixel(backend, 40, 20), [0, 0, 0, 255]);
      }
    } finally {
      first.destroy();
      second.destroy();
      source.destroy();
      backend.destroy();
    }
  });

  test('cut-outs leave the clear color where the union of cuts covers a live rectangle', async () => {
    const backend = await createBackend();
    const source = new Rectangle(8, 8, 48, 48);
    const hole = new Circle(28, 28, 10);
    const notch = new Rectangle(40, 40, 24, 24);
    const graphics = new Graphics({ fill: Color.green });

    graphics.addShape(source).cutShape(hole).cutShape(notch);

    try {
      render(backend, graphics);
      expectPixelNear(readWebGl2Pixel(backend, 28, 28), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 50, 50), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 12, 12), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 20, 50), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 50, 20), [0, 255, 0, 255]);

      hole.destroy();
      render(backend, graphics);
      expectPixelNear(readWebGl2Pixel(backend, 28, 28), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 50, 50), [0, 0, 0, 255]);
    } finally {
      graphics.destroy();
      source.destroy();
      notch.destroy();
      backend.destroy();
    }
  });

  test('solid-color rectangle fill renders the fill color inside and the clear color outside', async () => {
    const backend = await createBackend();
    const graphics = new Graphics();

    graphics.fillStyle = Color.green;
    graphics.drawRectangle(8, 8, 48, 48);

    try {
      render(backend, graphics);

      // Inside the rectangle: solid fill color (Color.green is the cube corner, (0, 255, 0)).
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 10, 10), [0, 255, 0, 255]);
      // Outside the rectangle: clear color.
      expectPixelNear(readWebGl2Pixel(backend, 2, 2), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 62, 62), [0, 0, 0, 255]);
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
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [255, 0, 0, 255]);
      // Corner well outside the circle's radius: clear color.
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 60, 60), [0, 0, 0, 255]);
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
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
      // Inside the translated rectangle: solid fill color.
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [0, 0, 255, 255]);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });
});
