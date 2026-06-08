/**
 * WebGPU RenderPipeline browser test — opt-in, capability-aware.
 *
 * Skips gracefully when WebGPU is unavailable. When it IS available, it drives a
 * RenderPipeline (including a nested pipeline) whose CallbackRenderPass redirects
 * into an off-screen target via the {@link BackendTargetPass}/coordinator path,
 * and asserts the composition raises no GPU validation error. Heavy multi-flush
 * pixel assertions live in the WebGL2 suite (WebGPU is sensitive to multiple
 * off-screen flushes inside one error scope).
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import { CallbackRenderPass } from '@/rendering/CallbackRenderPass';
import { RenderingContext } from '@/rendering/RenderingContext';
import { RenderPipeline } from '@/rendering/RenderPipeline';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';

import { getBackendDeviceOrSkip } from './webgpu-test-helpers';

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: 64, height: 64 },
      clearColor: Color.black,
    },
  }) as unknown as Application;

describe('RenderPipeline WebGPU browser', () => {
  test('a nested pipeline redirecting into a target raises no validation error', async (ctx) => {
    if (!navigator.gpu) {
      ctx.skip('WebGPU unavailable: navigator.gpu is absent');
    }

    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      ctx.skip('WebGPU unavailable: requestAdapter() returned null');
    }

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));
    await backend.initialize();

    const device = getBackendDeviceOrSkip(ctx, backend);

    if (!device) {
      backend.destroy();

      return;
    }

    const context = new RenderingContext(backend);
    const target = new RenderTexture(64, 64);

    device.pushErrorScope('validation');

    let validationError: GPUError | null;

    try {
      // A callback pass redirected into an off-screen target (clears it red via the
      // coordinator's load op), nested one pipeline deep — the full composition path.
      const inner = new RenderPipeline({ label: 'inner' }).addPass(
        new CallbackRenderPass(() => undefined, { target, clear: Color.red }),
      );
      new RenderPipeline({ label: 'frame' }).addPass(inner).execute(context);
      backend.flush();
    } finally {
      validationError = await device.popErrorScope();
    }

    expect(validationError).toBeNull();

    target.destroy();
    backend.destroy();
  });
});
