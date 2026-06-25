/**
 * Node ESM loader hook making a plain `node --import tsx/esm` run source-accurate
 * for the in-repo perf benches — the node/tsx counterpart of the vitest config's
 * `realShaderPlugin` + `aliasConfig`. Two jobs:
 *
 *  1. **GLSL imports.** Engine modules import shaders as
 *     `import src from '#rendering/.../x.frag'`, which `package.json#imports` maps
 *     to `./src/.../x.frag`. Node resolves the path but has no loader for the
 *     extension, so this hook loads the file as its source text exported as
 *     `default` (exactly like the vitest/rollup transforms).
 *
 *  2. **Workspace package specifiers.** `@codexo/exojs` and the extension packages
 *     (`@codexo/exojs-tilemap` etc.) do NOT expose a `@codexo/source` export
 *     condition, so `--conditions=@codexo/source` cannot redirect them to `src`;
 *     the vitest config aliases them explicitly, and so do we. Their package-
 *     internal `#*` imports still resolve to `src` via the `@codexo/source`
 *     condition (passed on the node command line).
 *
 * Pair with `--conditions=@codexo/source`. Entrypoint: `scripts/glsl-register.mjs`.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// Mirror of vitest.config.ts `aliasConfig` — public cross-package specifiers → source.
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

const isGlsl = specifier => specifier.endsWith('.vert') || specifier.endsWith('.frag');

export async function resolve(specifier, context, nextResolve) {
  const alias = packageAliases.get(specifier);

  if (alias !== undefined) {
    return { url: pathToFileURL(join(repoRoot, alias)).href, format: 'module', shortCircuit: true };
  }

  const result = await nextResolve(specifier, context);

  if (isGlsl(result.url)) {
    return { ...result, format: 'glsl-source', shortCircuit: true };
  }

  return result;
}

export async function load(url, context, nextLoad) {
  if (context.format === 'glsl-source' || isGlsl(url)) {
    const source = await readFile(fileURLToPath(url), 'utf8');

    return {
      format: 'module',
      source: `export default ${JSON.stringify(source)};`,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}
