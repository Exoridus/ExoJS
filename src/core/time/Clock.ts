import { TimeInterval } from '../../const/core';
import Time from './Time';
import { getPreciseTime } from '../../utils/core';

export default class Clock {

    private _startTime: number;
    private _time: Time = new Time();
    private _running: boolean = false;

    public constructor({ start = 0, factor = TimeInterval.MILLISECONDS, autoStart = false } = {}) {

        this._startTime = (start * factor);

        if (autoStart) {
            this.start();
        }
    }

    public get running(): boolean {
        return this._running;
    }

    public get time(): Time {
        return this._time;
    }

    public get startTime(): number {
        return this._startTime;
    }

    public get elapsedTime(): Time {
        if (this._running) {
            const now = getPreciseTime();

            this._time.add(now - this._startTime);
            this._startTime = now;
        }

        return this._time;
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

    public start(): this {
        if (!this._running) {
            this._running = true;
            this._startTime = getPreciseTime();
        }

        return this;
    }

    public stop(): this {
        if (this._running) {
            this._running = false;
            this._time.add(getPreciseTime() - this._startTime);
        }

        return this;
    }

    public reset(): this {
        this._running = false;
        this._time.setMilliseconds(0);

        return this;
    }

    public restart(): this {
        this.reset();
        this.start();

        return this;
    }

    public destroy() {
        this._time.destroy();
    }
}
