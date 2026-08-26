import { coreInternalDirs, createImportBoundaries } from '@codexo/exojs-config/eslint';
import { languageBaselineConfig, nodeToolingConfig } from '@codexo/exojs-config/eslint/base';
import { typeAwareCorrectnessRules } from '@codexo/exojs-config/eslint/correctness';
import { extensionSourceConfig } from '@codexo/exojs-config/eslint/extension';
import { packageTestConfig } from '@codexo/exojs-config/eslint/package-test';
import { vitestConfig } from '@codexo/exojs-config/eslint/vitest';
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
    ignores: ['dist/**', 'node_modules/**', 'src/vendor/**', 'site/dist/**', 'site/node_modules/**', 'site/public/vendor/**', 'coverage/**', '**/*.min.*'],
  },

  ...languageBaselineConfig({ tsconfigRootDir: import.meta.dirname }),

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
      // real dead stores, and also flags idiomatic safety-net initializers in
      // hot math/rendering paths - but the tree satisfies it everywhere today,
      // so there is nothing left for a softer level to buy.
      'no-useless-assignment': 'error',
      'no-useless-escape': 'error',
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
      // Base no-unused-vars handled by `unused-imports/no-unused-vars` above.
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

      // Engine-specific naming convention
      '@typescript-eslint/naming-convention': [
        'error',
        {
          // const namespace objects (MathUtils, Perf, Collision, ...) are PascalCase
          // by convention; const constants may be UPPER_CASE - both alongside camelCase.
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

  // Extension package source (runtime packages: particles, tilemap, tiled, ...).
  // `packages/exojs-react` lints its own tree with the same shared policy.
  ...extensionSourceConfig({ files: ['packages/exojs-*/src/**/*.ts'], tsconfigRootDir: import.meta.dirname }),

  // The published build tooling runs in Node: it drives esbuild and reads the
  // filesystem. The generic `packages/exojs-*/src` block grants browser
  // globals, which is the wrong environment here, so the Node ones are added on
  // top. What actually keeps DOM usage out is the package's own tsconfig
  // (`lib: es2022`, `types: node`), where a `document` reference is an error.
  {
    files: ['packages/exojs-build/src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2024 },
    },
  },

  // @codexo/exojs-bench is an internal benchmark TOOL - a Node CLI plus an
  // in-browser rendering harness - not a shipped library. It legitimately
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
    },
  },

  // Extension package tests. `packages/exojs-react` lints its own tree.
  ...packageTestConfig({ files: ['packages/exojs-*/test/**/*.{ts,tsx}'] }),

  // Site sources are deliberately absent here. ESLint resolves the config
  // nearest to each linted file, so `site/eslint.config.ts` governs them even
  // when the run starts at the repository root - a block for them here would
  // never be consulted. The root `lint` script still globs them so they stay in
  // this gate; what they are linted WITH belongs to the site.

  // ---------------------------------------------------------------------------
  // Per-subsystem overrides for src/. Scoped narrowly because these directories
  // either have hot-path lifecycle invariants, browser-API variance, or typed-
  // array plumbing that would create excessive false positives. Each block is
  // a known-deviation marker, NOT a license - every entry below is a candidate
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
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Rendering hot paths rely on lifecycle invariants and a broad browser API
  // surface; keep strict coverage elsewhere while reducing noise here. Covers
  // the whole subtree, WebGL2 and WebGPU alike - the backends, capability
  // probes and renderer lifecycles all sit under it.
  {
    files: ['src/rendering/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
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
      complexity: 'off',
      '@typescript-eslint/class-literal-property-style': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
    },
  },

  // The input channel map addresses a slot as "category base + index", so every
  // member of the keyboard and pointer enums is an addition. That is the design,
  // not a literal waiting to be inlined: writing the same values as bitwise ORs
  // would satisfy the rule while quietly depending on every sub-value staying
  // under the 256-slot category size.
  {
    files: ['src/input/types.ts'],
    rules: {
      '@typescript-eslint/prefer-literal-enum-member': 'off',
    },
  },

  // Claim/refcount tracking, multi-handle fill, and options-equivalence
  // branching are inherently branchy state machines.
  {
    files: ['src/assets/AssetResidency.ts'],
    rules: {
      complexity: 'off',
    },
  },

  // Asset internals using browser/IDB APIs with weak runtime typings.
  {
    files: ['src/assets/IndexedDbDatabase.ts', 'src/assets/factories/**/*.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      complexity: 'off',
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
  // object whose members (Rectangle, Polygon, ...) are PascalCase by convention
  // and whose string values are the Tiled wire format. This matches how the
  // core engine declares enum-like constants; the package naming policy is
  // relaxed here just for this file.
  {
    files: ['packages/exojs-tilemap/src/ObjectLayer.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
    },
  },

  // MapWorld exposes `MapLevelSide`, a PascalCase `as const` enum-like value
  // object, declared the same way as `ObjectKind` above and relaxed for the
  // same reason.
  {
    files: ['packages/exojs-tilemap/src/MapWorld.ts'],
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

  // Extension renderer / GPU hot paths - same relaxed policy as core rendering.
  {
    files: ['packages/exojs-tilemap/src/webgl2/**/*.ts', 'packages/exojs-tilemap/src/webgpu/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      complexity: 'off',
    },
  },

  // Extension tilemap core - geometry and data-path relaxations.
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

  // Particle system class - combined overload is a public API decision. The
  // channel storage next to it indexes capacity-sized typed arrays by a slot
  // the simulation itself handed out, so the bounds are an invariant rather
  // than something to re-check per particle.
  {
    files: ['packages/exojs-particles/src/ParticleSystem.ts', 'packages/exojs-particles/src/ParticleStorage.ts'],
    rules: {
      '@typescript-eslint/unified-signatures': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Particle extension descriptor - backend-type comparison is intentional.
  {
    files: ['packages/exojs-particles/src/particlesExtension.ts', 'packages/exojs-particles/src/modules/BurstSpawn.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
    },
  },

  // Extracted audio-effects/DSP package - same defensive audio regime as the
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

  // Worker sources run in a DedicatedWorkerGlobalScope - no DOM - and are
  // bundled into a string at build time, so they belong to no importer's
  // program. `tsconfig.workers.json` is their type-safety authority (it is the
  // only place `lib: webworker` can be selected without colliding with the DOM
  // lib every other program needs). ESLint's ProjectService cannot serve two
  // conflicting global libs for one file, so type-aware linting is off here and
  // the full syntactic/correctness/stylistic policy stays on; DOM globals are
  // banned outright as a lint-level backstop that repeats the compiler's answer.
  {
    files: ['**/*.worker.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.worker.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { projectService: false, project: null },
      globals: {
        ...globals.es2024,
        ...globals.worker,
      },
    },
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'alert', 'confirm', 'prompt'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // Physics indexes flat vertex/normal buffers (`number[]`) at provably in-bounds
  // positions; those reads use `arr[i]!` - the same convention core's hot math
  // paths use. Allow the non-null assertion here (packages discourage it by
  // default; the audio-fx override below does the same for its hot code).
  {
    files: ['packages/exojs-physics/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // The tilemap outline tracer walks a flat `[x, y, ...]` coordinate list and a
  // per-vertex direction table by computed index, the same convention the
  // physics package's math paths use above. The bounds are established by the
  // surrounding loop, so `arr[i]!` says what the reader already knows.
  {
    files: ['packages/exojs-tilemap-physics/src/outline.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
    },
  },

  // `Map.forEach` is the allocation-free way to walk a Map: `for...of` builds a
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

  // LDtk marks its runtime-computed fields with a `__` prefix (`__identifier`,
  // `__type`, ...). These types mirror an external file format verbatim, so the
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

  // The input channel constants (`Pointer.X`, `GamepadButton.South`, ...) are
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

  // Root test tree. `test/tsconfig.json` is the nearest project for these files,
  // so the project service resolves them to the very program `pnpm
  // typecheck:test` gates them with. That identity is the point: while ESLint
  // typed this tree through a separate wide-include config, the two programs
  // enabled different options, and a type-aware autofix could silently turn the
  // gate red.
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
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
      //     - the price of shape-only mocks; the type gate (`pnpm
      //       typecheck:test`) is what actually holds these files honest.
      //   require-await 395 - an `async` test body with no `await` is normal.
      //   unbound-method 236 - `expect(obj.method)` reads the method by design.
      // Revisit any of them by flipping it on and re-measuring, not by
      // reasoning about it.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/class-literal-property-style': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/require-await': 'off',
      // 1114 reports across 234 files, all autofixable, none of them a defect.
      // The test program turns `noUncheckedIndexedAccess` off, which is what
      // makes the `arr[0]!` on a fixture or a captured mock-call tuple
      // "unnecessary" - and what would make every one of them load-bearing
      // again the day that option is reconsidered for this tree. Enabling the
      // rule buys a repo-wide mechanical churn through test code and no
      // correctness.
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
  // Vitest test-quality rules, over both the root suite and every package's.
  ...vitestConfig({ files: ['test/**/*.ts', 'packages/exojs-*/test/**/*.{ts,tsx}'] }),
  // Node / config files / scripts - not part of any tsconfig `include`, so
  // type-aware rules (from the global `recommendedTypeChecked`/
  // `stylisticTypeChecked` configs applied unscoped above) have no type
  // information to work with here. `parserOptions.project: null` below only
  // starves those rules of a program; it doesn't disable them, so without
  // this explicit opt-out (the same pattern `packages/exojs-bench/src` and
  // the extension-package `test/**` blocks use) linting a file matched only
  // by this block crashes on the first typed rule it hits (e.g.
  // `@typescript-eslint/await-thenable`). The four `no-unsafe-*` rules below
  // were previously re-enabled after that blanket disable, which crashed the
  // same way (`no-unsafe-argument` needs type info too) - dropped rather than
  // given a real tsconfig program, since these files intentionally sit
  // outside any typed program.
  ...nodeToolingConfig({ files: ['*.config.ts', 'eslint.config.ts', 'scripts/**/*.ts', 'scripts/**/*.mjs', 'packages/exojs-bench/competitors/*.ts'] }),

  // scripts/webgpu-probe.ts runs as a Node process that drives a Playwright
  // page, but several of its callbacks are passed to `page.evaluate()` and
  // execute inside the browser page instead - so the same file legitimately
  // references both Node and browser globals. Layer `globals.browser` on top
  // of the Node/scripts block above just for this file, rather than widening
  // browser globals onto every `scripts/**` file.
  {
    files: ['scripts/webgpu-probe.ts'],
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

  // Examples (plain browser JS) - disable all type-aware TS rules first
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
      '@typescript-eslint/no-empty-function': 'error',
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
      'unicorn/prefer-node-protocol': 'error',
    },
  },

  // Guide sources (examples/guides/**) - the running programs the guide
  // chapters embed regions of. They are authored in TypeScript and never
  // transpiled to a `.js` twin, so unlike the rest of the example catalog the
  // `.ts` file is what gets linted. Type-aware rules are off for the same
  // reason they are off for example `.js`: the file belongs to
  // `tsconfig.examples.json`, which is not the project the service resolves
  // for it, and `typecheck:examples` already checks it with the right one.
  {
    files: ['examples/guides/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['examples/guides/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { projectService: false, project: null },
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
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-empty-function': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      // A guide listing shows the hook signature the reader has to write, so a
      // skeleton whose body ignores its own `delta` is the point rather than an
      // oversight - renaming it `_delta` would put the workaround in the
      // documentation. Unused module-level values are still reported.
      'unused-imports/no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
      curly: 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'unicorn/prefer-node-protocol': 'error',
    },
  },

  // Allow console only in the dedicated debug-layer inspector example
  {
    files: ['examples/debug-layer/signal-bus-inspector.js'],
    rules: {
      'no-console': 'error',
    },
  },

  // Build/release tooling and root config files. These run under Node, never
  // ship to consumers, and report progress on stdout by design - `no-console`
  // is the wrong rule here, not a violation to silence per-line.
  {
    files: ['scripts/**/*.ts', 'packages/exojs-bench/competitors/*.ts', '*.config.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Function style is a repository-wide convention, not a property of shipped
  // code: `typeAwareCorrectnessRules` carries it for the engine and the
  // extension packages, and these trees sit outside a typed program, so they
  // take the rule on its own. The site has its own config and carries it there.
  {
    files: ['test/**/*.{ts,tsx}', 'packages/exojs-*/test/**/*.{ts,tsx}', 'scripts/**/*.{ts,mjs}', 'packages/exojs-bench/competitors/*.ts', '*.config.ts'],
    rules: {
      'func-style': ['error', 'expression'],
    },
  },

  // Prettier compatibility: keep this last
  prettier,
]);
