/**
 * The outcome of reading one cache record.
 *
 * A miss and a failure are deliberately different things: a miss resolves to
 * `{ hit: false }`, a store that could not answer rejects. Reporting both as
 * one absent value would make "this entry was never written" indistinguishable
 * from "the database is broken", which is exactly the distinction a
 * cache-only policy has to act on.
 *
 * The `hit` discriminant is what carries the value, so a stored `null` or
 * `undefined` is still a hit.
 * @advanced
 */
export type CacheReadResult<T = unknown> = { readonly hit: true; readonly value: T } | { readonly hit: false };

/**
 * The shared miss result. Frozen and reusable, so a store that misses
 * allocates nothing.
 * @advanced
 */
export const cacheMiss: CacheReadResult<never> = Object.freeze({ hit: false });

/**
 * A hit carrying `value`.
 * @advanced
 */
export function cacheHit<T>(value: T): CacheReadResult<T> {
  return { hit: true, value };
}
