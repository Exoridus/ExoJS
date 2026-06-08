import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assets } from '../../examples/assets/assets';
import { ASSETS_GLOBAL_DTS_RELATIVE, renderAssetsGlobalDts } from '../../scripts/generate-examples-global-dts';

// Vitest runs with the repository root as the working directory.
const committedPath = join(process.cwd(), ASSETS_GLOBAL_DTS_RELATIVE);
const committed = readFileSync(committedPath, 'utf8').replace(/\r\n/g, '\n');
const generated = renderAssetsGlobalDts(assets as unknown as Record<string, unknown>);

describe('assets-global.d.ts drift guard', () => {
  it('matches the deterministically generated declaration (run `pnpm -C site examples:sync`)', () => {
    expect(committed).toBe(generated);
  });

  it('is self-contained — no imports into the canonical catalog module', () => {
    // The whole point of the generated decl is that Monaco can load it as a
    // single extra-lib without following a relative `import type` into a module
    // that does not exist in its virtual filesystem.
    expect(committed).not.toMatch(/^\s*import\b/m);
    expect(committed).toContain('declare global');
    expect(committed.trimEnd().endsWith('export {};')).toBe(true);
  });

  it('exposes the typed global both as a const and on Window', () => {
    expect(committed).toContain('const assets: ExampleAssetCatalog');
    expect(committed).toContain('readonly assets: ExampleAssetCatalog');
  });

  it('emits exact string literals for nested leaves (hierarchical + literal types)', () => {
    expect(committed).toContain("readonly musicLoop: 'demo/audio/demo-loop-main.ogg';");
    expect(committed).toContain("readonly alphaEdgeStraight: 'technical/alpha/alpha-edge-straight.png';");
    // numeric leaves stay numeric literals, not widened to `number`.
    expect(committed).toContain('readonly tileWidth: 64;');
  });
});
