// `pnpm build` no longer runs this file - see `scripts/build.ts` (Rolldown)
// and `rollup.full-bundle.config.ts` (the opt-in all-in-one bundle, which
// stays on Rollup). This config is retained only because
// `test/core/logging-production-filter.test.ts` and
// `test/core/scene-scope-sync-hooks.test.ts` read its `pure_funcs` list as
// the single source of truth for their own self-contained production-strip
// pipelines. Redirecting those tests to a Rolldown-based mechanism (Rolldown
// needs no `pure_funcs` list at all - see `scripts/build.ts`'s comment on
// why) is tracked as follow-up work, not done here.
import { dirname, relative as relativePath, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { codecovRollupPlugin } from '@codecov/rollup-plugin';
import { createShaderPlugin, createWorkletPlugin } from '@codexo/exojs-build';
import { createBuildDefinesFromRepo } from '@codexo/exojs-config/build-defines';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import type { Plugin, RollupOptions } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';

const rootDir = resolvePath(dirname(fileURLToPath(import.meta.url)));

const buildMode = process.env.EXOJS_ENV === 'development' ? 'development' : 'production';

const defines = createBuildDefinesFromRepo({ mode: buildMode, packageDir: rootDir });

// Activates the package-private `@codexo/exojs-source` condition in package.json#imports
// so `#*` resolves to ./src/*.ts at build time. preserveModules then rewrites the
// resolved paths to relative specifiers in the emitted ESM tree. The trailing
// standard conditions keep normal dependency resolution intact.
const sourceConditions = ['@codexo/exojs-source', 'browser', 'module', 'import', 'default'];

// Full-bundle source conditions: includes per-package source conditions for the
// extension packages that use # subpath imports internally (e.g. exojs-particles).
const fullSourceConditions = ['@codexo/exojs-source', '@codexo/exojs-particles-source', 'browser', 'module', 'import', 'default'];

// Resolves @codexo/exojs-<name> → packages/exojs-<name>/src/index.ts so the
// full IIFE bundle can be built entirely from TypeScript source without requiring
// the extension packages to be pre-built.
const extensionSourcePlugin = (): Plugin => ({
  name: 'extension-source',
  resolveId(id: string) {
    const match = /^@codexo\/exojs-([^/]+)$/.exec(id);
    if (match) {
      return resolvePath(rootDir, 'packages', `exojs-${match[1]}`, 'src', 'index.ts');
    }
    return null;
  },
});

// Shader text (`.vert`/`.frag`/`.wgsl`) ships verbatim inside the bundle -
// Terser never descends into a string literal - so the outputs that minify get
// the comment-stripped variant and the readable ones keep the source as
// authored. See `@codexo/exojs-config/shader-plugin`.
const shaderPlugin = createShaderPlugin();
const minifiedShaderPlugin = createShaderPlugin({ minify: true });

// Codecov Bundle Analysis: uploads per-bundle module stats when a token is
// present (CI passes CODECOV_TOKEN via secrets: inherit). A plain local
// `pnpm build` has no token and stays fully offline.
const codecovBundlePlugin = (bundleName: string): Plugin[] =>
  process.env.CODECOV_TOKEN
    ? codecovRollupPlugin({
        enableBundleAnalysis: true,
        bundleName,
        uploadToken: process.env.CODECOV_TOKEN,
        telemetry: false,
      })
    : [];

// Real, typed AudioWorklet sources imported via `?worklet` (see
// `@codexo/exojs-build`) are bundled - imports and all - and
// inlined as a JS string. It is a no-op for any input that never uses the
// `?worklet` query, so it is safe to include in every config below. Mirrors
// the shader plugin split above: the outputs that minify get the minified
// worklet string, the readable ones keep the plain bundle.
const workletPlugin = createWorkletPlugin();
const minifiedWorkletPlugin = createWorkletPlugin({ minify: true });

const constantReplacementPlugin = replace({
  preventAssignment: true,
  values: defines,
});

function createTerserPlugin(): Plugin {
  // In production, drop dev-only diagnostic calls (assert/assertDefined) from
  // the single-file bundles and minify them. `__DEV__` is already replaced with
  // `false` here, so the helper bodies are empty — `pure_funcs` removes the now
  // side-effect-free callsites (and their argument allocations) outright.
  // `invariant` is deliberately NOT listed here: it is an always-on contract
  // check that must survive into production.
  return terser({ compress: { pure_funcs: ['assert', 'assertDefined'] } });
}

// Shared production-only minify step, reused (same instance) by every config
// that should only minify in production. The modular `dist/esm` tree is
// intentionally left unminified so consumers can tree-shake it themselves.
const productionMinifyPlugins = buildMode === 'production' ? [createTerserPlugin()] : [];

type MinifyMode =
  | false // never minify
  | 'production' // minify only when buildMode === 'production' (shared instance)
  | 'always'; // always minify (own instance) — for configs only ever built in production

/**
 * Assembles the plugin pipeline shared by every output below. Behavior that
 * varies per-output (module resolution fields/conditions, the TypeScript vs.
 * esbuild transform step, extension-package source resolution, minification)
 * is passed in explicitly; everything else (constant replacement, shader
 * string imports, the worklet transform) is identical across all outputs, so
 * adding a new cross-cutting plugin only means editing this one function.
 */
function basePlugins(options: {
  exportConditions: string[];
  mainFields?: string[];
  transform: Plugin;
  extensionSource?: boolean;
  minify?: MinifyMode;
}): Plugin[] {
  const { exportConditions, mainFields = ['browser', 'module', 'main'], transform, extensionSource = false, minify = false } = options;

  const minifies = minify === 'always' || (minify === 'production' && buildMode === 'production');
  const minifyPlugins = minify === 'always' ? [createTerserPlugin()] : minify === 'production' ? productionMinifyPlugins : [];

  return [
    constantReplacementPlugin,
    ...(extensionSource ? [extensionSourcePlugin()] : []),
    resolve({ mainFields, exportConditions }),
    minifies ? minifiedShaderPlugin : shaderPlugin,
    minifies ? minifiedWorkletPlugin : workletPlugin,
    transform,
    ...minifyPlugins,
  ];
}

// The root tsconfig inherits `declaration: true` (library profile). Only the
// `modules` build is meant to emit declarations (into dist/esm); every other
// config must switch them off, or @rollup/plugin-typescript emits the whole
// .d.ts tree as bundle assets — polluting dist/ with a duplicate declaration
// tree and inflating the Codecov bundle-analysis numbers (incompressible
// assets are counted at raw size in the gzip column).
const noDeclarations = { declaration: false, declarationMap: false } as const;

const bundled: RollupOptions = {
  input: 'src/index.ts',
  output: {
    file: 'dist/exo.esm.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    ...basePlugins({
      exportConditions: sourceConditions,
      transform: typescript({
        compilerOptions: { incremental: false, ...noDeclarations },
        outputToFilesystem: false,
      }),
      minify: 'production',
    }),
    ...codecovBundlePlugin('exo-esm'),
  ],
};

