/**
 * WebGL2 rotated-mesh browser tests - instanced vs. single-draw parity,
 * mirroring webgpu-rotated-mesh.test.ts 1:1 (cross-backend gate).
 *
 * The WebGPU instanced-mesh path used to apply the per-node affine
 * transposed; WebGL2 is the ground truth. Both files assert the SAME
 * expected pixels for the same rotated quads through drawGeometry (single)
 * and drawBatch (instanced), so a divergence on either backend fails its
 * suite.
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

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

const canvasSize = 64;

// Rotation +90° in the engine's row-major convention (a=cosθ, b=-sinθ,
// c=sinθ, d=cosθ): (x, y) → (tx - y, ty + x).
const rotatePlus90 = (tx: number, ty: number): Matrix => new Matrix(0, -1, tx, 1, 0, ty);
// Rotation -90°: (x, y) → (tx + y, ty - x).
const rotateMinus90 = (tx: number, ty: number): Matrix => new Matrix(0, 1, tx, -1, 0, ty);

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
        webglAttributes: {
          antialias: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
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

// A solid-color quad (two triangles) in local space. Layout: position f32x2
// @0, color u8x4-norm @8, stride 12 - the default mesh path samples the 1×1
// white texture, so the output is the vertex color.
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

describe('WebGL2 rotated mesh: single-draw vs. instanced parity', () => {
  test('single draw renders a +90° rotated quad at the canonical world position', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 0, 0, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      // (0..16)² rotated +90° about the origin, translated to (32, 8):
      // covers x∈(16,32), y∈(8,24).
      context.drawGeometry(geometry, rotatePlus90(32, 8), { view: screenView() });

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
      expectPixelNear(readWebGl2Pixel(backend, 24, 16), [255, 0, 0, 255]); // rotated quad center
      expectPixelNear(readWebGl2Pixel(backend, 40, 4), [0, 0, 0, 255]); // transposed-artifact region stays empty
      expectPixelNear(readWebGl2Pixel(backend, 48, 48), [0, 0, 0, 255]); // unrelated region
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('instanced batch renders rotated instances at the same positions as single draws', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 255, 255, 255]);
    const batch = new RenderBatch(geometry)
      .add(rotatePlus90(32, 8), new Color(255, 0, 0)) // x∈(16,32), y∈(8,24)
      .add(rotateMinus90(16, 40), new Color(0, 255, 0)) // x∈(16,32), y∈(24,40)
      .add(new Matrix(1, 0, 40, 0, 1, 40), new Color(0, 0, 255)); // x∈(40,56), y∈(40,56)

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawBatch(batch, { view: screenView() });

      // All three instances are emitted as one instanced draw call.
      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readWebGl2Pixel(backend, 24, 16), [255, 0, 0, 255]); // +90° instance center
      expectPixelNear(readWebGl2Pixel(backend, 24, 32), [0, 255, 0, 255]); // -90° instance center
      expectPixelNear(readWebGl2Pixel(backend, 48, 48), [0, 0, 255, 255]); // identity instance center
      expectPixelNear(readWebGl2Pixel(backend, 40, 4), [0, 0, 0, 255]); // transposed +90° artifact region
      expectPixelNear(readWebGl2Pixel(backend, 8, 48), [0, 0, 0, 255]); // transposed -90° artifact region
    } finally {
      batch.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('a one-instance batch matches the single-draw output exactly', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 0, 0, 255]);
    const batch = new RenderBatch(geometry).add(rotatePlus90(32, 8), new Color(255, 255, 255));

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawBatch(batch, { view: screenView() });

      // Same expectations as the single-draw cell above.
      expectPixelNear(readWebGl2Pixel(backend, 24, 16), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 40, 4), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 48, 48), [0, 0, 0, 255]);
    } finally {
      batch.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});
