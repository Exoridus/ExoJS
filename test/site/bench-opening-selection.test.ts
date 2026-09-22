/**
 * Which load a benchmark card opens on.
 *
 * A reader arrives asking how ExoJS does at the size they are about to run, so
 * the card opens on its best real case: the largest load where ExoJS leads
 * every JavaScript peer, or - failing that - the one it trails least. Rapier is
 * excluded from the ranking, the same as it is from the headline sentences: a
 * gap against a Rust/WASM engine is not a JavaScript-peer comparison.
 */

import { describe, expect, it } from 'vitest';

import type { BenchCard, CardArm, CardLoad } from '../../site/src/lib/bench-cards';
import { openingSelection } from '../../site/src/lib/bench-cards';
import type { CellOutcome } from '../../site/src/lib/bench-profiles';

/** One arm at the outcome a test needs, every other field the uninteresting default. */
const armOf = (id: string, outcome: CellOutcome, reference = false): CardArm => ({
  id,
  label: id,
  ms: 1,
  p95Ms: 1,
  reference,
  overFrameBudget: false,
  outcome,
  quantitative: true,
});

/** One load, named by its size, with ExoJS's outcome against each named peer. */
const loadOf = (count: number, peerOutcomes: Readonly<Record<string, CellOutcome>>): CardLoad => ({
  id: String(count),
  label: `${String(count)} sprites`,
  count,
  primary: false,
  arms: [armOf('exojs', 'level', true), ...Object.entries(peerOutcomes).map(([id, outcome]) => armOf(id, outcome))],
  maxMs: 1,
  withheld: undefined,
});

const cardOf = (loads: readonly CardLoad[]): BenchCard => ({ id: 'test', category: 'test', loads });

describe('openingSelection', () => {
  it('opens on the largest load where ExoJS leads every peer', () => {
    const card = cardOf([loadOf(1_000, { pixi: 'lead' }), loadOf(10_000, { pixi: 'lead' }), loadOf(50_000, { pixi: 'loss' })]);

    const selection = openingSelection(card);

    expect(selection.reason).toBe('leading');
    expect(selection.load?.count).toBe(10_000);
  });

  it('treats clear-lead and lead as the same leading tier, ranked by size alone', () => {
    const card = cardOf([loadOf(1_000, { pixi: 'clear-lead' }), loadOf(10_000, { pixi: 'lead' })]);

    // A small clear-lead does not outrank a bigger plain lead: both count as
    // "leads", and only size breaks the tie between them.
    expect(openingSelection(card).load?.count).toBe(10_000);
  });

  it('requires every peer to lead, not just the best one', () => {
    const card = cardOf([loadOf(10_000, { pixi: 'lead', phaser: 'loss' }), loadOf(1_000, { pixi: 'lead', phaser: 'lead' })]);

    const selection = openingSelection(card);

    expect(selection.reason).toBe('leading');
    expect(selection.load?.count).toBe(1_000);
  });

  it('falls back to the least-behind load when nothing leads every peer', () => {
    const card = cardOf([loadOf(1_000, { pixi: 'clear-loss' }), loadOf(10_000, { pixi: 'loss' }), loadOf(50_000, { pixi: 'level' })]);

    const selection = openingSelection(card);

    expect(selection.reason).toBe('least-behind');
    // 'level' outranks 'loss' outranks 'clear-loss' on the ladder, regardless
    // of size.
    expect(selection.load?.count).toBe(50_000);
  });

  it('breaks a least-behind tie toward the larger load', () => {
    const card = cardOf([loadOf(1_000, { pixi: 'loss' }), loadOf(10_000, { pixi: 'loss' })]);

    expect(openingSelection(card).load?.count).toBe(10_000);
  });

  it('ignores Rapier when deciding whether ExoJS leads', () => {
    const card = cardOf([loadOf(1_000, { pixi: 'lead', rapier: 'clear-loss' })]);

    const selection = openingSelection(card);

    expect(selection.reason).toBe('leading');
    expect(selection.load?.count).toBe(1_000);
  });

  it('falls back to the harness default where no load carries a JavaScript peer', () => {
    const primary: CardLoad = { ...loadOf(1_000, { rapier: 'clear-loss' }), primary: true };
    const card = cardOf([loadOf(500, { rapier: 'clear-loss' }), primary]);

    const selection = openingSelection(card);

    expect(selection.reason).toBe('harness-default');
    expect(selection.load?.count).toBe(1_000);
  });

  it('falls back to the first load where the harness default carries no JavaScript peer and no primary flag', () => {
    const card = cardOf([loadOf(500, {}), loadOf(1_000, {})]);

    const selection = openingSelection(card);

    expect(selection.reason).toBe('harness-default');
    expect(selection.load?.count).toBe(500);
  });
});
