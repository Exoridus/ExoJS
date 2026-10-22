// Shared Rolldown builds for the official ExoJS packages: the preserveModules
// ESM tree, Core externalization, source maps, build-constant replacement, GLSL
// string imports, and package-private `#` resolution. No `typescript()`
// transform - Rolldown transpiles TypeScript natively, with no single-Program
// rootDir constraint. Declarations are a separate step, since Rolldown has no
// declaration emitter: adapters emit theirs from `scripts/build-extension.ts`
// against the package's own `tsconfig.build.json`, runtime modules from the
// Core build's single declaration program.
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import { codecovRollupPlugin } from '@codecov/rollup-plugin';
import { createShaderPlugin, createWorkletPlugin } from '@codexo/exojs-build';

import { createBuildDefinesFromRepo } from '../build-defines/index.js';

// Rolldown derives a preserveModules chunk name by dropping the module path's
// final extension, so `color-matrix.frag` and `color-matrix.wgsl` both want
// `color-matrix.js` and the second is disambiguated to `color-matrix2.js`.
// Rollup keeps the full basename, which is what the shipped `dist/esm` tree
// has always contained. Rebuilding the path from `facadeModuleId` restores
// that for the shader files; every other module keeps the default `[name]`.
const SHADER_EXTENSION = /\.(?:vert|frag|wgsl)$/;
/**
 * @param {string} sourceRoot
 * @returns {import('rolldown').ChunkFileNamesFunction}
 */
function preservedModuleNaming(sourceRoot) {
  return info => {
    const id = info.facadeModuleId;
    if (id && SHADER_EXTENSION.test(id)) {
      return `${relative(sourceRoot, id).replaceAll('\\', '/')}.js`;
    }
    return '[name].js';
  };
}

/**
 * @typedef {object} TreeOptions
 * @property {string} root package directory the sources and inputs are relative to
 * @property {string | null} sourceCondition package-private `#` source condition, if the package has `#` imports
 * @property {string[]} inputs entry modules, relative to `root`
 * @property {string} outDir output directory, absolute or relative to `root`
 * @property {Record<string, string>} defines build-constant replacements
 * @property {string} bundleName Codecov bundle name
 * @property {(id: string) => boolean} [external]
 * @property {import('rolldown').Plugin[]} [plugins] plugins that run before the shared ones
 */

/**
 * @param {TreeOptions} opts
 * @returns {import('rolldown').RolldownOptions}
 */
function createPreservedTreeOptions(opts) {
  const { root, sourceCondition, inputs, outDir, defines, bundleName, external, plugins = [] } = opts;

  const codecovPlugins = process.env.CODECOV_TOKEN
    ? [
        codecovRollupPlugin({
          enableBundleAnalysis: true,
          bundleName,
          uploadToken: process.env.CODECOV_TOKEN,
          telemetry: false,
        }),
      ]
    : [];

  return {
    cwd: root,
    input: inputs,
    ...(external ? { external } : {}),
    transform: { define: defines },
    resolve: sourceCondition
      ? { conditionNames: [sourceCondition, 'browser', 'module', 'import', 'default'], extensions: ['.ts', '.js'] }
      : undefined,
    // Shader text ships inside string literals, which no JavaScript minifier
    // descends into, so its comments are payload every consumer downloads:
    // stripped here, as the core's minified bundles strip them.
    plugins: [...plugins, createShaderPlugin({ minify: true }), createWorkletPlugin(), ...codecovPlugins],
    output: {
      dir: outDir,
      format: 'es',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
      entryFileNames: preservedModuleNaming(resolve(root, 'src')),
      chunkFileNames: preservedModuleNaming(resolve(root, 'src')),
      // Minify defaults to Rolldown's own 'dce-only' when left unset, which
      // would silently strip more from this deliberately-unminified tree than
      // Rollup ever did (see the core build's `scripts/build.ts` for the full
      // story). Explicit `false` to match the tree's actual intent.
      minify: false,
      // Same fix as the core build: preserveModules emits `sources` one
      // directory level too high, escaping the package; re-anchor every
      // `src/...` source to its real location relative to its map file.
      sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
        const match = /^(?:\.\.[\\/])+(src[\\/].*)$/.exec(relativeSourcePath);
        if (!match) return relativeSourcePath;
        return relative(dirname(sourcemapPath), resolve(root, match[1])).replaceAll('\\', '/');
      },
    },
  };
}

