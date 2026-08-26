import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { effectiveLanes } from '../../scripts/ci/select-lanes.ts';
import { LOCAL_LANES } from '../../scripts/lanes';

/**
 * Locks `pnpm lanes` to the lane vocabulary the CI detector uses.
 *
 * The selector decides WHICH lanes a change needs; this table decides WHAT each
 * of them runs locally. The failure mode the assertions below guard against is a
 * lane being added to the selector - and therefore to CI - while the local
 * runner silently has nothing to run for it, which turns `pnpm lanes --run` into
 * a green result that proves less than it appears to.
 */

const repoRoot = resolve(import.meta.dirname!, '../..');

/**
 * Lanes the local runner deliberately has no command for. `coverage` is the unit
 * suite measured; running it locally doubles the wall time for no extra signal,
 * and it is covered by the `unit` entry.
 */
const INTENTIONALLY_LOCAL_ONLY_IN_CI = new Set(['coverage', 'browserFirefox', 'packageVerify']);

const allLaneKeys = Object.keys(effectiveLanes({ engine: true, site: true, audioFx: true, tilemapWorker: true, exampleCatalog: true }));

/**
 * The package scripts a lane runs. A lane may chain steps with `&&` - the
 * example smoke serves the site build's output, so locally the build is part
 * of the lane - and every step named in it has to exist.
 */
const laneScripts = (command: readonly string[]): string[] => command.filter((part, index) => command[index - 1] === 'pnpm');

const packageScripts = (): Record<string, string> => {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

  return manifest.scripts;
};

describe('local lane commands', () => {
  it('covers every lane the selector can turn on', () => {
    const covered = new Set(LOCAL_LANES.map(lane => lane.key as string));
    const uncovered = allLaneKeys.filter(key => !covered.has(key) && !INTENTIONALLY_LOCAL_ONLY_IN_CI.has(key));

    expect(uncovered).toEqual([]);
  });

  it('names no lane the selector does not know', () => {
    for (const lane of LOCAL_LANES) {
      expect([...allLaneKeys, 'always']).toContain(lane.key);
    }
  });

  it('runs the ungated gate groups that have no lane key of their own', () => {
    // `gates sync` is ungated in CI - no path decides whether it runs - so the
    // selector has no key for it and the local runner has to claim it
    // explicitly, or `pnpm lanes --run` would silently skip the API-doc and
    // example-sync checks.
    const groups = LOCAL_LANES.filter(lane => lane.command[1] === 'gates').map(lane => lane.command[2]);

    expect(groups).toContain('sync');
  });

  it('runs only package scripts that exist', () => {
    const scripts = packageScripts();

    for (const lane of LOCAL_LANES) {
      expect(lane.command[0]).toBe('pnpm');

      const named = laneScripts(lane.command);

      expect(named.length).toBeGreaterThan(0);

      for (const script of named) {
        expect(Object.keys(scripts)).toContain(script);
      }
    }
  });

  it('marks every browser-driven lane so --quick can skip it', () => {
    for (const lane of LOCAL_LANES) {
      // `test:examples:smoke` drives a real Chromium too - it boots the whole
      // example catalog - so the flag has to follow what a lane actually does,
      // not just the `test:browser*` naming the vitest projects happen to use.
      const drivesBrowser = laneScripts(lane.command).some(script => script.startsWith('test:browser') || script === 'test:examples:smoke');

      expect(lane.browser ?? false).toBe(drivesBrowser);
    }
  });
});
