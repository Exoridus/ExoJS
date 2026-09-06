import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LANES } from '../../scripts/ci/lanes';

/**
 * Every vitest project must be run by some package.json script, and that script
 * by some lane.
 *
 * A project nobody invokes is worse than a missing test: the file still exists,
 * still typechecks and still reads like a gate, so nothing signals that it
 * stopped running. That is the failure mode this guards - the split that keeps
 * a load-sensitive measurement out of the parallel suite (`physics-perf`,
 * `rendering-alloc`) is exactly the kind of change that can drop a project on
 * the floor.
 *
 * Browser projects are exempt: they run through their own lanes with their own
 * commands rather than through a `--project` list.
 */

const repoRoot = resolve(import.meta.dirname!, '../..');
const config = readFileSync(resolve(repoRoot, 'vitest.config.ts'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

const declaredProjects = [...config.matchAll(/name: '([\w-]+)'/g)].map(match => match[1]!).filter(name => !name.startsWith('browser-'));

const scriptText = Object.values(packageJson.scripts).join(' ');
const laneText = LANES.map(lane => [lane.run, lane.ciRun ?? '', lane.coverageRun ?? ''].join(' ')).join(' ');

describe('every vitest project is actually run', () => {
  it('declares at least the projects this guard knows about', () => {
    expect(declaredProjects).toContain('physics-perf');
    expect(declaredProjects).toContain('rendering-alloc');
  });

  it.each(declaredProjects)('project `%s` is named by a package.json script', project => {
    expect(scriptText).toContain(`--project=${project}`);
  });

  it.each(declaredProjects)('project `%s` reaches a lane through its script', project => {
    const owning = Object.entries(packageJson.scripts)
      .filter(([, command]) => command.includes(`--project=${project}`))
      .map(([name]) => name);

    expect(owning.length).toBeGreaterThan(0);
    expect(owning.some(name => laneText.includes(`pnpm ${name}`))).toBe(true);
  });
});
