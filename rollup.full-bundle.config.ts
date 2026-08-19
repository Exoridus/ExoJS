import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { codecovRollupPlugin } from '@codecov/rollup-plugin';
import { createShaderPlugin, createWorkletPlugin } from '@codexo/exojs-build';
import { createBuildDefinesFromRepo } from '@codexo/exojs-config/build-defines';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import type { Plugin, RollupOptions } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';

// Builds the opt-in all-in-one IIFE bundle (core + every extension package),
// gated behind EXOJS_FULL_BUNDLE=1 in `pnpm build`. Kept on Rollup rather than
// migrated alongside the default build (see `scripts/build.ts`): this entry
// transpiles TypeScript source across multiple rootDirs (src/ + packages/*/src),
// which needs esbuild's file-by-file transform (no single Program constraint)
// rather than Rolldown's built-in transpiler - a path this repository's bundler
// evaluation never exercised. Not part of the default build or any size/tree-
// shaking gate, so staying on the proven stack here carries no measured cost.

const rootDir = resolvePath(dirname(fileURLToPath(import.meta.url)));
const buildMode = process.env.EXOJS_ENV === 'development' ? 'development' : 'production';
const defines = createBuildDefinesFromRepo({ mode: buildMode, packageDir: rootDir });

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

const shaderPlugin = createShaderPlugin();
const minifiedShaderPlugin = createShaderPlugin({ minify: true });
const workletPlugin = createWorkletPlugin();
const minifiedWorkletPlugin = createWorkletPlugin({ minify: true });

const constantReplacementPlugin = replace({
  preventAssignment: true,
  values: defines,
});

const codecovBundlePlugin = (bundleName: string): Plugin[] =>
  process.env.CODECOV_TOKEN
    ? codecovRollupPlugin({
        enableBundleAnalysis: true,
        bundleName,
        uploadToken: process.env.CODECOV_TOKEN,
        telemetry: false,
      })
    : [];

// This is a syntax-only transpile (no type-checking); `pnpm typecheck:full-bundle`
// is the type-safety gate for this entry, unaffected by the build.
const fullBundleTransform = (): Plugin => esbuild({ target: 'es2022' });

function basePlugins(minify: boolean): Plugin[] {
  return [
    constantReplacementPlugin,
    extensionSourcePlugin(),
    resolve({ mainFields: ['browser', 'module', 'main'], exportConditions: fullSourceConditions }),
    minify ? minifiedShaderPlugin : shaderPlugin,
    minify ? minifiedWorkletPlugin : workletPlugin,
    fullBundleTransform(),
    ...(minify ? [terser({ compress: { pure_funcs: ['assert', 'assertDefined'] } })] : []),
  ];
}

const iifeFull: RollupOptions = {
  input: 'scripts/exo-full.entry.ts',
  output: {
    file: 'dist/exo.full.iife.js',
    format: 'iife',
    name: 'Exo',
    sourcemap: true,
  },
  plugins: [...basePlugins(false), ...codecovBundlePlugin('exo-full-iife')],
};

const iifeFullMin: RollupOptions = {
  input: 'scripts/exo-full.entry.ts',
  output: {
    file: 'dist/exo.full.iife.min.js',
    format: 'iife',
    name: 'Exo',
    sourcemap: true,
  },
  plugins: basePlugins(true),
};

export default buildMode === 'production' ? [iifeFull, iifeFullMin] : [iifeFull];
