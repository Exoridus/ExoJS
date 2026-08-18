/**
 * WebGL2 Video browser test — v0.16 renderer-matrix drawable entry.
 *
 * {@link Video} wraps an `HTMLVideoElement` as a live-texture {@link Sprite}
 * (see `src/rendering/video/Video.ts`): its `Texture` holds the video element
 * directly as `source`, and `updateTexture()` calls `texture.updateSource()`
 * to bump the texture version whenever the decoded frame changes, which makes
 * the backend re-upload via the same generic `texImage2D(..., source)` path
 * used for any `TexImageSource` (canvas/image/video) — there is no
 * video-specific upload code in `WebGl2Backend`.
 *
 * Fixture strategy: a `<canvas>` painted a solid colour is turned into a
 * `MediaStream` via `captureStream()`, assigned to a `<video>` element's
 * `srcObject`, and played (muted, so no user-gesture is required). We poll
 * `videoWidth`/`readyState` for the first decoded frame instead of relying on
 * `requestVideoFrameCallback` — empirically, in this headless Chromium
 * configuration `requestVideoFrameCallback` never fires (even with the video
 * attached to the DOM and a `requestAnimationFrame` pump kept alive for the
 * full test). The bounded wait starts before `video.play()`: under full-lane
 * load that promise can stay pending indefinitely even though isolated runs
 * decode in under a second. A *second*,
 * dynamic scenario — repainting the source canvas after the first decoded
 * frame and asserting the video texture picks up the new colour — was
 * prototyped and found NOT to be reliably observable within a bounded window
 * in this headless environment (0/5 across two variants, including a
 * `requestAnimationFrame`-pumped + DOM-attached variant); it is intentionally
 * NOT included here to avoid committing a flaky test. Only the reliable,
 * bounded initial-decode-and-upload path is asserted below.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Video } from '#rendering/video/Video';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

const canvasSize = 64;

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app: Application = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: {
          antialias: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
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

const destroyVideo = (video: HTMLVideoElement): void => {
  video.pause();
  (video.srcObject as MediaStream | null)?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 Video — solid color frame', () => {
  test('decoded video frame uploads to the sprite texture and fills its bounds', async () => {
    const backend = await createBackend();
    const video = await createSolidColorVideo('#ff0000', 16);
    const root = new Container();
    const videoSprite = new Video(video);

    try {
      videoSprite.setPosition(8, 8);
      root.addChild(videoSprite);

      render(backend, root);

      // Interior of the video sprite (16x16 at 8,8 → covers 8..24) should be red
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);
      // Outside the sprite's bounds remains the clear color (black)
      expectPixelNear(readWebGl2Pixel(backend, 40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      videoSprite.destroy();
      destroyVideo(video);
      backend.destroy();
    }
  });

  test('tint is applied to the rendered video frame', async () => {
    const backend = await createBackend();
    const video = await createSolidColorVideo('#ffffff', 16);
    const root = new Container();
    const videoSprite = new Video(video);

    try {
      videoSprite.setPosition(8, 8);
      videoSprite.tint = new Color(0, 255, 0);
      root.addChild(videoSprite);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      videoSprite.destroy();
      destroyVideo(video);
      backend.destroy();
    }
  });
});
