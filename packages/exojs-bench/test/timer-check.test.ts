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

import type { TimerCheck } from '../src/shared/timerCheck';
import { mergeTimerChecks, timerCheckOfRun } from '../src/shared/timerCheck';

/** The step the WebKit build behind the published macOS profiles was observed to deliver. */
const COARSE_STEP = 0.02;

describe('timerCheckOfRun', () => {
  it('refuses a run whose two durations sit on the same single step', () => {
    expect(timerCheckOfRun([COARSE_STEP, COARSE_STEP], COARSE_STEP)).toBe<TimerCheck>('limited');
  });

  it('refuses one step against two, which is a rounding artefact rather than a doubling', () => {
    expect(timerCheckOfRun([COARSE_STEP, COARSE_STEP * 2], COARSE_STEP)).toBe<TimerCheck>('limited');
  });

  it('refuses a run where only one arm sits near the step, however far the other is above it', () => {
    expect(timerCheckOfRun([COARSE_STEP, 13.38], COARSE_STEP)).toBe<TimerCheck>('limited');
    expect(timerCheckOfRun([13.38, COARSE_STEP], COARSE_STEP)).toBe<TimerCheck>('limited');
  });

  it('reports an unrecorded step as unknown rather than as a pass', () => {
    expect(timerCheckOfRun([0.5, 1.5], null)).toBe<TimerCheck>('unknown');
  });

  it('treats a zero or negative step as unknown, never as a clock of unlimited precision', () => {
    expect(timerCheckOfRun([0.001, 0.002], 0)).toBe<TimerCheck>('unknown');
    expect(timerCheckOfRun([0.001, 0.002], -1)).toBe<TimerCheck>('unknown');
  });

  it('passes a run whose durations both stand clear of its own step', () => {
    expect(timerCheckOfRun([0.5, 1.5], COARSE_STEP)).toBe<TimerCheck>('resolved');
  });
});

describe('mergeTimerChecks', () => {
  /**
   * Pooling the durations first would hide this: the pooled median is 0.300 ms
   * and the coarsest step 0.020 ms, which clears the threshold, while the first
   * run stood nine steps above its own clock and did not.
   */
  it('refuses a comparison whose first run was limited even though the pooled figure would clear the coarsest step', () => {
    const perRun = [timerCheckOfRun([0.18, 5], 0.02), timerCheckOfRun([0.3, 5], 0.005), timerCheckOfRun([0.3, 5], 0.005)];

    expect(perRun).toStrictEqual<TimerCheck[]>(['limited', 'resolved', 'resolved']);
    expect(mergeTimerChecks(perRun)).toBe<TimerCheck>('limited');
  });

  it('does not let a run with no recorded step lift a limitation another run established', () => {
    expect(mergeTimerChecks(['limited', 'unknown'])).toBe<TimerCheck>('limited');
    expect(mergeTimerChecks(['unknown', 'limited', 'resolved'])).toBe<TimerCheck>('limited');
  });

  it('reports a comparison with any unrecorded run as unknown rather than resolved', () => {
    expect(mergeTimerChecks(['resolved', 'unknown', 'resolved'])).toBe<TimerCheck>('unknown');
  });

  it('reports resolved only where every run cleared the check', () => {
    expect(mergeTimerChecks(['resolved', 'resolved', 'resolved'])).toBe<TimerCheck>('resolved');
  });

  it('reports no runs at all as unknown', () => {
    expect(mergeTimerChecks([])).toBe<TimerCheck>('unknown');
  });
});
