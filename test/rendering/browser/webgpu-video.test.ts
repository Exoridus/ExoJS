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
 * not distinguish which one ran; one test forces the fallback path explicitly
 * (removing `importExternalTexture` from the device) to assert that branch is
 * reachable and correct. A separate test covers an unplayable video (no
 * decoded frame, `texture.width === 0`) - a different early-out inside
 * `render()` itself, before either draw path is ever attempted.
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
import type { Texture } from '#rendering/texture/Texture';
import { Video } from '#rendering/video/Video';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

const canvasSize = 64;
/** The device-loss cells use their own, smaller surface. */
const deviceLossCanvasSize = 32;

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
 * Budget for the first decoded frame. Generous on purpose: `video.play()` and
 * the decode behind it compete with every other file in the lane, and a
 * fixture that gives up early reports a timeout where the engine is not
 * involved at all. Still bounded, so a genuinely stuck fixture names itself
 * instead of running into the surrounding test timeout.
 */
const decodeWaitMs = 12_000;

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
    }, decodeWaitMs);

    const poll = (): void => {
      if (settled) {
        return;
      }

      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
        settled = true;
        clearTimeout(timeout);
        resolve();
      } else {
        // Repaint while waiting. `captureStream` emits a frame when the source
        // canvas is drawn to, so a canvas painted once before the call can
        // produce no frame at all once the capture misses that first paint -
        // the decode then never starts, however long the wait.
        paint(ctx, size);
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

/**
 * Runtime skip helper. Kept out of the test bodies because a `ctx.skip` call
 * directly inside one reads to the lint rule as a statically disabled test.
 */
const skipWith = (ctx: { skip: (reason: string) => void }, reason: string): void => {
  ctx.skip(reason);
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

describe('WebGPU Video', { timeout: 30_000 }, () => {
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

  test('fallback path renders the decoded frame in the correct orientation when the device has no importExternalTexture', async ctx => {
    const backend = await setupBackend();
    const device = getBackendDevice(backend);
    const original = device.importExternalTexture;

    // @ts-expect-error -- deliberately removing a required method to force the fallback branch
    device.importExternalTexture = undefined;

    // Top half blue, bottom half yellow, same fixture and reasoning as the
    // external-texture orientation test above: a solid-colour fixture is
    // invariant under vertical flip and cannot catch a flipY/UV regression.
    // This is the `copyExternalImageToTexture` + `texture.flipY` +
    // `textureSampleGrad` path specifically - the one most likely to diverge
    // from the external-texture path's orientation - so it needs the same
    // two-tone coverage, not a weaker one.
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

      // Same geometry as the external-texture orientation test: sprite bounds
      // canvas [8, 24) x [8, 24), source midline at canvas y = 16, sampled
      // clear of that boundary and of the sprite's own edges.
      expectPixelNear(readPixel(16, 10), [0, 0, 255, 255]);
      expectPixelNear(readPixel(16, 22), [255, 255, 0, 255]);
    } finally {
      device.importExternalTexture = original;
      root.destroy();
      videoSprite.destroy();
      destroyVideo(video);
      backend.destroy();
    }
  });

  test('the external-texture path resolves its sampler without uploading the video frame', async ctx => {
    const backend = await setupBackend();
    const device = getBackendDevice(backend);
    const queue = device.queue;
    const originalCopy = queue.copyExternalImageToTexture.bind(queue);
    const originalImport = device.importExternalTexture.bind(device);

    let uploads = 0;
    let imports = 0;

    queue.copyExternalImageToTexture = ((...args: Parameters<GPUQueue['copyExternalImageToTexture']>) => {
      uploads++;

      return originalCopy(...args);
    }) as GPUQueue['copyExternalImageToTexture'];

    device.importExternalTexture = ((...args: Parameters<GPUDevice['importExternalTexture']>) => {
      const imported = originalImport(...args);

      imports++;

      return imported;
    }) as GPUDevice['importExternalTexture'];

    // One fixture for both phases: the scene, the texture and the decoded
    // stream stay identical, so the only variable across the two assertions is
    // which draw path the renderer took.
    const video = await createSolidColorVideo('#00ff00');
    const root = new Container();
    const videoSprite = new Video(video);

    try {
      videoSprite.setPosition(8, 8);
      root.addChild(videoSprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      // A second frame with the texture version bumped: on the fallback path
      // that is exactly what triggers a re-upload, so it is the frame that
      // makes the assertion below meaningful rather than vacuous.
      (videoSprite.texture as Texture).updateSource();

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      if (imports === 0) {
        skipWith(ctx, 'adapter never took the external-texture path - nothing to assert about it');

        return;
      }

      // The whole point of the external path: the decoded frame is sampled in
      // place. Resolving the sampler must not drag the generic managed-texture
      // upload along with it, which is what happens when a caller reaches for
      // the sampler through getTextureBinding instead of getTextureSampler.
      expect(uploads).toBe(0);

      // @ts-expect-error -- deliberately removing a required method to force the fallback branch
      device.importExternalTexture = undefined;
      (videoSprite.texture as Texture).updateSource();

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      // Counter-case on the same fixture: the fallback path does upload, so the
      // zero above is a property of the external path and not of a blind spy.
      expect(uploads).toBeGreaterThan(0);
    } finally {
      queue.copyExternalImageToTexture = originalCopy;
      device.importExternalTexture = originalImport;
      root.destroy();
      videoSprite.destroy();
      destroyVideo(video);
      backend.destroy();
    }
  });

  test('an unplayable video with no decoded frame draws nothing and raises no validation error', async ctx => {
    const backend = await setupBackend();

    // A video element that never plays: readyState stays HAVE_NOTHING (0),
    // videoWidth stays 0. This is `render()`'s own `texture.width === 0`
    // early-out, before either draw path is ever attempted - `flush()` then
    // takes the `_pendingVideo === null` route and `_tryImportExternalTexture`
    // is never called. Render is expected to draw nothing, which is itself the
    // assertion: no GPU validation error and no crash.
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

/**
 * Device-loss teardown, on the same fixtures as the draw-path cells above.
 *
 * Mechanism: a genuine `GPUDevice.destroy()`, reached through
 * `WebGpuBackend.destroy()` - the same real device-loss mechanism
 * `webgpu-device-lifecycle.test.ts` uses (not a synthetic `GPUDeviceLostInfo`
 * dispatch). `backend.destroy()` calls `rendererRegistry.destroy()`, which
 * disconnects every bound renderer - `WebGpuVideoRenderer.onDisconnect` among
 * them - before the device itself is destroyed for real.
 *
 * A real WebGPU device that has already resolved its `lost` promise with
 * reason `'destroyed'` never attempts automatic recovery on the same backend
 * instance, so there is no event-driven, same-instance reconnect to observe on
 * real hardware. The reconnect side of the contract is proven the way
 * `webgpu-device-lifecycle.test.ts` proves it for the backend as a whole: a
 * second, independently constructed backend - a fresh real device, a fresh
 * `WebGpuVideoRenderer` built from scratch by `onConnect` - renders the SAME
 * `Video` the first backend already rendered and lost, and must still produce
 * correct pixels. That only holds if `onDisconnect` left nothing about the
 * `Video`/`Texture` corrupted, and if `onConnect` rebuilds every
 * pipeline/layout/shader-module/buffer/sampler without stale cross-instance
 * state.
 *
 * Kept in this file rather than its own: a second video-fixture file runs
 * concurrently with this one in the browser lane, and two `captureStream`
 * pipelines competing for the headless media stack starve each other into
 * never decoding a first frame.
 */
describe('WebGPU Video device-loss teardown', { timeout: 30_000 }, () => {
  test('a genuine device loss tears down WebGpuVideoRenderer without throwing', async ctx => {
    const backend = await createWebGpuTestBackend(deviceLossCanvasSize);
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

      // Proves the device was genuinely destroyed, not merely abandoned -
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
    const first = await createWebGpuTestBackend(deviceLossCanvasSize);
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

      second = await createWebGpuTestBackend(deviceLossCanvasSize);

      if (!(await renderWebGpuOnce(ctx, second, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(second, deviceLossCanvasSize);

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
