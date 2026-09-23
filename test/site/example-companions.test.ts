import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findExampleCompanions } from '../../site/src/lib/example-companions';
import { EXAMPLES_CATALOG } from '../../site/src/lib/examples-catalog';

const examplesDir = join(process.cwd(), 'examples');

describe('playground example companions', () => {
  it('lists the worker entry and shared helpers of the worker-streamed terrain example', () => {
    const source = readFileSync(join(examplesDir, 'tilemap/worker-streamed-terrain.ts'), 'utf8');

    expect(findExampleCompanions(source, 'tilemap/worker-streamed-terrain.ts').sort()).toEqual([
      'shared/runtime.ts',
      'shared/terrain-noise.ts',
      'tilemap/worker-streamed-terrain.worker.ts',
    ]);
  });

  it('ignores package imports and resolves extensionless sibling modules', () => {
    const source = ["import { Scene } from '@codexo/exojs';", "import { helper } from './helper';", "import shader from './glow.frag?raw';"].join('\n');

    expect(findExampleCompanions(source, 'filters/glow.ts')).toEqual(['filters/helper.ts', 'filters/glow.frag']);
  });

  it('points only at files that exist, for every catalog example', () => {
    const missing = Object.values(EXAMPLES_CATALOG)
      .flat()
      .flatMap(entry => {
        const entryPath = entry.path.replace(/\.js$/, '.ts');

        return findExampleCompanions(readFileSync(join(examplesDir, entryPath), 'utf8'), entryPath);
      })
      .filter(companion => !existsSync(join(examplesDir, companion)));

    expect(missing).toEqual([]);
  });
});
