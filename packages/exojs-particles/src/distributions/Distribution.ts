/**
 * Value distribution sampled at particle spawn time. Each `sample()` call
 * may return a different value — used to randomize spawn properties
 * (lifetime, position, velocity, scale, tint, ...) without per-particle
 * subclassing.
 *
 * Implementations come in two flavours:
 *
 * - **Stateless / scalar** (e.g. {@link Constant}, {@link Range}) just
 *   return a `T` directly.
 * - **Mutable-target** (Vector / Color distributions) accept an optional
 *   `out` parameter and write into it in place. Pass your own scratch
 *   instance to avoid per-spawn heap allocations; omit it to use the
 *   distribution's internal scratch (only valid until the next call).
 *
 * @example
 * const lifetime = new Range(0.5, 1.5);          // seconds, uniform
 * const velocity = new VectorRange(-50, 50, -200, -100);
 * const tint     = new ColorGradient([
 *     { t: 0,   color: Color.white },
 *     { t: 0.7, color: Color.yellow },
 *     { t: 1,   color: Color.transparent },
 * ]);
 *
 * for (let i = 0; i < count; i++) {
 *     particle.totalLifetime = lifetime.sample();
 *     velocity.sample(particle.velocity);
 *     // tint is applied per-frame by ColorOverLifetime, not at spawn.
 * }
 */
export interface Distribution<T> {
  sample(out?: T): T;
}

/**
 * Lifetime-parameterised function that produces a deterministic `T` for a
 * given lifetime ratio `t` in `[0, 1]`. Used by per-frame update modules
 * that interpolate over particle lifetime — `ColorOverLifetime` (ColorGradient),
 * `ScaleOverLifetime` (Curve), etc.
 *
 * Mutable-target rule: same as {@link Distribution} — pass your own scratch
 * via `out` for hot loops, omit for one-off calls.
 */
export interface LifetimeFunction<T> {
  evaluate(t: number, out?: T): T;
}
