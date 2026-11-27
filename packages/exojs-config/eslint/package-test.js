// Shared ESLint policy for the ExoJS monorepo. Each factory returns flat-config
// objects for one code category; the caller supplies the file globs and the
// project-service root, so the SAME rule set can be applied from the repository
// root and from a package that lints itself.
//
// Rules live here rather than in the root config because they are policy, not
// repository layout: an extension package's source is held to the same standard
// whichever config file happens to be nearest to it on disk.

import globals from 'globals';
import tseslint from 'typescript-eslint';

import { authoringStyleConfig } from './style.js';

/**
 * Test policy for a package's own `test/**`. Type-aware rules are switched off
 * first: a package `tsconfig.json` excludes `test/`, so there is no program to
 * type these files against, and a typed rule that reaches one crashes the run
 * rather than reporting. The structural rules that remain mirror the root test
 * policy.
 * @param {{ files: string[] }} options
 * @returns {object[]}
 */
export function packageTestConfig({ files }) {
  return [
    ...authoringStyleConfig({ files }),
    {
      files,
      ...tseslint.configs.disableTypeChecked,
    },
    {
      files,
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        parserOptions: {
          projectService: false,
        },
        globals: {
          ...globals.browser,
          ...globals.node,
          ...globals.jest,
          ...globals.es2024,
        },
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/class-literal-property-style': 'off',
        '@typescript-eslint/no-base-to-string': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/dot-notation': 'off',
        'dot-notation': 'off',
        // `mockResolvedValue(undefined)` and its kin need the argument to
        // satisfy their signature, so call arguments are left alone.
        'unicorn/no-useless-undefined': ['error', { checkArguments: false, checkArrowFunctionBody: false }],
        // A mock that stands in for a class is called with `new`, and Vitest only
        // constructs a `vi.fn` implementation that is a `function` or a `class`;
        // an arrow there throws "is not a constructor".
        'prefer-arrow-callback': 'off',
        'no-console': 'off',
        'max-lines': 'off',
      },
    },
  ];
}
