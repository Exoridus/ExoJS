import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserCommandContext } from 'vitest/node';

import { startGuideMotion, stopGuideMotion } from '../rendering/browser/guideMotionCommands';

vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>();
  const execFileSync = vi.fn();

  return { ...original, execFileSync, default: { ...original, execFileSync } };
});

interface Frame {
  data: string;
  sessionId: number;
  metadata: { timestamp: number; deviceWidth: number; deviceHeight: number; pageScaleFactor: number; offsetTop: number };
}

const fixture = (root: string, browser = 'chromium') => {
  let listener: ((frame: Frame) => void) | undefined;
  const session = {
    send: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((_event: string, callback: (frame: Frame) => void) => {
      listener = callback;
    }),
    off: vi.fn(() => {
      listener = undefined;
    }),
  };
  const bounds = { x: 42, y: 80, width: 800, height: 450 };
  const locator = vi.fn(() => ({ boundingBox: vi.fn().mockResolvedValue(bounds) }));
  const newCDPSession = vi.fn().mockResolvedValue(session);
  const context = {
    project: { config: { root } },
    page: { viewportSize: () => ({ width: 1280, height: 720 }) },
    context: { browser: () => ({ browserType: () => ({ name: () => browser }) }), newCDPSession },
    iframe: { locator },
  } as unknown as BrowserCommandContext;

  const emit = (timestamp: number, metadata: Partial<Frame['metadata']> = {}): void => {
    listener?.({
      data: Buffer.from(`frame at ${timestamp}`).toString('base64'),
      sessionId: 7,
      metadata: { timestamp, deviceWidth: 1280, deviceHeight: 720, pageScaleFactor: 1, offsetTop: 0, ...metadata },
    });
  };

  return { context, session, newCDPSession, locator, bounds, emit };
};

