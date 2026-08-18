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
  // `src/**` these are simply redundant with the compiler — they are all
  // syntactic, so the cost is nil.
  //
  // Four are deliberately left off — each is blind to the TS type space in a
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
      eqeqeq: ['error', 'always', { null: 'ignore' }],
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
      // Scene.init() must be synchronous: TypeScript's
      // void-returning override bivariance lets an `async init()` override
      // compile even though it silently breaks activation timing. Catch the
      // authoring mistake at lint time rather than only at runtime.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MethodDefinition[value.async=true][key.name="init"]',
          message:
            'Scene.init() must be synchronous — an async override runs after activation instead of gating it. Move asynchronous setup into load() instead.',
        },
      ],
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
      '@typescript-eslint/prefer-regexp-exec': 'error',
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
        // Acronyms are the one place the Strict* formats get in the way: they
        // reject consecutive capitals, so `UIRoot`, `HTMLText` and `_peekUI`
        // each carried an inline disable repeating the same sentence. These
        // two entries carry a `filter`, which outranks the generic selectors
        // above, and relax only the capitalisation — a name without one of
        // these acronyms stays strict.
        {
          selector: 'typeLike',
          filter: { regex: '(HTML|UI|JSON)', match: true },
          format: ['PascalCase'],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: ['variableLike', 'memberLike'],
          filter: { regex: '(HTML|UI|JSON|DPad)', match: true },
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
        // Same acronym exception, repeated for the `variable` + `const`
        // selector above: that one is more specific than the grouped
        // `variableLike` entry, so it would otherwise win and reject
        // `GamepadButton.DPadUp`.
        {
          selector: 'variable',
          modifiers: ['const'],
          filter: { regex: '(HTML|UI|JSON|DPad)', match: true },
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
        // A type property spelled in SCREAMING_CASE is a verbatim mirror of a
        // constant some external API hands us under that exact name (WebGL
        // extension constants, for one). Renaming it would break the lookup,
        // so the shape declaration has to keep the foreign spelling.
        {
          selector: 'typeProperty',
          filter: { regex: '^[A-Z][A-Z0-9_]*$', match: true },
          format: ['UPPER_CASE'],
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
      eqeqeq: ['error', 'always', { null: 'ignore' }],
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
      // Scene.init() must be synchronous — see the
      // matching rule in the engine-source block above for the full rationale.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MethodDefinition[value.async=true][key.name="init"]',
          message:
            'Scene.init() must be synchronous — an async override runs after activation instead of gating it. Move asynchronous setup into load() instead.',
        },
      ],
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
      '@typescript-eslint/prefer-regexp-exec': 'error',
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
        // Acronyms are the one place the Strict* formats get in the way: they
        // reject consecutive capitals, so `UIRoot`, `HTMLText` and `_peekUI`
        // each carried an inline disable repeating the same sentence. These
        // two entries carry a `filter`, which outranks the generic selectors
        // above, and relax only the capitalisation — a name without one of
        // these acronyms stays strict.
        {
          selector: 'typeLike',
          filter: { regex: '(HTML|UI|JSON)', match: true },
          format: ['PascalCase'],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: ['variableLike', 'memberLike'],
          filter: { regex: '(HTML|UI|JSON|DPad)', match: true },
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
        // Same acronym exception, repeated for the `variable` + `const`
        // selector above: that one is more specific than the grouped
        // `variableLike` entry, so it would otherwise win and reject
        // `GamepadButton.DPadUp`.
        {
          selector: 'variable',
          modifiers: ['const'],
          filter: { regex: '(HTML|UI|JSON|DPad)', match: true },
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
        // A type property spelled in SCREAMING_CASE is a verbatim mirror of a
        // constant some external API hands us under that exact name (WebGL
        // extension constants, for one). Renaming it would break the lookup,
        // so the shape declaration has to keep the foreign spelling.
        {
          selector: 'typeProperty',
          filter: { regex: '^[A-Z][A-Z0-9_]*$', match: true },
          format: ['UPPER_CASE'],
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
      // rendering, audio, assets, …). The site's URL/version/runtime helpers
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
      eqeqeq: ['error', 'always', { null: 'ignore' }],
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

  // Audio graph integration keeps defensive runtime checks against browser
  // API variance.
  {
    files: ['src/audio/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/class-literal-property-style': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Rendering hot paths rely on lifecycle invariants and a broad browser API
  // surface; keep strict coverage elsewhere while reducing noise here. Covers
  // the whole subtree, WebGL2 and WebGPU alike — the backends, capability
  // probes and renderer lifecycles all sit under it.
  {
    files: ['src/rendering/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
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
      '@typescript-eslint/prefer-optional-chain': 'off',
    },
  },

  // Claim/refcount tracking, multi-handle fill, and options-equivalence
  // branching are inherently branchy state machines.
  {
    files: ['src/assets/AssetResidency.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      complexity: 'off',
    },
  },

  // Asset internals using browser/IDB APIs with weak runtime typings.
  {
    files: ['src/assets/IndexedDbDatabase.ts', 'src/assets/factories/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      complexity: 'off',
    },
  },

  {
    files: ['src/rendering/video/Video.ts', 'src/rendering/filters/WebGpuShaderFilter.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-vars': 'off',
    },
  },

  {
    files: ['src/rendering/webgl2/WebGl2Backend.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      // Cohesive GL backend surface; grew just past the line limit with the
      // instanced-draw support. Splitting would scatter tightly
      // coupled GL state. Known deviation, candidate for a later extraction.
      'max-lines': 'off',
      // Context-loss and shader-compile diagnostics go straight to the console:
      // by the time this backend reports, the routed logger may itself be gone.
      'no-console': 'off',
    },
  },

  {
    files: [
      'src/rendering/webgpu/WebGpuBackend.ts',
      'src/rendering/webgpu/WebGpuMeshRenderer.ts',
      'src/rendering/webgpu/WebGpuSpriteRenderer.ts',
      'src/rendering/webgpu/WebGpuTextRenderer.ts',
    ],
    rules: {
      // Cohesive WebGPU backend/renderer surface; each file is a single
      // tightly-coupled unit (device/pipeline state, draw submission), and the
      // text renderer additionally carries its whole WGSL module as one
      // template literal that cannot be split the way `max-lines` assumes.
      // Splitting would scatter that state across files for no readability
      // gain. Known deviation, candidate for a later extraction.
      'max-lines': 'off',
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

  // Extension renderer / GPU hot paths — same relaxed policy as core rendering.
  {
    files: ['packages/exojs-tilemap/src/webgl2/**/*.ts', 'packages/exojs-tilemap/src/webgpu/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
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

  // Extension particle renderer / render-mode / GPU hot paths.
  {
    files: ['packages/exojs-particles/src/renderers/**/*.ts', 'packages/exojs-particles/src/renderModes/**/*.ts', 'packages/exojs-particles/src/gpu/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },

  // Extension particle modules / render modes with intentionally empty
  // lifecycle stubs.
  {
    files: [
      'packages/exojs-particles/src/modules/DeathModule.ts',
      'packages/exojs-particles/src/modules/SpawnModule.ts',
      'packages/exojs-particles/src/modules/UpdateModule.ts',
      'packages/exojs-particles/src/renderModes/ParticleRenderMode.ts',
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
  // core audio graph it was split from (browser API variance, DSP hot paths).
  {
    files: ['packages/exojs-audio-fx/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/class-literal-property-style': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      complexity: 'off',
    },
  },

  // The worklet sources run inside AudioWorkletGlobalScope - no DOM, no
  // module imports at runtime - and typecheck separately against
  // packages/exojs-audio-fx/tsconfig.worklets.json (see worklet-globals.d.ts),
  // not the package's main (DOM-lib) program covered by `projectService`
  // above. Disable type-aware linting here (matching the test/example
  // precedent elsewhere in this file) and supply just the AudioWorklet-
  // specific globals so `no-undef` doesn't false-positive; DOM globals are
  // explicitly banned via `no-restricted-globals` as a lint-level backstop.
  {
    files: ['packages/exojs-audio-fx/src/worklets/*.worklet.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['packages/exojs-audio-fx/src/worklets/*.worklet.ts'],
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

  // `Map.forEach` is the allocation-free way to walk a Map: `for…of` builds a
  // fresh iterator on every step, which these two per-frame paths cannot
  // afford. Deleting the current entry mid-`forEach` is well-defined and both
  // files rely on it. Scoped to the two files that actually run per frame
  // rather than the whole package, so the rule keeps working everywhere else.
  {
    files: ['packages/exojs-physics/src/ContactGraph.ts', 'packages/exojs-physics/src/broadphase/AabbTreeBroadPhase.ts'],
    rules: {
      'unicorn/no-array-for-each': 'off',
    },
  },

  // An AudioWorklet processor ships to the audio thread as one self-contained
  // source file - it cannot import other modules at runtime - so its body
  // cannot be split across files the way `max-lines` assumes. The limit
  // measures something these files cannot act on.
  {
    files: ['packages/exojs-audio-fx/src/worklets/*.worklet.ts'],
    rules: {
      'max-lines': 'off',
    },
  },

  // LDtk marks its runtime-computed fields with a `__` prefix (`__identifier`,
  // `__type`, …). These types mirror an external file format verbatim, so the
  // prefix is data, not a naming choice we get to make.
  {
    files: ['packages/exojs-ldtk/src/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: ['typeProperty', 'objectLiteralProperty'],
          format: null,
          leadingUnderscore: 'allowDouble',
        },
      ],
    },
  },

  // React passes component and class references as PascalCase parameters
  // (`SceneClass`), which is the ecosystem's spelling for "this argument is a
  // constructor", not a naming slip.
  {
    files: ['packages/exojs-react/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'parameter',
          format: ['strictCamelCase', 'StrictPascalCase'],
          leadingUnderscore: 'allow',
        },
      ],
    },
  },

  // The input channel constants (`Pointer.X`, `GamepadButton.South`, …) are
  // exposed as namespaces on purpose: it is the public spelling of the whole
  // input API, and these three files are the only namespaces in the engine.
  {
    files: ['src/input/Pointer.ts', 'src/input/GamepadAxis.ts', 'src/input/GamepadButton.ts'],
    rules: {
      '@typescript-eslint/no-namespace': 'off',
    },
  },

  // The one sanctioned console sink. Every routed DEV log and the one-time
  // startup banner leave the engine through this file, so `no-console` is the
  // wrong rule here rather than a violation to silence line by line.
  {
    files: ['src/core/logging.ts'],
    rules: {
      'no-console': 'off',
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
      // A promise dropped in a test is the failure mode this whole tree exists
      // to prevent: the assertions after it run before the work does, so the
      // test passes without proving anything. Measured across `test/**` it
      // costs exactly one report, so it is on.
      '@typescript-eslint/no-floating-promises': 'error',
      // Equally quiet (two reports) and equally load-bearing: a value that
      // stringifies to `[object Object]` makes the assertion compare noise.
      '@typescript-eslint/no-base-to-string': 'error',
      // The rules below stay off, but not for the reason that stood here
      // before: it cited ts-jest, which this repo has not used since the
      // Vitest migration. The real reason is the shape of test code and the
      // measured cost of each rule across `test/**`:
      //   no-unsafe-call 293, no-unsafe-member-access 279,
      //   no-unsafe-assignment 241, no-unsafe-argument 89, no-unsafe-return 12
      //     — the price of shape-only mocks; the type gate (`pnpm
      //       typecheck:test`) is what actually holds these files honest.
      //   require-await 395 — an `async` test body with no `await` is normal.
      //   unbound-method 236 — `expect(obj.method)` reads the method by design.
      // Revisit any of them by flipping it on and re-measuring, not by
      // reasoning about it.
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
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/require-await': 'off',
      // 235 reports, and autofixing them would be actively unsafe: ESLint types
      // `test/**` through tsconfig.eslint.json while the gate gates it through
      // tsconfig.test.json, and the two enable different options. A cast this
      // rule calls unnecessary under one program can be load-bearing under the
      // other, so `--fix` here can turn `pnpm typecheck:test` red.
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
    files: ['*.config.ts', 'rollup.config.ts', 'eslint.config.ts', 'scripts/**/*.ts', 'scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['*.config.ts', 'rollup.config.ts', 'eslint.config.ts', 'scripts/**/*.ts', 'scripts/**/*.mjs'],
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

  // scripts/webgpu-probe.mjs runs as a Node process that drives a Playwright
  // page, but several of its callbacks are passed to `page.evaluate()` and
  // execute inside the browser page instead — so the same file legitimately
  // references both Node and browser globals. Layer `globals.browser` on top
  // of the Node/scripts block above just for this file, rather than widening
  // browser globals onto every `scripts/**` file.
  {
    files: ['scripts/webgpu-probe.mjs'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
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
      // Base no-unused-vars handled by `unused-imports/no-unused-vars` below,
      // which honours the `_` prefix; leaving both on double-reports.
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      curly: 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      // The sync-init() rule (see the engine-source block) is deliberately NOT
      // enabled here yet: most of the catalog still uses the pre-v0.17
      // async `init(loader)` hook and is migrated in the dedicated examples
      // sweep (v0.17 core model, slice G), not opportunistically per-slice.
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

  // Build/release tooling and root config files. These run under Node, never
  // ship to consumers, and report progress on stdout by design — `no-console`
  // is the wrong rule here, not a violation to silence per-line.
  {
    files: ['scripts/**/*.ts', '*.config.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Prettier compatibility: keep this last
  prettier,
]);
