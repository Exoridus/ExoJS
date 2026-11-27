import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FAST_GATES, GATE_GROUPS, type GateGroup, orderGates } from '../../scripts/ci/gate-groups';
import { LANES } from '../../scripts/ci/lanes';
import { selectLocalPolicy } from '../../scripts/ci/local-policy.ts';

/**
 * The gate groups in `gate-groups.ts` are the complete gate inventory. CI
 * must run every one of them too, and exactly once: the
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

describe('the local full fallback runs the same gate set as CI', () => {
  it('keeps the explicit full command and the unknown-path fallback complete', () => {
    expect(packageJson.scripts['verify:quick']).toBe('pnpm gates all');
    expect(selectLocalPolicy(['unknown/new-file.ts']).gates).toEqual(orderGates(Object.values(GATE_GROUPS).flat()));
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

  it('type-checks the example program against the workspace sources', () => {
    const examplesConfig = readFileSync(resolve(repoRoot, 'tsconfig.examples.json'), 'utf8');
    expect(examplesConfig).toContain('"examples/**/*.ts"');
  });

  it('keeps `typecheck:site` out of the ungated typecheck group - it needs the built dist', () => {
    expect(GATE_GROUPS.typecheck).not.toContain('typecheck:site');
    expect(GATE_GROUPS.site).toContain('typecheck:site');
  });
});

describe('gate ordering fails cheap before expensive', () => {
  it('lists every fast gate in a group and keeps `lint:all` after them', () => {
    const all = Object.values(GATE_GROUPS).flat() as string[];

    for (const gate of FAST_GATES) {
      expect(all).toContain(gate);
    }

    const lint = GATE_GROUPS.lint as readonly string[];
    expect(lint.indexOf('format:check')).toBeLessThan(lint.indexOf('lint:all'));
  });

  it('orders a selection with the fast gates first and drops nothing', () => {
    const selection = ['typecheck', 'lint:all', 'format:check', 'docs:api:check', 'lint:changelog'];
    const ordered = orderGates(selection);

    expect(ordered.slice(0, 2)).toEqual(['lint:changelog', 'format:check']);
    expect([...ordered].sort()).toEqual([...selection].sort());
  });

  it('puts format:check ahead of the compiler gates in the affected policy', () => {
    const { gates } = selectLocalPolicy(['src/math/Vector.ts']);

    expect(gates.indexOf('format:check')).toBeLessThan(gates.indexOf('typecheck'));
  });
});