describe('focused guide motion capture', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(resolve(tmpdir(), 'exojs-guide-motion-'));
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    vi.stubEnv('CI', 'true');
    vi.stubEnv('EXOJS_GUIDE_MOTION', '1');
    vi.stubEnv('EXOJS_VISUAL_HEAD_SHA', 'source-head');
    vi.stubEnv('GITHUB_SHA', 'synthetic-merge');
    vi.mocked(execFileSync).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ['false', '1', 'chromium'],
    ['true', '', 'chromium'],
    ['true', '1', 'firefox'],
  ])('does not open a CDP session for CI=%s, flag=%s, browser=%s', async (ci, flag, browser) => {
    vi.stubEnv('CI', ci);
    vi.stubEnv('EXOJS_GUIDE_MOTION', flag);
    const capture = fixture(root, browser);

    expect(await startGuideMotion(capture.context, 'sprite-animation')).toBe(false);
    expect(capture.newCDPSession).not.toHaveBeenCalled();
    expect(existsSync(resolve(root, '.workspace'))).toBe(false);
  });

  it('crops from main-page canvas bounds and preserves irregular wall-clock frame timing', async () => {
    const capture = fixture(root);

    expect(await startGuideMotion(capture.context, 'sprite-animation')).toBe(true);
    capture.emit(100);
    capture.emit(100.01);
    capture.emit(100.25);
    vi.setSystemTime(100_750);
    const path = await stopGuideMotion(capture.context, [{ label: 'paused', timestamp: 100.3 }], 'completed');
    const directory = resolve(root, '.workspace/visual-review/current/guide-sprite-animation-webgl2-chromium-motion');
    const manifest = JSON.parse(readFileSync(resolve(directory, 'capture.json'), 'utf8'));

    expect(path).toBe(resolve(directory, 'clip.webm'));
    expect(capture.locator).toHaveBeenCalledWith('canvas[data-guide-motion="sprite-animation"]');
    expect(manifest.crop).toEqual(capture.bounds);
    expect(manifest.timing).toBe('wall-clock observation, not deterministic simulation frames');
    expect(manifest.outcome).toBe('completed');
    expect(manifest.sourceHead).toBe('source-head');
    expect(manifest.checkoutSha).toBe('synthetic-merge');
    expect(manifest.frames.map((frame: { timestamp: number }) => frame.timestamp)).toEqual([100, 100.25]);
    expect(manifest.observations).toEqual([{ label: 'paused', timestamp: 100.3 }]);
    expect(readFileSync(resolve(directory, 'frames.ffconcat'), 'utf8')).toContain('duration 0.250000');
    expect(readFileSync(resolve(directory, 'frames.ffconcat'), 'utf8')).toContain('duration 0.500000');
    expect(capture.session.send.mock.calls.filter(([method]) => method === 'Page.screencastFrameAck')).toHaveLength(3);
    expect(capture.session.detach).toHaveBeenCalledOnce();
    const [program, args] = vi.mocked(execFileSync).mock.calls[0];

    expect(program).toBe('ffmpeg');
    expect(args).toContain('crop=800:450:42:80,fps=12');
    expect(args?.slice(-3)).toEqual(['-t', '0.75', 'clip.webm']);
    expect(args).toContain('clip.webm');
  });

  it('releases the session and retains raw evidence when encoding fails', async () => {
    const capture = fixture(root);

    await startGuideMotion(capture.context, 'scene-navigation');
    capture.emit(100);
    capture.emit(100.2);
    vi.setSystemTime(100_500);
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('encoder unavailable');
    });

    await expect(stopGuideMotion(capture.context, [], 'failed')).rejects.toThrow('encoder unavailable');
    expect(capture.session.detach).toHaveBeenCalledOnce();
    expect(existsSync(resolve(root, '.workspace/visual-review/current/guide-scene-navigation-webgl2-chromium-motion/capture.json'))).toBe(
      true,
    );
    expect(await stopGuideMotion(capture.context, [], 'failed')).toBeNull();
  });

  it.each([
    ['deviceWidth', 800],
    ['deviceHeight', 450],
    ['pageScaleFactor', 2],
    ['offsetTop', 16],
  ])('rejects changed %s and retains the actual geometry in its failure evidence', async (field, value) => {
    const capture = fixture(root);

    await startGuideMotion(capture.context, 'sprite-animation');
    capture.emit(100);
    capture.emit(100.2, { [field]: value });
    await expect(stopGuideMotion(capture.context, [], 'completed')).rejects.toThrow('Guide screencast dimensions changed');
    const directory = resolve(root, '.workspace/visual-review/current/guide-sprite-animation-webgl2-chromium-motion');
    const manifest = JSON.parse(readFileSync(resolve(directory, 'capture.json'), 'utf8'));

    expect(manifest.captureError).toContain(`"${field}":${value}`);
    expect(manifest.frames).toHaveLength(1);
    expect(capture.session.send.mock.calls.filter(([method]) => method === 'Page.screencastFrameAck')).toHaveLength(2);
    expect(capture.session.detach).toHaveBeenCalledOnce();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('detaches a session if Chromium rejects starting the stream', async () => {
    const capture = fixture(root);

    capture.session.send.mockRejectedValueOnce(new Error('start rejected'));
    await expect(startGuideMotion(capture.context, 'parallax')).rejects.toThrow('start rejected');
    expect(capture.session.detach).toHaveBeenCalledOnce();
    expect(await stopGuideMotion(capture.context, [], 'failed')).toBeNull();
  });

  it('waits for pending frame acknowledgements before accepting a capture', async () => {
    const capture = fixture(root);
    const acknowledgements: Array<(error: Error) => void> = [];
    let completed = false;
    let failure: unknown;

    capture.session.send.mockImplementation((method: string) =>
      method === 'Page.screencastFrameAck'
        ? new Promise((_resolve, reject) => {
            acknowledgements.push(reject);
          })
        : Promise.resolve(),
    );
    await startGuideMotion(capture.context, 'parallax');
    capture.emit(100);
    capture.emit(100.2);
    const stopped = stopGuideMotion(capture.context, [], 'completed').then(
      () => {
        completed = true;
      },
      error => {
        failure = error;
      },
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(completed).toBe(false);

    for (const reject of acknowledgements) {
      reject(new Error('frame acknowledgement rejected'));
    }

    await stopped;
    expect(String(failure)).toContain('frame acknowledgement rejected');
    expect(execFileSync).not.toHaveBeenCalled();
    expect(capture.session.detach).toHaveBeenCalledOnce();
  });

  it('bounds frame acknowledgements that never settle', async () => {
    const capture = fixture(root);
    let failure: unknown;

    capture.session.send.mockImplementation((method: string) =>
      method === 'Page.screencastFrameAck' ? new Promise(() => {}) : Promise.resolve(),
    );
    await startGuideMotion(capture.context, 'parallax');
    capture.emit(100);
    capture.emit(100.2);
    void stopGuideMotion(capture.context, [], 'completed').catch(error => {
      failure = error;
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(String(failure)).toContain('acknowledging the captured frames');
    expect(execFileSync).not.toHaveBeenCalled();
    expect(capture.session.detach).toHaveBeenCalledOnce();
  });

  it('stops a stalled capture after its bounded wall-clock window', async () => {
    const capture = fixture(root);

    await startGuideMotion(capture.context, 'animated-character');
    capture.emit(100);
    capture.emit(100.2);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(capture.session.detach).toHaveBeenCalledOnce();
    await expect(stopGuideMotion(capture.context, [], 'failed')).rejects.toThrow('15 second');
    expect(capture.session.detach).toHaveBeenCalledOnce();
  });

  it('bounds a start command that never settles and detaches its session', async () => {
    const capture = fixture(root);
    let failure: unknown;

    capture.session.send.mockImplementation((method: string) =>
      method === 'Page.startScreencast' ? new Promise(() => {}) : Promise.resolve(),
    );
    void startGuideMotion(capture.context, 'parallax').catch(error => {
      failure = error;
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('starting the screencast');
    expect(capture.session.detach).toHaveBeenCalledOnce();
  });

  it.each(['Page.stopScreencast', 'detach'])('bounds a stalled %s while retaining its captured frames', async stalled => {
    const capture = fixture(root);
    let failure: unknown;

    await startGuideMotion(capture.context, 'parallax');
    capture.emit(100);
    capture.emit(100.2);

    if (stalled === 'detach') {
      capture.session.detach.mockImplementation(() => new Promise(() => {}));
    } else {
      capture.session.send.mockImplementation((method: string) => (method === stalled ? new Promise(() => {}) : Promise.resolve()));
    }

    void stopGuideMotion(capture.context, [], 'failed').catch(error => {
      failure = error;
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('timed out');
    expect(capture.session.detach).toHaveBeenCalledOnce();
    expect(existsSync(resolve(root, '.workspace/visual-review/current/guide-parallax-webgl2-chromium-motion/capture.json'))).toBe(true);
  });
});
