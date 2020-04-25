import { Time } from './Time';
import { getPreciseTime } from 'utils/core';

export class Clock {

    private _startTime: Time;
    private _elapsedTime: Time = new Time(0);
    private _running = false;

    public constructor(startTime: Time = Time.Zero, autoStart = false) {
        this._startTime = startTime.clone();

        if (autoStart) {
            this.start();
        }
    }

    public get running(): boolean {
        return this._running;
    }

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

    public start(): this {
        if (!this._running) {
            this._running = true;
            this._startTime.milliseconds = getPreciseTime();
        }

        return this;
    }

    public stop(): this {
        if (this._running) {
            this._running = false;
            this._elapsedTime.add(getPreciseTime() - this._startTime.milliseconds);
        }

        return this;
    }

    public reset(): this {
        this._running = false;
        this._elapsedTime.setMilliseconds(0);

        return this;
    }

    public restart(): this {
        this.reset();
        this.start();

        return this;
    }

    public destroy() {
        this._startTime.destroy();
        this._elapsedTime.destroy();
    }
}
