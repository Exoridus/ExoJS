// Internal dev/diagnostic utilities. Guards are stripped in production builds
// when __DEV__ is replaced with `false` by the rollup replace plugin.

const _warned = new Set<string>();

/**
 * Assert `condition` at dev/test time. Throws with `[ExoJS] message` when the
 * condition is falsy and `__DEV__` is true. No-op in production builds.
 */
export function invariant(condition: boolean, message: string): asserts condition {
  if (__DEV__ && !condition) {
    throw new Error(`[ExoJS] ${message}`);
  }
}

/**
 * Print a `console.warn` at most once per unique `key`.
 * Subsequent calls with the same key are silenced to avoid per-frame spam.
 * No-op in production builds.
 */
export function warnOnce(key: string, message: string): void {
  if (__DEV__ && !_warned.has(key)) {
    _warned.add(key);
    // eslint-disable-next-line no-console
    console.warn(`[ExoJS] ${message}`);
  }
}

/** @internal — clears the warned-keys set. For unit tests only. */
export function _resetWarnOnce(): void {
  _warned.clear();
}