/**
 * Build options for a separately published extension package (an adapter): its
 * own `dist/esm` tree, with every `@codexo/exojs` specifier left as a bare
 * external import that the consumer's installed Core satisfies.
 *
 * @param {{ root: string, sourceCondition: string | null, inputs?: string[], external?: string[] }} opts
 * @returns {import('rolldown').RolldownOptions}
 */
export function createExtensionBuildOptions(opts) {
  const { root, sourceCondition, inputs = ['src/index.ts'], external = [] } = opts;

  const defines = createBuildDefinesFromRepo({
    mode: process.env.EXOJS_ENV === 'development' ? 'development' : 'production',
    packageDir: root,
  });

  const packageName = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).name ?? 'extension';

  return createPreservedTreeOptions({
    root,
    sourceCondition,
    inputs,
    outDir: 'dist/esm',
    defines,
    bundleName: packageName.replace(/^@codexo\//, ''),
    external: id => id.startsWith('@codexo/exojs') || external.some(name => id === name || id.startsWith(`${name}/`)),
  });
}

/**
 * @typedef {object} RuntimeModule
 * @property {string} root source package directory
 * @property {string | null} sourceCondition package-private `#` source condition, if the module has `#` imports
 * @property {readonly string[]} inputs entry modules, relative to `root`
 */

/**
 * Declares how a runtime module is compiled. The module ships inside the Core
 * package, so the Core build supplies the output location and the resolution
 * of every specifier that leaves the module; see
 * {@link createRuntimeModuleBuildOptions}.
 *
 * @param {{ root: string, sourceCondition: string | null, inputs?: string[] }} opts
 * @returns {Readonly<RuntimeModule>}
 */
export function defineRuntimeModule(opts) {
  const { root, sourceCondition, inputs = ['src/index.ts'] } = opts;

  return Object.freeze({ root, sourceCondition, inputs: Object.freeze([...inputs]) });
}

/**
 * Build options for a runtime module compiled into the Core package tree.
 *
 * `resolveExternal` maps a specifier that leaves the module to the absolute
 * file it ships as, or returns `undefined` to let normal resolution bundle it.
 * A mapped import is emitted as a path relative to each importing chunk, so the
 * module reaches Core and its sibling modules through the same files the Core
 * entries load instead of through a bare package specifier.
 *
 * @param {Readonly<RuntimeModule>} module
 * @param {{ outDir: string, defines: Record<string, string>, bundleName: string, resolveExternal: (specifier: string, importer: string | undefined) => string | undefined }} target
 * @returns {import('rolldown').RolldownOptions}
 */
export function createRuntimeModuleBuildOptions(module, target) {
  const outDir = resolve(module.root, target.outDir);

  return createPreservedTreeOptions({
    root: module.root,
    sourceCondition: module.sourceCondition,
    inputs: [...module.inputs],
    outDir,
    defines: target.defines,
    bundleName: target.bundleName,
    plugins: [createShippedExternalsPlugin({ sourceRoot: resolve(module.root, 'src'), outDir, resolveExternal: target.resolveExternal })],
  });
}

/**
 * Emits an import that leaves a preserveModules tree as a path relative to the
 * importing module's own output file.
 *
 * The relative path is computed here rather than left to Rolldown: given an
 * absolute external id, Rolldown relativizes it against the importer's SOURCE
 * location, which lies in a different directory than the emitted file. A
 * preserveModules chunk sits at `outDir/<path below sourceRoot>`, so the
 * output location of every importer is known before bundling, and a relative
 * external id is emitted verbatim.
 *
 * @param {{ sourceRoot: string, outDir: string, resolveExternal: (specifier: string, importer: string | undefined) => string | undefined }} opts
 * @returns {import('rolldown').Plugin}
 */
export function createShippedExternalsPlugin(opts) {
  const { sourceRoot, outDir, resolveExternal } = opts;

  return {
    name: 'exojs-shipped-externals',
    resolveId(source, importer) {
      const target = resolveExternal(source, importer);

      if (target === undefined) {
        return null;
      }

      if (importer === undefined) {
        throw new Error(`"${source}" cannot be an entry of a preserveModules tree.`);
      }

      const importerOutput = resolve(outDir, relative(sourceRoot, importer));
      const id = relative(dirname(importerOutput), target).replaceAll('\\', '/');

      return { id: id.startsWith('.') ? id : `./${id}`, external: true };
    },
  };
}
