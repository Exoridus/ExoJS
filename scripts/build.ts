/**
 * Builds the core package: `exo.esm.js`, `exo.debug.esm.js`, the preserveModules
 * `dist/esm` tree (with declarations), `exo.iife.js`, and (production only)
 * `exo.iife.min.js`.
 *
 * Bundling runs on Rolldown; declarations are a separate `tsc
 * --emitDeclarationOnly` pass over `dist/esm`, since Rolldown has no
 * declaration emitter. `EXOJS_ENV=development` selects the dev build
 * (`pnpm build:dev`); `--watch` runs Rolldown's watch mode instead of a single
 * build (`pnpm build:watch`) and skips declarations - they are not part of the
 * inner dev loop this mode serves, and `pnpm typecheck` already covers type
 * correctness.
 *
 * `EXOJS_FULL_BUNDLE=1` additionally builds the opt-in all-in-one IIFE bundle
 * (core + every extension package) through `rollup.full-bundle.config.ts`,
 * which stays on Rollup - see that file for why.
 */
import { spawnSync } from 'node:child_process';
import { dirname, relative as relativePath, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { codecovRollupPlugin } from '@codecov/rollup-plugin';
import { createShaderPlugin, createWorkletPlugin } from '@codexo/exojs-build';
import { createBuildDefinesFromRepo } from '@codexo/exojs-config/build-defines';
import { rolldown, watch, type OutputOptions, type Plugin, type RolldownOptions } from 'rolldown';

const rootDir = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const watchMode = process.argv.includes('--watch');
// `--dev` (used by `build:dev`/`build:watch`) selects the dev build without
// relying on a cross-platform env-var-setting mechanism. `EXOJS_ENV` is
// still honored as a fallback for anything that invokes this script directly
// with the env var set (matching the previous `rollup -c` convention).
const buildMode = process.argv.includes('--dev') || process.env.EXOJS_ENV === 'development' ? 'development' : 'production';
const defines = createBuildDefinesFromRepo({ mode: buildMode, packageDir: rootDir });

// Activates the package-private `@codexo/exojs-source` condition in package.json#imports
// so `#*` resolves to ./src/*.ts at build time. preserveModules then rewrites the
// resolved paths to relative specifiers in the emitted ESM tree. The trailing
// standard conditions keep normal dependency resolution intact.
const sourceConditions = ['@codexo/exojs-source', 'browser', 'module', 'import', 'default'];

// The preserveModules tree emits `sources` one directory level too high
// (`../../../../src/…` escapes the repo), so consumers (e.g. Vite serving the
// site) warn about missing source files on every module. Re-anchor every
// `src/…` source to its real location relative to its map file.
const ESCAPED_SOURCE = /^(?:\.\.[\\/])+(src[\\/].*)$/;
function sourcemapPathTransform(relativeSourcePath: string, sourcemapPath: string): string {
  const match = ESCAPED_SOURCE.exec(relativeSourcePath);
  if (!match) return relativeSourcePath;
  return relativePath(dirname(sourcemapPath), resolvePath(rootDir, match[1])).replaceAll('\\', '/');
}

// Rolldown derives a preserveModules chunk name by dropping the module path's
// final extension, so `color-matrix.frag` and `color-matrix.wgsl` both want
// `color-matrix.js` and the second is disambiguated to `color-matrix2.js`.
// Rollup (the previous bundler) keeps the full basename, which is what the
// shipped `dist/esm` tree has always contained. Rebuilding the path from
// `facadeModuleId` restores that for the shader files; every other module
// keeps the default `[name]`.
const SHADER_EXTENSION = /\.(?:vert|frag|wgsl)$/;
function preservedModuleNaming(info: { facadeModuleId: string | null }): string {
  const id = info.facadeModuleId;
  if (id && SHADER_EXTENSION.test(id)) {
    return `${relativePath(resolvePath(rootDir, 'src'), id).replaceAll('\\', '/')}.js`;
  }
  return '[name].js';
}

// Codecov Bundle Analysis: uploads per-bundle module stats when a token is
// present (CI passes CODECOV_TOKEN via secrets: inherit). A plain local
// `pnpm build` has no token and stays fully offline.
function codecovBundlePlugin(bundleName: string): Plugin[] {
  return process.env.CODECOV_TOKEN
    ? [codecovRollupPlugin({ enableBundleAnalysis: true, bundleName, uploadToken: process.env.CODECOV_TOKEN, telemetry: false }) as Plugin]
    : [];
}

// Shader text (`.vert`/`.frag`/`.wgsl`) ships verbatim inside the bundle -
// minification never descends into a string literal - so the outputs that
// minify get the comment-stripped variant and the readable ones keep the
// source as authored.
function shaderAndWorkletPlugins(minify: boolean): Plugin[] {
  return [createShaderPlugin({ minify }), createWorkletPlugin({ minify })];
}

// No `pure_funcs`-equivalent config needed here: once `__DEV__` is replaced by
// `false`, Rolldown's own dead-code elimination already removes calls to the
// now-empty `assert`/`assertDefined` bodies together with their (provably
// pure) argument expressions, in every output including the unminified
// `modules` tree - unlike the previous Rollup+terser pipeline, which only did
// this for the minified single-file bundles and left live callsites in the
// unminified tree.

const shared = {
  cwd: rootDir,
  transform: { define: defines },
  resolve: { conditionNames: sourceConditions, mainFields: ['browser', 'module', 'main'] },
};

function bundled(minify: boolean): RolldownOptions {
  return {
    ...shared,
    input: 'src/index.ts',
    plugins: [...shaderAndWorkletPlugins(minify), ...codecovBundlePlugin('exo-esm')],
    output: { file: 'dist/exo.esm.js', format: 'es', sourcemap: true, minify },
  };
}

function debugBundled(minify: boolean): RolldownOptions {
  return {
    ...shared,
    input: 'src/debug/index.ts',
    // All `#` imports are core dependencies - mark them external so the debug
    // bundle contains only debug code and imports from @codexo/exojs at
    // runtime. (Intra-debug imports are same-directory `./` and stay bundled.)
    external: (id: string) => id.startsWith('#'),
    plugins: shaderAndWorkletPlugins(minify),
    output: {
      file: 'dist/exo.debug.esm.js',
      format: 'es',
      sourcemap: true,
      minify,
      // Remap all `#` external IDs to the package name in the output.
      paths: (id: string) => (id.startsWith('#') ? '@codexo/exojs' : id),
    },
  };
}

function modules(): RolldownOptions {
  return {
    ...shared,
    input: ['src/index.ts', 'src/debug/index.ts', 'src/extensions/index.ts', 'src/renderer-sdk.ts'],
    resolve: { conditionNames: sourceConditions, mainFields: ['module', 'browser', 'main'] },
    plugins: [...shaderAndWorkletPlugins(false), ...codecovBundlePlugin('exo-esm-modules')],
    output: {
      dir: 'dist/esm',
      format: 'es',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
      entryFileNames: preservedModuleNaming,
      chunkFileNames: preservedModuleNaming,
      sourcemapPathTransform,
      // Rolldown's own default is 'dce-only', not off - left implicit here it
      // would silently remove the (verified side-effect-free) assert/
      // assertDefined callsites from this tree too. Explicit `false` to match
      // this tree's actual intent: intentionally unoptimized, so consumers do
      // their own tree-shaking against predictable, unmodified-beyond-
      // transpilation source.
      minify: false,
    },
  };
}

function iife(minify: boolean): RolldownOptions {
  return {
    ...shared,
    input: 'src/index.ts',
    plugins: shaderAndWorkletPlugins(minify),
    output: { file: minify ? 'dist/exo.iife.min.js' : 'dist/exo.iife.js', format: 'iife', name: 'Exo', sourcemap: true, minify },
  };
}

async function runJob(options: RolldownOptions): Promise<void> {
  const bundle = await rolldown(options);
  await bundle.write(options.output as OutputOptions);
  await bundle.close();
}

async function emitDeclarations(): Promise<void> {
  const tsc = resolvePath(rootDir, 'node_modules/typescript/bin/tsc');
  const result = spawnSync(
    process.execPath,
    [tsc, '-p', 'tsconfig.json', '--emitDeclarationOnly', '--outDir', 'dist/esm', '--declarationDir', 'dist/esm', '--inlineSources', '--incremental', 'false'],
    { cwd: rootDir, stdio: 'inherit' },
  );
  if (result.status !== 0) {
    throw new Error(`declaration emit failed (tsc exit ${result.status})`);
  }
}

function buildFullBundle(): void {
  const rollup = resolvePath(rootDir, 'node_modules/rollup/dist/bin/rollup');
  const result = spawnSync(process.execPath, ['--import', 'tsx/esm', rollup, '-c', 'rollup.full-bundle.config.ts', '--environment', `EXOJS_ENV:${buildMode}`], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`full-bundle build failed (rollup exit ${result.status})`);
  }
}

if (watchMode) {
  const jobs = [bundled(false), debugBundled(false), modules(), iife(false)];
  const watcher = watch(jobs as never);
  watcher.on('event', event => {
    if (event.code === 'BUNDLE_END') void event.result.close();
    if (event.code === 'ERROR') console.error(event.error);
    if (event.code === 'END') console.log('rebuilt');
  });
} else {
  const jobs =
    buildMode === 'production'
      ? [bundled(true), debugBundled(true), modules(), iife(false), iife(true)]
      : [bundled(true), debugBundled(true), modules(), iife(false)];

  for (const job of jobs) {
    await runJob(job);
  }
  await emitDeclarations();

  if (process.env.EXOJS_FULL_BUNDLE === '1') {
    buildFullBundle();
  }
}
