import type { TimeSource } from '#platform/PlatformAdapter';

import { type Milliseconds, milliseconds, type Seconds, seconds } from './units';
import { getPreciseTime } from './utils';

/** The host's own monotonic clock, used by any clock given no other source. */
const hostTimeSource: TimeSource = { now: getPreciseTime };

/**
 * High-precision clock that accumulates elapsed time while running.
 * Reads the host's monotonic clock unless a {@link TimeSource} is supplied -
 * pass an application's platform adapter to follow its time, or any
 * object with a `now()` to drive the clock deterministically from a test. Use
 * {@link Clock.start}, {@link Clock.stop}, {@link Clock.reset}, and
 * {@link Clock.restart} to control the running state; read elapsed time via
 * {@link Clock.elapsedSeconds}.
 *
 * Use {@link Timer} for a clock with a fixed limit and `expired` flag.
 */
export class Clock {
  private _startTime: Milliseconds = milliseconds(0);
  private _elapsed: Milliseconds = milliseconds(0);
  private _running = false;

  private readonly _timeSource: TimeSource;

  public constructor(autoStart = false, timeSource: TimeSource = hostTimeSource) {
    this._timeSource = timeSource;

    if (autoStart) {
      this.start();
    }
  }

  public get running(): boolean {
    return this._running;
  }

  /**
   * Total accumulated time since the last {@link Clock.reset}. While the clock
   * is running the value advances on every read, folding in the interval since
   * the previous one; while stopped it stays at the moment of stopping.
   */
  public get elapsedMilliseconds(): Milliseconds {
    if (this._running) {
      const now = this._timeSource.now();

      this._elapsed = milliseconds(this._elapsed + (now - this._startTime));
      this._startTime = milliseconds(now);
    }

    return this._elapsed;
  }

  /** {@link Clock.elapsedMilliseconds} in seconds. */
  public get elapsedSeconds(): Seconds {
    return seconds(this.elapsedMilliseconds / 1000);
  }

  /** {@link Clock.elapsedMilliseconds} in minutes. */
  public get elapsedMinutes(): number {
    return this.elapsedMilliseconds / 60000;
  }

  /** {@link Clock.elapsedMilliseconds} in hours. */
  public get elapsedHours(): number {
    return this.elapsedMilliseconds / 3600000;
  }

  /** Begin accumulating time. No-op when already running. */
  public start(): this {
    if (!this._running) {
      this._running = true;
      this._startTime = milliseconds(this._timeSource.now());
    }

    return this;
  }

  /** Halt accumulation. Elapsed time stays at the moment of stopping. */
  public stop(): this {
    if (this._running) {
      this._running = false;
      this._elapsed = milliseconds(this._elapsed + (this._timeSource.now() - this._startTime));
    }

    return this;
  }

  /** Halt and zero the accumulated time. The clock is left stopped. */
  public reset(): this {
    this._running = false;
    this._elapsed = milliseconds(0);

    return this;
  }

  /** Reset accumulated time to zero, then immediately start. Common per-frame pattern. */
  public restart(): this {
    this.reset();
    this.start();

    return this;
  }

  public destroy(): void {
    // no-op - the clock owns only numbers, kept for Destroyable conformance
  }
}
