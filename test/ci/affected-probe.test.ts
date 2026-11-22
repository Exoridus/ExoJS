// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { makeAffectedProbe } from '../../scripts/ci/affected-probe.ts';
import type { AffectedPlanDocument, AffectedRunDocument } from '../../scripts/ci/affected-reporter.ts';

const first = { project: 'unit', file: 'test/first.test.ts' };
const second = { project: 'browser', file: 'test/second.test.ts' };
const selection = { name: 'AnimatedSprite', mode: 'related' as const, fallbackReasons: [], inventory: [first, second], tests: [first] };
const plan: AffectedPlanDocument = { version: 1, base: 'base', head: 'head', tree: 'tree', selections: [selection] };
const audit = (inventory = [first, second]): AffectedRunDocument => ({
  ...plan,
  startedAt: 'start',
  finishedAt: 'end',
  reason: 'passed',
  unhandledErrors: 0,
  inventoryComplete: true,
  inventoryProblems: [],
  inventory,
  files: inventory.map(file => ({
    ...file,
    state: 'passed',
    started: true,
    completed: true,
    counts: { total: 1, passed: 1, failed: 0, skipped: 0, pending: 0 },
    durationMs: 1,
    wallDurationMs: 1,
  })),
  selections: [{ ...selection, files: [], excludedFailures: [] }],
});

describe('diagnostic replay after complete shadow qualification', () => {
  it('replays only the named scenario after a full passing audit', () => {
    expect(makeAffectedProbe(plan, [audit()], 'AnimatedSprite')).toEqual({
      ...plan,
      selections: [{ ...selection, name: 'change' }],
    });
    expect(plan.selections[0]?.name).toBe('AnimatedSprite');
  });

  it('accepts complete project inventories audited by separate native invocations', () => {
    expect(makeAffectedProbe(plan, [audit([first]), audit([second])], 'AnimatedSprite').selections[0]?.tests).toEqual([first]);
  });

  it.each([[], [audit([first])]])('rejects missing full-inventory evidence %#', audits => {
    expect(() => makeAffectedProbe(plan, audits, 'AnimatedSprite')).toThrow();
  });

  it.each([
    { head: 'older' },
    { tree: 'other' },
    { base: 'other' },
    { reason: 'failed' },
    { unhandledErrors: 1 },
    { inventoryComplete: false },
    { inventoryProblems: ['missing test'] },
  ])('rejects stale or unsuccessful evidence %j', change => {
    expect(() => makeAffectedProbe(plan, [{ ...audit(), ...change } as AffectedRunDocument], 'AnimatedSprite')).toThrow();
  });

  it('rejects a scenario that was not included in the full-run audit', () => {
    expect(() => makeAffectedProbe(plan, [{ ...audit(), selections: [] }], 'AnimatedSprite')).toThrow();
    expect(() => makeAffectedProbe(plan, [audit()], 'Unknown')).toThrow();
  });

  it('rejects an altered selection even when the checkout identity stayed the same', () => {
    const changed = audit();
    changed.selections[0]!.tests = [second];
    expect(() => makeAffectedProbe(plan, [changed], 'AnimatedSprite')).toThrow();
  });

  it('rejects excluded failures and incomplete or failed file observations', () => {
    const excluded = audit();
    excluded.selections[0]!.excludedFailures = [second];
    expect(() => makeAffectedProbe(plan, [excluded], 'AnimatedSprite')).toThrow();

    for (const change of [{ completed: false }, { state: 'failed' as const }, { counts: { ...audit().files[0]!.counts, pending: 1 } }]) {
      const incomplete = audit();
      Object.assign(incomplete.files[0]!, change);
      expect(() => makeAffectedProbe(plan, [incomplete], 'AnimatedSprite')).toThrow();
    }
  });
});
