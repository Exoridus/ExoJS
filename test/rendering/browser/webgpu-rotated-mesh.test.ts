/**
 * WebGPU rotated-mesh browser tests — instanced vs. single-draw parity
 * (review finding F3/B-01 pixel regression gate).
 *
 * The WebGPU instanced-mesh path used to apply the per-node affine
 * TRANSPOSED (a·x + c·y instead of a·x + b·y). Axis-aligned transforms are
 * transpose-invariant, so every existing cell passed while rotated or skewed
 * instances rendered at mirrored positions — diverging both from the CPU-bake
 * single-draw path and from WebGL2. These cells rotate quads through BOTH
 * paths and assert identical world positions; the expected pixels are
 * mirrored 1:1 in webgl2-rotated-mesh.test.ts for cross-backend equality.
 *
 * CI guarantees a real WebGPU adapter; tests only skip when the software
 * adapter drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Geometry } from '#rendering/geometry/Geometry';
import { RenderBatch } from '#rendering/RenderBatch';
import { RenderingContext } from '#rendering/RenderingContext';
import { View } from '#rendering/View';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

// Rotation +90° in the engine's row-major convention (a=cosθ, b=-sinθ,
// c=sinθ, d=cosθ): (x, y) → (tx - y, ty + x). The TRANSPOSED application maps
// (x, y) → (tx + y, ty - x) instead — the black-checked artifact positions.
const rotatePlus90 = (tx: number, ty: number): Matrix => new Matrix(0, -1, tx, 1, 0, ty);
// Rotation -90°: (x, y) → (tx + y, ty - x).
const rotateMinus90 = (tx: number, ty: number): Matrix => new Matrix(0, 1, tx, -1, 0, ty);

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

// A solid-color quad (two triangles) in local space. Layout: position f32x2
// @0, color u8x4-norm @8, stride 12 — the default mesh path samples the 1×1
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

const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d');

  if (!ctx) {
    throw new Error('2D context is required for canvas readback.');
  }

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0], data[1], data[2], data[3]];
  };
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 6): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Run `draw` through the real flush path inside a validation error scope.
// Returns false when the device dropped mid-test (the caller should bail).
const renderScoped = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, draw: () => void): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    draw();
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

describe('WebGPU rotated mesh: single-draw vs. instanced parity', () => {
  test('single draw renders a +90° rotated quad at the canonical world position', async ctx => {
    const backend = await setupBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 0, 0, 255]);

    try {
      // (0..16)² rotated +90° about the origin, translated to (32, 8):
      // covers x∈(16,32), y∈(8,24).
      if (!(await renderScoped(ctx, backend, () => context.drawGeometry(geometry, rotatePlus90(32, 8), { view: screenView() })))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(24, 16), [255, 0, 0, 255]); // rotated quad center
      expectPixelNear(readPixel(40, 4), [0, 0, 0, 255]); // transposed-artifact region stays empty
      expectPixelNear(readPixel(48, 48), [0, 0, 0, 255]); // unrelated region
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('instanced batch renders rotated instances at the same positions as single draws', async ctx => {
    const backend = await setupBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 255, 255, 255]);
    const batch = new RenderBatch(geometry)
      .add(rotatePlus90(32, 8), new Color(255, 0, 0)) // x∈(16,32), y∈(8,24)
      .add(rotateMinus90(16, 40), new Color(0, 255, 0)) // x∈(16,32), y∈(24,40)
      .add(new Matrix(1, 0, 40, 0, 1, 40), new Color(0, 0, 255)); // x∈(40,56), y∈(40,56)

    try {
      if (!(await renderScoped(ctx, backend, () => context.drawBatch(batch, { view: screenView() })))) {
        return;
      }

      // All three instances are emitted as one instanced draw call — the
      // exact WGSL slot-math path under test.
      expect(backend.stats.drawCalls).toBe(1);

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(24, 16), [255, 0, 0, 255]); // +90° instance center
      expectPixelNear(readPixel(24, 32), [0, 255, 0, 255]); // -90° instance center
      expectPixelNear(readPixel(48, 48), [0, 0, 255, 255]); // identity instance center
      expectPixelNear(readPixel(40, 4), [0, 0, 0, 255]); // transposed +90° artifact region
      expectPixelNear(readPixel(8, 48), [0, 0, 0, 255]); // transposed -90° artifact region
    } finally {
      batch.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('a one-instance batch matches the single-draw output exactly', async ctx => {
    const backend = await setupBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 0, 0, 255]);
    const batch = new RenderBatch(geometry).add(rotatePlus90(32, 8), new Color(255, 255, 255));

    try {
      if (!(await renderScoped(ctx, backend, () => context.drawBatch(batch, { view: screenView() })))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // Same expectations as the single-draw cell above.
      expectPixelNear(readPixel(24, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(40, 4), [0, 0, 0, 255]);
      expectPixelNear(readPixel(48, 48), [0, 0, 0, 255]);
    } finally {
      batch.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});
