import type { BackendComparison, ComparisonCell, ComparisonRow, ComparisonSection } from './build';
import type { VerdictRung } from './verdict';

/**
 * The comparison model as it is published: one run's model widened by what
 * several runs of the same matrix observed.
 *
 * A published claim is a ratio between two arms, and one run does not support
 * one - the same code measured twice on one idle machine moves a cell's median
 * far enough to reverse which arm it favours. A published cell therefore
 * carries, beside the pooled value, the range the runs observed and whether
 * they agreed on a verdict at all.
 *
 * These types live apart from the stage that computes them because they are
 * part of the published schema, and a reader of a profile document must be able
 * to type it without pulling in the harness: the pooling stage imports the
 * browser driver and the run artifacts, which drag Playwright and the engine
 * source into any program that touches them.
 */

/** How far one measured value moved across the runs that were pooled. */
export interface RunSpread {
  /** Smallest per-run median, in milliseconds. */
  readonly minMs: number;
  /** Largest per-run median, in milliseconds. */
  readonly maxMs: number;
  /** `maxMs / minMs`: the same measurement's own noise, as a factor. */
  readonly ratio: number;
}

/** What the pooled runs agreed and disagreed on for one arm pair. */
export interface CellAggregate {
  /** How many runs produced a comparable cell here. */
  readonly runs: number;
  /** Spread of the reference arm's per-run medians. */
  readonly reference: RunSpread;
  /** Spread of the competitor arm's per-run medians. */
  readonly competitor: RunSpread;
  /**
   * True when every run placed the pair on the same rung and the pooled medians
   * land on that rung too. A false value means the runs disagreed, and the cell
   * publishes no verdict.
   *
   * Runs that agree the pair is `not-comparable` are stable: they agreed, and
   * "not comparable" was never a verdict.
   */
  readonly stable: boolean;
  /** The rung each run produced, in run order - the evidence behind {@link stable}. */
  readonly rungs: readonly VerdictRung[];
}

/** One arm pair's outcome, pooled across runs. */
export interface AggregatedCell extends ComparisonCell {
  /** Spread and stability of the numbers above. */
  readonly aggregate: CellAggregate;
}

/** One published row, pooled across runs. */
export interface AggregatedRow extends ComparisonRow {
  readonly cells: readonly AggregatedCell[];
}

/** A category section, pooled across runs. */
export interface AggregatedSection extends ComparisonSection {
  readonly rows: readonly AggregatedRow[];
}

/** One backend's comparison, pooled across runs. */
export interface AggregatedBackendComparison extends BackendComparison {
  readonly sections: readonly AggregatedSection[];
  readonly webgl1: readonly AggregatedRow[];
}