// Unminified IIFE global bundle for CDN script-tag usage (both dev and production).
const iife: RollupOptions = {
  input: 'src/index.ts',
  output: {
    file: 'dist/exo.iife.js',
    format: 'iife',
    name: 'Exo',
    sourcemap: true,
  },
  plugins: basePlugins({
    exportConditions: sourceConditions,
    transform: typescript({
      compilerOptions: { incremental: false, ...noDeclarations },
      outputToFilesystem: false,
    }),
  }),
};

// Minified IIFE global bundle for CDN production use (production only).
const iifeMin: RollupOptions = {
  input: 'src/index.ts',
  output: {
    file: 'dist/exo.iife.min.js',
    format: 'iife',
    name: 'Exo',
    sourcemap: true,
  },
  plugins: [
    ...basePlugins({
      exportConditions: sourceConditions,
      transform: typescript({
        compilerOptions: { incremental: false, ...noDeclarations },
        outputToFilesystem: false,
      }),
      minify: 'always',
    }),
    ...codecovBundlePlugin('exo-iife-min'),
  ],
};

const debugBundled: RollupOptions = {
  input: 'src/debug/index.ts',
  // All `#` imports are core dependencies — mark them external so the debug
  // bundle contains only debug code and imports from @codexo/exojs at runtime.
  // (Intra-debug imports are same-directory `./` and stay bundled.)
  external: id => id.startsWith('#'),
  output: {
    file: 'dist/exo.debug.esm.js',
    format: 'es',
    sourcemap: true,
    // Remap all `#` external IDs to the package name in the output.
    paths: id => (id.startsWith('#') ? '@codexo/exojs' : id),
  },
  plugins: basePlugins({
    exportConditions: sourceConditions,
    transform: typescript({
      compilerOptions: { incremental: false, ...noDeclarations },
      outputToFilesystem: false,
    }),
    minify: 'production',
  }),
};

