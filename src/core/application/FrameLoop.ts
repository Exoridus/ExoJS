import { Clock } from '#core/Clock';
import { FixedTimestep } from '#core/FixedTimestep';
import { type Seconds, seconds } from '#core/units';
import type { PlatformAdapter } from '#platform/PlatformAdapter';

/** Default fixed-timestep size in milliseconds (60 Hz). */
export const defaultFixedStepMs = 1000 / 60;
/**
 * Upper bound on the simulation delta a single frame may report. Debugger
 * pauses, device sleep/resume and severe scheduling gaps would otherwise
 * advance animation by the whole gap at once.
 */
export const maxDeltaMs = 100;

/** What one frame is given to work with, derived once at the top of the frame. */
export interface FrameTiming {
  /** Unclamped host time since the previous frame began. */
  readonly rawDeltaMs: number;
  /** `rawDeltaMs` capped at {@link maxDeltaMs} - the delta the simulation actually advances by. */
  readonly clampedDeltaMs: number;
  /** {@link FrameTiming.clampedDeltaMs} in seconds, as handed to every update recipient. */
  readonly frameDelta: Seconds;
  /** Fixed steps this frame owes, zero or more. */
  readonly fixedSteps: number;
}

/**
 * The frame loop's timekeeping and scheduling: the host frame request, the
 * three runtime clocks, the fixed-step accumulator, and the frame counter.
 *
 * It answers *when* a frame runs and *how long* it may advance. What happens
 * inside a frame belongs to the application that owns the scene graph, so the
 * frame body is the caller's - passed in as `tick` and driven from here.
 *
 * Every clock reads the host through the same {@link PlatformAdapter} as the
 * scheduling does, so a platform with a deterministic time source makes the
 * whole loop deterministic.
 */
export class FrameLoop {
  private readonly _startupClock: Clock;
  private readonly _activeClock: Clock;
  private readonly _frameClock: Clock;
  private readonly _fixed: FixedTimestep;
  private readonly _fixedSeconds: Seconds;
  private readonly _handler: (timestamp: number) => void;

  private _active = false;
  private _request = 0;
  private _frameCount = 0;
  private _alpha = 0;
  /**
   * Host timestamp of the frame the loop most recently began. The frame delta
   * is the distance between two of these rather than two readings taken inside
   * the callback, so a frame that starts late does not also report a short
   * delta.
   */
  private _lastFrameTimestamp = 0;

  public constructor(
    private readonly _platform: PlatformAdapter,
    tick: (timestamp: number) => void,
    fixedStepMs: number,
  ) {
    this._startupClock = new Clock(false, _platform);
    this._activeClock = new Clock(false, _platform);
    this._frameClock = new Clock(false, _platform);
    this._fixed = new FixedTimestep(fixedStepMs, FixedTimestep.deriveMaxSteps(maxDeltaMs, fixedStepMs));
    this._fixedSeconds = seconds(fixedStepMs / 1000);
    this._handler = (timestamp: number): void => {
      tick(timestamp);

      // Only the scheduled callback chains the next frame. The tick is
      // reachable from outside the loop, so a manual call made while the loop
      // is live would otherwise fork a second frame chain and silently double
      // the frame rate.
      if (this._active) this._request = this._platform.requestFrame(this._handler);
    };
  }

  /** Whether the loop is live - a strict superset of the application being in its running state. */
  public get active(): boolean {
    return this._active;
  }

  /** Frames completed since construction, counted only while the loop is live. */
  public get frameCount(): number {
    return this._frameCount;
  }

  /** Interpolation factor `[0, 1)` as of the last frame that reached its fixed steps. */
  public get alpha(): number {
    return this._alpha;
  }

  /** Fixed-step size in milliseconds, as configured. */
  public get stepMs(): number {
    return this._fixed.stepMs;
  }

  /** Fixed-step size as handed to every fixed-update recipient. */
  public get stepSeconds(): Seconds {
    return this._fixedSeconds;
  }

  public get startupSeconds(): Seconds {
    return this._startupClock.elapsedSeconds;
  }

  public get activeSeconds(): Seconds {
    return this._activeClock.elapsedSeconds;
  }

  public get frameSeconds(): Seconds {
    return this._frameClock.elapsedSeconds;
  }

  /** Begin measuring startup time. Separate from construction, which happens well before the application is built. */
  public startStartupClock(): void {
    this._startupClock.start();
  }

  /**
   * Go live: schedule the first frame and reset every clock the frame body
   * depends on, so every call site that can start the loop does so
   * identically.
   */
  public start(): void {
    this._active = true;
    this._request = this._platform.requestFrame(this._handler);
    this._lastFrameTimestamp = this._platform.now();
    this._frameClock.restart();
    this._fixed.reset();
    this._activeClock.start();
  }

  /**
   * Halt the loop: cancel the pending frame request and stop the active and
   * frame clocks. Returns whether this call is the one that halted it, so a
   * caller can hang work that must happen exactly once - such as settling
   * whatever the loop was driving - off the transition rather than off the
   * state.
   */
  public stop(): boolean {
    if (!this._active) {
      return false;
    }

    this._active = false;
    this._platform.cancelFrame(this._request);
    this._activeClock.stop();
    this._frameClock.stop();

    return true;
  }

  /**
   * Take a frame's timing and advance the fixed-step accumulator by it.
   *
   * The returned step count is owed immediately: the accumulator has already
   * been debited, so a caller that skips the steps loses them.
   */
  public beginFrame(timestamp: number): FrameTiming {
    const rawDeltaMs = Math.max(0, timestamp - this._lastFrameTimestamp);

    this._lastFrameTimestamp = timestamp;

    // Separate domain from the delta above: this one is the in-frame stopwatch
    // behind `frameSeconds`, restarted at the top of the frame so a reader
    // inside the frame body sees how long the frame has been running rather
    // than how long the previous one took.
    this._frameClock.restart();

    const clampedDeltaMs = Math.min(rawDeltaMs, maxDeltaMs);

    return {
      rawDeltaMs,
      clampedDeltaMs,
      frameDelta: seconds(clampedDeltaMs / 1000),
      fixedSteps: this._fixed.advance(clampedDeltaMs),
    };
  }

  /**
   * Publish the interpolation factor for {@link FrameLoop.alpha}.
   *
   * Deliberately not folded into {@link FrameLoop.beginFrame}, even
   * though the accumulator no longer moves after it: the caller invokes this
   * once its fixed steps have actually run, so a frame that throws part-way
   * through them leaves the previous frame's factor standing rather than
   * publishing one for steps that never completed. A skipped frame keeps it
   * for the same reason.
   */
  public captureAlpha(): void {
    this._alpha = this._fixed.alpha;
  }

  /**
   * Drop a frame without running it, holding the delta at zero for the next
   * one: the timestamp is adopted and the accumulator cleared, so resuming
   * after a long pause does not advance the simulation by the whole pause.
   */
  public skipFrame(timestamp: number): void {
    this._lastFrameTimestamp = timestamp;
    this._frameClock.restart();
    this._fixed.reset();
  }

  /** Close out a frame. Counted only while the loop is live, so a manual tick does not inflate the count. */
  public endFrame(): void {
    if (this._active) this._frameCount++;
  }

  public destroy(): void {
    this._startupClock.destroy();
    this._activeClock.destroy();
    this._frameClock.destroy();
  }
}
