import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import security from 'eslint-plugin-security';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unicorn from 'eslint-plugin-unicorn';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/vendor/**',
      'site/dist/**',
      'site/node_modules/**',
      'site/public/vendor/**',
      'site/src/**',
      'coverage/**',
      '**/*.min.*',
    ],
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

      // Engine-specific: enforce '@/'-prefixed internal imports
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['audio/*', 'core/*', 'input/*', 'math/*', 'particles/*', 'physics/*', 'rendering/*', 'resources/*', 'vendor/*'],
              message: "Internal imports use the '@/' prefix — e.g. '@/core/X' instead of 'core/X'.",
            },
          ],
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
      // ESLint 10 promoted `no-useless-assignment` to recommended. It catches
      // real dead stores, but also flags idiomatic safety-net initializers
      // in hot math/rendering paths. Keeping at warning level repo-wide.
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-return': 'error',
      'object-shorthand': 'error',
      'prefer-object-spread': 'error',
      'prefer-promise-reject-errors': 'error',
      'prefer-template': 'error',
      radix: 'error',
      // Base rules disabled in favor of TS / plugin variants.
      'no-shadow': 'off',
      'dot-notation': 'off',

      // TypeScript correctness
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/await-thenable': 'error',
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
      '@typescript-eslint/consistent-indexed-object-style': ['error', 'record'],
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
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
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-deprecated': 'warn',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-duplicate-type-constituents': 'error',
      '@typescript-eslint/no-empty-function': [
        'warn',
        {
          allow: ['private-constructors', 'protected-constructors', 'decoratedFunctions', 'overrideMethods'],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
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
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-shadow': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      // Base no-unused-vars handled by `unused-imports/no-unused-vars` above.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/non-nullable-type-assertion-style': 'warn',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-for-of': 'off',
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
      '@typescript-eslint/prefer-readonly': 'off',
      '@typescript-eslint/prefer-reduce-type-parameter': 'error',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/prefer-ts-expect-error': 'error',
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
      '@typescript-eslint/unified-signatures': 'warn',

      // Engine-specific naming convention
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

  // TODO: replace this override by tightening BeatDetector worklet payload
  // types and normalizing input at the message boundary.
  {
    files: ['src/audio/BeatDetector.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
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
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
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
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
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
      '@typescript-eslint/no-unsafe-argument': 'off',
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

  // Complex generic overload and internal queue logic is intentional here.
  {
    files: ['src/resources/Loader.ts'],
    rules: {
      'no-nested-ternary': 'off',
      '@typescript-eslint/unified-signatures': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      complexity: 'off',
    },
  },

  {
    files: ['src/resources/factories/VttFactory.ts'],
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
      '@typescript-eslint/no-unsafe-argument': 'off',
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
    },
  },

  {
    files: ['src/resources/CacheStore.ts'],
    rules: {
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },

  {
    files: ['src/core/Application.ts', 'src/core/SceneManager.ts', 'src/animation/Tween.ts', 'src/rendering/webgl2/WebGl2Backend.ts'],
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
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/class-literal-property-style': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/require-await': 'warn',
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
      'no-console': 'warn',
      'max-lines': ['warn', { max: 999, skipBlankLines: true, skipComments: true }],
    },
  },

  // Node / config files / scripts
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
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      'unicorn/prefer-node-protocol': 'warn',
      'security/detect-non-literal-fs-filename': 'off',
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
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
      unicorn,
    },
    rules: {
      'simple-import-sort/imports': 'error',
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
