/**
 * WebGPU immediate-draw browser tests - opt-in, capability-aware.
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
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { RenderBatch } from '#rendering/RenderBatch';
import { RenderingContext } from '#rendering/RenderingContext';
import { INSTANCE_TRANSFORM_WGSL } from '#rendering/shader/instanceContract';
import { View } from '#rendering/View';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear, type RgbaTuple } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

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
// color u8x4-norm @8, stride 12. No texcoord - the default mesh path samples the
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

// The immediate batch path keeps one render pass open across `drawBatch` calls,
// but the shared buffers each batch slices (node indices, instanced uniform
// slots) only ratchet up to a frame's worth of batches over the first frames -
// growing them mid-pass would free buffers earlier draws still bind, so the
// renderer splits the pass instead and sizes up for next time. Steady state is
// what the pass count is asserted on, so run the same frame a few times first.
const settleFrames = 3;

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

      const readPixel = readWebGpuPixels(backend, canvasSize);

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

      const readPixel = readWebGpuPixels(backend, canvasSize);

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

      expectPixelNear(readWebGpuPixels(backend, canvasSize)(32, 32), [96, 160, 224, 255]);
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
        // drawBatch leaves the pass open so consecutive batches share one
        // submit; end the frame explicitly before reading the canvas back.
        backend.flush();
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

      const readPixel = readWebGpuPixels(backend, canvasSize);

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

  test('two drawBatch calls in one frame each read their own node indices', async ctx => {
    const backend = await setupBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 255, 255, 255]);
    // Two batches take DISTINCT ranges of the shared transform buffer AND
    // distinct sub-ranges of the one shared node-index buffer. Both draws land
    // in the same open pass and therefore the same submit, and
    // `queue.writeBuffer` is ordered against that submit rather than against the
    // individual draws inside it - so writing both index ranges at offset 0
    // would make the first batch render the second's transforms, and this test
    // is what catches it.
    const first = new RenderBatch(geometry).add(new Matrix(1, 0, 0, 0, 1, 0), new Color(255, 0, 0));
    const second = new RenderBatch(geometry).add(new Matrix(1, 0, 40, 0, 1, 40), new Color(0, 255, 0));

    try {
      const device = getBackendDevice(backend);

      device.pushErrorScope('validation');

      let validationError: GPUError | null;

      try {
        backend.resetStats();
        backend.clear(Color.black);
        // ONE view instance for both calls: `setView` flushes on a view CHANGE,
        // and a fresh View object per call would count as one.
        const view = screenView();

        for (let frame = 0; frame < settleFrames; frame++) {
          backend.resetStats();
          backend.clear(Color.black);
          context.drawBatch(first, { view });
          context.drawBatch(second, { view });
          // drawBatch leaves the pass open so consecutive batches share one
          // submit; end the frame explicitly before reading the canvas back.
          backend.flush();
        }

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
      expect(backend.stats.drawCalls).toBe(2);
      // Both batches share ONE render pass (and one submit). drawBatch used to
      // end the pass per call, so a scene issuing N batches paid N passes and N
      // submits per frame.
      expect(backend.stats.renderPasses).toBe(1);

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(8, 8), [255, 0, 0, 255]); // first batch kept its own transform
      expectPixelNear(readPixel(48, 48), [0, 255, 0, 255]); // second batch drew at its own
    } finally {
      first.destroy();
      second.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('many drawBatch calls in one frame merge into a single render pass', async ctx => {
    const backend = await setupBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 8, 8, [255, 255, 255, 255]);
    // Six batches on a diagonal, spaced so every 8x8 tile fits the 64x64 canvas
    // without overlapping. Each takes its own transform-buffer range,
    // node-index sub-range and instanced-uniform slot; if any of those three
    // cursors were reset per call instead of per pass, the earlier draws would
    // read the last batch's data and the diagonal would collapse onto one tile.
    const batchCount = 6;
    const batchStride = 10;
    const batches = Array.from({ length: batchCount }, (_, i) =>
      new RenderBatch(geometry).add(new Matrix(1, 0, i * batchStride, 0, 1, i * batchStride), new Color(255, 255, 255)),
    );

    try {
      const device = getBackendDevice(backend);

      device.pushErrorScope('validation');

      let validationError: GPUError | null;

      try {
        backend.resetStats();
        backend.clear(Color.black);

        // ONE view instance for every call: `setView` flushes on a view CHANGE,
        // and a fresh View object per call would count as one.
        const view = screenView();

        for (let frame = 0; frame < settleFrames; frame++) {
          backend.resetStats();
          backend.clear(Color.black);

          for (const batch of batches) {
            context.drawBatch(batch, { view });
          }

          // drawBatch leaves the pass open so consecutive batches share one
          // submit; end the frame explicitly before reading the canvas back.
          backend.flush();
        }

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
      expect(backend.stats.drawCalls).toBe(batchCount);
      expect(backend.stats.renderPasses).toBe(1);

      const readPixel = readWebGpuPixels(backend, canvasSize);

      for (let i = 0; i < batchCount; i++) {
        expectPixelNear(readPixel(i * batchStride + 4, i * batchStride + 4), [255, 255, 255, 255]);
      }
    } finally {
      for (const batch of batches) {
        batch.destroy();
      }

      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('drawBatch renders a custom material with free per-instance attributes', async ctx => {
    const backend = await setupBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 255, 255, 255]);
    // Built on the exported WGSL contract, so this also proves group 0 resolves
    // against the shared transform storage under a custom pipeline. The free
    // attribute sits at location 7 per FIRST_INSTANCE_ATTRIBUTE_LOCATION.
    const material = new MeshMaterial({
      shader: new ShaderSource({
        wgsl: `${INSTANCE_TRANSFORM_WGSL}

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(6) nodeIndex: u32,
    @location(7) offset: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) tint: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4<f32>(exoInstanceClipPosition(input.position + input.offset, input.nodeIndex), 0.0, 1.0);
    output.tint = exoInstanceTint(input.nodeIndex);
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(input.tint.rgb * input.tint.a, input.tint.a);
}`,
      }),
    });
    const batch = new RenderBatch(geometry, material, { instanceAttributes: [{ name: 'a_offset', format: 'float32x2' }] });
    const data = { a_offset: [0, 0] };

    batch.add(new Matrix(), new Color(255, 0, 0), data);
    data.a_offset[0] = 32;
    data.a_offset[1] = 32;
    batch.add(new Matrix(), new Color(0, 255, 0), data);

    try {
      const device = getBackendDevice(backend);

      device.pushErrorScope('validation');

      let validationError: GPUError | null;

      try {
        backend.resetStats();
        backend.clear(Color.black);
        context.drawBatch(batch, { view: screenView() });
        // drawBatch leaves the pass open so consecutive batches share one
        // submit; end the frame explicitly before reading the canvas back.
        backend.flush();
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
      expect(backend.stats.drawCalls).toBe(1);

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // Identical transforms: only the free attribute separates the instances.
      expectPixelNear(readPixel(8, 8), [255, 0, 0, 255]);
      expectPixelNear(readPixel(40, 40), [0, 255, 0, 255]);
    } finally {
      batch.destroy();
      material.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});
