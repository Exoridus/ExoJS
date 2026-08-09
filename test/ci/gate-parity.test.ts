import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GATE_GROUPS, type GateGroup } from '../../scripts/ci/gate-groups';

/**
 * Locks the required GitHub CI jobs (`.github/workflows/_ci-checks.yml`) to the
 * SAME gate set as the local `verify:quick` pre-push hook. Both sides run the
 * lists in `scripts/ci/gate-groups.ts` — the hook as `pnpm gates all`, CI as one
 * `pnpm gates <group>` per job — so a gate cannot drift out of CI by being
 * spelled out in only one of the two places, which is how the two gates fell
 * apart before.
 *
 * What CAN still drift is a group nobody claims: adding a group here does not
 * create the CI job that runs it, and an unclaimed group would silently stop
 * running in CI while `verify:quick` keeps it green locally. That is the one
 * manual step left, and it is what these assertions cover.
 */

const repoRoot = resolve(import.meta.dirname!, '../..');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/_ci-checks.yml'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

/** Every `pnpm gates <group>` argument the workflow invokes, in file order. */
const invokedGroups = [...workflow.matchAll(/pnpm gates ([\w:-]+)/g)].map(match => match[1]!);

const groupNames = Object.keys(GATE_GROUPS) as GateGroup[];

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
  // These four were the original required-CI set; typecheck:packages and
  // typecheck:test joined them when the lists were unified. Naming them keeps a
  // silent deletion from a group visible as a failing test rather than as a gate
  // that quietly stops running on both sides at once.
  it.each(['typecheck', 'typecheck:guides', 'typecheck:examples', 'typecheck:type-tests'])('`%s` is in the typecheck group', script => {
    expect(GATE_GROUPS.typecheck).toContain(script);
  });

  it('keeps `typecheck:site` out of the ungated typecheck job — it needs the built dist', () => {
    expect(GATE_GROUPS.typecheck).not.toContain('typecheck:site');
    expect(GATE_GROUPS.site).toContain('typecheck:site');
  });
});
