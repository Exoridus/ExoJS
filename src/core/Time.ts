import { Cloneable, TimeInterval } from "types/types";

let temp: Time | null = null;

export class Time implements Cloneable {

    private _milliseconds: number;

    public constructor(time = 0, factor: TimeInterval = Time.Milliseconds) {
        this._milliseconds = time * factor;
    }

    public get milliseconds(): number {
        return this._milliseconds;
    }

    public set milliseconds(milliseconds: number) {
        this._milliseconds = milliseconds;
    }

    public get seconds(): number {
        return this._milliseconds / Time.Seconds;
    }

    public set seconds(seconds: number) {
        this._milliseconds = seconds * Time.Seconds;
    }

    public get minutes(): number {
        return this._milliseconds / Time.Minutes;
    }

    public set minutes(minutes: number) {
        this._milliseconds = minutes * Time.Minutes;
    }

    public get hours(): number {
        return this._milliseconds / Time.Hours;
    }

    public set hours(hours: number) {
        this._milliseconds = hours * Time.Hours;
    }

    public set(time = 0, factor: TimeInterval = Time.Milliseconds): this {
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

    public clone(): this {
        return new (this.constructor as any)(this._milliseconds);
    }

    public copy(time: Time): this {
        this._milliseconds = time.milliseconds;

        return this;
    }

    public add(value = 0, factor: TimeInterval = Time.Milliseconds): this {
        this._milliseconds += (value * factor);

        return this;
    }

    public addTime(time: Time): this {
        this._milliseconds += time.milliseconds;

        return this;
    }

    public subtract(value = 0, factor: TimeInterval = Time.Milliseconds): this {
        this._milliseconds -= (value * factor);

        return this;
    }

    public subtractTime(time: Time): this {
        this._milliseconds -= time.milliseconds;

        return this;
    }

    public destroy() {
        // todo - check if destroy is needed
    }

    public static readonly Milliseconds: TimeInterval = 1;
    public static readonly Seconds: TimeInterval = 1000;
    public static readonly Minutes: TimeInterval = 60000;
    public static readonly Hours: TimeInterval = 3600000;

    public static readonly Zero = new Time(0);
    public static readonly OneMillisecond = new Time(1);
    public static readonly OneSecond = new Time(1, Time.Seconds);
    public static readonly OneMinute = new Time(1, Time.Minutes);
    public static readonly OneHour = new Time(1, Time.Hours);

    public static get Temp(): Time {
        if (temp === null) {
            temp = new Time();
        }

        return temp;
    }
}