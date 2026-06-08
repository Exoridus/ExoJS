import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanForbiddenContent } from '../../scripts/release/full-zip';

let tree: string;

const write = (rel: string, content: string): void => {
  const abs = join(tree, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
};

beforeEach(() => {
  tree = mkdtempSync(join(tmpdir(), 'exo-fullzip-'));
});

afterEach(() => rmSync(tree, { recursive: true, force: true }));

describe('scanForbiddenContent', () => {
  it('passes a clean tree (compiled ESM + TS example sources, no forbidden patterns)', () => {
    write('vendor/exojs/esm/index.js', "export * from './core/index.js';\n");
    write('vendor/exojs/esm/index.d.ts', 'export declare const x: number;\n');
    write('examples/js/sprites/basic.js', "import { Application } from '@codexo/exojs';\n");
    write('examples/src/sprites/basic.ts', "import { Application } from '@codexo/exojs';\nconst p = assets.demo.textures.shipA;\n");
    write('examples/examples.json', '{"sprites":[]}');
    expect(scanForbiddenContent(tree)).toEqual([]);
  });

  it('flags a workspace: specifier leaking into a manifest', () => {
    write('examples/js/x.js', 'ok');
    write('vendor/exojs/esm/package.json', '{"dependencies":{"@codexo/exojs-config":"workspace:*"}}');
    const hits = scanForbiddenContent(tree);
    expect(hits.some(h => h.pattern === 'workspace: specifier')).toBe(true);
  });

  it('flags an @assets alias import', () => {
    write('examples/js/x.js', "import { textures } from '@assets';\n");
    const hits = scanForbiddenContent(tree);
    expect(hits.some(h => h.pattern === '@assets alias')).toBe(true);
  });

  it('flags an @/ alias import', () => {
    write('vendor/exojs/esm/y.js', "import { Foo } from '@/core/foo';\n");
    const hits = scanForbiddenContent(tree);
    expect(hits.some(h => h.pattern === '@/ alias import')).toBe(true);
  });

  it('flags a reserved @codexo/exojs-assets reference', () => {
    write('examples/js/x.js', "import a from '@codexo/exojs-assets';\n");
    const hits = scanForbiddenContent(tree);
    expect(hits.some(h => h.pattern === '@codexo/exojs-assets reference')).toBe(true);
  });

  it('flags a raw .ts runtime entrypoint shipped under vendor/', () => {
    write('vendor/exojs/esm/index.ts', 'export const raw = 1;\n');
    const hits = scanForbiddenContent(tree);
    expect(hits.some(h => h.pattern === 'raw .ts runtime entrypoint')).toBe(true);
  });

  it('allows .ts under examples/src (lesson sources are not runtime entrypoints)', () => {
    write('examples/src/a/b.ts', 'const p = assets.demo.audio.musicLoop;\nexport {};\n');
    expect(scanForbiddenContent(tree)).toEqual([]);
  });
});
