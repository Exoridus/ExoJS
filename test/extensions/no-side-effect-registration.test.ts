import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const rootDir = resolve(import.meta.dirname!, '..', '..');

/**
 * Registration-by-import collides with `sideEffects: false` (declared on the
 * root package and every extension package): a bare top-level call to a
 * `register*` function - reachable merely by evaluating the module, not by
 * using any of its exports - is exactly what a tree-shaking bundler is
 * entitled to drop under that flag for a partial consumer that never
 * references the module's exports directly.
 *
 * The fix is architectural, not a `sideEffects` array entry: every
 * registration in these files funnels through an explicit, function-wrapped
 * seam - `buildCoreRendererBindings` + `materializeRendererBindings` for
 * renderers, the frozen `coreAssetTypes` list + `materializeAssetTypes` for
 * asset types - invoked by Application's bootstrap rather than fired as an
 * automatic consequence of importing the module.
 *
 * This is a source-level regression test, not a behavioural one: it catches
 * a bare `registerX(...)` statement reappearing at module scope in one of
 * these files, independent of whether the current import graph happens to
 * keep it reachable today.
 */
function topLevelRegisterCallLines(relativePath: string): string[] {
  const source = readFileSync(resolve(rootDir, relativePath), 'utf8');
  return source.split(/\r?\n/).filter(line => /^register\w*\(/.test(line));
}

describe('no bare top-level register*() calls (sideEffects:false safety)', () => {
  it.each(['src/rendering/sprite/Sprite.ts', 'src/rendering/coreRendererBindings.ts', 'src/assets/coreAssetTypes.ts'] as const)(
    '%s has zero module-scope register*() statements',
    relativePath => {
      expect(topLevelRegisterCallLines(relativePath)).toEqual([]);
    },
  );
});
