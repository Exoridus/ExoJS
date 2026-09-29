/**
 * WebGL2 Video browser test - v0.16 renderer-matrix drawable entry.
 *
 * {@link Video} wraps an `HTMLVideoElement` as a live-texture {@link Sprite}
 * (see `src/rendering/video/Video.ts`): its `Texture` holds the video element
 * directly as `source`, and `updateTexture()` calls `texture.updateSource()`
 * to bump the texture version whenever the decoded frame changes, which makes
 * the backend re-upload via the same generic `texImage2D(..., source)` path
 * used for any `TexImageSource` (canvas/image/video) - there is no
 * video-specific upload code in `WebGl2Backend`.
 *
 * Fixture strategy: see `_videoFixture.ts` - a painted `<canvas>` becomes a
 * `MediaStream` via `captureStream()` and plays in a muted `<video>`; readiness
 * is polled inside one deadline because `requestVideoFrameCallback` never fires
 * in this headless Chromium configuration, and `video.play()` can stay pending
 * indefinitely under load. A *second*,
 * dynamic scenario - repainting the source canvas after the first decoded
 * frame and asserting the video texture picks up the new colour - was
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
import { createSolidColorVideo, disposeAllVideoFixtures } from './_videoFixture';

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 Video — solid color frame', () => {
  afterEach(disposeAllVideoFixtures);

  test('decoded video frame uploads to the sprite texture and fills its bounds', async () => {
    const fixture = await createSolidColorVideo('#ff0000', 16);
    const backend = await createBackend();
    const root = new Container();
    const videoSprite = new Video(fixture.video);

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
      fixture.dispose();
      backend.destroy();
    }
  });

  test('tint is applied to the rendered video frame', async () => {
    const fixture = await createSolidColorVideo('#ffffff', 16);
    const backend = await createBackend();
    const root = new Container();
    const videoSprite = new Video(fixture.video);

    try {
      videoSprite.setPosition(8, 8);
      videoSprite.tint = new Color(0, 255, 0);
      root.addChild(videoSprite);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      videoSprite.destroy();
      fixture.dispose();
      backend.destroy();
    }
  });
});
