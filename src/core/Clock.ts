import { getPreciseTime } from '@/core/utils';

import { Time } from './Time';

/**
 * High-precision wall-clock that accumulates elapsed time while running.
 * Reads from {@link performance.now} via `getPreciseTime`. Use
 * {@link Clock.start}, {@link Clock.stop}, {@link Clock.reset}, and
 * {@link Clock.restart} to control the running state; read elapsed time via
 * {@link Clock.elapsedTime} (the {@link Time} instance is shared — copy it
 * if you need to keep a snapshot).
 *
 * Use {@link Timer} for a clock with a fixed limit and `expired` flag.
 */
export class Clock {
  private _startTime: Time;
  private _elapsedTime: Time = new Time(0);
  private _running = false;

  public constructor(startTime: Time = Time.zero, autoStart = false) {
    this._startTime = startTime.clone();

    if (autoStart) {
      this.start();
    }
  }

  public get running(): boolean {
    return this._running;
  }

  /**
   * Total accumulated time since the last {@link Clock.reset}. While the
   * clock is running, the value advances on every read by folding in the
   * delta since the previous read; while stopped, the value is fixed at
   * the stop point. Returns the same {@link Time} instance — read the
   * scalar fields if you need an unchanging snapshot.
   */
  public get elapsedTime(): Time {
    if (this._running) {
      const now = getPreciseTime();

      this._elapsedTime.add(now - this._startTime.milliseconds);
      this._startTime.milliseconds = now;
    }

    return this._elapsedTime;
  }

  public get elapsedMilliseconds(): number {
    return this.elapsedTime.milliseconds;
  }

  public get elapsedSeconds(): number {
    return this.elapsedTime.seconds;
  }

  public get elapsedMinutes(): number {
    return this.elapsedTime.minutes;
  }

  public get elapsedHours(): number {
    return this.elapsedTime.hours;
  }

  /** Begin accumulating time. No-op when already running. */
  public start(): this {
    if (!this._running) {
      this._running = true;
      this._startTime.milliseconds = getPreciseTime();
    }

    return this;
  }

  /** Halt accumulation. Elapsed time stays at the moment of stopping. */
  public stop(): this {
    if (this._running) {
      this._running = false;
      this._elapsedTime.add(getPreciseTime() - this._startTime.milliseconds);
    }

    return this;
  }

  /** Halt and zero the accumulated time. The clock is left stopped. */
  public reset(): this {
    this._running = false;
    this._elapsedTime.setMilliseconds(0);

    return this;
  }

  /** Reset accumulated time to zero, then immediately start. Common per-frame pattern. */
  public restart(): this {
    this.reset();
    this.start();

    return this;
  }

  public destroy(): void {
    this._startTime.destroy();
    this._elapsedTime.destroy();
  }
}
