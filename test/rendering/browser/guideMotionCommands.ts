/** Node-side, opt-in recording of four existing guide interactions. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { BrowserContext, CDPSession, FrameLocator, Page } from 'playwright';
import type { BrowserCommandContext } from 'vitest/node';

export type GuideMotionId = 'sprite-animation' | 'animated-character' | 'parallax' | 'scene-navigation';
export interface GuideMotionObservation {
  readonly label: string;
  readonly timestamp: number;
}

type PlaywrightCommandContext = BrowserCommandContext & {
  readonly page: Page;
  readonly context: BrowserContext;
  readonly iframe: FrameLocator;
};

interface ScreencastFrame {
  readonly data: string;
  readonly sessionId: number;
  readonly metadata: {
    readonly timestamp?: number;
    readonly deviceWidth: number;
    readonly deviceHeight: number;
    readonly pageScaleFactor: number;
    readonly offsetTop: number;
  };
}

interface Capture {
  readonly id: GuideMotionId;
  readonly session: CDPSession;
  readonly directory: string;
  readonly crop: { x: number; y: number; width: number; height: number };
  readonly viewport: { width: number; height: number };
  readonly startedAt: number;
  readonly frames: Array<{ file: string; timestamp: number; timestampSource: string }>;
  readonly acknowledgements: Set<Promise<void>>;
  readonly onFrame: (frame: ScreencastFrame) => void;
  timer?: ReturnType<typeof setTimeout>;
  stoppedAt?: number;
  stopping?: Promise<void>;
  error?: unknown;
}

const ids = new Set<GuideMotionId>(['sprite-animation', 'animated-character', 'parallax', 'scene-navigation']);
const captures = new WeakMap<Page, Capture>();
const durationLimit = 15;
const fps = 12;

const protocolDeadline = async <T>(operation: Promise<T>, description: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Guide capture timed out ${description}.`)), 2_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const stopStream = (capture: Capture): Promise<void> => {
  if (capture.stopping !== undefined) {
    return capture.stopping;
  }

  clearTimeout(capture.timer);
  capture.stoppedAt = Date.now() / 1000;
  capture.stopping = (async () => {
    try {
      await protocolDeadline(capture.session.send('Page.stopScreencast'), 'stopping the screencast');
    } catch (error) {
      capture.error ??= error;
    } finally {
      capture.session.off('Page.screencastFrame', capture.onFrame);

      try {
        await protocolDeadline(Promise.all(capture.acknowledgements), 'acknowledging the captured frames');
      } catch (error) {
        capture.error ??= error;
      }

      try {
        await protocolDeadline(capture.session.detach(), 'detaching the screencast session');
      } catch (error) {
        capture.error ??= error;
      }
    }
  })();

  return capture.stopping;
};

export const startGuideMotion = async (context: BrowserCommandContext, id: GuideMotionId): Promise<boolean> => {
  const ctx = context as PlaywrightCommandContext;

  if (
    process.env['CI'] !== 'true' ||
    process.env['EXOJS_GUIDE_MOTION'] !== '1' ||
    ctx.context.browser()?.browserType().name() !== 'chromium'
  ) {
    return false;
  }

  if (!ids.has(id) || captures.has(ctx.page)) {
    throw new Error('Guide capture requires a known interaction and no active recording.');
  }

  // Locator bounds are in the outer page's coordinates, including Vitest's iframe.
  const crop = await ctx.iframe.locator(`canvas[data-guide-motion="${id}"]`).boundingBox();
  const viewport = ctx.page.viewportSize();

  if (
    crop === null ||
    viewport === null ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.x + crop.width > viewport.width ||
    crop.y + crop.height > viewport.height
  ) {
    throw new Error('Guide capture requires a fully visible canvas and a fixed viewport.');
  }

  const directory = resolve(ctx.project.config.root, '.workspace/visual-review/current', `guide-${id}-webgl2-chromium-motion`);

  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const session = await ctx.context.newCDPSession(ctx.page);
  const capture: Capture = {
    id,
    session,
    directory,
    crop,
    viewport,
    startedAt: Date.now() / 1000,
    frames: [],
    acknowledgements: new Set(),
    onFrame: frame => {
      // ACK even discarded frames so sampling cannot stall Chromium's stream.
      const acknowledgement = session.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).then(
        () => undefined,
        (error: unknown) => {
          capture.error ??= error;
        },
      );

      capture.acknowledgements.add(acknowledgement);
      void acknowledgement.then(() => capture.acknowledgements.delete(acknowledgement));

      if (capture.stopping !== undefined || capture.error !== undefined || capture.frames.length >= durationLimit * fps) {
        return;
      }

      const { metadata } = frame;
      const timestamp = metadata.timestamp ?? Date.now() / 1000;
      const previous = capture.frames.at(-1);

      if (previous !== undefined && timestamp - previous.timestamp < 1 / fps) {
        return;
      }

      try {
        if (
          metadata.deviceWidth !== viewport.width ||
          metadata.deviceHeight !== viewport.height ||
          metadata.pageScaleFactor !== 1 ||
          metadata.offsetTop !== 0
        ) {
          throw new Error(
            `Guide screencast dimensions changed; the canvas crop would be ambiguous. Expected ${JSON.stringify(viewport)}, received ${JSON.stringify(metadata)}.`,
          );
        }

        const file = `frame-${String(capture.frames.length).padStart(4, '0')}.jpg`;

        writeFileSync(resolve(directory, file), Buffer.from(frame.data, 'base64'));
        capture.frames.push({ file, timestamp, timestampSource: metadata.timestamp === undefined ? 'node receipt' : 'CDP frame swap' });
      } catch (error) {
        capture.error ??= error;
      }
    },
  };

  captures.set(ctx.page, capture);
  session.on('Page.screencastFrame', capture.onFrame);
  capture.timer = setTimeout(() => {
    capture.error ??= new Error('Guide capture exceeded its 15 second wall-clock limit.');
    void stopStream(capture);
  }, durationLimit * 1000);

  try {
    await protocolDeadline(
      session.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 85,
        maxWidth: viewport.width,
        maxHeight: viewport.height,
        everyNthFrame: 1,
      }),
      'starting the screencast',
    );
  } catch (error) {
    captures.delete(ctx.page);
    await stopStream(capture);

    throw error;
  }

  return true;
};

export const stopGuideMotion = async (
  context: BrowserCommandContext,
  observations: readonly GuideMotionObservation[],
  outcome: 'completed' | 'failed',
): Promise<string | null> => {
  const ctx = context as PlaywrightCommandContext;
  const capture = captures.get(ctx.page);

  if (capture === undefined) {
    return null;
  }

  captures.delete(ctx.page);
  await stopStream(capture);
  const { frames, directory, crop } = capture;
  let captureError: string | null = null;

  if (capture.error !== undefined) {
    captureError = capture.error instanceof Error ? capture.error.message : 'Guide capture failed with a non-Error rejection.';
  }

  const manifest = {
    guide: capture.id,
    browser: 'chromium',
    backend: 'webgl2',
    sourceHead: process.env['EXOJS_VISUAL_HEAD_SHA'] ?? null,
    checkoutSha: process.env['GITHUB_SHA'] ?? null,
    timing: 'wall-clock observation, not deterministic simulation frames',
    outcome,
    outcomeScope: 'recorded interaction only; the CI report owns the final test result',
    captureError,
    startedAt: capture.startedAt,
    stoppedAt: capture.stoppedAt,
    crop,
    viewport: capture.viewport,
    observations,
    frames,
  };

  // Retain raw evidence even if the stream or encoder fails.
  writeFileSync(resolve(directory, 'capture.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (capture.error !== undefined) {
    throw capture.error instanceof Error ? capture.error : new Error('Guide capture failed.', { cause: capture.error });
  }

  if (frames.length < 2) {
    throw new Error('Guide capture produced fewer than two frames.');
  }

  const concat = ['ffconcat version 1.0'];

  for (let i = 0; i < frames.length; i++) {
    const current = frames[i];
    const next = frames[i + 1]?.timestamp ?? capture.stoppedAt!;

    concat.push(`file '${current.file}'`, `duration ${Math.max(1 / fps, next - current.timestamp).toFixed(6)}`);
  }

  concat.push(`file '${frames.at(-1)!.file}'`);
  writeFileSync(resolve(directory, 'frames.ffconcat'), `${concat.join('\n')}\n`);
  const duration = Math.min(durationLimit, Math.max(1 / fps, capture.stoppedAt! - frames[0].timestamp));

  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '1',
      '-i',
      'frames.ffconcat',
      '-vf',
      `crop=${Math.round(crop.width)}:${Math.round(crop.height)}:${Math.round(crop.x)}:${Math.round(crop.y)},fps=${fps}`,
      '-an',
      '-c:v',
      'libvpx-vp9',
      '-b:v',
      '0',
      '-crf',
      '35',
      '-deadline',
      'realtime',
      '-cpu-used',
      '6',
      '-pix_fmt',
      'yuv420p',
      '-t',
      String(duration),
      'clip.webm',
    ],
    { cwd: directory, encoding: 'utf8', timeout: 20_000, stdio: 'pipe' },
  );

  return resolve(directory, 'clip.webm');
};
