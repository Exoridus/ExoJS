declare const secondsBrand: unique symbol;
declare const millisecondsBrand: unique symbol;

/**
 * A length of time in seconds.
 *
 * The unit every duration in the public API is expressed in - frame deltas,
 * the fixed step, elapsed totals, timer limits. It is a `number` at runtime and
 * reads as one everywhere (`delta < 0.5`, `Math.round(delta)`); the brand only
 * stops a millisecond value from being passed where seconds are meant, which no
 * plain `number` signature can catch.
 *
 * Build one with {@link Time.seconds}, {@link Time.minutes} or
 * {@link Time.hours}. Arithmetic returns a plain `number` - re-label the result
 * when handing it back to the engine.
 */
export type Seconds = number & { readonly [secondsBrand]: true };

/**
 * A length of time in milliseconds.
 *
 * The unit the platform speaks - `performance.now()`, frame timestamps, Web
 * Audio scheduling. Convert at the boundary with {@link Time.toSeconds} rather
 * than carrying milliseconds inward.
 */
export type Milliseconds = number & { readonly [millisecondsBrand]: true };

export const seconds = (value: number): Seconds => value as Seconds;
export const milliseconds = (value: number): Milliseconds => value as Milliseconds;
export const minutes = (value: number): Seconds => (value * 60) as Seconds;
export const hours = (value: number): Seconds => (value * 3600) as Seconds;
export const toSeconds = (value: Milliseconds): Seconds => (value / 1000) as Seconds;
export const toMilliseconds = (value: Seconds): Milliseconds => (value * 1000) as Milliseconds;

/**
 * Constructors for the engine's time units.
 *
 * Grouped rather than exported loose because `seconds`, `minutes` and `hours`
 * are names application code is likely to want for its own variables.
 *
 * ```ts
 * const cooldown = new Timer(Time.seconds(1.5), true);
 * scene.onFixedFrame.add(step => body.x += speed * step);
 * ```
 */
export const Time = {
  /** Label a plain number as {@link Seconds}. */
  seconds,
  /** Label a plain number as {@link Milliseconds}. */
  milliseconds,
  /** A minute count as the equivalent {@link Seconds}. */
  minutes,
  /** An hour count as the equivalent {@link Seconds}. */
  hours,
  /** Convert a millisecond length to {@link Seconds}. */
  toSeconds,
  /** Convert a second length to {@link Milliseconds}. */
  toMilliseconds,
} as const;
