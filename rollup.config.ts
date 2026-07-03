import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBuildDefinesFromRepo } from '@codexo/exojs-config/build-defines';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import type { Plugin, RollupOptions } from 'rollup';
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

const constantReplacementPlugin = replace({
  preventAssignment: true,
  values: defines,
});

// In production, drop dev-only diagnostic calls (assert/assertDefined) from
// the single-file bundles and minify them. `__DEV__` is already replaced with
// `false` here, so the helper bodies are empty — `pure_funcs` removes the now
// side-effect-free callsites (and their argument allocations) outright.
// `invariant` is deliberately NOT listed here: it is an always-on contract
// check that must survive into production. The modular `dist/esm` tree is
// intentionally left unminified so consumers can tree-shake it themselves.
const productionMinifyPlugins = buildMode === 'production' ? [terser({ compress: { pure_funcs: ['assert', 'assertDefined'] } })] : [];

const bundled: RollupOptions = {
  input: 'src/index.ts',
  output: {
    file: 'dist/exo.esm.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    constantReplacementPlugin,
    resolve({ mainFields: ['browser', 'module', 'main'], exportConditions: sourceConditions }),
    glslPlugin,
    typescript({
      compilerOptions: { incremental: false },
      outputToFilesystem: false,
    }),
    ...productionMinifyPlugins,
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
  plugins: [
    constantReplacementPlugin,
    resolve({ mainFields: ['browser', 'module', 'main'], exportConditions: sourceConditions }),
    glslPlugin,
    typescript({
      compilerOptions: { incremental: false },
      outputToFilesystem: false,
    }),
  ],
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
    constantReplacementPlugin,
    resolve({ mainFields: ['browser', 'module', 'main'], exportConditions: sourceConditions }),
    glslPlugin,
    typescript({
      compilerOptions: { incremental: false },
      outputToFilesystem: false,
    }),
    terser({ compress: { pure_funcs: ['assert', 'assertDefined'] } }),
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
  plugins: [
    constantReplacementPlugin,
    resolve({ mainFields: ['browser', 'module', 'main'], exportConditions: sourceConditions }),
    glslPlugin,
    typescript({
      compilerOptions: { incremental: false },
      outputToFilesystem: false,
    }),
    ...productionMinifyPlugins,
  ],
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
  plugins: [
    constantReplacementPlugin,
    resolve({ mainFields: ['module', 'browser', 'main'], exportConditions: sourceConditions }),
    glslPlugin,
    typescript({
      compilerOptions: {
        incremental: false,
        outDir: 'dist/esm',
        declaration: true,
        declarationDir: 'dist/esm',
      },
    }),
  ],
};

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
    constantReplacementPlugin,
    extensionSourcePlugin(),
    resolve({ mainFields: ['browser', 'module', 'main'], exportConditions: fullSourceConditions }),
    glslPlugin,
    typescript({
      compilerOptions: { incremental: false },
      outputToFilesystem: false,
      // The full bundle pulls extension-package source (resolved via
      // extensionSourcePlugin); the TS transform must cover them, not just src/.
      include: ['src/**/*.ts', 'packages/*/src/**/*.ts', 'scripts/exo-full.entry.ts'],
    }),
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
  plugins: [
    constantReplacementPlugin,
    extensionSourcePlugin(),
    resolve({ mainFields: ['browser', 'module', 'main'], exportConditions: fullSourceConditions }),
    glslPlugin,
    typescript({
      compilerOptions: { incremental: false },
      outputToFilesystem: false,
      include: ['src/**/*.ts', 'packages/*/src/**/*.ts', 'scripts/exo-full.entry.ts'],
    }),
    terser({ compress: { pure_funcs: ['assert', 'assertDefined'] } }),
  ],
};

const productionOnlyConfigs = buildMode === 'production' ? [iifeMin] : [];

// The all-in-one full bundle (core + every extension package) is opt-in via
// EXOJS_FULL_BUNDLE=1. It bundles extension-package SOURCE, which
// @rollup/plugin-typescript cannot transform across the multiple rootDirs
// (src/ + packages/*/src) in one pass — building it needs an esbuild/swc
// transpile step (or a build-from-dist approach) that is not yet wired up.
// Keeping it out of the default build keeps `pnpm build` / release green.
const fullBundleConfigs = process.env.EXOJS_FULL_BUNDLE === '1' ? (buildMode === 'production' ? [iifeFull, iifeFullMin] : [iifeFull]) : [];

export default [bundled, debugBundled, modules, iife, ...productionOnlyConfigs, ...fullBundleConfigs];
