import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBuildDefinesFromRepo } from '@codexo/exojs-config/build-defines';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';
import { string } from 'rollup-plugin-string';

const rootDir = resolvePath(dirname(fileURLToPath(import.meta.url)));

const buildMode = process.env.EXOJS_ENV === 'development' ? 'development' : 'production';

const defines = createBuildDefinesFromRepo({ mode: buildMode, packageDir: rootDir });

// Activates the package-private `@codexo/source` condition in package.json#imports
// so `#*` resolves to ./src/*.ts at build time. preserveModules then rewrites the
// resolved paths to relative specifiers in the emitted ESM tree. The trailing
// standard conditions keep normal dependency resolution intact.
const sourceConditions = ['@codexo/source', 'browser', 'module', 'import', 'default'];

const glslPlugin = string({
  include: ['**/*.vert', '**/*.frag'],
});

const constantReplacementPlugin = replace({
  preventAssignment: true,
  values: defines,
});

// In production, drop dev-only diagnostic calls (assert/assertDefined/invariant/
// warnOnce) from the single-file bundles and minify them. `__DEV__` is already
// replaced with `false` here, so the helper bodies are empty — `pure_funcs`
// removes the now side-effect-free callsites (and their argument allocations)
// outright. The modular `dist/esm` tree is intentionally left unminified so
// consumers can tree-shake it themselves.
const productionMinifyPlugins = buildMode === 'production' ? [terser({ compress: { pure_funcs: ['assert', 'assertDefined', 'invariant', 'warnOnce'] } })] : [];

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

export default [bundled, debugBundled, modules];
