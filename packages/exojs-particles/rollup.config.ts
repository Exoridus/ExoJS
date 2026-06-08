import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import nodeResolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';
import { string } from 'rollup-plugin-string';

// Resolves this package's package-private `#*` imports through package.json#imports
// via its OWN `@codexo/exojs-particles-source` condition (-> ./src/*.ts);
// preserveModules then rewrites them to relative specifiers. The package-specific
// condition name ensures Core's `#` imports (in Core's built .d.ts) are NOT
// redirected to Core source during this build — they resolve to Core's dist,
// avoiding a dual src/dist type identity. @codexo/exojs stays external.
const sourceConditions = ['@codexo/exojs-particles-source', 'browser', 'module', 'import', 'default'];

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
    nodeResolve({ exportConditions: sourceConditions, extensions: ['.ts', '.js'] }),
    glslPlugin,
    typescript({
      compilerOptions: {
        incremental: false,
        rootDir: 'src',
        outDir: 'dist/esm',
        declaration: true,
        declarationDir: 'dist/esm',
        declarationMap: false,
        // Only THIS package's source condition is active for the build, so this
        // package's `#` imports resolve to ./src while Core's `#` imports (in its
        // built .d.ts, referenced below) resolve to Core's dist — single identity.
        customConditions: ['@codexo/exojs-particles-source'],
        // Core types come from the BUILT declarations (ambient .d.ts, not under
        // this package's rootDir). The emitted specifiers stay external bare paths.
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
