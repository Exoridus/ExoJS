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
        'simple-import-sort/imports': 'error',
        'simple-import-sort/exports': 'error',
        'unused-imports/no-unused-imports': 'error',
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
        '@typescript-eslint/consistent-type-imports': [
          'error',
          {
            prefer: 'type-imports',
            fixStyle: 'inline-type-imports',
            disallowTypeAnnotations: false,
          },
        ],
        'no-console': 'off',
        'max-lines': 'off',
      },
    },
  ];
}
