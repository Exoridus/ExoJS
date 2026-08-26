/**
 * Node ESM loader hook making a plain `node --import tsx/esm` run source-accurate
 * for the in-repo perf benches - the node/tsx counterpart of the vitest config's
 * `realShaderPlugin` + `aliasConfig`. Two jobs:
 *
 *  1. **Shader imports.** Engine modules import shaders as
 *     `import src from '#rendering/.../x.frag'` (and the WGSL counterparts as
 *     `.wgsl`), which `package.json#imports` maps into `./src/`. Node resolves
 *     the path but has no loader for those extensions, so this hook loads the
 *     file as its source text exported as `default` (exactly like the
 *     vitest/rollup transforms).
 *
 *  2. **Workspace package specifiers.** `@codexo/exojs` and the extension packages
 *     (`@codexo/exojs-tilemap` etc.) do NOT expose a `@codexo/exojs-source` export
 *     condition, so `--conditions=@codexo/exojs-source` cannot redirect them to `src`;
 *     the vitest config aliases them explicitly, and so do we. Their package-
 *     internal `#*` imports still resolve to `src` via the `@codexo/exojs-source`
 *     condition (passed on the node command line).
 *
 * Pair with `--conditions=@codexo/exojs-source`. Entrypoint: `scripts/glsl-register.ts`.
 *
 * Node loads this file on the hooks thread and strips its types itself, which
 * is the only reason it can be TypeScript: `tsx/esm` never reaches a module
 * that arrives through `--import` or `register()`. Keep the syntax erasable
 * (no enums, no parameter properties) - there is no compiler here.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { LoadHook, ResolveHook } from 'node:module';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// Mirror of vitest.config.ts `aliasConfig` - public cross-package specifiers → source.
// Longest-first so subpaths (`@codexo/exojs/debug`) match before the bare root.
const packageAliases = new Map([
  ['@codexo/exojs/extensions', 'src/extensions/index.ts'],
  ['@codexo/exojs/renderer-sdk', 'src/renderer-sdk.ts'],
  ['@codexo/exojs/debug', 'src/debug/index.ts'],
  ['@codexo/exojs', 'src/index.ts'],
  ['@codexo/exojs-tilemap', 'packages/exojs-tilemap/src/index.ts'],
  ['@codexo/exojs-tiled', 'packages/exojs-tiled/src/index.ts'],
  ['@codexo/exojs-physics', 'packages/exojs-physics/src/index.ts'],
  ['@codexo/exojs-particles', 'packages/exojs-particles/src/index.ts'],
  ['@codexo/exojs-audio-fx', 'packages/exojs-audio-fx/src/index.ts'],
]);

const SHADER_EXTENSIONS = ['.vert', '.frag', '.wgsl'];

const isShaderSource = (specifier: string): boolean => SHADER_EXTENSIONS.some(extension => specifier.endsWith(extension));

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  const alias = packageAliases.get(specifier);

  if (alias !== undefined) {
    return { url: pathToFileURL(join(repoRoot, alias)).href, format: 'module', shortCircuit: true };
  }

  const result = await nextResolve(specifier, context);

  if (isShaderSource(result.url)) {
    return { ...result, format: 'shader-source', shortCircuit: true };
  }

  return result;
};

export const load: LoadHook = async (url, context, nextLoad) => {
  if (context.format === 'shader-source' || isShaderSource(url)) {
    const source = await readFile(fileURLToPath(url), 'utf8');

    return {
      format: 'module',
      source: `export default ${JSON.stringify(source)};`,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
};
