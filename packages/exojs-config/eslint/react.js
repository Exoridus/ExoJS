// Shared ESLint policy for the ExoJS monorepo. Each factory returns flat-config
// objects for one code category; the caller supplies the file globs and the
// project-service root, so the SAME rule set can be applied from the repository
// root and from a package that lints itself.
//
// Rules live here rather than in the root config because they are policy, not
// repository layout: an extension package's source is held to the same standard
// whichever config file happens to be nearest to it on disk.

import eslintReact from '@eslint-react/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

/**
 * React/TSX policy, shared by every React consumer in the repository: the
 * integration package and the documentation site's interactive islands.
 *
 * `@eslint-react`'s own hooks rules are switched off in favour of
 * `eslint-plugin-react-hooks`, so a hooks finding has exactly one rule id and
 * an in-code disable applies once.
 * @param {{ files: string[], tsconfigRootDir: string }} options
 * @returns {object[]}
 */
export function reactConfig({ files, tsconfigRootDir }) {
  return [
  {
    files,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
    plugins: {
      '@eslint-react': eslintReact,
      'react-hooks': reactHooks,
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      ...eslintReact.configs['recommended-typescript'].rules,
      ...eslintReact.configs['disable-conflict-eslint-plugin-react-hooks'].rules,
      ...reactHooks.configs.recommended.rules,

      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', disallowTypeAnnotations: false, fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      // Two deliberate uses of `{}` run through the engine: an empty interface
      // as the declaration-merging point consumers augment (FontRegistry,
      // SceneRegistry), and `= {}` as the empty-registry default of a generic
      // that is already fenced in by its `extends` constraint. Both were
      // carrying inline disables saying so.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always', allowObjectTypes: 'always' }],
      // `abstract new (...args: any[]) => T` is the only way to write "any
      // constructor producing T": with `unknown[]`, parameter contravariance
      // makes the type reject every constructor that declares real parameters,
      // so `typeof Texture` would no longer match. Four type aliases carried an
      // inline disable for exactly this; the rule ships an option for it.
      '@typescript-eslint/no-explicit-any': ['error', { ignoreRestArgs: true }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            arguments: false,
            attributes: false,
          },
        },
      ],
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/prefer-regexp-exec': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowBoolean: false,
          allowAny: false,
          allowNullish: false,
          allowRegExp: false,
        },
      ],
      // Disabled for site/src to match the engine: `strict-boolean-expressions`
      // is turned off across every practical src/ directory (core, input, math,
      // rendering, audio, assets, ...). The site's URL/version/runtime helpers
      // are the same class of nullable-string code, so holding only site code to
      // it would be an inconsistent double standard.
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',

      '@eslint-react/dom-no-unsafe-iframe-sandbox': 'error',
      '@eslint-react/no-array-index-key': 'error',
      '@eslint-react/no-nested-component-definitions': 'error',
      '@eslint-react/no-unstable-default-props': 'error',
      // Correctness rules `recommended-typescript` leaves off. Each was measured
      // at zero across the site and the integration package before being turned
      // on, so they are guards on new code rather than a backlog.
      '@eslint-react/no-duplicate-key': 'error',
      '@eslint-react/no-implicit-key': 'error',
      '@eslint-react/no-implicit-ref': 'error',
      // A `value && <X />` that leaks `0` or `''` into the tree renders it.
      '@eslint-react/no-leaked-conditional-rendering': 'error',
      '@eslint-react/no-missing-context-display-name': 'error',
      '@eslint-react/no-misused-capture-owner-stack': 'error',
      // A context value rebuilt every render re-renders every consumer.
      '@eslint-react/no-unstable-context-value': 'error',
      '@eslint-react/no-unused-props': 'error',
      '@eslint-react/no-unused-state': 'error',
      '@eslint-react/refs': 'error',

      // The hooks rules below were warnings with nothing left to migrate.
      // `@eslint-react/no-class-component` and `no-implicit-children` stay off:
      // both are house-style opinions rather than correctness.
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/preserve-manual-memoization': 'error',
      'react-hooks/set-state-in-effect': 'error',

      curly: 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // Allow console.error/console.warn for intentional diagnostics (e.g. the
      // fetch/parse error logging in request-manager.ts); only console.log/debug warn.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-nested-ternary': 'error',
      'object-shorthand': 'error',
      'prefer-object-spread': 'error',
      'prefer-template': 'error',
      radix: 'error',
    },
  },
  ];
}

/**
 * Relaxations for a React binding around an imperative, mutable handle - the
 * defining shape of the ExoJS integration, which the immutability and
 * set-state-in-effect rules cannot model.
 * @param {{ files: string[] }} options
 * @returns {object[]}
 */
export function reactImperativeBindingConfig({ files }) {
  return [
  {
    files,
    rules: {
      'react-hooks/immutability': 'off',
      '@eslint-react/exhaustive-deps': 'off',
      // Creating the imperative Application/Scene in an effect and exposing it
      // as state is the defining pattern of this bridge, not a bug.
      'react-hooks/set-state-in-effect': 'off',
      '@eslint-react/set-state-in-effect': 'off',
      // Targets React 18; `<Context.Provider>` / `useContext` are correct there
      // (the `use()` and bare-`<Context>` forms are React 19+).
      '@eslint-react/no-context-provider': 'off',
      '@eslint-react/no-use-context': 'off',
      // Reading declarative `<Scene>` config via Children.forEach is the
      // intended pattern (mirrors react-three-fiber / react-router).
      '@eslint-react/no-children-for-each': 'off',
    },
  },
  ];
}
