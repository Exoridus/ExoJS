import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBuildDefinesFromRepo } from '@codexo/exojs-config/build-defines';
import { createWorkletPlugin } from '@codexo/exojs-config/worklet-plugin';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import type { Plugin, RollupOptions } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import { string } from 'rollup-plugin-string';

const rootDir = resolvePath(dirname(fileURLToPath(import.meta.url)));

const buildMode = process.env.EXOJS_ENV === 'development' ? 'development' : 'production';

const defines = createBuildDefinesFromRepo({ mode: buildMode, packageDir: rootDir });

// Activates the package-private `@codexo/source` condition in package.json#imports
// so `#*` resolves to ./src/*.ts at build time. preserveModules then rewrites the
// resolved paths to relative specifiers in the emitted ESM tree. The trailing
// standard conditions keep normal dependency resolution intact.
const sourceConditions = ['@codexo/source', 'browser', 'module', 'import', 'default'];

// Full-bundle source conditions: includes per-package source conditions for the
// extension packages that use # subpath imports internally (e.g. exojs-particles).
const fullSourceConditions = ['@codexo/source', '@codexo/exojs-particles-source', 'browser', 'module', 'import', 'default'];

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

const glslPlugin = string({
  include: ['**/*.vert', '**/*.frag'],
});

// Real, typed AudioWorklet sources imported via `?worklet` (see
// `@codexo/exojs-config/worklet-plugin`) are transpiled and inlined as a JS
// string; untouched worklets keep exporting a plain template-string constant
// and never reach this plugin. It is a no-op for any input that never uses
// the `?worklet` query — safe to include in every config below.
const workletPlugin = createWorkletPlugin();

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
 * is passed in explicitly; everything else (constant replacement, GLSL string
 * imports, the worklet transform) is identical across all outputs, so adding
 * a new cross-cutting plugin only means editing this one function.
 */
function basePlugins(options: {
  exportConditions: string[];
  mainFields?: string[];
  transform: Plugin;
  extensionSource?: boolean;
  minify?: MinifyMode;
}): Plugin[] {
  const { exportConditions, mainFields = ['browser', 'module', 'main'], transform, extensionSource = false, minify = false } = options;

  const minifyPlugins = minify === 'always' ? [createTerserPlugin()] : minify === 'production' ? productionMinifyPlugins : [];

  return [
    constantReplacementPlugin,
    ...(extensionSource ? [extensionSourcePlugin()] : []),
    resolve({ mainFields, exportConditions }),
    glslPlugin,
    workletPlugin,
    transform,
    ...minifyPlugins,
  ];
}

const bundled: RollupOptions = {
  input: 'src/index.ts',
  output: {
    file: 'dist/exo.esm.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: basePlugins({
    exportConditions: sourceConditions,
    transform: typescript({
      compilerOptions: { incremental: false },
      outputToFilesystem: false,
    }),
    minify: 'production',
  }),
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
      compilerOptions: { incremental: false },
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
  plugins: basePlugins({
    exportConditions: sourceConditions,
    transform: typescript({
      compilerOptions: { incremental: false },
      outputToFilesystem: false,
    }),
    minify: 'always',
  }),
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
      compilerOptions: { incremental: false },
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
  },
  plugins: basePlugins({
    exportConditions: sourceConditions,
    mainFields: ['module', 'browser', 'main'],
    transform: typescript({
      compilerOptions: {
        incremental: false,
        outDir: 'dist/esm',
        declaration: true,
        declarationDir: 'dist/esm',
      },
    }),
  }),
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
  plugins: basePlugins({
    exportConditions: fullSourceConditions,
    extensionSource: true,
    transform: fullBundleTransform(),
  }),
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
// an artifact most consumers don't need (see .size-limit.cjs), so it stays
// out of the default `pnpm build` / release path.
const fullBundleConfigs = process.env.EXOJS_FULL_BUNDLE === '1' ? (buildMode === 'production' ? [iifeFull, iifeFullMin] : [iifeFull]) : [];

export default [bundled, debugBundled, modules, iife, ...productionOnlyConfigs, ...fullBundleConfigs];
