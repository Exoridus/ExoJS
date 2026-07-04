// Shared Rollup factory for official ExoJS extension packages. Standardizes the
// preserveModules ESM-tree build, declaration emit, Core externalization, source
// maps, build-constant replacement, GLSL string imports, and the package-private
// `#` resolution. Package-local config supplies only the package root and its own
// source condition (or null when the package has no internal `#` imports).
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import { codecovRollupPlugin } from '@codecov/rollup-plugin';
import { createBuildDefinesFromRepo } from '../build-defines/index.js';
import { createWorkletPlugin } from '../worklet-plugin.js';
import nodeResolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import { string } from 'rollup-plugin-string';

// Core types come from the BUILT declarations (ambient .d.ts, outside the
// extension's rootDir). The emitted import specifiers stay the external
// `@codexo/exojs` bare paths.
const corePaths = {
  '@codexo/exojs': ['../../dist/esm/index.d.ts'],
  '@codexo/exojs/extensions': ['../../dist/esm/extensions/index.d.ts'],
  '@codexo/exojs/rendering': ['../../dist/esm/rendering.d.ts'],
  '@codexo/exojs/debug': ['../../dist/esm/debug/index.d.ts'],
  '@codexo/exojs-tilemap': ['../exojs-tilemap/dist/esm/index.d.ts'],
};

/**
 * @param {{ root: string, sourceCondition: string | null, inputs?: string[], external?: string[] }} opts
 *   `external` lists additional bare package names (e.g. `'react'`) to mark
 *   external alongside the always-external `@codexo/exojs*` core. Subpaths
 *   (e.g. `react/jsx-runtime`) are matched too.
 * @returns {import('rollup').RollupOptions}
 */
export function createExtensionConfig(opts) {
  const { root, sourceCondition, inputs = ['src/index.ts', 'src/register.ts'], external = [] } = opts;

  const defines = createBuildDefinesFromRepo({
    mode: process.env.EXOJS_ENV === 'development' ? 'development' : 'production',
    packageDir: root,
  });

  const isExternal = id =>
    id.startsWith('@codexo/exojs') || external.some(name => id === name || id.startsWith(`${name}/`));

  const packageName = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).name ?? 'extension';
  // Codecov Bundle Analysis: uploads per-package bundle stats when a token is
  // present (CI passes CODECOV_TOKEN); local and fork builds stay offline.
  const codecovPlugins = process.env.CODECOV_TOKEN
    ? codecovRollupPlugin({
        enableBundleAnalysis: true,
        bundleName: packageName.replace(/^@codexo\//, ''),
        uploadToken: process.env.CODECOV_TOKEN,
        telemetry: false,
      })
    : [];

  return {
    input: inputs,
    external: isExternal,
    output: {
      dir: 'dist/esm',
      format: 'es',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
      // The preserveModules tree emits `sources` one directory level too high
      // (../../../src/… escapes the package), so consumers that inspect the
      // maps warn about missing source files. Re-anchor every `src/…` source
      // to its real location relative to its map file (same fix as the core
      // rollup.config.ts).
      sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
        const match = /^(?:\.\.[\\/])+(src[\\/].*)$/.exec(relativeSourcePath);
        if (!match) return relativeSourcePath;
        return relative(dirname(sourcemapPath), resolve(root, match[1])).replaceAll('\\', '/');
      },
    },
    plugins: [
      replace({
        preventAssignment: true,
        values: defines,
      }),
      // Resolve this package's `#` imports to source via its OWN condition;
      // skipped when the package has no internal `#` imports.
      ...(sourceCondition ? [nodeResolve({ exportConditions: [sourceCondition, 'browser', 'module', 'import', 'default'], extensions: ['.ts', '.js'] })] : []),
      string({ include: ['**/*.vert', '**/*.frag'] }),
      // Real, typed AudioWorklet sources imported via `?worklet` (see
      // `../worklet-plugin.js`); untouched worklets keep exporting a plain
      // template-string constant and are unaffected.
      createWorkletPlugin(),
      typescript({
        compilerOptions: {
          incremental: false,
          rootDir: 'src',
          outDir: 'dist/esm',
          declaration: true,
          declarationDir: 'dist/esm',
          declarationMap: false,
          // Embed the original TS text so the shipped maps work without src/
          // on disk (npm consumers, Vite's missing-source check).
          inlineSources: true,
          // Only this package's source condition is active (or none): the package's
          // `#` -> ./src, while Core's `#` (in its built .d.ts) -> Core's dist.
          customConditions: sourceCondition ? [sourceCondition] : [],
          paths: corePaths,
        },
      }),
      // Bundle-analysis upload goes last, after all transforms.
      ...codecovPlugins,
    ],
  };
}
