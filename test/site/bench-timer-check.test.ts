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

import { type CellOutcome, outcomeOf, type ProfileCell, SUMMARY_OF, timerCheck } from '../../site/src/lib/bench-profiles';

/** A stable comparison with two given medians; every other field is the uninteresting default. */
const cellOf = (referenceMs: number | null, competitorMs: number | null, stable = true): ProfileCell => ({
  competitor: 'pixi',
  referenceMs,
  referenceP95Ms: referenceMs,
  referenceOverFrameBudget: false,
  competitorMs,
  competitorP95Ms: competitorMs,
  competitorOverFrameBudget: false,
  verdict: {
    side: 'exojs',
    ratio: referenceMs !== null && competitorMs !== null && competitorMs !== 0 ? referenceMs / competitorMs : null,
    factor: 2,
    label: 'ExoJS leads (2.00x)',
    structural: false,
  },
  mechanism: null,
  aggregate: {
    runs: 3,
    reference: { minMs: referenceMs, maxMs: referenceMs, ratio: 1 },
    competitor: { minMs: competitorMs, maxMs: competitorMs, ratio: 1 },
    stable,
    rungs: ['exojs-leads', 'exojs-leads', 'exojs-leads'],
  },
});

/** The step the WebKit build behind the published macOS profiles was observed to deliver. */
const COARSE_STEP = 0.02;

describe('timerCheck', () => {
  it('refuses a pair whose two durations sit on the same single step', () => {
    expect(timerCheck(cellOf(COARSE_STEP, COARSE_STEP), COARSE_STEP)).toBe('limited');
  });

  it('refuses a pair of one step against two, which is a rounding artefact rather than a doubling', () => {
    expect(timerCheck(cellOf(COARSE_STEP, COARSE_STEP * 2), COARSE_STEP)).toBe('limited');
  });

  it('refuses a pair where only one arm sits near the step, however far the other is above it', () => {
    expect(timerCheck(cellOf(COARSE_STEP, 13.38), COARSE_STEP)).toBe('limited');
    expect(timerCheck(cellOf(13.38, COARSE_STEP), COARSE_STEP)).toBe('limited');
  });

  it('reports an unrecorded step as unknown rather than as a pass', () => {
    expect(timerCheck(cellOf(COARSE_STEP, COARSE_STEP), null)).toBe('unknown');
    expect(timerCheck(cellOf(0.5, 1.5), null)).toBe('unknown');
  });

  it('treats a zero or negative step as unknown, never as a clock of unlimited precision', () => {
    expect(timerCheck(cellOf(0.001, 0.002), 0)).toBe('unknown');
    expect(timerCheck(cellOf(0.001, 0.002), -1)).toBe('unknown');
  });

  it('passes a pair whose durations both stand clear of the step', () => {
    expect(timerCheck(cellOf(0.5, 1.5), COARSE_STEP)).toBe('resolved');
  });
});

describe('outcomeOf', () => {
  it('reports a timer-limited pair as such, ahead of any verdict the ladder reached', () => {
    expect(outcomeOf(cellOf(COARSE_STEP, COARSE_STEP * 2), COARSE_STEP)).toBe<CellOutcome>('timer-limited');
  });

  it('reports a timer-limited pair as such even where the runs also disagreed', () => {
    expect(outcomeOf(cellOf(COARSE_STEP, COARSE_STEP, false), COARSE_STEP)).toBe<CellOutcome>('timer-limited');
  });

  it('leaves a resolved pair on the verdict the ladder reached', () => {
    expect(outcomeOf(cellOf(0.5, 1.5), COARSE_STEP)).toBe<CellOutcome>('lead');
  });

  it('leaves a pair with no recorded step exactly as it read before the check existed', () => {
    expect(outcomeOf(cellOf(COARSE_STEP, COARSE_STEP * 2), null)).toBe(outcomeOf(cellOf(COARSE_STEP, COARSE_STEP * 2)));
  });
});

describe('the scoreboard', () => {
  it('counts a timer-limited pair on no summary line, so it is neither a win, a loss nor a level row', () => {
    expect(SUMMARY_OF['timer-limited']).toBeNull();
  });

  it('keeps it apart from the pairs whose runs disagreed, which did produce a comparison', () => {
    expect(SUMMARY_OF.unstable).toBe('unclear');
  });
});
