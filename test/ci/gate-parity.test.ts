import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GATE_GROUPS, type GateGroup } from '../../scripts/ci/gate-groups';

/**
 * Locks the required GitHub CI jobs (`.github/workflows/_ci-checks.yml`) to the
 * SAME gate set as the local `verify:quick` pre-push hook. Both sides run the
 * lists in `scripts/ci/gate-groups.ts` - the hook as `pnpm gates all`, CI as one
 * `pnpm gates <group>` per job - so a gate cannot drift out of CI by being
 * spelled out in only one of the two places, which is how the two gates fell
 * apart before.
 *
 * A group's `pnpm gates <group>` invocation is not enough on its own: it also
 * has to live in the job `EXPECTED_JOB_FOR_GROUP` says it belongs to, AND that
 * job has to be a dependency of `required-ci`. Otherwise a group can run in a
 * job nobody requires - green everywhere, but silently optional - which is the
 * same drift class the original job-block assertion guarded against, one level
 * up: not "gate missing from CI" but "gate runs in CI, just not where a merge
 * is blocked on it".
 *
 * What CAN still drift is a group nobody claims: adding a group here does not
 * create the CI job that runs it, and an unclaimed group would silently stop
 * running in CI while `verify:quick` keeps it green locally. That is the one
 * manual step left, and it is what these assertions cover.
 */

const repoRoot = resolve(import.meta.dirname!, '../..');
const workflowPath = resolve(repoRoot, '.github/workflows/_ci-checks.yml');
const workflow = readFileSync(workflowPath, 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

/** Every `pnpm gates <group>` argument the workflow invokes, in file order. */
const invokedGroups = [...workflow.matchAll(/pnpm gates ([\w:-]+)/g)].map(match => match[1]!);

const groupNames = Object.keys(GATE_GROUPS) as GateGroup[];

/**
 * The CI job each gate group is expected to run in. Kept as an explicit
 * per-group table (rather than re-deriving it from the workflow) so a group
 * quietly moving to the wrong job - or a new group shipping with no entry
 * here - shows up as a failing assertion instead of passing by construction.
 */
const EXPECTED_JOB_FOR_GROUP = {
  typecheck: 'typecheck',
  lint: 'lint',
  sync: 'sync-checks',
  site: 'site-build',
} as const satisfies Record<GateGroup, string>;

/** Extracts the `jobs.<jobName>` block's raw YAML text (up to the next top-level job key or EOF). */
const extractJobBlock = (source: string, jobName: string): string => {
  const headerRe = new RegExp(`\\n {2}${jobName}:\\n`);
  const startMatch = headerRe.exec(source);
  if (!startMatch) {
    throw new Error(`job "${jobName}" not found in ${workflowPath}`);
  }

  const rest = source.slice(startMatch.index + startMatch[0].length);
  const nextJobMatch = /\n {2}[a-zA-Z][\w-]*:\n/.exec(rest);

  return nextJobMatch ? rest.slice(0, nextJobMatch.index) : rest;
};

/** The job names listed in `jobs.required-ci.needs`, as an exact-match array. */
const extractRequiredCiNeeds = (source: string): string[] => {
  const block = extractJobBlock(source, 'required-ci');
  const needsMatch = /needs:\s*\[([\s\S]*?)\]/.exec(block);
  if (!needsMatch) {
    throw new Error(`"needs" array not found in the required-ci job block of ${workflowPath}`);
  }

  return needsMatch[1]!
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
};

describe('CI gate jobs cover every gate group', () => {
  it.each(groupNames)('group `%s` is invoked by a CI job', group => {
    expect(invokedGroups).toContain(group);
  });

  it('invokes no group that does not exist', () => {
    const unknown = invokedGroups.filter(group => group !== 'all' && !groupNames.includes(group as GateGroup));

    expect(unknown).toEqual([]);
  });

  it('runs each group in exactly one job, so no gate runs twice per CI run', () => {
    const duplicated = groupNames.filter(group => invokedGroups.filter(invoked => invoked === group).length > 1);

    expect(duplicated).toEqual([]);
  });
});

const groupJobPairs = groupNames.map(group => [group, EXPECTED_JOB_FOR_GROUP[group]] as const);

describe('each gate group runs in the CI job that owns it', () => {
  it.each(groupJobPairs)('group `%s` is invoked inside job `%s`, not merely somewhere in the workflow', (group, jobName) => {
    const jobBlock = extractJobBlock(workflow, jobName);

    expect(jobBlock).toMatch(new RegExp(`pnpm gates ${group}\\b`));
  });

  it.each(groupJobPairs)('group `%s` is owned by job `%s`, which `required-ci` depends on', (_group, jobName) => {
    const requiredNeeds = extractRequiredCiNeeds(workflow);

    expect(requiredNeeds).toContain(jobName);
  });
});

describe('the local pre-push hook runs the same gate set as CI', () => {
  it('`verify:quick` runs every group via `pnpm gates all`', () => {
    expect(packageJson.scripts['verify:quick']).toBe('pnpm gates all');
  });

  it.each(Object.entries(GATE_GROUPS).flatMap(([group, scripts]) => scripts.map(script => [group, script] as const)))(
    'group `%s` gate `%s` is a real package.json script',
    (_group, script) => {
      expect(packageJson.scripts).toHaveProperty(script);
    },
  );
});

describe('the Typecheck job covers the type-level gates verify:quick knows about', () => {
  // These gates protect distinct source surfaces; typecheck:packages and
  // typecheck:test joined the original set when the lists were unified.
  // Naming them keeps a silent deletion visible as a failing test rather than
  // as a gate that quietly stops running on both sides at once.
  it.each(['typecheck', 'typecheck:guides', 'typecheck:examples', 'typecheck:type-tests'])('`%s` is in the typecheck group', script => {
    expect(GATE_GROUPS.typecheck).toContain(script);
  });

  // The opt-in all-in-one IIFE entry has no gate of its own: it is a
  // consumer-shaped re-export surface, so it rides along in the example
  // program. The production build only compiles it when EXOJS_FULL_BUNDLE=1,
  // so dropping it from this include silently moves a stale named export back
  // to being CI-build-only.
  it('type-checks the full-bundle entry as part of the example program', () => {
    const examplesConfig = readFileSync(resolve(repoRoot, 'tsconfig.examples.json'), 'utf8');

    expect(examplesConfig).toContain('"scripts/exo-full.entry.ts"');
  });

  it('keeps `typecheck:site` out of the ungated typecheck job — it needs the built dist', () => {
    expect(GATE_GROUPS.typecheck).not.toContain('typecheck:site');
    expect(GATE_GROUPS.site).toContain('typecheck:site');
  });
});
