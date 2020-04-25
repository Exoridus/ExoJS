import { Clock } from './Clock';
import { Time } from "core/Time";

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

    public get expired(): boolean {
        return this.elapsedMilliseconds >= this._limit.milliseconds;
    }

    public get remainingMilliseconds(): number {
        return Math.max(0, this._limit.milliseconds - this.elapsedMilliseconds);
    }

    public get remainingSeconds(): number {
        return this.remainingMilliseconds / Time.Seconds;
    }

    public get remainingMinutes(): number {
        return this.remainingMilliseconds / Time.Minutes;
    }

    public get remainingHours(): number {
        return this.remainingMilliseconds / Time.Hours;
    }
}
