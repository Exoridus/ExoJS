import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GATE_GROUPS, type GateGroup } from '../../scripts/ci/gate-groups';
import { LANES } from '../../scripts/ci/lanes';

/**
 * The gate groups in `gate-groups.ts` are what the pre-push hook runs as
 * `verify:quick`. CI must run every one of them too, and exactly once: the
 * `gates` matrix takes the ungated groups from the lane table, and the `site`
 * job runs the `site` group after the dist it needs has been built.
 */

const repoRoot = resolve(import.meta.dirname!, '../..');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

const groupNames = Object.keys(GATE_GROUPS) as GateGroup[];
const laneGroups = LANES.filter(lane => lane.stage === 'gates').map(lane => /pnpm gates ([\w:-]+)/.exec(lane.run)?.[1]);
const workflowGroups = [...workflow.matchAll(/pnpm gates ([\w:-]+)/g)].map(match => match[1]!);
const invokedGroups = [...laneGroups, ...workflowGroups];

describe('CI runs every gate group', () => {
  it.each(groupNames)('group `%s` is invoked by a lane or a job', group => {
    expect(invokedGroups).toContain(group);
  });

  it('invokes no group that does not exist', () => {
    const unknown = invokedGroups.filter(group => group !== 'all' && !groupNames.includes(group as GateGroup));
    expect(unknown).toEqual([]);
  });

  it('runs each group exactly once per CI run', () => {
    const duplicated = groupNames.filter(group => invokedGroups.filter(invoked => invoked === group).length > 1);
    expect(duplicated).toEqual([]);
  });

  it('keeps the `site` group in the site job, where the built dist exists, and every other group in the gates matrix', () => {
    expect(workflowGroups).toEqual(['site']);
    expect(laneGroups.sort()).toEqual(groupNames.filter(group => group !== 'site').sort());
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

describe('the typecheck group covers the type-level gates verify:quick knows about', () => {
  it.each(['typecheck', 'typecheck:guides', 'typecheck:examples', 'typecheck:type-tests'])('`%s` is in the typecheck group', script => {
    expect(GATE_GROUPS.typecheck).toContain(script);
  });

  it('type-checks the full-bundle entry as part of the example program', () => {
    const examplesConfig = readFileSync(resolve(repoRoot, 'tsconfig.examples.json'), 'utf8');
    expect(examplesConfig).toContain('"scripts/exo-full.entry.ts"');
  });

  it('keeps `typecheck:site` out of the ungated typecheck group - it needs the built dist', () => {
    expect(GATE_GROUPS.typecheck).not.toContain('typecheck:site');
    expect(GATE_GROUPS.site).toContain('typecheck:site');
  });
});