const modules: RollupOptions = {
  input: ['src/index.ts', 'src/debug/index.ts', 'src/extensions/index.ts', 'src/renderer-sdk.ts'],
  output: {
    dir: 'dist/esm',
    format: 'es',
    sourcemap: true,
    preserveModules: true,
    preserveModulesRoot: 'src',
    // The preserveModules tree emits `sources` one directory level too high
    // (`../../../../src/…` escapes the repo), so consumers (e.g. Vite serving
    // the site) warn about missing source files on every module. Re-anchor
    // every `src/…` source to its real location relative to its map file.
    sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
      const match = /^(?:\.\.[\\/])+(src[\\/].*)$/.exec(relativeSourcePath);
      if (!match) return relativeSourcePath;
      return relativePath(dirname(sourcemapPath), resolvePath(rootDir, match[1])).replaceAll('\\', '/');
    },
  },
  plugins: [
    ...basePlugins({
      exportConditions: sourceConditions,
      mainFields: ['module', 'browser', 'main'],
      transform: typescript({
        compilerOptions: {
          incremental: false,
          outDir: 'dist/esm',
          declaration: true,
          declarationDir: 'dist/esm',
          // Embed the original TS text so the shipped maps work without src/
          // on disk (npm consumers, and Vite's missing-source check).
          inlineSources: true,
        },
      }),
    }),
    ...codecovBundlePlugin('exo-esm-modules'),
  ],
};

// The full IIFE bundle transpiles TypeScript source across multiple rootDirs
// (src/ + packages/*/src), which @rollup/plugin-typescript cannot cover in a
// single Program/include pass (see git history for the earlier failed
// attempt). esbuild transforms file-by-file with no cross-file Program, so it
// has no such rootDir constraint — each file is transpiled using the nearest
// tsconfig.json it finds (root tsconfig.json for src/, the owning package's
// tsconfig.json for packages/*/src/). This is a syntax-only transpile (no
// type-checking); `pnpm typecheck`/`typecheck:packages` remain the type-safety
// gate, unaffected by the build.
const fullBundleTransform = (): Plugin =>
  esbuild({
    target: 'es2022',
  });

// Unminified full IIFE bundle (core + all extension packages) for CDN script-tag usage.
const iifeFull: RollupOptions = {
  input: 'scripts/exo-full.entry.ts',
  output: {
    file: 'dist/exo.full.iife.js',
    format: 'iife',
    name: 'Exo',
    sourcemap: true,
  },
  plugins: [
    ...basePlugins({
      exportConditions: fullSourceConditions,
      extensionSource: true,
      transform: fullBundleTransform(),
    }),
    // "Everything together": core + every extension in one tracked bundle.
    ...codecovBundlePlugin('exo-full-iife'),
  ],
};

// Minified full IIFE bundle (production only).
const iifeFullMin: RollupOptions = {
  input: 'scripts/exo-full.entry.ts',
  output: {
    file: 'dist/exo.full.iife.min.js',
    format: 'iife',
    name: 'Exo',
    sourcemap: true,
  },
  plugins: basePlugins({
    exportConditions: fullSourceConditions,
    extensionSource: true,
    transform: fullBundleTransform(),
    minify: 'always',
  }),
};

const productionOnlyConfigs = buildMode === 'production' ? [iifeMin] : [];

// The all-in-one full bundle (core + every extension package) is opt-in via
// EXOJS_FULL_BUNDLE=1. It bundles extension-package source across multiple
// rootDirs, which is meaningfully more expensive to build (esbuild transpiles
// the entire dependency graph of core + every extension package) and produces
// an artifact most consumers don't need, so it stays out of the default
// `pnpm build` / release path and is not size-gated (see the "size-limit"
// field in package.json).
const fullBundleConfigs = process.env.EXOJS_FULL_BUNDLE === '1' ? (buildMode === 'production' ? [iifeFull, iifeFullMin] : [iifeFull]) : [];

export default [bundled, debugBundled, modules, iife, ...productionOnlyConfigs, ...fullBundleConfigs];
