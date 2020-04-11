import { TimeInterval } from '../../const/core';

export default class Time {

    public static readonly Zero = new Time(0);
    public static readonly OneMillisecond = new Time(1);
    public static readonly OneSecond = new Time(1, TimeInterval.SECONDS);
    public static readonly OneMinute = new Time(1, TimeInterval.MINUTES);
    public static readonly OneHour = new Time(1, TimeInterval.HOURS);
    public static Temp = new Time();

    private _milliseconds: number;

    public constructor(time: number = 0, factor: TimeInterval = TimeInterval.MILLISECONDS) {
        this._milliseconds = time * factor;
    }

    public get milliseconds(): number {
        return this._milliseconds;
    }

    public set milliseconds(milliseconds: number) {
        this._milliseconds = milliseconds;
    }

    public get seconds(): number {
        return this._milliseconds / TimeInterval.SECONDS;
    }

    public set seconds(seconds: number) {
        this._milliseconds = seconds * TimeInterval.SECONDS;
    }

    public get minutes(): number {
        return this._milliseconds / TimeInterval.MINUTES;
    }

    public set minutes(minutes: number) {
        this._milliseconds = minutes * TimeInterval.MINUTES;
    }

    public get hours(): number {
        return this._milliseconds / TimeInterval.HOURS;
    }

    public set hours(hours: number) {
        this._milliseconds = hours * TimeInterval.HOURS;
    }

    public set(time: number = 0, factor: TimeInterval = TimeInterval.MILLISECONDS): this {
        this._milliseconds = time * factor;

        return this;
    }

    public setMilliseconds(milliseconds: number): this {
        this.milliseconds = milliseconds;

        return this;
    }

    public setSeconds(seconds: number): this {
        this.seconds = seconds;

        return this;
    }

    public setMinutes(minutes: number): this {
        this.minutes = minutes;

        return this;
    }

    public setHours(hours: number): this {
        this.hours = hours;

        return this;
    }

    public equals({ milliseconds, seconds, minutes, hours }: Partial<Time> = {}): boolean {
        return (milliseconds === undefined || this.milliseconds === milliseconds)
            && (seconds === undefined || this.seconds === seconds)
            && (minutes === undefined || this.minutes === minutes)
            && (hours === undefined || this.hours === hours);
    }

    public greaterThan(time: Time): boolean {
        return this._milliseconds > time.milliseconds;
    }

    public lessThan(time: Time): boolean {
        return this._milliseconds < time.milliseconds;
    }

    public clone(): Time {
        return new Time(this._milliseconds);
    }

    public copy(time: Time): this {
        this._milliseconds = time.milliseconds;

        return this;
    }

    public add(value: number = 0, factor: TimeInterval = TimeInterval.MILLISECONDS): this {
        this._milliseconds += (value * factor);

        return this;
    }

    public addTime(time: Time): this {
        this._milliseconds += time.milliseconds;

        return this;
    }

    public subtract(value: number = 0, factor: TimeInterval = TimeInterval.MILLISECONDS): this {
        this._milliseconds -= (value * factor);

        return this;
    }

    public subtractTime(time: Time): this {
        this._milliseconds -= time.milliseconds;

        return this;
    }

    public destroy() {

    }
}

