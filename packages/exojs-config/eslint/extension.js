// Shared ESLint policy for the ExoJS monorepo. Each factory returns flat-config
// objects for one code category; the caller supplies the file globs and the
// project-service root, so the SAME rule set can be applied from the repository
// root and from a package that lints itself.
//
// Rules live here rather than in the root config because they are policy, not
// repository layout: an extension package's source is held to the same standard
// whichever config file happens to be nearest to it on disk.

import security from 'eslint-plugin-security';
import globals from 'globals';

import { typeAwareCorrectnessRules } from './correctness.js';

/**
 * Source policy for an official extension package: the engine rule set, minus
 * the Core-only import boundaries (an extension may import Core by name).
 *
 * Each package owns its `tsconfig.json`, and the project service resolves the
 * nearest project that includes the file being linted, so type-aware rules work
 * without naming a program here.
 * @param {{ files: string[], tsconfigRootDir: string }} options
 * @returns {object[]}
 */
export function extensionSourceConfig({ files, tsconfigRootDir }) {
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
        'max-lines': ['error', { max: 999, skipBlankLines: true, skipComments: true }],
        'no-bitwise': 'off',
        'no-caller': 'error',
        'no-console': 'error',
        'no-eval': 'error',
        'no-extra-bind': 'error',
        'no-label-var': 'error',
        'no-nested-ternary': 'error',
        'no-new-func': 'error',
        'no-new-wrappers': 'error',
        'no-promise-executor-return': 'error',
        // Scene.init() must be synchronous - see the
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
        'no-useless-assignment': 'error',
        'no-useless-escape': 'error',
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
        '@typescript-eslint/class-literal-property-style': 'error',
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
        '@typescript-eslint/explicit-member-accessibility': 'error',
        '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
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
        '@typescript-eslint/no-redundant-type-constituents': 'error',
        '@typescript-eslint/no-require-imports': 'error',
        '@typescript-eslint/no-shadow': 'error',
        '@typescript-eslint/no-unsafe-call': 'error',
        '@typescript-eslint/no-unsafe-enum-comparison': 'error',
        '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
        '@typescript-eslint/no-unnecessary-condition': 'error',
        '@typescript-eslint/no-unnecessary-type-arguments': 'error',
        '@typescript-eslint/no-unnecessary-type-assertion': 'error',
        '@typescript-eslint/no-unsafe-argument': 'error',
        '@typescript-eslint/no-unsafe-assignment': 'error',
        '@typescript-eslint/no-unsafe-member-access': 'error',
        '@typescript-eslint/no-unsafe-return': 'error',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/non-nullable-type-assertion-style': 'error',
        '@typescript-eslint/prefer-for-of': 'off',
        '@typescript-eslint/prefer-readonly': 'off',
        '@typescript-eslint/prefer-reduce-type-parameter': 'error',
        '@typescript-eslint/prefer-regexp-exec': 'error',
        '@typescript-eslint/require-await': 'error',
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
        '@typescript-eslint/strict-boolean-expressions': 'error',
        '@typescript-eslint/unbound-method': 'error',
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
          // above, and relax only the capitalisation - a name without one of
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
        'unicorn/no-instanceof-array': 'error',
        'unicorn/no-typeof-undefined': 'error',
        'unicorn/no-useless-undefined': 'error',
        'unicorn/no-zero-fractions': 'error',
        'unicorn/prefer-array-find': 'error',
        'unicorn/prefer-array-some': 'error',
        'unicorn/prefer-default-parameters': 'error',
        'unicorn/prefer-node-protocol': 'error',
        'unicorn/prefer-string-replace-all': 'error',
        'unicorn/throw-new-error': 'error',

        // Measured strict/unicorn additions, plus the promotions of the
        // warnings above. Last so those promotions take effect.
        ...typeAwareCorrectnessRules,
      },
    },
  ];
}
