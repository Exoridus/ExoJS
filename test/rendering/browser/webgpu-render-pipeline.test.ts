/**
 * WebGPU RenderPipeline browser test — opt-in, capability-aware.
 *
 * Runs under the `browser-webgpu` project: new headless Chromium exposes a WebGPU
 * adapter via swiftshader (`--enable-unsafe-webgpu --ignore-gpu-blocklist`). CI
 * guarantees a real adapter (the required Chromium-WebGPU lane runs against Mesa
 * lavapipe); `withValidation` only skips when the software adapter drops the
 * device mid-test (the canonical `isDeviceLoss` model shared by every
 * webgpu-*.test.ts).
 *
 * It drives a RenderPipeline (including a nested pipeline) whose CallbackRenderPass
 * redirects into an off-screen target via the BackendTargetPass/coordinator path,
 * and asserts the composition raises no GPU validation error. Heavy multi-flush
 * pixel assertions live in the WebGL2 suite.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { CallbackRenderPass } from '#rendering/CallbackRenderPass';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: 64, height: 64 },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;

  const backend = new WebGpuBackend(makeApp(canvas));
  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const withValidation = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, run: () => void): Promise<void> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    run();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return;
    }

    throw error;
  }

  expect(validationError).toBeNull();
};

describe('RenderPipeline WebGPU browser', () => {
  test('a nested pipeline redirecting into a target raises no validation error', async ctx => {
    const backend = await setupBackend();

    const context = new RenderingContext(backend);
    const target = new RenderTexture(64, 64);

    try {
      await withValidation(ctx, backend, () => {
        // A callback pass redirected into an off-screen target (cleared via the coordinator's
        // load op), nested one pipeline deep — the full composition path.
        const inner = new RenderPipeline({ label: 'inner' }).addPass(new CallbackRenderPass(() => undefined, { target, clear: Color.red }));
        new RenderPipeline({ label: 'frame' }).addPass(inner).execute(context);
        backend.flush();
      });
    } finally {
      target.destroy();
      backend.destroy();
    }
  });
});
