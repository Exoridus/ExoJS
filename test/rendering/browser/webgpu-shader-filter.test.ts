/**
 * WebGpuShaderFilter browser test — opt-in, capability-aware, real GPU.
 *
 * Reproduces the black-screen bug (crt-scanlines / chromatic-aberration
 * examples on the WebGPU backend): `WebGpuShaderFilter._ensureConnected`
 * builds and permanently caches its `GPURenderPipeline` against
 * `backend.renderTargetFormat` — which reflects whatever render target is
 * *currently bound* (still the canvas/root target at the moment the
 * pipeline is built) rather than the filter's own offscreen `output`
 * RenderTexture the pipeline will actually render into. Offscreen render
 * textures are always allocated in the fixed managed format
 * (`rgba8unorm`), so whenever the canvas' preferred format differs (e.g.
 * `bgra8unorm`), every draw through the mismatched pipeline is silently
 * rejected by WebGPU validation and the filter's `output` never receives
 * any pixels — it stays cleared to transparent black.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { WebGpuShaderFilter } from '#rendering/filters/WebGpuShaderFilter';
import { Mesh } from '#rendering/mesh/Mesh';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDeviceOrSkip } from './webgpu-test-helpers';

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (ctx: { skip: (reason: string) => void }): Promise<WebGpuBackend | null> => {
  if (!navigator.gpu) {
    ctx.skip('WebGPU unavailable: navigator.gpu is absent');

    return null;
  }

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    ctx.skip('WebGPU unavailable: requestAdapter() returned null');

    return null;
  }

  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();
  wireCoreRenderers(backend);

  return backend;
};

// On the software (swiftshader/lavapipe) adapter the WebGPU device can drop
// mid-test; treat that as an unavailable-adapter skip rather than a failure
// (mirrors every other webgpu-*.test.ts in this suite).
const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Ignores the input texture entirely and paints solid opaque red — so the
// only way `output` ends up as anything other than red is the draw through
// this pipeline being silently dropped (the bug under test), not a sampling
// or UV mistake in the test shader itself.
const solidRedFragSrc = `
@group(0) @binding(0) var<uniform> uResolution: vec2<f32>;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment
fn main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
`;

const fullQuadVertices = (): Float32Array => new Float32Array([0, 0, canvasSize, 0, canvasSize, canvasSize, 0, 0, canvasSize, canvasSize, 0, canvasSize]);
const fullQuadUvs = (): Float32Array => new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);

// `output` is an offscreen RenderTexture, never presented directly — draw it
// onto the (still-root) canvas through the real mesh path, then sample the
// presented canvas via a 2D context to get CPU-side pixel access.
const readTexturePixel = (backend: WebGpuBackend, texture: RenderTexture, x: number, y: number): readonly [number, number, number, number] => {
  const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

  try {
    backend.resetStats();
    backend.clear(Color.black);
    mesh.render(backend);
    backend.flush();
  } finally {
    mesh.destroy();
  }

  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx2d = readback.getContext('2d');

  if (!ctx2d) {
    throw new Error('2D context is required for canvas readback.');
  }

  ctx2d.drawImage(backend.context.canvas as HTMLCanvasElement, 0, 0);

  const { data } = ctx2d.getImageData(x, y, 1, 1);

  return [data[0], data[1], data[2], data[3]];
};

describe('WebGpuShaderFilter (real GPU)', () => {
  test('apply() writes non-black pixels into output — pipeline format matches the offscreen target', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const device = getBackendDeviceOrSkip(ctx, backend);

    if (!device) {
      return;
    }

    const input = new RenderTexture(canvasSize, canvasSize);
    const output = new RenderTexture(canvasSize, canvasSize);
    const filter = new WebGpuShaderFilter({ fragmentSource: solidRedFragSrc });

    try {
      device.pushErrorScope('validation');

      let validationError: GPUError | null;

      try {
        // `backend.renderTarget` is still the root canvas target here — this
        // is exactly the state Filter.apply()/RenderEffectExecutor invoke the
        // filter in, before BackendTargetPass redirects into `output`.
        filter.apply(backend, input, output);
        validationError = await device.popErrorScope();
      } catch (error) {
        if (isDeviceLoss(error)) {
          ctx.skip('WebGPU device lost mid-test — unstable software adapter');

          return;
        }

        throw error;
      }

      // Confirms the exact mechanism: a color-target format mismatch between
      // the cached pipeline and the render pass targeting `output`.
      expect(validationError).toBeNull();

      const [r, g, b, a] = readTexturePixel(backend, output, canvasSize / 2, canvasSize / 2);

      expect([r, g, b, a]).not.toEqual([0, 0, 0, 0]);
      expect(r).toBeGreaterThan(200);
      expect(g).toBeLessThan(20);
      expect(b).toBeLessThan(20);
    } finally {
      filter.destroy();
      input.destroy();
      output.destroy();
      backend.destroy();
    }
  });
});
