/**
 * The verdict ladder of the published comparison.
 *
 * Every verdict is COMPUTED from two measured medians, never authored. A
 * hand-written verdict is the point at which a comparison stops being a
 * measurement, and the ladder's thresholds are the only place a judgement about
 * "how much is a real difference" is allowed to live.
 */

/** Lower bound of the noise band: a ratio inside `[NOISE_LOW, NOISE_HIGH]` is not a difference. */
export const NOISE_LOW = 0.8;

/** Upper bound of the noise band; see {@link NOISE_LOW}. */
export const NOISE_HIGH = 1.2;

/**
 * Factor at or above which a lead is called STRUCTURAL rather than merely
 * measured.
 *
 * Below it, a lead could still be contaminated by machine mood, driver state or
 * an unlucky window - the honest word is then "leads". At or above it the gap is
 * too large for any of those to explain, so it is attributable to how the two
 * libraries are built, which is a different claim and gets a different word.
 */
export const STRUCTURAL_FACTOR = 5;

/** Which arm a cell's comparison favours. */
export type VerdictSide = 'exojs' | 'competitor' | 'neither';

/** One computed comparison of two medians. */
export interface Verdict {
  /** The arm the ladder favours, or `'neither'` inside the noise band. */
  readonly side: VerdictSide;
  /** `exojs / competitor` - below 1 means ExoJS took less time. */
  readonly ratio: number;
  /** How many times faster the leading arm is; `1` when neither leads. */
  readonly factor: number;
  /** The ladder's word for this outcome, ready to print. */
  readonly label: string;
  /** True when the gap is large enough to be attributed to structure rather than to measurement conditions. */
  readonly structural: boolean;
}

/** The verdict for a cell neither arm could produce a comparable number for. */
export const NO_VERDICT: Verdict = { side: 'neither', ratio: Number.NaN, factor: Number.NaN, label: 'not comparable', structural: false };

/**
 * Place two medians on the ladder. Lower is better, so a `ratio` below 1 favours
 * ExoJS.
 *
 * A non-finite or non-positive input yields {@link NO_VERDICT}: a zero median is
 * not a win, it is a cell that did not measure anything.
 */
export const compareMedians = (exojsMs: number, competitorMs: number): Verdict => {
  if (!Number.isFinite(exojsMs) || !Number.isFinite(competitorMs) || exojsMs <= 0 || competitorMs <= 0) {
    return NO_VERDICT;
  }

  const ratio = exojsMs / competitorMs;

  if (ratio >= NOISE_LOW && ratio <= NOISE_HIGH) {
    return { side: 'neither', ratio, factor: 1, label: 'level', structural: false };
  }

  const side: VerdictSide = ratio < 1 ? 'exojs' : 'competitor';
  const factor = ratio < 1 ? 1 / ratio : ratio;
  const structural = factor >= STRUCTURAL_FACTOR;
  const leader = side === 'exojs' ? 'ExoJS' : 'competitor';

  return { side, ratio, factor, label: `${leader} ${structural ? 'leads clearly' : 'leads'} (${factor.toFixed(2)}x)`, structural };
};

/**
 * The rung a verdict landed on, with the measured ratio dropped.
 *
 * Two runs of one cell never produce the same ratio, so agreement between runs
 * can only be asked of the rung. This is the unit an aggregation compares.
 */
export type VerdictRung = 'not-comparable' | 'level' | 'exojs-leads' | 'exojs-leads-clearly' | 'competitor-leads' | 'competitor-leads-clearly';

/** The rung `verdict` sits on. */
export const verdictRung = (verdict: Verdict): VerdictRung => {
  if (!Number.isFinite(verdict.ratio)) {
    return 'not-comparable';
  }

  if (verdict.side === 'neither') {
    return 'level';
  }

  return verdict.structural ? `${verdict.side}-leads-clearly` : `${verdict.side}-leads`;
};

/**
 * The verdict a cell carries when the runs behind it did not agree on one.
 *
 * A verdict-shaped absence rather than a computed outcome: the runs disagreed
 * about which arm the cell favours, so no rung is supported by the evidence,
 * and publishing the pooled numbers' own rung would state a claim that part of
 * the measurement contradicts. The cell is still published, with its observed
 * range - the disagreement is a finding about the measurement, not a row to
 * hide.
 */
export const UNSTABLE_VERDICT: Verdict = { side: 'neither', ratio: Number.NaN, factor: Number.NaN, label: 'unstable across runs', structural: false };
