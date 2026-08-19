/**
 * WebGPU Video device-loss teardown browser test.
 *
 * Mechanism: a genuine `GPUDevice.destroy()`, reached through
 * `WebGpuBackend.destroy()` — the same real device-loss mechanism
 * `webgpu-device-lifecycle.test.ts` uses (not a synthetic `GPUDeviceLostInfo`
 * dispatch). `backend.destroy()` calls `rendererRegistry.destroy()`, which
 * disconnects every bound renderer — `WebGpuVideoRenderer.onDisconnect` among
 * them — before the device itself is destroyed for real. This is the actual
 * production code path a device loss ultimately drives (see the "device-bound
 * state" teardown `WebGpuBackend` performs on both explicit `destroy()` and
 * device-loss recovery), exercised here without the intermediate JS
 * abstraction that a bare `.disconnect()` call in isolation would be.
 *
 * A real WebGPU device that has already resolved its `lost` promise with
 * reason `'destroyed'` never attempts automatic recovery on the same backend
 * instance (`webgpu-device-lifecycle.test.ts` establishes this directly), so
 * there is no event-driven, same-instance reconnect to observe on real
 * hardware. The reconnect side of the contract is instead proven the way
 * `webgpu-device-lifecycle.test.ts`'s own third case proves it for the
 * backend as a whole: a second, independently constructed backend — a fresh
 * real device, a fresh `WebGpuVideoRenderer` built from scratch by
 * `onConnect` — renders the SAME `Video` (same `HTMLVideoElement`, same
 * `Texture`) the first backend already rendered and lost, and must still
 * produce correct pixels. That is only possible if `onDisconnect` left
 * nothing about the `Video`/`Texture` corrupted for a later renderer to trip
 * over, and if `onConnect` rebuilds every pipeline/layout/shader-module/
 * buffer/sampler the video renderer needs without relying on any stale
 * cross-instance state.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Container } from '#rendering/Container';
import { Video } from '#rendering/video/Video';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { expectPixelNear } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 32;

/**
 * A `<video>` element playing a `MediaStream` sourced from a solid-colour
 * `<canvas>`, resolved once the first frame has decoded.
 *
 * Polls `videoWidth`/`readyState` rather than `requestVideoFrameCallback` —
 * empirically unreliable in this headless Chromium configuration (see
 * `webgpu-video.test.ts`'s file header for the full rationale).
 */
const createSolidColorVideo = async (color: string, size = 16): Promise<HTMLVideoElement> => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const ctx = source.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  const stream = (source as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);

  const video = document.createElement('video');

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanupFailedPlayback = (): void => {
      video.pause();
      stream.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    };
    const fail = (error: unknown): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      cleanupFailedPlayback();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const timeout = setTimeout(() => {
      fail(new Error(`timed out waiting for video.play() / decoded frame (videoWidth=${video.videoWidth}, readyState=${video.readyState})`));
    }, 5000);

    const poll = (): void => {
      if (settled) {
        return;
      }

      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
        settled = true;
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(poll, 16);
      }
    };

    void video.play().catch(fail);
    poll();
  });

  return video;
};

const destroyVideo = (video: HTMLVideoElement): void => {
  video.pause();
  (video.srcObject as MediaStream | null)?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
};

describe('WebGPU Video device-loss teardown', () => {
  test('a genuine device loss tears down WebGpuVideoRenderer without throwing', async ctx => {
    const backend = await createWebGpuTestBackend(canvasSize);
    const video = await createSolidColorVideo('#ff0000', 16);
    const root = new Container();
    const videoSprite = new Video(video);

    videoSprite.setPosition(8, 8);
    root.addChild(videoSprite);

    let backendDestroyed = false;

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root))) {
        return;
      }

      const lost = getBackendDevice(backend).lost;

      // Real production teardown: destroy() -> rendererRegistry.destroy() ->
      // every bound renderer's disconnect() (WebGpuVideoRenderer.onDisconnect
      // included) -> the actual GPUDevice.destroy() call.
      backend.destroy();
      backendDestroyed = true;

      // Proves the device was genuinely destroyed, not merely abandoned —
      // the same assertion webgpu-device-lifecycle.test.ts makes for its own
      // destroy() cycles.
      expect((await lost).reason).toBe('destroyed');
    } finally {
      // A skip (renderWebGpuOnce returning false) returns before the
      // explicit destroy() above runs; the live-device count is finite (see
      // webgpu-device-lifecycle.test.ts's file header), so every path out of
      // this test must still release the device.
      if (!backendDestroyed) {
        backend.destroy();
      }

      root.destroy();
      videoSprite.destroy();
      destroyVideo(video);
    }
  });

  test('a fresh backend renders the same Video correctly after a prior backend was lost', async ctx => {
    const first = await createWebGpuTestBackend(canvasSize);
    const video = await createSolidColorVideo('#00ff00', 16);
    const root = new Container();
    const videoSprite = new Video(video);

    videoSprite.setPosition(8, 8);
    root.addChild(videoSprite);

    let second: WebGpuBackend | null = null;
    let firstDestroyed = false;

    try {
      if (!(await renderWebGpuOnce(ctx, first, root))) {
        return;
      }

      first.destroy();
      firstDestroyed = true;

      second = await createWebGpuTestBackend(canvasSize);

      if (!(await renderWebGpuOnce(ctx, second, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(second, canvasSize);

      expectPixelNear(readPixel(16, 16), [0, 255, 0, 255]);
    } finally {
      // A skip on the FIRST render returns before first.destroy() above
      // runs; the live-device count is finite (see
      // webgpu-device-lifecycle.test.ts's file header), so every path out of
      // this test must still release both backends.
      if (!firstDestroyed) {
        first.destroy();
      }

      root.destroy();
      videoSprite.destroy();
      destroyVideo(video);
      second?.destroy();
    }
  });
});
