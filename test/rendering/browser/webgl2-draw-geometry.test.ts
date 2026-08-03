/**
 * WebGL2 immediate-draw browser tests — opt-in, capability-aware.
 *
 * Exercises {@link RenderingContext.drawGeometry}: a node-free immediate draw of
 * a {@link Geometry} through the pooled mesh path and the synthetic (non-plan)
 * instanced transform seam (`_drawDynamicInstancedSingle` with a null command →
 * `_writeTransformCommand`). Confirms the geometry renders at its world
 * position, the raw transform is applied verbatim, and a tint modulates color.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Geometry } from '#rendering/geometry/Geometry';
import { RenderBatch } from '#rendering/RenderBatch';
import { RenderingContext } from '#rendering/RenderingContext';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear, type RgbaTuple } from './_pixels';

// The browser project rewrites `.vert`/`.frag` imports to empty strings, so the
// default engine shaders the renderers compile on connect must be mocked with
// valid sources. The mesh sources keep the REAL pinned attribute locations
// (0/1/2/6) and the shared TransformBuffer fetch so the synthetic transform path
// renders correctly.

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

// A solid-color quad (two triangles) in world space. Layout: position f32x2 @0,
// color u8x4-norm @8, stride 12. No texcoord — the default mesh path samples the
// 1×1 white texture, so the output is the vertex color × tint.
const coloredQuad = (x0: number, y0: number, x1: number, y1: number, rgba: RgbaTuple): Geometry => {
  const stride = 12;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y0],
    [x1, y1],
    [x0, y1],
  ];
  const buffer = new ArrayBuffer(corners.length * stride);
  const view = new DataView(buffer);

  corners.forEach(([x, y], index) => {
    const base = index * stride;

    view.setFloat32(base + 0, x, true);
    view.setFloat32(base + 4, y, true);
    view.setUint8(base + 8, rgba[0]);
    view.setUint8(base + 9, rgba[1]);
    view.setUint8(base + 10, rgba[2]);
    view.setUint8(base + 11, rgba[3]);
  });

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 8 },
    ],
    vertexData: buffer,
    stride,
  });
};

// A screen-space view matching the canvas: world (0,0)..(64,64) maps to the
// whole surface, top-left origin.
const screenView = (): View => new View(canvasSize / 2, canvasSize / 2, canvasSize, canvasSize);

describe('WebGL2 RenderingContext.drawGeometry', () => {
  test('renders a colored geometry quad at its world position', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(16, 16, 48, 48, [255, 0, 0, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawGeometry(geometry, new Matrix(), { view: screenView() });

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [255, 0, 0, 255]); // inside the quad
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]); // outside → cleared black
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('applies the raw transform verbatim (translation)', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 32, 32, [0, 255, 0, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      // Translate the quad from (0,0)-(32,32) to (32,32)-(64,64).
      context.drawGeometry(geometry, new Matrix(1, 0, 32, 0, 1, 32), { view: screenView() });

      expectPixelNear(readWebGl2Pixel(backend, 48, 48), [0, 255, 0, 255]); // inside the moved quad
      expectPixelNear(readWebGl2Pixel(backend, 12, 12), [0, 0, 0, 255]); // original location now empty
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('modulates the geometry color by the tint', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    // White geometry × a fractional tint resolves to the tint color.
    const geometry = coloredQuad(16, 16, 48, 48, [255, 255, 255, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawGeometry(geometry, new Matrix(), { tint: new Color(96, 160, 224), view: screenView() });

      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [96, 160, 224, 255]);
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('draws multiple immediate geometries in call order', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const red = coloredQuad(8, 8, 32, 32, [255, 0, 0, 255]);
    const blue = coloredQuad(24, 24, 56, 56, [0, 0, 255, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      // Blue is drawn after red, so it layers on top in the overlap region.
      context.drawGeometry(red, new Matrix(), { view: screenView() });
      context.drawGeometry(blue, new Matrix(), { view: screenView() });

      expectPixelNear(readWebGl2Pixel(backend, 12, 12), [255, 0, 0, 255]); // red-only region
      expectPixelNear(readWebGl2Pixel(backend, 50, 50), [0, 0, 255, 255]); // blue-only region
      expectPixelNear(readWebGl2Pixel(backend, 28, 28), [0, 0, 255, 255]); // overlap → blue on top
    } finally {
      red.destroy();
      blue.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});

describe('WebGL2 RenderingContext.drawBatch', () => {
  test('draws N instances of one geometry as a single instanced draw call', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    // A 16×16 white quad at the local origin, instanced to three positions/tints.
    const geometry = coloredQuad(0, 0, 16, 16, [255, 255, 255, 255]);
    const batch = new RenderBatch(geometry)
      .add(new Matrix(1, 0, 0, 0, 1, 0), new Color(255, 0, 0))
      .add(new Matrix(1, 0, 32, 0, 1, 0), new Color(0, 255, 0))
      .add(new Matrix(1, 0, 0, 0, 1, 32), new Color(0, 0, 255));

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawBatch(batch, { view: screenView() });

      // All three instances are emitted as a single instanced draw call.
      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [255, 0, 0, 255]); // instance 0 → red
      expectPixelNear(readWebGl2Pixel(backend, 40, 8), [0, 255, 0, 255]); // instance 1 → green
      expectPixelNear(readWebGl2Pixel(backend, 8, 40), [0, 0, 255, 255]); // instance 2 → blue
      expectPixelNear(readWebGl2Pixel(backend, 60, 60), [0, 0, 0, 255]); // empty → cleared black
    } finally {
      batch.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});
