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
//      invariants that must remain active in production. {@link invariant}
//      is this category: it throws unconditionally and is never stripped.
//
// New callers: prefer category 1 for simple checks. For anything that
// allocates objects, calls functions, or formats strings use category 2.

/**
 * Assert `condition` at dev/test time. Throws with `[ExoJS] message` when the
 * condition is falsy and `__DEV__` is true. No-op in production builds.
 *
 * `message` is optional — omit it for invariant/in-bounds checks where the
 * stack trace already localizes the failure. Prefer a constant string over a
 * template literal: arguments are evaluated before the (stripped) body runs, so
 * an interpolated message still allocates in production.
 */
export function assert(condition: boolean, message?: string): asserts condition {
  if (__DEV__ && !condition) {
    throw new Error(`[ExoJS] ${message ?? 'assertion failed'}`);
  }
}

/**
 * Assert that `value` is neither `null` nor `undefined`. Returns the value so
 * it can be used inline in an expression. No-op in production builds (returns
 * the value cast to `T` without checking). `message` is optional.
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): T {
  if (__DEV__ && (value === null || value === undefined)) {
    throw new Error(`[ExoJS] ${message ?? 'expected a defined value'}`);
  }
  return value as T;
}

/**
 * Enforce a public-contract invariant. Always-on: throws with `[ExoJS]
 * message` when `condition` is falsy in **every** build, including
 * production — unlike {@link assert}, this is never stripped and never
 * gated by `__DEV__`. Use it for contract checks that guard against corrupt
 * state or misuse the type system cannot express, where silently continuing
 * would be worse than throwing.
 */
export function invariant(condition: boolean, message?: string): asserts condition {
  if (!condition) {
    throw new Error(`[ExoJS] ${message ?? 'invariant violated'}`);
  }
}
