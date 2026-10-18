/**
 * A decoded `<video>` for the browser video specs, with a bounded lifecycle.
 *
 * A painted `<canvas>` becomes a `MediaStream` through `captureStream()` and
 * plays in a muted `<video>`, so no user gesture, codec or network fixture is
 * involved. Readiness is polled (`videoWidth`, `readyState`) instead of awaiting
 * `requestVideoFrameCallback`, which never fires in headless Chromium, and the
 * whole wait - including a `video.play()` that stays pending under a loaded
 * browser - lives inside one deadline.
 *
 * Every fixture is tracked until it is disposed, so a spec that fails or skips
 * before its own cleanup cannot leave a live capture pipeline behind for the
 * next file: call {@link disposeAllVideoFixtures} from `afterEach`.
 */

/** The browser media stack could not deliver what a spec needs; the renderer was never involved. */
export class MediaFixtureError extends Error {
  public override readonly name = 'MediaFixtureError';

  public constructor(message: string) {
    super(`MEDIA FIXTURE: ${message}`);
  }
}

export interface VideoFixture {
  readonly video: HTMLVideoElement;
  /** Stops the capture tracks and detaches the element. Idempotent. */
  dispose(): void;
}

export interface VideoFixtureOptions {
  /** Edge length of the square source canvas. */
  readonly size?: number;
  /** Deadline for the first decoded frame. */
  readonly decodeWaitMs?: number;
}

/**
 * Budget for the first decoded frame. Generous on purpose: `video.play()` and
 * the decode behind it compete with the rest of the browser, and a fixture that
 * gives up early reports a timeout where the engine is not involved at all.
 * Still bounded, so a stuck fixture names itself instead of running into the
 * surrounding test timeout.
 */
const DEFAULT_DECODE_WAIT_MS = 12_000;
const POLL_INTERVAL_MS = 16;

type CapturableCanvas = HTMLCanvasElement & { captureStream?: (frameRate?: number) => MediaStream };

const live = new Set<VideoFixture>();

export const liveVideoFixtureCount = (): number => live.size;

export const disposeAllVideoFixtures = (): void => {
  for (const fixture of [...live]) {
    fixture.dispose();
  }
};

const describeState = (video: HTMLVideoElement, stream: MediaStream): string =>
  `videoWidth=${video.videoWidth}, readyState=${video.readyState}, paused=${video.paused}, tracks=[${stream
    .getTracks()
    .map(track => `${track.kind}:${track.readyState}`)
    .join(',')}]`;

/**
 * Creates a video whose source canvas `paint` redraws for as long as the first
 * frame is awaited: `captureStream` emits a frame when the canvas is drawn to,
 * so a canvas painted once before capture can miss that paint and never decode.
 */
export const createPaintedVideoFixture = async (
  paint: (ctx: CanvasRenderingContext2D, size: number) => void,
  options: VideoFixtureOptions = {},
): Promise<VideoFixture> => {
  const size = options.size ?? 16;
  const decodeWaitMs = options.decodeWaitMs ?? DEFAULT_DECODE_WAIT_MS;
  const source: CapturableCanvas = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const ctx = source.getContext('2d');

  if (ctx === null) {
    throw new MediaFixtureError('a 2D canvas context is unavailable');
  }

  if (typeof source.captureStream !== 'function') {
    throw new MediaFixtureError('HTMLCanvasElement.captureStream is unavailable');
  }

  paint(ctx, size);

  const stream = source.captureStream(30);
  const video = document.createElement('video');
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fixture: VideoFixture = {
    video,
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      clearTimeout(timer);
      video.pause();
      stream.getTracks().forEach(track => track.stop());
      video.srcObject = null;
      video.removeAttribute('src');
      video.load();
      live.delete(fixture);
    },
  };

  live.add(fixture);
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  try {
    await new Promise<void>((resolve, reject) => {
      const deadline = performance.now() + decodeWaitMs;

      const poll = (): void => {
        if (disposed) {
          reject(new MediaFixtureError('disposed while waiting for the first decoded frame'));
        } else if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
          resolve();
        } else if (performance.now() >= deadline) {
          reject(new MediaFixtureError(`no decoded frame within ${decodeWaitMs} ms (${describeState(video, stream)})`));
        } else {
          paint(ctx, size);
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      // A rejection after the wait settled is a no-op, so the play() promise can
      // stay pending or fail late without touching a finished test.
      video.play().catch((error: unknown) => reject(new MediaFixtureError(`video.play() rejected: ${String(error)}`)));
      poll();
    });
  } catch (error) {
    fixture.dispose();

    throw error;
  }

  return fixture;
};

/** A video whose decoded frame is a single solid colour. */
export const createSolidColorVideo = (color: string, size = 16): Promise<VideoFixture> =>
  createPaintedVideoFixture(
    (ctx, edge) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, edge, edge);
    },
    { size },
  );

/**
 * A video split into a `topColor` top half and a `bottomColor` bottom half:
 * asymmetric under a vertical flip, so a spec sampling one pixel from each half
 * catches a `flipY` or UV-orientation regression that a solid colour cannot.
 */
export const createTwoToneVideo = (topColor: string, bottomColor: string, size = 16): Promise<VideoFixture> =>
  createPaintedVideoFixture(
    (ctx, edge) => {
      const half = edge / 2;

      ctx.fillStyle = topColor;
      ctx.fillRect(0, 0, edge, half);
      ctx.fillStyle = bottomColor;
      ctx.fillRect(0, half, edge, half);
    },
    { size },
  );
