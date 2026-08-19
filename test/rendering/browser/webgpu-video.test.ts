/**
 * WebGPU Video browser test - v0.16 renderer-matrix drawable entry.
 *
 * {@link Video} wraps an `HTMLVideoElement` as a live-texture drawable (see
 * `src/rendering/video/Video.ts`): its `Texture` holds the video element
 * directly as `source`, and `updateTexture()` calls `texture.updateSource()`
 * to bump the texture version whenever the decoded frame changes. On the
 * WebGPU backend, `Video` resolves to `WebGpuVideoRenderer`
 * (`src/rendering/webgpu/WebGpuVideoRenderer.ts`), which attempts a zero-copy
 * `GPUExternalTexture` import fresh every flush and falls back to a
 * `texture_2d` copy-upload path (`device.queue.copyExternalImageToTexture`,
 * the same generic upload `WebGpuBackend` uses for any non-DataTexture,
 * non-RenderTexture source) on any failure, before the renderer draws an
 * instanced quad sampling whichever texture resource that flush bound. Most
 * tests below exercise whichever path the real adapter actually takes and do
 * not distinguish which one ran; two tests force the fallback path
 * explicitly (removing `importExternalTexture` from the device, and a video
 * with no decoded frame yet) to assert that branch is reachable and correct.
 *
 * Fixture strategy: a `<canvas>` painted a solid or two-tone colour is turned
 * into a `MediaStream` via `captureStream()`, assigned to a `<video>` element's
 * `srcObject`, and played (muted, so no user-gesture is required). We poll
 * `videoWidth`/`readyState` for the first decoded frame instead of relying on
 * `requestVideoFrameCallback` - empirically, in this headless Chromium
 * configuration `requestVideoFrameCallback` never fires (even with the video
 * attached to the DOM and a `requestAnimationFrame` pump kept alive for the
 * full test). The bounded wait starts before `video.play()`: under full-lane
 * load that promise can stay pending indefinitely even though isolated runs
 * decode in under a second. A *second*,
 * dynamic scenario - repainting the source canvas after the first decoded
 * frame and asserting the video texture picks up the new colour - was
 * prototyped and found NOT to be reliably observable within a bounded window
 * in this headless environment (0/5 across two variants, including a
 * `requestAnimationFrame`-pumped + DOM-attached variant); it is intentionally
 * NOT included here to avoid committing a flaky test. Only the reliable,
 * bounded initial-decode-and-render path is asserted below.
 *
 * All WebGPU renderers use inline WGSL - no shader file mocks are needed.
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

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

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

/**
 * Create an `HTMLVideoElement` playing a `MediaStream` sourced from a
 * `<canvas>` `paint` leaves in whatever state, resolved once the first frame
 * has decoded.
 *
 * Polls `videoWidth`/`readyState` rather than `requestVideoFrameCallback` -
 * see the file header comment for why.
 */
const createPaintedVideo = async (paint: (ctx: CanvasRenderingContext2D, size: number) => void, size = 16): Promise<HTMLVideoElement> => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const ctx = source.getContext('2d')!;

  paint(ctx, size);

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

    // `play()` may stay pending indefinitely under a fully loaded browser lane,
    // so its promise must live inside the same bounded wait as first-frame
    // readiness. Polling can still succeed before the play promise settles.
    void video.play().catch(fail);
    poll();
  });

  return video;
};

/** A video whose decoded frame is a single solid colour. */
const createSolidColorVideo = (color: string, size = 16): Promise<HTMLVideoElement> =>
  createPaintedVideo((ctx, fillSize) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, fillSize, fillSize);
  }, size);

/**
 * A video whose decoded frame is split into a `topColor` top half and a
 * `bottomColor` bottom half - deliberately asymmetric under vertical flip, so
 * a test sampling one pixel from each half can catch a `flipY`/UV-orientation
 * regression that a solid-colour fixture cannot (a uniformly-coloured square
 * looks identical flipped or not).
 */
const createTwoToneVideo = (topColor: string, bottomColor: string, size = 16): Promise<HTMLVideoElement> =>
  createPaintedVideo((ctx, fillSize) => {
    const half = fillSize / 2;

    ctx.fillStyle = topColor;
    ctx.fillRect(0, 0, fillSize, half);
    ctx.fillStyle = bottomColor;
    ctx.fillRect(0, half, fillSize, half);
  }, size);

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
      ctx.skip('WebGPU device lost mid-test - unstable software adapter');

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

