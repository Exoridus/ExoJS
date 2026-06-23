import type { Cloneable, TimeInterval } from './types';

let temp: Time | null = null;

/**
 * Time-duration value object stored internally in milliseconds. Provides
 * unit-converted accessors (`seconds`, `minutes`, `hours`) and arithmetic
 * helpers ({@link Time.add}, {@link Time.subtract}, {@link Time.addTime}).
 *
 * Constants on the class hold canonical durations: {@link Time.zero},
 * {@link Time.oneSecond}, {@link Time.oneMinute}, {@link Time.oneHour}, plus
 * the {@link TimeInterval} multipliers used by the `factor` parameter.
 *
 * `Time.temp` is a shared scratch instance for hot paths — do not store the
 * reference across calls.
 */
export class Time implements Cloneable {
  private _milliseconds: number;

  public constructor(time = 0, factor: TimeInterval = Time.milliseconds) {
    this._milliseconds = time * factor;
  }

  public get milliseconds(): number {
    return this._milliseconds;
  }

  public set milliseconds(milliseconds: number) {
    this._milliseconds = milliseconds;
  }

  public get seconds(): number {
    return this._milliseconds / Time.seconds;
  }

  public set seconds(seconds: number) {
    this._milliseconds = seconds * Time.seconds;
  }

  public get minutes(): number {
    return this._milliseconds / Time.minutes;
  }

  public set minutes(minutes: number) {
    this._milliseconds = minutes * Time.minutes;
  }

  public get hours(): number {
    return this._milliseconds / Time.hours;
  }

  public set hours(hours: number) {
    this._milliseconds = hours * Time.hours;
  }

  /**
   * Replace the stored duration with `time * factor` milliseconds. Pair
   * with {@link Time.seconds}, {@link Time.minutes}, or {@link Time.hours}
   * as the `factor` to construct from non-millisecond units.
   */
  public set(time = 0, factor: TimeInterval = Time.milliseconds): this {
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
    return (
      (milliseconds === undefined || this.milliseconds === milliseconds) &&
      (seconds === undefined || this.seconds === seconds) &&
      (minutes === undefined || this.minutes === minutes) &&
      (hours === undefined || this.hours === hours)
    );
  }

  public greaterThan(time: Time): boolean {
    return this._milliseconds > time.milliseconds;
  }

  public lessThan(time: Time): boolean {
    return this._milliseconds < time.milliseconds;
  }

  public clone(): this {
    return new Time(this._milliseconds) as this;
  }

  public copy(time: Time): this {
    this._milliseconds = time.milliseconds;

    return this;
  }

  /** Add `value * factor` milliseconds in place. Mutates this instance. */
  public add(value = 0, factor: TimeInterval = Time.milliseconds): this {
    this._milliseconds += value * factor;

    return this;
  }

  /** Add another `Time` value in place. Mutates this instance. */
  public addTime(time: Time): this {
    this._milliseconds += time.milliseconds;

    return this;
  }

  /** Subtract `value * factor` milliseconds in place. Mutates this instance. */
  public subtract(value = 0, factor: TimeInterval = Time.milliseconds): this {
    this._milliseconds -= value * factor;

    return this;
  }

  /** Subtract another `Time` value in place. Mutates this instance. */
  public subtractTime(time: Time): this {
    this._milliseconds -= time.milliseconds;

    return this;
  }

  public destroy(): void {
    // no-op — pure value class, kept for Destroyable interface conformance
  }

  public static readonly milliseconds: TimeInterval = 1;
  public static readonly seconds: TimeInterval = 1000;
  public static readonly minutes: TimeInterval = 60000;
  public static readonly hours: TimeInterval = 3600000;

  /** Current high-resolution monotonic time (`performance.now()`) as a {@link Time}. */
  public static now(): Time {
    return new Time(performance.now());
  }

  /** Construct a {@link Time} from a millisecond count. */
  public static fromMilliseconds(value: number): Time {
    return new Time(value, Time.milliseconds);
  }

  /** Construct a {@link Time} from a second count. */
  public static fromSeconds(value: number): Time {
    return new Time(value, Time.seconds);
  }

  /** Construct a {@link Time} from a minute count. */
  public static fromMinutes(value: number): Time {
    return new Time(value, Time.minutes);
  }

  /** Construct a {@link Time} from an hour count. */
  public static fromHours(value: number): Time {
    return new Time(value, Time.hours);
  }

  public static readonly zero = new Time(0);
  public static readonly oneMillisecond = new Time(1);
  public static readonly oneSecond = new Time(1, Time.seconds);
  public static readonly oneMinute = new Time(1, Time.minutes);
  public static readonly oneHour = new Time(1, Time.hours);

  /**
   * Shared scratch {@link Time} instance for intermediate calculations. Never
   * retain the reference across frames or async boundaries.
   * @internal
   */
  public static get temp(): Time {
    if (temp === null) {
      temp = new Time();
    }

    return temp;
  }
}
