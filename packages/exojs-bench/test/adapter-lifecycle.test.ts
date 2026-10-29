import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

/**
 * Guards on adapter resource ownership. They read the adapter source because
 * the adapters need a live engine and GPU context; the browser probe measures
 * the behaviour those calls produce.
 */
const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(join(PACKAGE, path), 'utf8');
describe('adapter lifecycle symmetry', () => {
  test('the ExoJS adapter teardown releases every scene helper buildScene can acquire', () => {
    const source = read('src/rendering/adapters/exojs.ts');
    const helpers = [
      'releaseBatchScene',
      'releaseComposite',
      'releaseTilemap',
      'releaseParticles',
      'releaseLit',
      'releaseBlur',
      'releasePicking',
      'releaseLayout',
    ];

    for (const helper of helpers) {
      expect(source.match(new RegExp(`${helper}\\(\\)`, 'g'))).toHaveLength(2);
    }
  });

  test('the Pixi tilemap release destroys the atlas texture it created', () => {
    const source = read('src/rendering/adapters/pixi.ts');
    const body = source.slice(source.indexOf('const releaseTilemap'), source.indexOf('const releaseParticles'));

    expect(body).toContain('tileAtlasTexture?.destroy(true)');
  });
});
