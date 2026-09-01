// Correctness rules shared by every ExoJS source tree that is linted with type
// information - Core, the extension packages, and the React binding's `.ts`
// modules.
//
// Everything here was measured against the repository before being switched on,
// and the rules that were rejected are recorded next to the ones that were not,
// with the count that decided it. The rejected list is the more useful half: it
// is what stops the same rule being proposed again, and every entry on it is a
// rule that would have cost correctness, performance, or a public contract.

/**
 * Type-aware and modern-JavaScript correctness rules layered on top of
 * typescript-eslint's `recommendedTypeChecked` + `stylisticTypeChecked` base.
 *
 * They are the subset of `strictTypeChecked` and `eslint-plugin-unicorn` that
 * pays for itself here. Spread this LAST in a `rules` object so the deliberate
 * promotions below (a rule that used to be a warning) take effect; per-directory
 * relaxations still come after it and win, which is where a hot path that needs
 * an exception goes.
 */
export const typeAwareCorrectnessRules = {
  // ── typescript-eslint: strictTypeChecked additions that hold here ─────────
  // A type-only re-export that is spelled as a value export keeps a runtime
  // binding alive in the bundle for nothing.
  '@typescript-eslint/consistent-type-exports': 'error',
  '@typescript-eslint/no-deprecated': 'error',
  // Spreading a Map, a Promise or a class instance is almost always a mistake;
  // spreading a string is how the text layout walks code points, and that is
  // deliberate.
  '@typescript-eslint/no-misused-spread': ['error', { allow: ['string'] }],
  '@typescript-eslint/no-unnecessary-template-expression': 'error',
  'no-useless-constructor': 'off',
  '@typescript-eslint/no-useless-constructor': 'error',
  '@typescript-eslint/no-useless-default-assignment': 'error',
  // `||` and `??` differ exactly when a falsy-but-valid value can occur, which
  // in an engine full of numeric defaults is the bug this catches. Lazy-init
  // `if (x === null) { x = ... }` blocks are left alone: collapsing them to
  // `??=` is a rewrite with no correctness content.
  '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignoreIfStatements: true }],
  '@typescript-eslint/prefer-optional-chain': 'error',
  // Bitmask members are the reason this rule is usually rejected here, and the
  // option covers them exactly. What is left is offset arithmetic in the input
  // channel map, which is relaxed at that file rather than repo-wide.
  '@typescript-eslint/prefer-literal-enum-member': ['error', { allowBitwiseExpressions: true }],
  '@typescript-eslint/prefer-return-this-type': 'error',
  // A getter whose type is not assignable to its setter's makes `a.x = b.x`
  // fail to compile - a real defect in a public accessor pair.
  '@typescript-eslint/related-getter-setter-pairs': 'error',
  // A switch that handles a union WITHOUT a default has to handle all of it.
  // A switch that does have a default is exhaustive by construction, and this
  // repository uses one deliberately in every such place.
  '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
  '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',

  // ── Function style ───────────────────────────────────────────────────────
  // Every function value is an expression: callbacks are arrows, and a module's
  // own functions are constants rather than declarations, so a name is bound
  // where it is written instead of being hoisted to the top of the module.
  //
  // Class methods stay methods - turning one into an arrow field moves it off
  // the prototype, allocates it per instance and breaks `super`. TypeScript
  // overload sets are exempt from `func-style` on their own; a generator has no
  // arrow form and takes `const g = function* () {}`.
  //
  // An assertion or `never` signature is only honoured on a function
  // declaration or on a constant carrying an explicit type annotation, so the
  // few guards in the tree name their signature (see `core/dev.ts`).
  'func-style': ['error', 'expression'],
  'prefer-arrow-callback': 'error',
  'arrow-body-style': ['error', 'as-needed'],

  // ── Unicorn: correctness and modern APIs ─────────────────────────────────
  'unicorn/consistent-date-clone': 'error',
  'unicorn/consistent-empty-array-spread': 'error',
  'unicorn/consistent-existence-index-check': 'error',
  'unicorn/no-await-expression-member': 'error',
  'unicorn/no-document-cookie': 'error',
  'unicorn/no-invalid-fetch-options': 'error',
  // Passing a differently-bound function to removeEventListener silently keeps
  // the listener attached; on a per-scene subscription that is a leak.
  'unicorn/no-invalid-remove-event-listener': 'error',
  'unicorn/no-lonely-if': 'error',
  'unicorn/no-magic-array-flat-depth': 'error',
  'unicorn/no-object-as-default-parameter': 'error',
  'unicorn/no-single-promise-in-promise-methods': 'error',
  'unicorn/no-this-assignment': 'error',
  'unicorn/no-unnecessary-await': 'error',
  'unicorn/no-useless-fallback-in-spread': 'error',
  'unicorn/no-useless-length-check': 'error',
  'unicorn/no-useless-promise-resolve-reject': 'error',
  'unicorn/prefer-array-flat': 'error',
  'unicorn/prefer-array-flat-map': 'error',
  'unicorn/prefer-array-index-of': 'error',
  'unicorn/prefer-blob-reading-methods': 'error',
  'unicorn/prefer-date-now': 'error',
  'unicorn/prefer-dom-node-append': 'error',
  'unicorn/dom-node-dataset': 'error',
  'unicorn/prefer-event-target': 'error',
  'unicorn/prefer-includes': 'error',
  'unicorn/prefer-logical-operator-over-ternary': 'error',
  'unicorn/prefer-native-coercion-functions': 'error',
  'unicorn/prefer-negative-index': 'error',
  'unicorn/prefer-object-from-entries': 'error',
  'unicorn/prefer-optional-catch-binding': 'error',
  'unicorn/prefer-regexp-test': 'error',
  'unicorn/prefer-string-slice': 'error',
  'unicorn/prefer-string-starts-ends-with': 'error',
  'unicorn/prefer-structured-clone': 'error',
  'unicorn/relative-url-style': 'error',
  'unicorn/require-array-join-separator': 'error',
  'unicorn/require-number-to-fixed-digits-argument': 'error',
  'unicorn/text-encoding-identifier-case': 'error',
  'unicorn/escape-case': 'error',
  'unicorn/prefer-unicode-code-point-escapes': 'error',
  'unicorn/catch-error-name': 'error',
  // Covers `.size` as well as `.length`, so an emptiness check reads the same
  // whichever collection it is asking about.
  'unicorn/explicit-length-check': 'error',
  'unicorn/no-unnecessary-array-splice-count': 'error',
  // `window` is not the global object in a worker, and this engine runs in both.
  'unicorn/prefer-global-this': 'error',

  // Promoted from warning: all three are satisfied everywhere, so the warning
  // was a migration state with nothing left to migrate.
  'unicorn/no-for-each': 'error',
  'unicorn/prefer-spread': 'error',
  'unicorn/prefer-ternary': 'error',
};

