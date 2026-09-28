/**
 * SDR input boundary contract for video textures (R39): under the
 * color-managed pipeline, a browser-decoded video is a color source like any
 * other, so its two WebGPU draw paths - the zero-copy `GPUExternalTexture`
 * import and the `texture_2d` copy-upload fallback - must land on the same
 * linear-light sample despite `texture_external` never getting the hardware
 * sRGB decode a `rgba8unorm-srgb` view gives the fallback path (see
 * `src/rendering/video/webgpuVideoMaterialSources.ts`). Comparing the two
 * paths against each other, rather than against an absolute expected value,
 * keeps this test independent of whether anything downstream re-encodes for
 * display - it only needs to hold that neither path decodes twice or skips
 * the decode the other one applies.
 */
import { expect, test, vi } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Video } from '#rendering/video/Video';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

vi.mock('#rendering/colorPipelineActivation', () => ({ COLOR_PIPELINE_ENABLED: true }));

const canvasSize = 32;
const decodeWaitMs = 12_000;

interface SkipCtx {
  skip: (reason: string) => void;
}

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const setupBackend = async (): Promise<WebGpuBackend> => {
  const { WebGpuBackend } = await import('#rendering/webgpu/WebGpuBackend');
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = { canvas, options: { canvas: { width: canvasSize, height: canvasSize }, clearColor: Color.black } } as unknown as Application;
  const backend = new WebGpuBackend(app);

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const renderScene = async (ctx: SkipCtx, backend: WebGpuBackend, root: Container): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test - unstable software adapter');

      return false;
    }

    throw error;
  }

  expect(validationError).toBeNull();

  return true;
};

/**
 * Same painted-canvas-to-`MediaStream` fixture strategy as
 * `webgpu-video.test.ts`: `requestVideoFrameCallback` never fires in this
 * headless configuration, so readiness is polled instead.
 */
const createSolidColorVideo = async (color: string, size = 16): Promise<HTMLVideoElement> => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const ctx = source.getContext('2d')!;
  const paint = (): void => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
  };

  paint();

  const stream = (source as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
  const video = document.createElement('video');

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      video.pause();
      stream.getTracks().forEach(track => track.stop());
      video.srcObject = null;
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const timeout = setTimeout(() => {
      fail(new Error(`timed out waiting for video.play() / decoded frame (videoWidth=${video.videoWidth}, readyState=${video.readyState})`));
    }, decodeWaitMs);
    const poll = (): void => {
      if (settled) return;

      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
        settled = true;
        clearTimeout(timeout);
        resolve();
      } else {
        paint();
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

/** Renders one solid-color video and returns the center pixel, on whichever draw path the device currently resolves to. */
const renderVideoPixel = async (ctx: SkipCtx, backend: WebGpuBackend, color: string): Promise<Uint8ClampedArray | null> => {
  const video = await createSolidColorVideo(color);
  const root = new Container();
  const videoSprite = new Video(video);

  try {
    videoSprite.setPosition(8, 8);
    root.addChild(videoSprite);

    if (!(await renderScene(ctx, backend, root))) {
      return null;
    }

    return readWebGpuPixels(backend, canvasSize)(16, 16);
  } finally {
    root.destroy();
    videoSprite.destroy();
    destroyVideo(video);
  }
};

describe('WebGPU video color pipeline - SDR input boundary parity', { timeout: 30_000 }, () => {
  test.each([
    ['gray', '#808080'],
    ['color', '#3c8cd6'],
  ])('external-texture and texture_2d fallback agree on a %s frame under the color pipeline', async (_name, color, ctx) => {
    const backend = await setupBackend();

    try {
      const device = getBackendDevice(backend);

      const externalPixel = await renderVideoPixel(ctx, backend, color);

      if (externalPixel === null) {
        return;
      }

      const originalImport = device.importExternalTexture;

      // @ts-expect-error -- deliberately removing a required method to force the fallback branch
      device.importExternalTexture = undefined;

      const fallbackPixel = await renderVideoPixel(ctx, backend, color);

      device.importExternalTexture = originalImport;

      if (fallbackPixel === null) {
        return;
      }

      // Both paths must land on the same linear-light sample: the external path's
      // explicit srgbToLinear (gated on colorPipelineEnabled) stands in for the
      // hardware sRGB decode the fallback's rgba8unorm-srgb view applies for free.
      for (let channel = 0; channel < 4; channel++) {
        expect(Math.abs(externalPixel[channel]! - fallbackPixel[channel]!)).toBeLessThanOrEqual(1);
      }

      // A video frame carries no alpha channel of its own: both paths must report
      // it fully opaque, matching the source's premultiplied-opaque contract.
      expect(externalPixel[3]).toBe(255);
      expect(fallbackPixel[3]).toBe(255);
    } finally {
      backend.destroy();
    }
  });
});
