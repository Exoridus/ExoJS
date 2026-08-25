import type { TimeSource } from '#platform/PlatformAdapter';

import { Clock } from './Clock';
import { type Milliseconds, milliseconds, type Seconds, seconds } from './units';

/**
 * {@link Clock} variant with a fixed limit. Inherits start/stop/reset/restart
 * semantics; adds {@link Timer.expired} (true once the elapsed time reaches the
 * limit) and remaining-time accessors. Useful for cooldowns, delays, and any
 * timed gating logic where you want to ask "is the duration up?" each frame.
 */
export class Timer extends Clock {
  private _limit: Seconds;

  public constructor(limit: Seconds, autoStart = false, timeSource?: TimeSource) {
    super(false, timeSource);

    this._limit = limit;

    if (autoStart) {
      this.restart();
    }
  }

  public get limit(): Seconds {
    return this._limit;
  }

  public set limit(limit: Seconds) {
    this._limit = limit;
  }

  /** `true` once the elapsed time has reached or exceeded the configured limit. */
  public get expired(): boolean {
    return this.elapsedSeconds >= this._limit;
  }

  /** Time left until {@link Timer.expired}, clamped at zero. */
  public get remainingSeconds(): Seconds {
    return seconds(Math.max(0, this._limit - this.elapsedSeconds));
  }

  /** {@link Timer.remainingSeconds} in milliseconds. */
  public get remainingMilliseconds(): Milliseconds {
    return milliseconds(this.remainingSeconds * 1000);
  }

  /** {@link Timer.remainingSeconds} in minutes. */
  public get remainingMinutes(): number {
    return this.remainingSeconds / 60;
  }

  /** {@link Timer.remainingSeconds} in hours. */
  public get remainingHours(): number {
    return this.remainingSeconds / 3600;
  }
}
