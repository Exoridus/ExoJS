import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LANES } from '../../scripts/ci/lanes.ts';
import { effectiveLanes } from '../../scripts/ci/select-lanes.ts';

/**
 * The lane table against the selector and the package manifest: every lane the
 * selector can turn on has an entry, every entry runs scripts that exist, and
 * the flags the runners rely on are set where they must be.
 */

const repoRoot = resolve(import.meta.dirname!, '../..');

/** Lane keys the table covers elsewhere: `coverage` is a mode of `unit`, the site and smoke keys are jobs of their own. */
const COVERED_OUTSIDE_THE_TABLE = new Set(['coverage', 'siteBuild', 'exampleSmoke']);

const allLaneKeys = Object.keys(
  effectiveLanes({
    engine: true,
    site: true,
    audioFx: true,
    tilemapWorker: true,
    exampleCatalog: true,
    benchStructural: true,
    release: true,
    guides: true,
    createExoApp: true,
  }),
);

const scriptsIn = (command: string): string[] =>
  [...command.matchAll(/\bpnpm (?:--filter "[^"]+" )*([\w:-]+)/g)].map(match => match[1]!).filter(script => script !== 'pack');

const packageScripts = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

describe('lane table', () => {
  it('covers every lane the selector can turn on', () => {
    const covered = new Set(LANES.map(lane => lane.when as string));
    const uncovered = allLaneKeys.filter(key => !covered.has(key) && !COVERED_OUTSIDE_THE_TABLE.has(key));
    expect(uncovered).toEqual([]);
  });

  it('names no lane the selector does not know', () => {
    for (const lane of LANES) {
      expect([...allLaneKeys, 'always']).toContain(lane.when);
    }
  });

  it('runs the sync gates on every event', () => {
    expect(LANES.find(lane => lane.run === 'pnpm gates sync')?.when).toBe('always');
  });

  it('runs only package scripts that exist', () => {
    for (const lane of LANES) {
      for (const command of [lane.run, lane.ciRun, lane.coverageRun].filter((value): value is string => value !== undefined)) {
        const named = scriptsIn(command);
        expect(named.length, `${lane.id}: ${command}`).toBeGreaterThan(0);
        for (const script of named) {
          expect(Object.keys(packageScripts.scripts), `${lane.id} runs \`pnpm ${script}\``).toContain(script);
        }
      }
    }
  });

  it('marks every browser-driven lane so --quick can skip it and CI installs the browser', () => {
    for (const lane of LANES) {
      const drivesBrowser = scriptsIn(lane.run).some(script => script.startsWith('test:browser') || script === 'gate:bench:structural');
      expect(lane.local === 'browser', `${lane.id} local`).toBe(drivesBrowser);
      expect(lane.browser !== undefined, `${lane.id} browser`).toBe(drivesBrowser);
    }
  });
});
