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
 * The `test` script selects by wildcard (`exojs*`) so a new package's project
 * joins it by name alone; the projects deliberately kept out of the parallel
 * suite are the ones named otherwise, and each needs a script of its own.
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

/** The `--project` patterns a script passes to vitest. */
const projectPatterns = (command: string): string[] => [...command.matchAll(/--project="?([^\s"]+)"?/g)].map(match => match[1]!);

/** Vitest's own matching: `*` is a wildcard, a leading `!` negates, case-insensitive. */
const matchesPattern = (pattern: string, name: string): boolean => {
  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  const regexp = new RegExp(`^${body.split('*').map(escapeRegExp).join('.*')}$`, 'i');
  return negated ? !regexp.test(name) : regexp.test(name);
};

const escapeRegExp = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const scriptsRunning = (project: string): string[] =>
  Object.entries(packageJson.scripts)
    .filter(([, command]) => command.startsWith('vitest ') && projectPatterns(command).some(pattern => matchesPattern(pattern, project)))
    .map(([name]) => name);

/** Scripts reachable from a lane, following one level of `pnpm <script>` delegation (`test:coverage` -> `test`). */
const laneText = LANES.map(lane => [lane.run, lane.ciRun ?? '', lane.coverageRun ?? ''].join(' ')).join(' ');
const reachesLane = (script: string): boolean =>
  laneText.includes(`pnpm ${script}`) ||
  Object.entries(packageJson.scripts).some(([name, command]) => command.startsWith(`pnpm ${script} `) && laneText.includes(`pnpm ${name}`));

describe('every vitest project is actually run', () => {
  it('declares at least the projects this guard knows about', () => {
    expect(declaredProjects).toContain('physics-perf');
    expect(declaredProjects).toContain('rendering-alloc');
  });

  it('keeps the serial measurements out of the parallel `test` script', () => {
    const selected = projectPatterns(packageJson.scripts['test']!);
    for (const project of ['physics-perf', 'rendering-alloc']) {
      expect(selected.some(pattern => matchesPattern(pattern, project))).toBe(false);
    }
  });

  it.each(declaredProjects)('project `%s` is selected by a package.json script', project => {
    expect(scriptsRunning(project).length).toBeGreaterThan(0);
  });

  it.each(declaredProjects)('project `%s` reaches a lane through its script', project => {
    expect(scriptsRunning(project).some(reachesLane)).toBe(true);
  });
});
