import type { Cloneable, TimeInterval } from './types';

/**
 * A length of time that the holder may read but not change.
 *
 * The type every duration the engine hands out is declared as - the frame
 * delta, the fixed step, a clock's elapsed time, the canonical constants on
 * {@link Time}. Each of those is a shared instance the engine keeps mutating,
 * so a caller that needs a duration of its own copies it into one:
 * `Time.fromMilliseconds(delta.milliseconds)`.
 *
 * {@link Time} implements it. Take a `Time` instead where the callee is meant
 * to write.
 */
export interface Duration {
  readonly milliseconds: number;
  readonly seconds: number;
  readonly minutes: number;
  readonly hours: number;
  equals(other?: Partial<Duration>): boolean;
  greaterThan(time: Duration): boolean;
  lessThan(time: Duration): boolean;
}

/**
 * Time-duration value object stored internally in milliseconds. Provides
 * unit-converted accessors (`seconds`, `minutes`, `hours`) and arithmetic
 * helpers ({@link Time.add}, {@link Time.subtract}, {@link Time.addTime}).
 *
 * Arithmetic mutates in place, so an instance reached by more than one owner
 * is a shared mutable value. The canonical constants ({@link Time.zero},
 * {@link Time.oneMillisecond}, {@link Time.oneSecond}, {@link Time.oneMinute},
 * {@link Time.oneHour}) are process-wide and therefore typed as
 * {@link Duration}: the mutators are not reachable on them.
 *
 * The {@link TimeInterval} multipliers used by the `factor` parameter
 * (`Time.milliseconds`, `Time.seconds`, `Time.minutes`, `Time.hours`) are
 * plain numbers.
 */
export class Time implements Cloneable<Time>, Duration {
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

  public equals({ milliseconds, seconds, minutes, hours }: Partial<Duration> = {}): boolean {
    return (
      (milliseconds === undefined || this.milliseconds === milliseconds) &&
      (seconds === undefined || this.seconds === seconds) &&
      (minutes === undefined || this.minutes === minutes) &&
      (hours === undefined || this.hours === hours)
    );
  }

  public greaterThan(time: Duration): boolean {
    return this._milliseconds > time.milliseconds;
  }

  public lessThan(time: Duration): boolean {
    return this._milliseconds < time.milliseconds;
  }

  public clone(): this {
    return new Time(this._milliseconds) as this;
  }

  public copy(time: Duration): this {
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
    // no-op - pure value class, kept for Destroyable interface conformance
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

  /** Canonical zero duration. Shared process-wide; copy it to obtain a duration you own. */
  public static readonly zero: Duration = new Time(0);
  /** Canonical one-millisecond duration. Shared process-wide; copy it to obtain a duration you own. */
  public static readonly oneMillisecond: Duration = new Time(1);
  /** Canonical one-second duration. Shared process-wide; copy it to obtain a duration you own. */
  public static readonly oneSecond: Duration = new Time(1, Time.seconds);
  /** Canonical one-minute duration. Shared process-wide; copy it to obtain a duration you own. */
  public static readonly oneMinute: Duration = new Time(1, Time.minutes);
  /** Canonical one-hour duration. Shared process-wide; copy it to obtain a duration you own. */
  public static readonly oneHour: Duration = new Time(1, Time.hours);
}

// `Duration` hides the mutators from TypeScript, but the constants are real
// `Time` instances shared process-wide: a cast or a plain-JavaScript caller
// still reaches `set`. Freezing turns that into a TypeError where it happens,
// rather than a value silently wrong for every later reader. Dev only - in a
// production build `__DEV__` is `false` and the block is dropped.
if (__DEV__) {
  Object.freeze(Time.zero);
  Object.freeze(Time.oneMillisecond);
  Object.freeze(Time.oneSecond);
  Object.freeze(Time.oneMinute);
  Object.freeze(Time.oneHour);
}
