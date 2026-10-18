// Repository-wide authoring style: how ExoJS code LOOKS, independent of how
// strictly it is typed. Core, the extension packages, the example catalog, the
// guide sources, tests, scripts and the site all take this layer, so a reader
// cannot tell from the shape of a file which tree it came from.
//
// Style is kept apart from correctness (`correctness.js`) on purpose. A tree
// may be held to a lower correctness bar - the examples are copy-paste material
// with the type-aware rules off - without looking any different from the engine.
//
// Ownership: Prettier owns indentation, quotes, semicolons, commas, whitespace
// and wrapping. ESLint owns the choices that need the syntax tree - braces,
// blank-line structure, import hygiene, which construct is spelled how - and no
// rule here restates a Prettier decision. The one exception is `curly`, which
// `eslint-config-prettier` switches off wholesale; see `prettierCompatConfig`.
//
// Measured and deliberately NOT enabled (re-open by re-measuring):
//
//   @stylistic/padding-line-between-statements, declaration-group form
//     A blank line after every `const`/`let` run: 7.5k reports, and it splits
//     bindings from the statement that immediately configures them
//     (`const point = ...; point.x = ...`), which is an intentional grouping.
//   operator-assignment
//     6 reports, 4 of them the mulberry32 mixing step `t = (t + ...) ^ t`, where
//     the autofix swaps the operands to reach `^=` and hides the reference
//     algorithm the code mirrors. The two plain `a = a + b` hits are not worth a
//     rule on their own.
//   unicorn/prefer-ternary
//     Rejected on correctness grounds already (see `correctness.js`); explicit
//     control flow is the house style.
//
// Not measured, and not wanted: key sorting and member ordering rules, because
// ordering carries meaning here (lifecycle order, hot-path field layout).

import prettier from 'eslint-config-prettier';

/**
 * Syntax-only style rules, valid in every tree whether or not it has a
 * TypeScript program. Spread into a `rules` object or use `authoringStyleConfig`.
 */
export const authoringStyleRules = {
  // ── Function and variable style ──────────────────────────────────────────
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
  'no-var': 'error',
  'prefer-const': 'error',
  'object-shorthand': 'error',
  'prefer-object-spread': 'error',
  'prefer-template': 'error',
  // `a = a || b` and its `&&`/`??` kin only. The `if (!a) { a = b; }` lazy-init
  // form is left alone: collapsing it to `??=` is a rewrite with no readability gain.
  'logical-assignment-operators': ['error', 'always', { enforceForIfStatements: false }],

  // ── Blocks ───────────────────────────────────────────────────────────────
  // A control-flow body is always a block, and a block is never squeezed onto
  // one line. `if (ready) return;` and `if (ready) { return; }` are both out.
  //
  // `curly-newline` rather than `brace-style`: Prettier breaks the heritage of a
  // long class header and puts the `{` on its own line, which `brace-style`
  // rejects, and `eslint-config-prettier` turns `brace-style` off for exactly
  // that reason. `curly-newline` states the requirement directly - a block that
  // holds anything starts on a new line - and does not collide with Prettier.
  curly: ['error', 'all'],
  '@stylistic/curly-newline': ['error', { minElements: 1, consistent: true }],

  // ── Comments ─────────────────────────────────────────────────────────────
  // `/` keeps triple-slash directives, `!` keeps license banners, `#region`
  // keeps editor folds. The exception characters allow ruled separators.
  '@stylistic/spaced-comment': [
    'error',
    'always',
    {
      line: { markers: ['/', '!', '#region', '#endregion'], exceptions: ['-', '+', '*', '='] },
      block: { markers: ['!'], exceptions: ['*'], balanced: true },
    },
  ],

  // ── Blank-line structure ─────────────────────────────────────────────────
  // Runs of fields stay grouped; everything involving a method, accessor or
  // constructor is separated. Overload signatures sit together with their
  // implementation.
  '@stylistic/lines-between-class-members': [
    'error',
    {
      enforce: [
        { blankLine: 'always', prev: '*', next: 'method' },
        { blankLine: 'always', prev: 'method', next: '*' },
      ],
    },
    { exceptAfterOverload: true },
  ],
  // Conservative on purpose: the control-flow exits and the structured blocks
  // get air, plain statements are left as the author grouped them.
  '@stylistic/padding-line-between-statements': [
    'error',
    { blankLine: 'always', prev: '*', next: ['return', 'throw'] },
    { blankLine: 'always', prev: 'multiline-block-like', next: '*' },
    { blankLine: 'always', prev: '*', next: 'multiline-block-like' },
    { blankLine: 'always', prev: ['import', 'cjs-import'], next: '*' },
    { blankLine: 'any', prev: ['import', 'cjs-import'], next: ['import', 'cjs-import'] },
    { blankLine: 'any', prev: 'directive', next: '*' },
    // Case labels stack without a gap, and a `case X: {` block would otherwise be
    // read as the statement following the preceding label.
    { blankLine: 'any', prev: ['case', 'default'], next: '*' },
  ],

  // ── Imports and exports ──────────────────────────────────────────────────
  'simple-import-sort/imports': 'error',
  'simple-import-sort/exports': 'error',
  'unused-imports/no-unused-imports': 'error',
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', disallowTypeAnnotations: false, fixStyle: 'inline-type-imports' },
  ],

  // ── Literal and syntax spelling ──────────────────────────────────────────
  '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
  'unicorn/escape-case': 'error',
  // An arrow body of `undefined` is the idiomatic no-op (`.catch(() => undefined)`);
  // the autofix would turn it into an empty function, which `no-empty-function` rejects.
  'unicorn/no-useless-undefined': ['error', { checkArrowFunctionBody: false }],
  'unicorn/no-zero-fractions': 'error',
  'unicorn/prefer-optional-catch-binding': 'error',
};

/**
 * Style rules that read type information. A tree linted without a TypeScript
 * program must not take them.
 *
 * A type-only re-export that is spelled as a value export keeps a runtime
 * binding alive in the bundle for nothing.
 */
export const typeAwareStyleRules = {
  '@typescript-eslint/consistent-type-exports': 'error',
};

/**
 * The shared authoring style as one flat-config block.
 *
 * Place it BEFORE the per-category blocks so a category can still relax a rule
 * where it has a reason. `@stylistic` and the import plugins are registered by
 * `languageBaselineConfig`, which every consumer applies first.
 * @param {{ files: string[], typeAware?: boolean }} options
 * @returns {object[]}
 */
export function authoringStyleConfig({ files, typeAware = false }) {
  return [
    {
      files,
      rules: {
        ...authoringStyleRules,
        ...(typeAware ? typeAwareStyleRules : {}),
      },
    },
  ];
}

/**
 * `eslint-config-prettier`, followed by the structural rule it would otherwise
 * leave off. Keep this LAST in a config.
 *
 * Prettier compatibility switches `curly` off because it can conflict with
 * Prettier in some option combinations. It is consistent with Prettier's output
 * here, and ExoJS requires it, so it is re-enabled after the preset rather than
 * before. Putting it earlier turns it off silently, which is how a rule can be
 * configured at `error` and report nothing at all.
 * @param {{ files: string[] }} options
 * @returns {object[]}
 */
export function prettierCompatConfig({ files }) {
  return [
    prettier,
    {
      files,
      rules: {
        curly: authoringStyleRules.curly,
      },
    },
  ];
}
