import { coreInternalDirs, createImportBoundaries } from '@codexo/exojs-config/eslint';
import eslintReact from '@eslint-react/eslint-plugin';
import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unicorn from 'eslint-plugin-unicorn';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    ignores: ['dist/**', 'node_modules/**', 'src/vendor/**', 'site/dist/**', 'site/node_modules/**', 'site/public/vendor/**', 'coverage/**', '**/*.min.*'],
  },

  // Base JavaScript recommendations
  js.configs.recommended,

  // TypeScript recommended + type-aware strict/stylistic baseline
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Engine source
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.es2024,
        ...globals.worker,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
      security,
      unicorn,
    },
    rules: {
      // Import management
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

      // Engine-specific import boundaries (shared policy from @codexo/exojs-config):
      // enforce `#` package-internal subpath imports; forbid the removed `@/` alias,
      // parent-relative imports, bare package-internal paths, core→extension
      // imports, and cross-package /src deep imports.
      'no-restricted-imports': ['error', { patterns: createImportBoundaries({ internalDirs: coreInternalDirs }) }],

      // Core ESLint
      complexity: ['error', 20],
      curly: 'error',
      'default-case-last': 'error',
      eqeqeq: ['error', 'always'],
      'guard-for-in': 'error',
      'max-lines': ['warn', { max: 999, skipBlankLines: true, skipComments: true }],
      'no-bitwise': 'off',
      'no-caller': 'error',
      'no-console': 'warn',
      'no-eval': 'error',
      'no-extra-bind': 'error',
      'no-label-var': 'error',
      'no-nested-ternary': 'warn',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-promise-executor-return': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-template-curly-in-string': 'error',
      'no-undef-init': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      // ESLint 10 promoted `no-useless-assignment` to recommended. It catches
      // real dead stores, but also flags idiomatic safety-net initializers
      // in hot math/rendering paths. Keeping at warning level repo-wide.
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-return': 'error',
      'object-shorthand': 'error',
      'prefer-object-spread': 'error',
      'prefer-template': 'error',
      radix: 'error',
      // Base rules disabled in favor of TS / plugin variants.
      'no-shadow': 'off',
      'dot-notation': 'off',

      // TypeScript correctness
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': false,
          'ts-nocheck': false,
          'ts-check': false,
        },
      ],
      '@typescript-eslint/class-literal-property-style': 'warn',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', disallowTypeAnnotations: false, fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/default-param-last': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': 'warn',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-deprecated': 'warn',
      '@typescript-eslint/no-empty-function': [
        'warn',
        {
          allow: ['private-constructors', 'protected-constructors', 'decoratedFunctions', 'overrideMethods'],
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-meaningless-void-operator': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            arguments: false,
            attributes: false,
          },
        },
      ],
      '@typescript-eslint/no-mixed-enums': 'error',
      '@typescript-eslint/no-non-null-asserted-nullish-coalescing': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'error',
      // Base no-unused-vars handled by `unused-imports/no-unused-vars` above.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/non-nullable-type-assertion-style': 'warn',
      '@typescript-eslint/prefer-for-of': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-readonly': 'off',
      '@typescript-eslint/prefer-reduce-type-parameter': 'error',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      '@typescript-eslint/require-await': 'warn',
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
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/unified-signatures': 'error',

      // Engine-specific naming convention
      '@typescript-eslint/naming-convention': [
        'error',
        {
          // const namespace objects (MathUtils, Perf, Collision, …) are PascalCase
          // by convention; const constants may be UPPER_CASE — both alongside camelCase.
          selector: 'variable',
          modifiers: ['const'],
          format: ['strictCamelCase', 'StrictPascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
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

      // Security
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
      'security/detect-possible-timing-attacks': 'off',
      'security/detect-bidi-characters': 'error',

      // Unicorn
      'unicorn/error-message': 'error',
      'unicorn/no-array-for-each': 'warn',
      'unicorn/no-instanceof-array': 'error',
      'unicorn/no-typeof-undefined': 'error',
      'unicorn/no-useless-undefined': 'error',
      'unicorn/no-zero-fractions': 'error',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-default-parameters': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-spread': 'warn',
      'unicorn/prefer-string-replace-all': 'error',
      'unicorn/prefer-ternary': 'warn',
      'unicorn/throw-new-error': 'error',
    },
  },

  // Extension package source (runtime packages: particles, tilemap, tiled).
  // Each package owns its tsconfig.json; projectService resolves the nearest
  // tsconfig that includes the file being linted. This REPLACES the previous
  // state where typed @typescript-eslint rules crashed with exit code 2 because
  // no parserOptions.project / projectService was configured for these files.
  {
    files: ['packages/exojs-*/src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
      security,
      unicorn,
    },
    rules: {
      // Import management
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

      // Core ESLint
      complexity: ['error', 20],
      curly: 'error',
      'default-case-last': 'error',
      eqeqeq: ['error', 'always'],
      'guard-for-in': 'error',
      'max-lines': ['warn', { max: 999, skipBlankLines: true, skipComments: true }],
      'no-bitwise': 'off',
      'no-caller': 'error',
      'no-console': 'warn',
      'no-eval': 'error',
      'no-extra-bind': 'error',
      'no-label-var': 'error',
      'no-nested-ternary': 'warn',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-promise-executor-return': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-template-curly-in-string': 'error',
      'no-undef-init': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-return': 'error',
      'object-shorthand': 'error',
      'prefer-object-spread': 'error',
      'prefer-template': 'error',
      radix: 'error',
      'no-shadow': 'off',
      'dot-notation': 'off',

      // TypeScript correctness
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': false,
          'ts-nocheck': false,
          'ts-check': false,
        },
      ],
      '@typescript-eslint/class-literal-property-style': 'warn',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', disallowTypeAnnotations: false, fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/default-param-last': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': 'warn',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-deprecated': 'warn',
      '@typescript-eslint/no-empty-function': [
        'warn',
        {
          allow: ['private-constructors', 'protected-constructors', 'decoratedFunctions', 'overrideMethods'],
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-meaningless-void-operator': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            arguments: false,
            attributes: false,
          },
        },
      ],
      '@typescript-eslint/no-mixed-enums': 'error',
      '@typescript-eslint/no-non-null-asserted-nullish-coalescing': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/non-nullable-type-assertion-style': 'warn',
      '@typescript-eslint/prefer-for-of': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-readonly': 'off',
      '@typescript-eslint/prefer-reduce-type-parameter': 'error',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      '@typescript-eslint/require-await': 'warn',
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
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/unified-signatures': 'error',

      // Engine-standard naming convention
      '@typescript-eslint/naming-convention': [
        'error',
        {
          // Module-level const constants may be UPPER_CASE (mirrors the core config);
          // const namespace-object facades stay PascalCase, regular consts camelCase.
          selector: 'variable',
          modifiers: ['const'],
          format: ['strictCamelCase', 'StrictPascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
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

      // Security
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
      'security/detect-possible-timing-attacks': 'off',
      'security/detect-bidi-characters': 'error',

      // Unicorn
      'unicorn/error-message': 'error',
      'unicorn/no-array-for-each': 'warn',
      'unicorn/no-instanceof-array': 'error',
      'unicorn/no-typeof-undefined': 'error',
      'unicorn/no-useless-undefined': 'error',
      'unicorn/no-zero-fractions': 'error',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-default-parameters': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-spread': 'warn',
      'unicorn/prefer-string-replace-all': 'error',
      'unicorn/prefer-ternary': 'warn',
      'unicorn/throw-new-error': 'error',
    },
  },

  // @codexo/exojs-bench is an internal benchmark TOOL — a Node CLI plus an
  // in-browser rendering harness — not a shipped library. It legitimately
  // monkeypatches live graphics contexts and casts through `unknown` to
  // instrument arbitrary engines, and it was linted under the relaxed `test/**`
  // profile at its former `test/perf/baseline/` location. Preserve that profile
  // after the move to `packages/exojs-bench/src`: disable the strict type-aware
  // rules the generic `packages/exojs-*/src` block turns on, and grant the
  // node+browser globals the mixed driver/harness runtime needs. (Its `test/**`
  // files are already covered by the extension-test blocks below.)
  {
    files: ['packages/exojs-bench/src/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['packages/exojs-bench/src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: false,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      // Match the relaxed `test/**` profile the harness was authored under: it
      // legitimately casts through `unknown` to instrument foreign engines,
      // drives an inherently branchy CLI, and asserts on bounds-guaranteed array
      // accesses. These are the src-strict-only rules that never applied at its
      // former `test/perf/baseline/` home.
      complexity: 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      'max-lines': 'off',
    },
  },

  // Extension package tests — disable type-aware rules (package tsconfigs
  // exclude test/), then apply relaxed structural rules matching the core test
  // policy. Excludes create-exo-app (standalone scaffolding CLI, no ESLint
  // integration).
  {
    files: ['packages/exojs-*/test/**/*.{ts,tsx}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['packages/exojs-*/test/**/*.{ts,tsx}'],
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
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
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

  // Site React components. Astro files are type-checked by `astro check`; this
  // block covers the TypeScript/TSX islands that ship browser interactivity.
  {
    files: ['site/src/**/*.{ts,tsx}', 'packages/exojs-react/src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
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
      '@typescript-eslint/prefer-regexp-exec': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
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
      // rendering, audio, resources, …). The site's URL/version/runtime helpers
      // are the same class of nullable-string code, so holding only site code to
      // it would be an inconsistent double standard.
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',

      '@eslint-react/dom-no-unsafe-iframe-sandbox': 'error',
      '@eslint-react/no-array-index-key': 'warn',
      '@eslint-react/no-nested-component-definitions': 'error',
      '@eslint-react/no-unstable-default-props': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',

      curly: 'error',
      eqeqeq: ['error', 'always'],
      // Allow console.error/console.warn for intentional diagnostics (e.g. the
      // fetch/parse error logging in request-manager.ts); only console.log/debug warn.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-nested-ternary': 'warn',
      'object-shorthand': 'error',
      'prefer-object-spread': 'error',
      'prefer-template': 'error',
      radix: 'error',
    },
  },

  // The React integration package holds an imperative ExoJS `Application` handle
  // in `useState` and mutates it by design (resize / clearColor / sizingMode),
  // which the immutability rule cannot model. `@eslint-react/exhaustive-deps`
  // duplicates `react-hooks/exhaustive-deps`; keep the latter as the single
  // source so the in-code disables apply once.
  {
    files: ['packages/exojs-react/src/**/*.{ts,tsx}'],
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

  // ---------------------------------------------------------------------------
  // Per-subsystem overrides for src/. Scoped narrowly because these directories
  // either have hot-path lifecycle invariants, browser-API variance, or typed-
  // array plumbing that would create excessive false positives. Each block is
  // a known-deviation marker, NOT a license — every entry below is a candidate
  // for tightening once the underlying code is refactored.
  // ---------------------------------------------------------------------------

  // WebGPU renderer lifecycle invariants: these classes rely on explicit init
  // phases; forcing removal of `!` would add significant guard noise.
  {
    files: ['src/rendering/webgpu/WebGpuMeshRenderer.ts', 'src/rendering/webgpu/WebGpuMaskCompositor.ts', 'src/rendering/webgpu/WebGpuParticleRenderer.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Runtime capability/back-end probes intentionally keep defensive checks for
  // browser/API variance, even when static types look stricter.
  {
    files: [
      'src/core/capabilities.ts',
      'src/rendering/webgl2/AbstractWebGl2Renderer.ts',
      'src/rendering/webgl2/WebGl2Backend.ts',
      'src/rendering/webgl2/WebGl2RenderBuffer.ts',
      'src/rendering/webgpu/AbstractWebGpuRenderer.ts',
      'src/rendering/webgpu/WebGpuBackend.ts',
    ],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
    },
  },

  // Audio graph integration frequently passes bound methods and keeps
  // defensive runtime checks against browser API variance.
  {
    files: ['src/audio/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/class-literal-property-style': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      complexity: 'off',
    },
  },

  // Legacy WebGL2 backend/shader stack relies on dynamic browser APIs and
  // typed-array plumbing that would otherwise create excessive false positives.
  {
    files: ['src/rendering/webgl2/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Rendering hot paths rely on lifecycle invariants and a broad browser API
  // surface; keep strict coverage elsewhere while reducing noise here.
  {
    files: ['src/rendering/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      complexity: 'off',
    },
  },

  // Geometry/math defaults are intentionally terse and not harmful when using
  // falsy defaults (0, empty, etc.).
  {
    files: ['src/math/**/*.ts', 'src/core/**/*.ts', 'src/debug/**/*.ts', 'src/input/**/*.ts'],
    rules: {
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      complexity: 'off',
      '@typescript-eslint/class-literal-property-style': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      eqeqeq: 'off',
    },
  },

  {
    files: ['src/particles/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/unified-signatures': 'off',
    },
  },

  // Complex generic overload, internal queue logic, and cohesive single-file
  // scope are intentional here. Splitting would degrade readability and release
  // safety.
  {
    files: ['src/resources/Loader.ts'],
    rules: {
      'no-nested-ternary': 'off',
      'max-lines': 'off',
      '@typescript-eslint/unified-signatures': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      complexity: 'off',
    },
  },

  {
    files: ['src/resources/factories/SubtitleFactory.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },

  // Resource internals using browser/IDB APIs with weak runtime typings.
  {
    files: ['src/resources/IndexedDbDatabase.ts', 'src/resources/IndexedDbStore.ts', 'src/resources/factories/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      complexity: 'off',
    },
  },

  // Intentional runtime plumbing / optional lifecycle guards.
  {
    files: ['src/core/Scene.ts', 'src/rendering/utils.ts', 'src/resources/AssetManifest.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    files: ['src/rendering/video/Video.ts', 'src/rendering/filters/WebGpuShaderFilter.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-vars': 'off',
    },
  },

  {
    files: ['src/rendering/webgl2/WebGl2Backend.ts'],
    rules: {
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/require-await': 'off',
      // Cohesive GL backend surface; grew just past the line limit with the
      // instanced-draw support added in #151. Splitting would scatter tightly
      // coupled GL state. Known deviation, candidate for a later extraction.
      'max-lines': 'off',
    },
  },

  {
    files: ['src/rendering/webgpu/WebGpuBackend.ts', 'src/rendering/webgpu/WebGpuMeshRenderer.ts', 'src/rendering/webgpu/WebGpuSpriteRenderer.ts'],
    rules: {
      // Cohesive WebGPU backend/renderer surface; each file is a single
      // tightly-coupled unit (device/pipeline state, draw submission).
      // Splitting would scatter that state across files for no readability
      // gain. Known deviation, candidate for a later extraction.
      'max-lines': 'off',
    },
  },

  {
    files: ['src/resources/CacheStore.ts'],
    rules: {
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },

  // Build-time constants intentionally follow ecosystem-style ALL_CAPS names.
  {
    files: [
      'src/build-constants.d.ts',
      'src/typings.d.ts',
      'packages/exojs-particles/src/typings.d.ts',
      'packages/exojs-tilemap/src/typings.d.ts',
      'packages/exojs-tiled/src/typings.d.ts',
      'packages/exojs-physics/src/typings.d.ts',
    ],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
    },
  },

  // ObjectLayer exposes `ObjectKind`, a PascalCase `as const` enum-like value
  // object whose members (Rectangle, Polygon, …) are PascalCase by convention
  // and whose string values are the Tiled wire format. This matches how the
  // core engine declares enum-like constants; the package naming policy is
  // relaxed here just for this file.
  {
    files: ['packages/exojs-tilemap/src/ObjectLayer.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
    },
  },

  // Extension bitmask / validation constants follow ALL_CAPS convention.
  {
    files: [
      'packages/exojs-tilemap/src/types.ts',
      'packages/exojs-tilemap/src/TileLayer.ts',
      'packages/exojs-tilemap/src/webgl2/WebGl2TileChunkRenderer.ts',
      'packages/exojs-tilemap/src/webgpu/WebGpuTileChunkRenderer.ts',
      'packages/exojs-tiled/src/gid.ts',
      'packages/exojs-tiled/src/url.ts',
      'packages/exojs-tiled/src/validate.ts',
    ],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
    },
  },

  {
    files: ['src/core/Application.ts', 'src/core/SceneManager.ts', 'src/animation/Tween.ts', 'src/rendering/webgl2/WebGl2Backend.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Extension renderer / GPU hot paths — same relaxed policy as core rendering.
  {
    files: ['packages/exojs-tilemap/src/webgl2/**/*.ts', 'packages/exojs-tilemap/src/webgpu/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      complexity: 'off',
    },
  },

  // Extension tilemap core — geometry and data-path relaxations.
  {
    files: [
      'packages/exojs-tilemap/src/chunkGeometry.ts',
      'packages/exojs-tilemap/src/TileChunk.ts',
      'packages/exojs-tilemap/src/TileSet.ts',
      'packages/exojs-tilemap/src/TileMapView.ts',
      'packages/exojs-tilemap/src/TileLayer.ts',
      'packages/exojs-tilemap/src/tilemapExtension.ts',
    ],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
    },
  },

  // Extension particle renderer / GPU hot paths.
  {
    files: ['packages/exojs-particles/src/renderers/**/*.ts', 'packages/exojs-particles/src/gpu/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
    },
  },

  // Extension particle modules with intentionally empty lifecycle stubs.
  {
    files: [
      'packages/exojs-particles/src/modules/DeathModule.ts',
      'packages/exojs-particles/src/modules/SpawnModule.ts',
      'packages/exojs-particles/src/modules/UpdateModule.ts',
    ],
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
    },
  },

  // Particle system class — combined overload is a public API decision.
  {
    files: ['packages/exojs-particles/src/ParticleSystem.ts'],
    rules: {
      '@typescript-eslint/unified-signatures': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Particle extension descriptor — backend-type comparison is intentional.
  {
    files: ['packages/exojs-particles/src/particlesExtension.ts', 'packages/exojs-particles/src/modules/BurstSpawn.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
    },
  },

  // Extracted audio-effects/DSP package — same defensive audio regime as the
  // core audio graph it was split from (bound methods, browser API variance).
  // TODO: replace the BeatDetector relaxation by tightening its worklet payload
  // types and normalizing input at the message boundary.
  {
    files: ['packages/exojs-audio-fx/src/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/class-literal-property-style': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      complexity: 'off',
    },
  },

  // The bit-crusher worklet source (Phase 1 proof-of-concept for the
  // `.worklet.ts` → `?worklet` build plugin) runs inside AudioWorkletGlobalScope
  // — no DOM, no module imports at runtime — and typechecks separately against
  // packages/exojs-audio-fx/tsconfig.worklets.json (see worklet-globals.d.ts),
  // not the package's main (DOM-lib) program covered by `projectService`
  // above. Disable type-aware linting here (matching the test/example
  // precedent elsewhere in this file) and supply just the AudioWorklet-
  // specific globals so `no-undef` doesn't false-positive; DOM globals are
  // explicitly banned via `no-restricted-globals` as a lint-level backstop.
  {
    files: ['packages/exojs-audio-fx/src/worklets/bit-crusher.worklet.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['packages/exojs-audio-fx/src/worklets/bit-crusher.worklet.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { projectService: false, project: null },
      globals: {
        ...globals.es2024,
        AudioWorkletProcessor: 'readonly',
        AudioParamDescriptor: 'readonly',
        registerProcessor: 'readonly',
        sampleRate: 'readonly',
        currentTime: 'readonly',
        currentFrame: 'readonly',
      },
    },
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'fetch', 'localStorage', 'sessionStorage', 'alert', 'confirm', 'prompt'],
    },
  },

  // Physics indexes flat vertex/normal buffers (`number[]`) at provably in-bounds
  // positions; those reads use `arr[i]!` — the same convention core's hot math
  // paths use. Allow the non-null assertion here (packages discourage it by
  // default; the audio-fx override below does the same for its hot code).
  {
    files: ['packages/exojs-physics/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Tests (Jest)
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        ...globals.es2024,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      // Test files intentionally use jest mocks/spies and dynamic fixtures.
      // Keep structural linting, but disable noisy type-aware false positives.
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
      // Test mocks intentionally use `as unknown as <RealType>` to satisfy
      // jest's strict generic signatures with shape-only fakes. Auto-removing
      // these casts breaks ts-jest type compilation.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      // Tests deliberately use bracket notation (`obj['_member']`) as a
      // project-wide friend-class convention to spy on protected/private
      // underscore-prefixed members. Autofix to dot notation breaks
      // TS visibility check on protected/private fields.
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
      // Match the src/packages convention: T[] for simple types, Array<T> for
      // complex element types (unions, inline object literals). The base config
      // forces always-[] otherwise, which reads poorly for Array<{ ... }>.
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
    },
  },

  // Vitest test-quality rules: the recommended set + `no-focused-tests` promoted
  // to error so an accidentally committed `.only` fails CI. Layered on top of the
  // structural test config above; covers both root and package test suites.
  {
    ...vitest.configs.recommended,
    files: ['test/**/*.ts', 'packages/exojs-*/test/**/*.{ts,tsx}'],
    rules: {
      ...vitest.configs.recommended.rules,
      // Primary value: block an accidentally committed `.only`.
      'vitest/no-focused-tests': 'error',
      // 27 deliberate device-conditional skips (WebGPU adapter / device-loss
      // guards). Keep them visible but non-blocking rather than churn them.
      'vitest/no-disabled-tests': 'warn',
      // False positives in this suite, kept off:
      //  - expect-expect: assertions run through shared helpers (mountControls,
      //    renderText, …) the rule cannot see (148 hits).
      //  - no-conditional-expect / no-standalone-expect: browser tests use
      //    `if (!device) return` skip guards and assert via helpers.
      //  - valid-title: parametrised `test(name, …)` over a case array.
      'vitest/expect-expect': 'off',
      'vitest/no-conditional-expect': 'off',
      'vitest/no-standalone-expect': 'off',
      'vitest/valid-title': 'off',
    },
  },

  // Node / config files / scripts — not part of any tsconfig `include`, so
  // type-aware rules (from the global `recommendedTypeChecked`/
  // `stylisticTypeChecked` configs applied unscoped above) have no type
  // information to work with here. `parserOptions.project: null` below only
  // starves those rules of a program; it doesn't disable them, so without
  // this explicit opt-out (the same pattern `packages/exojs-bench/src` and
  // the extension-package `test/**` blocks use) linting a file matched only
  // by this block crashes on the first typed rule it hits (e.g.
  // `@typescript-eslint/await-thenable`). The four `no-unsafe-*` rules below
  // were previously re-enabled after that blanket disable, which crashed the
  // same way (`no-unsafe-argument` needs type info too) — dropped rather than
  // given a real tsconfig program, since these files intentionally sit
  // outside any typed program.
  {
    files: ['*.config.ts', 'rollup.config.ts', 'jest.config.ts', 'eslint.config.ts', 'scripts/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['*.config.ts', 'rollup.config.ts', 'jest.config.ts', 'eslint.config.ts', 'scripts/**/*.ts'],
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
      '@typescript-eslint/no-unused-vars': 'warn',
      'unicorn/prefer-node-protocol': 'warn',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // create-exo-app: a Node CLI scaffolder with its own tsconfig. Console output is
  // the tool's primary interface, so no-console is allowed here.
  {
    files: ['packages/create-exo-app/src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      'no-console': 'off',
    },
  },

  // Examples (plain browser JS) — disable all type-aware TS rules first
  {
    files: ['examples/**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['examples/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        project: null,
      },
      globals: {
        ...globals.browser,
        ...globals.es2024,
        // Injected typed asset catalog (see examples/shared/assets-global.d.ts).
        assets: 'readonly',
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
      unicorn,
    },
    rules: {
      // Example sources are authored in TypeScript and transpiled to the linted
      // `.js` by `examples:sync`; that transpile strips the blank lines between
      // import groups, so a single sorted group (no group separators) is the only
      // shape an example `.js` can hold. Collapse all imports into one group so
      // examples that mix a package import with a relative one (e.g. a shared
      // recipe) still lint clean.
      'simple-import-sort/imports': ['error', { groups: [['^\\u0000', '^node:', '^@?\\w', '^', '^\\.']] }],
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'unused-imports/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      curly: 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'unicorn/prefer-node-protocol': 'warn',
    },
  },

  // Allow console only in the dedicated debug-layer inspector example
  {
    files: ['examples/debug-layer/signal-bus-inspector.js'],
    rules: {
      'no-console': 'warn',
    },
  },

  // Prettier compatibility: keep this last
  prettier,
]);
