import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';
import { string } from 'rollup-plugin-string';

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

const glslPlugin = string({
  include: ['**/*.vert', '**/*.frag'],
});

const constantReplacementPlugin = replace({
  preventAssignment: true,
  values: {
    __BUILD_ENV__: JSON.stringify(buildEnvironment),
    __COMMIT_SHA__: JSON.stringify(gitCommitSha),
    __DEV__: JSON.stringify(isDevelopmentBuild),
    __VERSION__: JSON.stringify(packageVersion),
  },
});

const bundled: RollupOptions = {
  input: 'src/index.ts',
  output: {
    file: 'dist/exo.esm.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    constantReplacementPlugin,
    resolve({ mainFields: ['browser', 'module', 'main'] }),
    glslPlugin,
    typescript({
      compilerOptions: { incremental: false },
      outputToFilesystem: false,
    }),
  ],
};

const debugBundled: RollupOptions = {
  input: 'src/debug/index.ts',
  output: {
    file: 'dist/exo.debug.esm.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    constantReplacementPlugin,
    resolve({ mainFields: ['browser', 'module', 'main'] }),
    glslPlugin,
    typescript({
      compilerOptions: { incremental: false },
      outputToFilesystem: false,
    }),
  ],
};

const modules: RollupOptions = {
  input: ['src/index.ts', 'src/debug/index.ts'],
  output: {
    dir: 'dist/esm',
    format: 'es',
    sourcemap: true,
    preserveModules: true,
    preserveModulesRoot: 'src',
  },
  plugins: [
    constantReplacementPlugin,
    resolve({ mainFields: ['module', 'browser', 'main'] }),
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
