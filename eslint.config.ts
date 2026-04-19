import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    ignores: ['dist/**', 'node_modules/**', 'src/vendor/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.worker,
      },
    },
    rules: {
      // ESLint 10 promoted `no-useless-assignment` to recommended. It catches
      // real dead stores, but also flags idiomatic safety-net initializers
      // in hot math/rendering paths (loop-scope accumulators, try/catch
      // placeholders, if/else-assigned variables that TS strict mode
      // requires to be definitely assigned). Keeping off repo-wide; the
      // sibling rule `preserve-caught-error` stays on.
      'no-useless-assignment': 'off',

      // Block the old bare-specifier path style so new imports stick to the
      // @/-prefixed convention. Equivalent npm-name collision risk (audio,
      // core, math, etc.) is what motivated the migration in the first place.
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            'audio/*', 'core/*', 'input/*', 'math/*', 'particles/*',
            'physics/*', 'rendering/*', 'resources/*', 'vendor/*',
          ],
          message: "Internal imports use the '@/' prefix — e.g. '@/core/X' instead of 'core/X'.",
        }],
      }],

      'no-template-curly-in-string': 'error',
      'init-declarations': 'error',
      'no-label-var': 'error',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/array-type': [
        'error',
        {
          default: 'generic',
          readonly: 'generic',
        },
      ],
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variableLike',
          format: ['strictCamelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'memberLike',
          format: ['strictCamelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'typeLike',
          format: ['StrictPascalCase'],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'interface',
          format: null,
          custom: {
            regex: '^(I)?[A-Z][A-Za-z0-9]*$',
            match: true,
          },
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'enumMember',
          format: null,
          custom: {
            regex: '^[A-Z][A-Za-z0-9]*$|^[a-z][A-Za-z0-9]*$|^[A-Z][A-Z0-9_]*$',
            match: true,
          },
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
      ],
    },
  },
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        ...globals.es2021,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
