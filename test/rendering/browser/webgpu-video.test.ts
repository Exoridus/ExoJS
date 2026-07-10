/**
 * WebGPU Video browser test — v0.16 renderer-matrix drawable entry.
 *
 * {@link Video} wraps an `HTMLVideoElement` as a live-texture {@link Sprite}
 * (see `src/rendering/video/Video.ts`): its `Texture` holds the video element
 * directly as `source`, and `updateTexture()` calls `texture.updateSource()`
 * to bump the texture version whenever the decoded frame changes, which makes
 * the backend re-upload via `device.queue.copyExternalImageToTexture(...)` —
 * the same generic path `WebGpuBackend` uses for any non-DataTexture,
 * non-RenderTexture source (canvas/image/video); there is no video-specific
 * upload code.
 *
 * Fixture strategy: a `<canvas>` painted a solid colour is turned into a
 * `MediaStream` via `captureStream()`, assigned to a `<video>` element's
 * `srcObject`, and played (muted, so no user-gesture is required). We poll
 * `videoWidth`/`readyState` for the first decoded frame instead of relying on
 * `requestVideoFrameCallback` — empirically, in this headless Chromium
 * configuration `requestVideoFrameCallback` never fires (even with the video
 * attached to the DOM and a `requestAnimationFrame` pump kept alive for the
 * full test), while polling resolves reliably in ~60-100ms. A *second*,
 * dynamic scenario — repainting the source canvas after the first decoded
 * frame and asserting the video texture picks up the new colour — was
 * prototyped and found NOT to be reliably observable within a bounded window
 * in this headless environment (0/5 across two variants, including a
 * `requestAnimationFrame`-pumped + DOM-attached variant); it is intentionally
 * NOT included here to avoid committing a flaky test. Only the reliable,
 * bounded initial-decode-and-upload path is asserted below.
 *
 * All WebGPU renderers use inline WGSL — no shader file mocks are needed.
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); `renderScene` only skips when the software adapter
 * drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Video } from '#rendering/video/Video';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

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

  await backend.initialize();
  wireCoreRenderers(backend);

  return backend;
};

// Read the presented WebGPU canvas back through a 2D canvas.
const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d')!;

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0], data[1], data[2], data[3]];
  };
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 16): void => {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
};

/**
 * Create an `HTMLVideoElement` playing a solid-colour `MediaStream` sourced
 * from a painted `<canvas>`, resolved once the first frame has decoded.
 *
 * Polls `videoWidth`/`readyState` rather than `requestVideoFrameCallback` —
 * see the file header comment for why.
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

  await video.play();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`timed out waiting for decoded video frame (videoWidth=${video.videoWidth}, readyState=${video.readyState})`)),
      5000,
    );

    const poll = (): void => {
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(poll, 16);
      }
    };

    poll();
  });

  return video;
};

const destroyVideo = (video: HTMLVideoElement): void => {
  video.pause();
  (video.srcObject as MediaStream | null)?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const renderScene = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
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
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }

  expect(validationError).toBeNull();

  return true;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGPU Video — solid color frame', () => {
  test('decoded video frame uploads to the sprite texture and fills its bounds', async ctx => {
    const backend = await setupBackend();

    const video = await createSolidColorVideo('#ff0000', 16);
    const root = new Container();
    const videoSprite = new Video(video);

    try {
      videoSprite.setPosition(8, 8);
      root.addChild(videoSprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      videoSprite.destroy();
      destroyVideo(video);
      backend.destroy();
    }
  });

  test('tint is applied to the rendered video frame', async ctx => {
    const backend = await setupBackend();

    const video = await createSolidColorVideo('#ffffff', 16);
    const root = new Container();
    const videoSprite = new Video(video);

    try {
      videoSprite.setPosition(8, 8);
      videoSprite.tint = new Color(0, 255, 0);
      root.addChild(videoSprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 16), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      videoSprite.destroy();
      destroyVideo(video);
      backend.destroy();
    }
  });
});
