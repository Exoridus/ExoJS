import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { LinearGradient } from '#rendering/gradient/LinearGradient';
import { RadialGradient } from '#rendering/gradient/RadialGradient';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// The browser project rewrites `.vert`/`.frag` imports to empty strings, so the
// default engine shaders the backend compiles on connect must be mocked with
// valid sources. The mesh sources are the REAL instanced default path (pinned
// attribute locations 0/1/2/6, transform-texture tint), which is the path
// Graphics gradient meshes render through. Every default renderer is connected
// on backend.initialize() and extracts its declared attributes, so each default
// shader needs valid sources with the exact attributes its renderer expects.
type RgbaTuple = readonly [number, number, number, number];

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

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 5): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index])).toBeLessThanOrEqual(tolerance);
  }
};

describe('Graphics gradient fills WebGL2 browser', () => {
  test('linear gradient fill renders a red-to-blue ramp across the shape', async () => {
    const backend = await createBackend();
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
      render(backend, graphics);

      const left = readPixel(backend, 10, 32);
      const right = readPixel(backend, 54, 32);

      // Left edge is dominantly red, right edge dominantly blue — proving the
      // gradient is sampled across the fill rather than a flat color.
      expect(left[0]).toBeGreaterThan(180);
      expect(left[2]).toBeLessThan(70);
      expect(right[2]).toBeGreaterThan(180);
      expect(right[0]).toBeLessThan(70);
      expect(left[3]).toBeGreaterThanOrEqual(250);
      expect(right[3]).toBeGreaterThanOrEqual(250);

      // Outside the rectangle stays the clear color.
      expectPixelNear(readPixel(backend, 2, 2), [0, 0, 0, 255]);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });

  test('radial gradient fill distinguishes center from edge', async () => {
    const backend = await createBackend();
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
      render(backend, graphics);

      const center = readPixel(backend, 32, 32);
      const edge = readPixel(backend, 10, 32);

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

  test('transformed Graphics gradient appears at the translated location', async () => {
    const backend = await createBackend();
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
      render(backend, graphics);

      // Untouched region before the translated rectangle stays clear.
      expectPixelNear(readPixel(backend, 8, 8), [0, 0, 0, 255]);

      const left = readPixel(backend, 22, 30);
      const right = readPixel(backend, 42, 30);

      // The ramp still runs red→blue, now offset to world (20, 20)+.
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
