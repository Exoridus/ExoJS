// Internal dev/diagnostic utilities.
//
// Every function in this module is guarded by `__DEV__`, which is statically
// replaced with `false` in production builds — the entire function body becomes
// dead code and is tree-shaken.
//
// ── Argument-evaluation note ────────────────────────────────────────────────
// JavaScript evaluates function arguments BEFORE entering the function body,
// so `assert(expensive(), msg)` still calls `expensive()` in production even
// though the assert body is a no-op. All callsites in the engine source have
// been audited and fall into these categories:
//
//   1. Trivial value/property checks — the comparisons and template-literal
//      messages are simple enough that the production cost is negligible.
//      → No guard needed; the inline `if (__DEV__ && …)` in the function
//        body is sufficient.
//
//   2. Nontrivial string formatting or allocations — the callsite wraps the
//      call in an explicit `if (__DEV__) { … }` block so the arguments are
//      never evaluated in production.
//
//   3. Side-effecting validation — callsites that mutate state must always
//      be guarded externally. (None exist in the current engine source.)
//
//   4. Always-on runtime validation — guards user input and public-contract
//      invariants that must remain active in production. These do NOT use
//      this module; they throw unconditionally.
//
// New callers: prefer category 1 for simple checks. For anything that
// allocates objects, calls functions, or formats strings use category 2.

const _warned = new Set<string>();

/**
 * Assert `condition` at dev/test time. Throws with `[ExoJS] message` when the
 * condition is falsy and `__DEV__` is true. No-op in production builds.
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (__DEV__ && !condition) {
    throw new Error(`[ExoJS] ${message}`);
  }
}

/**
 * Assert that `value` is neither `null` nor `undefined`. Returns the value so
 * it can be used inline in an expression. No-op in production builds (returns
 * the value cast to `T` without checking).
 */
export function assertDefined<T>(value: T | null | undefined, message: string): T {
  if (__DEV__ && (value === null || value === undefined)) {
    throw new Error(`[ExoJS] ${message}`);
  }
  return value as T;
}

/** @internal — alias for {@link assert}; kept for backward compatibility. */
export function invariant(condition: boolean, message: string): asserts condition {
  assert(condition, message);
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
