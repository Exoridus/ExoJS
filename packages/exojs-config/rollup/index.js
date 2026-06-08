// Shared Rollup factory for official ExoJS extension packages. Standardizes the
// preserveModules ESM-tree build, declaration emit, Core externalization, source
// maps, build-constant replacement, GLSL string imports, and the package-private
// `#` resolution. Package-local config supplies only the package root and its own
// source condition (or null when the package has no internal `#` imports).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
};

/**
 * @param {{ root: string, sourceCondition: string | null, inputs?: string[] }} opts
 * @returns {import('rollup').RollupOptions}
 */
export function createExtensionConfig(opts) {
  const { root, sourceCondition, inputs = ['src/index.ts', 'src/register.ts'] } = opts;

  const version = (() => {
    try {
      return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  })();
  const sha = (() => {
    try {
      return execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  })();
  const env = process.env.EXOJS_ENV === 'development' ? 'development' : 'production';
  const isDev = env === 'development';

  return {
    input: inputs,
    external: id => id.startsWith('@codexo/exojs'),
    output: {
      dir: 'dist/esm',
      format: 'es',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
    },
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          __BUILD_ENV__: JSON.stringify(env),
          __COMMIT_SHA__: JSON.stringify(sha),
          __DEV__: JSON.stringify(isDev),
          __VERSION__: JSON.stringify(version),
        },
      }),
      // Resolve this package's `#` imports to source via its OWN condition;
      // skipped when the package has no internal `#` imports.
      ...(sourceCondition ? [nodeResolve({ exportConditions: [sourceCondition, 'browser', 'module', 'import', 'default'], extensions: ['.ts', '.js'] })] : []),
      string({ include: ['**/*.vert', '**/*.frag'] }),
      typescript({
        compilerOptions: {
          incremental: false,
          rootDir: 'src',
          outDir: 'dist/esm',
          declaration: true,
          declarationDir: 'dist/esm',
          declarationMap: false,
          // Only this package's source condition is active (or none): the package's
          // `#` -> ./src, while Core's `#` (in its built .d.ts) -> Core's dist.
          customConditions: sourceCondition ? [sourceCondition] : [],
          paths: corePaths,
        },
      }),
    ],
  };
}
