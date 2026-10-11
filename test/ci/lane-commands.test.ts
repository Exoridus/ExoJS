import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LANES, laneTimeoutMinutes } from '../../scripts/ci/lanes.ts';
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
    siteData: true,
    createExoApp: true,
  }),
);

const scriptsIn = (command: string): string[] => [...command.matchAll(/\bpnpm ([\w:-]+)/g)].map(match => match[1]!);

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

  it('runs every browser suite on CI as a supervised qualification row with an outer deadline', () => {
    const browserLanes = LANES.filter(lane => lane.local === 'browser');

    for (const lane of browserLanes) {
      for (const command of [lane.ciRun, lane.coverageRun].filter((value): value is string => value !== undefined)) {
        const segments = command
          .split(' && ')
          .filter(segment => /\bpnpm (test:browser|gate:bench)/.test(segment.replace(/^.*?-- /, '')) || segment.includes('pnpm qualify'));

        expect(segments.length, `${lane.id} has no qualification row`).toBeGreaterThan(0);

        for (const segment of segments) {
          expect(segment, `${lane.id}: ${segment}`).toMatch(/pnpm qualify --row "[^"]+"/);
          expect(segment, `${lane.id} needs a deadline`).toMatch(/--timeout \d+/);
        }
      }
    }
  });

  it('keeps a lane deadline above the sum of its rows, so the row deadline is the one that fires', () => {
    for (const lane of LANES.filter(candidate => candidate.ciRun?.includes('pnpm qualify'))) {
      const minutes = [...(lane.ciRun ?? '').matchAll(/--timeout (\d+)/g)].map(match => Number(match[1]));
      const total = minutes.reduce((sum, value) => sum + value, 0);

      expect(laneTimeoutMinutes(lane), `${lane.id}: rows total ${total} min`).toBeGreaterThan(total);
    }
  });

  it('gives an informational row no way to fail the job and a blocking row no way to hide', () => {
    for (const lane of LANES) {
      for (const segment of (lane.ciRun ?? '').split(' && ').filter(part => part.includes('pnpm qualify'))) {
        const informational = segment.includes('--policy informational');
        const name = /--row "([^"]+)"/.exec(segment)?.[1] ?? '';

        expect(informational, `${lane.id} / ${name}`).toBe(name.includes('Firefox / WebGPU'));
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
