import { vi } from 'vitest';

import type { Application } from '#core/Application';
import type { FrameTiming } from '#core/application/FrameLoop';
import type { Clock } from '#core/Clock';
import { type Seconds, seconds } from '#core/units';

/**
 * White-box access to the frame loop an {@link Application} runs on.
 *
 * The loop's scheduling, clocks and fixed-step accumulator live on the
 * application's private `FrameLoop`. Specs that drive frames by hand -
 * rather than letting a host actually schedule them - need to reach it, and
 * routing that through one module keeps the reach-in in a single place instead
 * of spreading string-keyed field access across a dozen spec files.
 */
const schedulerOf = (app: Application): Record<string, unknown> => (app as unknown as Record<string, unknown>)['_scheduler'] as Record<string, unknown>;

/** Whether the frame loop considers itself live. */
export const isFrameLoopActive = (app: Application): boolean => schedulerOf(app)['_active'] as boolean;

/** Put the loop into (or out of) its live state without scheduling a host frame. */
export const setFrameLoopActive = (app: Application, active: boolean): void => {
  schedulerOf(app)['_active'] = active;
};

/** The in-frame stopwatch behind {@link Application.frameSeconds}. */
export const frameClockOf = (app: Application): Clock => schedulerOf(app)['_frameClock'] as Clock;

/** The clock measuring how long the loop has been live. */
export const activeClockOf = (app: Application): Clock => schedulerOf(app)['_activeClock'] as Clock;

/** Host timestamp the loop recorded for the previous frame. */
export const lastFrameTimestampOf = (app: Application): number => schedulerOf(app)['_lastFrameTimestamp'] as number;

export const setLastFrameTimestamp = (app: Application, timestamp: number): void => {
  schedulerOf(app)['_lastFrameTimestamp'] = timestamp;
};

export const setFrameCount = (app: Application, frameCount: number): void => {
  schedulerOf(app)['_frameCount'] = frameCount;
};

/**
 * Run one frame the way the loop does. The scheduled callback, not the public
 * `update()`, is what chains the next frame, so any assertion about
 * rescheduling has to go through it.
 */
export const tickFrame = (app: Application, timestamp = 0): void => {
  (schedulerOf(app)['_handler'] as (timestamp: number) => void)(timestamp);
};

/** The scheduler surface the per-frame body actually calls. */
export interface FrameLoopDouble {
  active: boolean;
  alpha: number;
  frameCount: number;
  stepSeconds: Seconds;
  stepMs: number;
  beginFrame: (timestamp: number) => FrameTiming;
  captureAlpha: () => void;
  skipFrame: (timestamp: number) => void;
  endFrame: () => void;
  start: () => void;
  stop: () => boolean;
  destroy: () => void;
  startStartupClock: () => void;
  startupSeconds: Seconds;
  activeSeconds: Seconds;
  frameSeconds: Seconds;
}

/**
 * A scheduler stand-in for specs that build an application through
 * `Object.create()` and drive `update()` directly. Reports a live loop, a
 * 16 ms frame and no fixed steps unless told otherwise.
 */
export const createFrameLoopDouble = (overrides: Partial<FrameLoopDouble> = {}): FrameLoopDouble => ({
  active: true,
  alpha: 0,
  frameCount: 0,
  stepSeconds: seconds(1 / 60),
  stepMs: 1000 / 60,
  beginFrame: vi.fn((): FrameTiming => ({ rawDeltaMs: 16, clampedDeltaMs: 16, frameDelta: seconds(0.016), fixedSteps: 0 })),
  captureAlpha: vi.fn(),
  skipFrame: vi.fn(),
  endFrame: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(() => true),
  destroy: vi.fn(),
  startStartupClock: vi.fn(),
  startupSeconds: seconds(0),
  activeSeconds: seconds(0),
  frameSeconds: seconds(0.016),
  ...overrides,
});

/** The error-pipeline surface the per-frame body calls into. */
export interface ErrorReporterDouble {
  recent: readonly unknown[];
  recordFrameError: (error: unknown) => boolean;
  recordRenderError: (error: unknown) => void;
  resetFrameErrors: () => void;
  report: (error: Error, fatal: boolean, alreadyLogged?: boolean) => void;
}

/**
 * A reporter stand-in that never declares a frame error fatal, so a spec
 * driving `update()` by hand sees the loop survive whatever it throws.
 */
export const createErrorReporterDouble = (overrides: Partial<ErrorReporterDouble> = {}): ErrorReporterDouble => ({
  recent: [],
  recordFrameError: vi.fn(() => false),
  recordRenderError: vi.fn(),
  resetFrameErrors: vi.fn(),
  report: vi.fn(),
  ...overrides,
});

/** Both halves of the frame loop's private machinery, for an application built without its constructor. */
export interface FrameLoopDoubles {
  readonly scheduler: FrameLoopDouble;
  readonly errors: ErrorReporterDouble;
}

/**
 * Install the scheduler and error-reporter stand-ins the per-frame body needs.
 *
 * Specs that build an {@link Application} through `Object.create()` skip the
 * constructor, so neither collaborator exists; without both, `update()` fails
 * on its own error path rather than on whatever the spec is asserting.
 */
export const installFrameLoopDoubles = (
  app: object,
  overrides: { scheduler?: Partial<FrameLoopDouble>; errors?: Partial<ErrorReporterDouble> } = {},
): FrameLoopDoubles => {
  const scheduler = createFrameLoopDouble(overrides.scheduler);
  const errors = createErrorReporterDouble(overrides.errors);
  const record = app as Record<string, unknown>;

  record['_scheduler'] = scheduler;
  record['_errors'] = errors;

  return { scheduler, errors };
};
