/**
 * The published-comparison guard against a clock that did not separate the two
 * arms.
 *
 * A duration only a step or two above the grid `performance.now()` delivers on
 * carries no ratio worth printing: the same scene measured again lands on the
 * neighbouring step, and the factor built from it moves by a whole multiple. The
 * check therefore refuses the comparison rather than the measurement - both
 * times stay readable, and only the figure, the bar and the winner go.
 *
 * Clearing the check is not a precision claim. It establishes that this one
 * guard did not trip; every other check a cell passes still applies.
 */

import { describe, expect, it } from 'vitest';

import { type CellOutcome, outcomeOf, type ProfileCell, SUMMARY_OF, type TimerCheck } from '../../site/src/lib/bench-profiles';

/** A stable comparison carrying a timer verdict; every other field is the uninteresting default. */
const cellOf = (timer: TimerCheck | undefined, stable = true): ProfileCell => ({
  competitor: 'pixi',
  referenceMs: 0.5,
  referenceP95Ms: 0.6,
  referenceOverFrameBudget: false,
  competitorMs: 1.5,
  competitorP95Ms: 1.7,
  competitorOverFrameBudget: false,
  ...(timer !== undefined && { timer }),
  verdict: { side: 'exojs', ratio: 1 / 3, factor: 3, label: 'ExoJS leads (3.00x)', structural: false },
  mechanism: null,
  aggregate: {
    runs: 3,
    reference: { minMs: 0.5, maxMs: 0.5, ratio: 1 },
    competitor: { minMs: 1.5, maxMs: 1.5, ratio: 1 },
    stable,
    rungs: ['exojs-leads', 'exojs-leads', 'exojs-leads'],
  },
});

describe('outcomeOf', () => {
  it('reports a timer-limited pair as such, ahead of any verdict the ladder reached', () => {
    expect(outcomeOf(cellOf('limited'))).toBe<CellOutcome>('timer-limited');
  });

  it('reports a timer-limited pair as such even where the runs also disagreed', () => {
    expect(outcomeOf(cellOf('limited', false))).toBe<CellOutcome>('timer-limited');
  });

  it('withholds the comparison of a profile that recorded no clock, and keeps that state apart', () => {
    expect(outcomeOf(cellOf(undefined))).toBe<CellOutcome>('timer-unknown');
    expect(outcomeOf(cellOf('unknown'))).toBe<CellOutcome>('timer-unknown');
  });

  it('leaves a resolved pair on the verdict the ladder reached', () => {
    expect(outcomeOf(cellOf('resolved'))).toBe<CellOutcome>('lead');
    expect(outcomeOf(cellOf('resolved', false))).toBe<CellOutcome>('unstable');
  });
});

describe('the scoreboard', () => {
  it('counts neither timer state on a summary line, so neither is a win, a loss nor a level row', () => {
    expect(SUMMARY_OF['timer-limited']).toBeNull();
    expect(SUMMARY_OF['timer-unknown']).toBeNull();
  });

  it('keeps them apart from the pairs whose runs disagreed, which did produce a comparison', () => {
    expect(SUMMARY_OF.unstable).toBe('unclear');
  });
});
