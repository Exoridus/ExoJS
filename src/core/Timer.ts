import { Clock } from './Clock';
import { Time } from '@/core/Time';

/**
 * {@link Clock} variant with a fixed limit. Inherits start/stop/reset/restart
 * semantics; adds {@link Timer.expired} (true once `elapsedTime >= limit`)
 * and remaining-time accessors. Useful for cooldowns, delays, and any timed
 * gating logic where you want to ask "is the duration up?" each frame.
 */
export class Timer extends Clock {

    private readonly _limit: Time;

    public constructor(limit: Time, autoStart = false) {
        super();

        this._limit = limit.clone();

        if (autoStart) {
            this.restart();
        }
    }

    public set limit(limit: Time) {
        this._limit.copy(limit);
    }

    /** `true` once the elapsed time has reached or exceeded the configured limit. */
    public get expired(): boolean {
        return this.elapsedMilliseconds >= this._limit.milliseconds;
    }

    public get remainingMilliseconds(): number {
        return Math.max(0, this._limit.milliseconds - this.elapsedMilliseconds);
    }

    public get remainingSeconds(): number {
        return this.remainingMilliseconds / Time.seconds;
    }

    public get remainingMinutes(): number {
        return this.remainingMilliseconds / Time.minutes;
    }

    public get remainingHours(): number {
        return this.remainingMilliseconds / Time.hours;
    }
}
