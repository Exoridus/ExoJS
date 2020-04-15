import { TimeInterval } from 'const/core';
import { Clock } from './Clock';

export class Timer extends Clock {

    private _limit: number;

    public constructor({ limit = 0, factor = TimeInterval.MILLISECONDS, autoStart = false } = {}) {
        super();

        this._limit = (limit * factor);

        if (autoStart) {
            this.restart();
        }
    }

    public set limit(limit: number) {
        this._limit = limit;
    }

    public get expired(): boolean {
        return this.elapsedMilliseconds >= this._limit;
    }

    public get remainingMilliseconds(): number {
        return Math.max(0, this._limit - this.elapsedMilliseconds);
    }

    public get remainingSeconds(): number {
        return this.remainingMilliseconds / TimeInterval.SECONDS;
    }

    public get remainingMinutes(): number {
        return this.remainingMilliseconds / TimeInterval.MINUTES;
    }

    public get remainingHours(): number {
        return this.remainingMilliseconds / TimeInterval.HOURS;
    }
}
