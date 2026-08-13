import type { Cloneable, TimeInterval } from './types';

/**
 * Time-duration value object stored internally in milliseconds. Provides
 * unit-converted accessors (`seconds`, `minutes`, `hours`) and arithmetic
 * helpers ({@link Time.add}, {@link Time.subtract}, {@link Time.addTime}).
 *
 * Constants on the class hold canonical durations: {@link Time.zero},
 * {@link Time.oneMillisecond}, {@link Time.oneSecond}, {@link Time.oneMinute},
 * {@link Time.oneHour}. Each of those is `Object.freeze`d — they are shared
 * process-wide, so a mutating call on one (e.g. `Time.zero.add(1)`) throws
 * instead of silently corrupting the shared instance for every other caller.
 * The {@link TimeInterval} multipliers used by the `factor` parameter
 * (`Time.milliseconds`, `Time.seconds`, `Time.minutes`, `Time.hours`) are
 * plain `static readonly` numbers, not frozen.
 */
export class Time implements Cloneable<Time> {
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

  /** Canonical zero duration. Frozen — mutating methods throw instead of corrupting the shared instance. */
  public static readonly zero: Time = freezeTime(new Time(0));
  /** Canonical one-millisecond duration. Frozen — mutating methods throw instead of corrupting the shared instance. */
  public static readonly oneMillisecond: Time = freezeTime(new Time(1));
  /** Canonical one-second duration. Frozen — mutating methods throw instead of corrupting the shared instance. */
  public static readonly oneSecond: Time = freezeTime(new Time(1, Time.seconds));
  /** Canonical one-minute duration. Frozen — mutating methods throw instead of corrupting the shared instance. */
  public static readonly oneMinute: Time = freezeTime(new Time(1, Time.minutes));
  /** Canonical one-hour duration. Frozen — mutating methods throw instead of corrupting the shared instance. */
  public static readonly oneHour: Time = freezeTime(new Time(1, Time.hours));
}

// `Object.freeze<T>` is typed to return `Readonly<T>`, and TypeScript's
// mapped-type expansion of a class with a private field loses that field's
// nominal brand — `Readonly<Time>` structurally stops satisfying `Time`
// (TS2741), even though the underlying object is still a real `Time` at
// runtime. The cast is safe: `freezeTime` never changes the value's shape,
// only its writability.
//
// Exported (rather than kept module-private) so other core modules that own
// a shared, never-mutated `Time` scratch instance handed to user code — e.g.
// `Application._fixedTime`, dispatched via `onFixedFrame` — can close the
// same "shared mutable Time reachable by user code" hole this fixes for the
// canonical constants above. Not part of the public package surface: it is
// not re-exported from the `#core` barrel, only reachable via a direct
// same-package import.
export function freezeTime(value: Time): Time {
  return Object.freeze(value) as Time;
}
