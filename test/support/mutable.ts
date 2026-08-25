/** A view of `T` with `readonly` stripped from its own properties. */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Reinterpret a value as mutable, for the one thing a spec legitimately does
 * that production code must not: drive a state a real implementation owns.
 *
 * A browser's `AudioContext.state`, `HTMLMediaElement.paused` and
 * `AudioContext.currentTime` are `readonly` because the user agent advances
 * them; a spec that exercises how the engine reacts to a suspended context has
 * to set one. The same goes for proving that a getter hands back a copy - the
 * proof is an assignment the type system exists to prevent.
 *
 * Use it where the mutation IS the setup. Reaching past `readonly` on an engine
 * type to skip building the state properly is what this makes visible, not what
 * it licenses.
 */
export const mutable = <T extends object>(value: T): Mutable<T> => value as Mutable<T>;
