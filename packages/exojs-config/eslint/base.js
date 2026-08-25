// Shared ESLint policy for the ExoJS monorepo. Each factory returns flat-config
// objects for one code category; the caller supplies the file globs and the
// project-service root, so the SAME rule set can be applied from the repository
// root and from a package that lints itself.
//
// Rules live here rather than in the root config because they are policy, not
// repository layout: an extension package's source is held to the same standard
// whichever config file happens to be nearest to it on disk.

import js from '@eslint/js';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * The language baseline every ExoJS config starts from: core JavaScript
 * recommendations, the type-aware TypeScript baseline, and the core correctness
 * rules typescript-eslint delegates to the compiler.
 *
 * `tsconfigRootDir` is set unscoped rather than per block. The parser infers it
 * from the nearest ESLint config when it is absent, which stops being
 * unambiguous the moment a second config file exists in the tree - and it then
 * refuses to parse rather than guessing, including for files whose blocks want
 * no program at all.
 * @param {{ tsconfigRootDir: string }} options
 * @returns {object[]}
 */
export function languageBaselineConfig({ tsconfigRootDir }) {
  return [
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir },
    },
  },

  // Base JavaScript recommendations
  js.configs.recommended,

  // TypeScript recommended + type-aware strict/stylistic baseline
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // typescript-eslint's `eslint-recommended` turns off ~20 core correctness
  // rules on the grounds that the compiler already reports them. That holds
  // only where a tsconfig actually covers the file, and most of this repo is
  // not covered: `tsconfig.json` is `src/**` only, each package tsconfig has
  // `exclude: ["test"]`, and `test/**`, `scripts/**`, `*.config.ts` and
  // `site/src/**` are in no typecheck gate at all. A `const` reassignment in
  // four of those five places passes every check today.
  //
  // Re-enabled repo-wide rather than per-directory: the delegation is only
  // ever safe when it tracks tsconfig coverage exactly, and keeping a second
  // list in sync with that coverage is what failed in the first place. Over
  // `src/**` these are simply redundant with the compiler - they are all
  // syntactic, so the cost is nil.
  //
  // Four are deliberately left off - each is blind to the TS type space in a
  // way that produces false positives on correct code here:
  //
  // - `no-undef` misfires on type-only names and ambient globals in TS
  //   (typescript-eslint recommends against enabling it at all).
  // - `no-redeclare`, including the TS variant, cannot tell an `interface X` /
  //   `const X` facade pair from a real redeclaration, and this repo uses that
  //   pattern deliberately (Asset, Assets, ActionMap).
  // - `constructor-super` does not recognise `extends (Base as unknown as new
  //   () => T)` as a constructor, which is how the audio-fx tests build mock
  //   subclasses.
  // - `no-new-symbol` is deprecated in favour of `no-new-native-nonconstructor`.
  //
  // The compiler reports all four as TS2304/TS2451/TS2377 in the places it
  // does cover, which is where they would have mattered most.
  //
  // `no-dupe-class-members` is taken in its TS variant, which knows overload
  // signatures are not duplicates.
  {
    rules: {
      'getter-return': 'error',
      'no-class-assign': 'error',
      'no-const-assign': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-obj-calls': 'error',
      'no-setter-return': 'error',
      'no-this-before-super': 'error',
      'no-unreachable': 'error',
      'no-unsafe-negation': 'error',
      '@typescript-eslint/no-dupe-class-members': 'error',
    },
  },
  ];
}

/**
 * Policy for Node-side tooling that sits outside every TypeScript program -
 * config files, build and release scripts.
 *
 * Type-aware rules are switched off explicitly rather than merely starved of a
 * program: `parserOptions.project: null` leaves them enabled, so the first typed
 * rule to run crashes the lint instead of reporting.
 * @param {{ files: string[] }} options
 * @returns {object[]}
 */
export function nodeToolingConfig({ files }) {
  return [
  {
    files,
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
      parserOptions: {
        project: null,
      },
    },
    plugins: {
      unicorn,
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      // Base no-unused-vars handled by `unused-imports/no-unused-vars`, which
      // honours the `_` prefix this repo uses for deliberately unused bindings.
      '@typescript-eslint/no-unused-vars': 'off',
      'unicorn/prefer-node-protocol': 'warn',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  ];
}
