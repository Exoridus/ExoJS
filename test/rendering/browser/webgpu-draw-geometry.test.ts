/**
 * WebGPU immediate-draw browser tests — opt-in, capability-aware.
 *
 * Exercises {@link RenderingContext.drawGeometry}: a node-free immediate draw of
 * a {@link Geometry} through the pooled mesh path and the synthetic (non-plan)
 * transform seam. Confirms the geometry renders at its world position, that the
 * raw transform is applied verbatim, and that a tint modulates the vertex color.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); `drawGeometries` only skips when the software adapter
 * drops the device mid-test.
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

interface DrawCall {
  readonly geometry: Geometry;
  readonly transform: Matrix;
  readonly tint?: Color;
}

// Run one or more drawGeometry calls through the real flush path inside a
// validation error scope. Returns false when the device dropped mid-test.
const drawGeometries = async (
  ctx: { skip: (reason: string) => void },
  backend: WebGpuBackend,
  context: RenderingContext,
  calls: readonly DrawCall[],
): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);

    for (const call of calls) {
      context.drawGeometry(call.geometry, call.transform, { tint: call.tint, view: screenView() });
    }

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

describe('WebGPU RenderingContext.drawGeometry', () => {
  test('renders a colored geometry quad at its world position', async ctx => {
    const backend = await setupBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(16, 16, 48, 48, [255, 0, 0, 255]);

    try {
      if (!(await drawGeometries(ctx, backend, context, [{ geometry, transform: new Matrix() }]))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(32, 32), [255, 0, 0, 255]); // inside the quad
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]); // outside → cleared black
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('applies the raw transform verbatim (translation)', async ctx => {
    const backend = await setupBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 32, 32, [0, 255, 0, 255]);

    try {
      // Translate the quad from (0,0)-(32,32) to (32,32)-(64,64).
      if (!(await drawGeometries(ctx, backend, context, [{ geometry, transform: new Matrix(1, 0, 32, 0, 1, 32) }]))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(48, 48), [0, 255, 0, 255]); // inside the moved quad
      expectPixelNear(readPixel(12, 12), [0, 0, 0, 255]); // original location now empty
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('modulates the geometry color by the tint', async ctx => {
    const backend = await setupBackend();
    const context = new RenderingContext(backend);
    // White geometry × a fractional tint resolves to the tint color.
    const geometry = coloredQuad(16, 16, 48, 48, [255, 255, 255, 255]);

    try {
      if (!(await drawGeometries(ctx, backend, context, [{ geometry, transform: new Matrix(), tint: new Color(96, 160, 224) }]))) {
        return;
      }

      expectPixelNear(readCanvas(backend)(32, 32), [96, 160, 224, 255]);
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('drawBatch draws N instances of one geometry as a single instanced draw call', async ctx => {
    const backend = await setupBackend();
    const context = new RenderingContext(backend);
    // A 16×16 white quad at the local origin, instanced to three positions/tints.
    const geometry = coloredQuad(0, 0, 16, 16, [255, 255, 255, 255]);
    const batch = new RenderBatch(geometry)
      .add(new Matrix(1, 0, 0, 0, 1, 0), new Color(255, 0, 0))
      .add(new Matrix(1, 0, 32, 0, 1, 0), new Color(0, 255, 0))
      .add(new Matrix(1, 0, 0, 0, 1, 32), new Color(0, 0, 255));

    try {
      const device = getBackendDevice(backend);

      device.pushErrorScope('validation');

      let validationError: GPUError | null;

      try {
        backend.resetStats();
        backend.clear(Color.black);
        context.drawBatch(batch, { view: screenView() });
        validationError = await device.popErrorScope();
      } catch (error) {
        if (isDeviceLoss(error)) {
          // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
          ctx.skip('WebGPU device lost mid-test — unstable software adapter');

          return;
        }

        throw error;
      }

      expect(validationError).toBeNull();
      // All three instances are emitted as a single instanced draw call.
      expect(backend.stats.drawCalls).toBe(1);

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(8, 8), [255, 0, 0, 255]); // instance 0 → red
      expectPixelNear(readPixel(40, 8), [0, 255, 0, 255]); // instance 1 → green
      expectPixelNear(readPixel(8, 40), [0, 0, 255, 255]); // instance 2 → blue
    } finally {
      batch.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});
