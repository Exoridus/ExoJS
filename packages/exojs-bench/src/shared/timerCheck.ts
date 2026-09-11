/**
 * Whether the clock a measurement was read on was fine enough for a comparison
 * to be drawn from it.
 *
 * A duration only a few steps above the grid it was read on carries a
 * quantisation error of the same order as the difference a comparison would
 * claim, so the check runs before any factor is published and travels with the
 * cell into the profile. It is evaluated per RUN, against that run's own clock,
 * and only then merged: pooling the durations first lets a well-resolved
 * repetition carry a limited one past the threshold, which is the reading this
 * check exists to prevent.
 */

/**
 * How many of the clock's observed steps a duration has to span before a
 * comparison built from it publishes a factor.
 *
 * A guard, chosen to be safely clear of the one- and two-step readings that a
 * coarse clock produces, and applied to every library, browser and profile
 * alike. It is not a standard and not a precision claim: clearing it means this
 * one check did not trip, never that the comparison is accurate or
 * statistically established. Every other check a cell passes still applies.
 */
export const MIN_RESOLVED_STEPS = 10;

/** What the timer check established about a comparison. */
export type TimerCheck = 'resolved' | 'limited' | 'unknown';

/**
 * Whether both durations of one run stand far enough above the step that run's
 * clock was observed to deliver.
 *
 * Each duration is checked on its own - the question is how large a reading is
 * against the grid it was read on, not how far the two arms are apart. A run
 * with no recorded step yields `unknown`, which is the absence of the check and
 * never a pass.
 *
 * The durations must be the ones the clock actually BRACKETED. Where a harness
 * times a batch of steps and divides, the batch duration is the reading and the
 * per-step quotient is not: checking the quotient would compare a derived
 * number against a grid it was never read on.
 */
export const timerCheckOfRun = (durations: ReadonlyArray<number | null>, resolutionMs: number | null): TimerCheck => {
  if (resolutionMs === null || !Number.isFinite(resolutionMs) || resolutionMs <= 0) return 'unknown';

  const floor = resolutionMs * MIN_RESOLVED_STEPS;
  const measured = durations.filter((ms): ms is number => ms !== null && Number.isFinite(ms));

  return measured.some(ms => ms < floor) ? 'limited' : 'resolved';
};

/**
 * One verdict for a comparison from the verdicts of the runs behind it.
 *
 * A limitation any run established stands for the pooled figure, and a run
 * whose clock was never recorded cannot lift it: missing information does not
 * cancel an established one. Only a comparison whose every run cleared the
 * check is reported as resolved.
 */
export const mergeTimerChecks = (checks: readonly TimerCheck[]): TimerCheck => {
  if (checks.length === 0) return 'unknown';
  if (checks.includes('limited')) return 'limited';
  if (checks.includes('unknown')) return 'unknown';

  return 'resolved';
};
