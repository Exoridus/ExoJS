// Shared Rolldown build for official ExoJS extension packages: the
// preserveModules ESM tree, Core externalization, source maps, build-constant
// replacement, GLSL string imports, and package-private `#` resolution. No
// `typescript()` transform - Rolldown transpiles TypeScript natively, with no
// single-Program rootDir constraint. Declarations are a separate step, driven
// by `scripts/build-extension.ts` against the package's own
// `tsconfig.build.json`, since Rolldown has no declaration emitter.
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
 * @param {{ root: string, sourceCondition: string | null, inputs?: string[], external?: string[] }} opts
 *   Same contract as `createExtensionConfig` in `../rollup/index.js`.
 * @returns {import('rolldown').RolldownOptions}
 */
export function createExtensionBuildOptions(opts) {
  const { root, sourceCondition, inputs = ['src/index.ts'], external = [] } = opts;

  const defines = createBuildDefinesFromRepo({
    mode: process.env.EXOJS_ENV === 'development' ? 'development' : 'production',
    packageDir: root,
  });

  /** @param {string} id */
  const isExternal = id => id.startsWith('@codexo/exojs') || external.some(name => id === name || id.startsWith(`${name}/`));

  const packageName = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).name ?? 'extension';
  const codecovPlugins = process.env.CODECOV_TOKEN
    ? [
        codecovRollupPlugin({
          enableBundleAnalysis: true,
          bundleName: packageName.replace(/^@codexo\//, ''),
          uploadToken: process.env.CODECOV_TOKEN,
          telemetry: false,
        }),
      ]
    : [];

  return {
    cwd: root,
    input: inputs,
    external: isExternal,
    transform: { define: defines },
    resolve: sourceCondition ? { conditionNames: [sourceCondition, 'browser', 'module', 'import', 'default'], extensions: ['.ts', '.js'] } : undefined,
    plugins: [createShaderPlugin(), createWorkletPlugin(), ...codecovPlugins],
    output: {
      dir: 'dist/esm',
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