// Measured and deliberately NOT enabled. The count is what decided it;
// re-open one of these by re-measuring, not by reasoning about it.
//
//   @typescript-eslint/no-non-null-assertion
//     890 in Core, 530 in packages. `!` is the engine idiom under
//     noUncheckedIndexedAccess.
//   @typescript-eslint/no-unnecessary-condition
//     107 + 28. Defensive guards against browser API variance, the same
//     reason strict-boolean-expressions is off.
//   @typescript-eslint/no-unnecessary-type-parameters
//     13 + 1. Cannot tell a type parameter that exists to capture a caller
//     type at the call site from a redundant one; every hit is public API
//     inference.
//   @typescript-eslint/no-extraneous-class
//     6. Static-only classes (Easing, GamepadPromptLayouts) are the public
//     spelling of those namespaces.
//   @typescript-eslint/no-invalid-void-type
//     12 + 3. `void` is used at type level on purpose: the Synchronous hook
//     contract, branded types, `[T] extends [void]`.
//   @typescript-eslint/no-unnecessary-type-conversion
//     10. Every hit is a `String(x)` inside a validation message on a value a
//     JavaScript caller supplied; a bare template literal throws a TypeError
//     on a symbol instead of producing the validation error.
//   @typescript-eslint/no-dynamic-delete
//     1. One in-place record clear in a destroy path, where the object
//     identity is retained.
//   @typescript-eslint/promise-function-async
//     84 + 15. Would add `async` to satisfy a linter rather than to await
//     anything.
//   unicorn/no-useless-spread
//     36, and its autofix is unsafe here: every hit was a
//     `for (const x of [...collection])` snapshot taken because the body
//     mutates the collection it iterates, which the rule cannot see. Applying
//     the fix left the "Snapshot first" comments in place above loops that no
//     longer snapshot, and broke two suites outright.
//   unicorn/prefer-modern-math-apis
//     30, all of them Math.hypot over Math.sqrt(a*a+b*b), in collision,
//     particles and vector math. Math.hypot is far slower.
//   unicorn/prefer-math-min-max
//     30. Math.min/max differ from the ternary on NaN and -0, and are slower
//     in the loops that hit them.
//   unicorn/no-new-array
//     13. Replaces the pre-sized `new Array(n)` allocation with Array.from,
//     which is what the sized paths exist to avoid.
//   unicorn/prefer-query-selector
//     0 today, but getElementById is the faster lookup and the rule would
//     forbid it in new code.
//   unicorn/prefer-code-point
//     9. charCodeAt is the deliberate UTF-16 code-unit read in text layout
//     and atlas keying.
//   unicorn/prefer-add-event-listener
//     9. Exclusive `onended`/`onload`/`onmessage` ownership, cleared by
//     assigning null; a listener would need removal bookkeeping.
//   unicorn/prefer-dom-node-remove
//     13. `node.remove()` tolerates a detached node where removeChild throws,
//     which changes teardown behavior.
//   unicorn/no-useless-switch-case
//     6. The empty cases before `default` document which values are handled
//     there.
//   unicorn/prefer-set-has
//     4. Two to eight elements, where a linear includes beats a Set and the
//     array form carries the element type directly.
//   unicorn/no-thenable
//     2. TweenSequencer and LoadingQueue are awaitable on purpose.
//   unicorn/no-array-method-this-argument
//     1. The thisArg avoids a per-call closure in a physics hot path.
//   unicorn/consistent-function-scoping
//     5. Every hit is a one-shot `Array.from({ length }, ...)` initializer,
//     which the rule cannot tell from a per-frame closure.
//   unicorn/number-literal-case
//     270, and unicorn/switch-case-braces 212. Formatting, which Prettier
//     owns.
//   unicorn/no-negated-condition
//     144. A readability opinion, not a correctness rule.
//   unicorn/prefer-type-error
//     39. Changes which error class is thrown, which is public behavior.
//   unicorn/prefer-string-raw
//     5. Cosmetic.