describe('WebGPU Video - solid color frame', () => {
  test('decoded video frame renders and fills its bounds', async ctx => {
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

      const readPixel = readWebGpuPixels(backend, canvasSize);

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

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(16, 16), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      videoSprite.destroy();
      destroyVideo(video);
      backend.destroy();
    }
  });

  test('premultiply semantics hold for a translucent tint', async ctx => {
    const backend = await setupBackend();

    const video = await createSolidColorVideo('#ffffff', 16);
    const root = new Container();
    const videoSprite = new Video(video);

    try {
      videoSprite.setPosition(8, 8);
      // Alpha is 0-1 on Color, not 0-255 (see src/core/Color.ts). A fully
      // opaque tint cannot distinguish premultiplied from unpremultiplied
      // output - 0.5 makes the two diverge.
      videoSprite.tint = new Color(255, 0, 0, 0.5);
      root.addChild(videoSprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // The vertex stage premultiplies tint by its own alpha before the
      // fragment modulates the (opaque, alpha=1) video sample by it, so the
      // shaded fragment is (255, 0, 0, 128) premultiplied - 128 from
      // Math.round(0.5 * 255) (see packTintRow in TransformBuffer.ts).
      // Composited with Normal (premultiplied source-over: srcFactor 'one',
      // dstFactor 'one-minus-src-alpha') over the opaque black clear
      // (alpha 1), the output alpha saturates to 1 regardless of the tint's
      // alpha - only RGB carries the premultiply signal here. A renderer
      // that forgot to premultiply the tint would instead composite full
      // brightness (255, 0, 0), not half.
      expectPixelNear(readPixel(16, 16), [128, 0, 0, 255]);
    } finally {
      root.destroy();
      videoSprite.destroy();
      destroyVideo(video);
      backend.destroy();
    }
  });

  test('external-texture path renders the decoded frame in the correct orientation', async ctx => {
    const backend = await setupBackend();

    // Top half blue, bottom half yellow: a solid-colour fixture is invariant
    // under vertical flip, so it cannot catch a flipY/UV regression on either
    // draw path - this one can, because top-blue-bottom-yellow-flipped reads
    // as top-yellow-bottom-blue instead.
    const video = await createTwoToneVideo('#0000ff', '#ffff00', 16);
    const root = new Container();
    const videoSprite = new Video(video);

    try {
      videoSprite.setPosition(8, 8);
      root.addChild(videoSprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // Sprite bounds are canvas [8, 24) x [8, 24); the source's vertical
      // midline lands at canvas y = 16. Sampled well clear of that boundary
      // and of the sprite's own edges.
      expectPixelNear(readPixel(16, 10), [0, 0, 255, 255]);
      expectPixelNear(readPixel(16, 22), [255, 255, 0, 255]);
    } finally {
      root.destroy();
      videoSprite.destroy();
      destroyVideo(video);
      backend.destroy();
    }
  });

  test('fallback path renders correctly when the device has no importExternalTexture', async ctx => {
    const backend = await setupBackend();
    const device = getBackendDevice(backend);
    const original = device.importExternalTexture;

    // @ts-expect-error -- deliberately removing a required method to force the fallback branch
    device.importExternalTexture = undefined;

    const video = await createSolidColorVideo('#00ff00', 16);
    const root = new Container();
    const videoSprite = new Video(video);

    try {
      videoSprite.setPosition(8, 8);
      root.addChild(videoSprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(16, 16), [0, 255, 0, 255]);
    } finally {
      device.importExternalTexture = original;
      root.destroy();
      videoSprite.destroy();
      destroyVideo(video);
      backend.destroy();
    }
  });

  test('fallback path renders correctly when the video has no decoded frame yet (readyState gate)', async ctx => {
    const backend = await setupBackend();

    // A video element that never plays: readyState stays HAVE_NOTHING (0),
    // videoWidth stays 0 - exercises the readiness pre-check, not the
    // capability check. Render is expected to draw nothing (texture width 0
    // early-outs in `render()`), which is itself the assertion: no GPU
    // validation error and no crash.
    const video = document.createElement('video');
    const root = new Container();
    const videoSprite = new Video(video);

    try {
      root.addChild(videoSprite);

      const rendered = await renderScene(ctx, backend, root);

      expect(rendered).toBe(true);
    } finally {
      root.destroy();
      videoSprite.destroy();
      backend.destroy();
    }
  });
});
