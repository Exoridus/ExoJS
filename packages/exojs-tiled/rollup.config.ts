import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';

const rootDir = resolvePath(dirname(fileURLToPath(import.meta.url)));

const packageVersion = (() => {
  const packageJsonPath = resolvePath(rootDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };

  return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
})();

const gitCommitSha = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();

const buildEnvironment = process.env.EXOJS_ENV === 'development' ? 'development' : 'production';
const isDevelopmentBuild = buildEnvironment === 'development';

const constantReplacementPlugin = replace({
  preventAssignment: true,
  values: {
    __BUILD_ENV__: JSON.stringify(buildEnvironment),
    __COMMIT_SHA__: JSON.stringify(gitCommitSha),
    __DEV__: JSON.stringify(isDevelopmentBuild),
    __VERSION__: JSON.stringify(packageVersion),
  },
});

const modules: RollupOptions = {
  input: ['src/index.ts', 'src/register.ts'],
  external: (id: string) => id.startsWith('@codexo/exojs'),
  output: {
    dir: 'dist/esm',
    format: 'es',
    sourcemap: true,
    preserveModules: true,
    preserveModulesRoot: 'src',
  },
  plugins: [
    constantReplacementPlugin,
    typescript({
      compilerOptions: {
        incremental: false,
        rootDir: 'src',
        outDir: 'dist/esm',
        declaration: true,
        declarationDir: 'dist/esm',
        declarationMap: false,
        paths: {
          '@codexo/exojs': ['../../dist/esm/index.d.ts'],
          '@codexo/exojs/extensions': ['../../dist/esm/extensions/index.d.ts'],
          '@codexo/exojs/rendering': ['../../dist/esm/rendering.d.ts'],
          '@codexo/exojs/debug': ['../../dist/esm/debug/index.d.ts'],
        },
      },
    }),
  ],
};

export default [modules];
