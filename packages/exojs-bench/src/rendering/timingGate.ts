import type { Backend, CellResult } from './EngineAdapter';

/**
 * The timing regression gate: coarse, manual, and a release precondition.
 *
 * Everything about it is the opposite of the structural gate, deliberately.
 * Where that one compares integers exactly and runs in CI, this one compares
 * wall-clock medians with a wide threshold and runs only when a human invokes it
 * on a machine they have confirmed is idle.
 *
 * NOT a pre-push hook, and the reason is methodological rather than
 * convenience: the matrix needs an idle machine, and a push is by definition not
 * idle - editor, language server, often a parallel gate run. Measured evidence
 * from this harness: real machine load moved `dynamic-heavy` from 93 ms to
 * 115 ms, about 24 %. A percentage gate on numbers that move that much produces
 * red runs from noise, and a gate that goes falsely red gets bypassed - at which
 * point it no longer exists. Tag pushes additionally already run
 * `verify:release`; a multi-minute GPU matrix on top would make tagging unusable.
 */

/**
 * Fractional regression a cell's median may absorb before it fails: 25 %.
 *
 * Chosen to sit ABOVE the noise band the matrix already declares - its own read
 * rule treats cross-arm ratios of 0.8 to 1.2 as indistinguishable - so a tighter
 * threshold could not be told apart from machine mood. p95 is recorded and
 * reported but never gated, since it is the noisier of the two statistics.
 */
export const TIMING_THRESHOLD = 0.25;

/**
 * Absolute increase (ms) a cell's median must ALSO gain before it fails.
 *
 * A relative threshold alone cannot gate a sub-millisecond cell. Measured on this
 * harness: two consecutive runs of this gate, same machine, no code change, put
 * 15 of 42 cells over 25 % - and the smallest of them moved 0.060 ms to
 * 0.095 ms, which is a few timer quanta rather than a regression. A frame has
 * 16.7 ms to spend, so an increase this small is not a defect at any ratio.
 *
 * Both conditions must hold, so the gate keeps its 25 % sharpness where the
 * numbers are large enough to carry it and stops manufacturing failures where
 * they are not.
 */
export const TIMING_FLOOR_MS = 0.5;

/** Identity of one baselined cell. */
export interface TimingCellKey {
  /** Engine label. */
  readonly engine: string;
  /** Engine config label. */
  readonly config: string;
  /** Backend. */
  readonly backend: Backend;
  /** Archetype id. */
  readonly archetype: string;
  /** Node count. */
  readonly nodeCount: number;
}

/** One baseline entry: a cell and the timings it produced when the baseline was recorded. */
export interface TimingBaselineCell extends TimingCellKey {
  /** Median per-frame CPU time (ms) - the gated statistic. */
  readonly cpuMsMedian: number;
  /** 95th-percentile per-frame CPU time (ms) - reported, never gated. */
  readonly cpuMsP95: number;
  /** Timed frames the median rests on, so a thinner re-run is visible rather than silently compared. */
  readonly timedFrames: number;
}

/** The committed timing baseline. */
export interface TimingBaseline {
  /** What produced these numbers. A timing baseline is worthless without it. */
  readonly recorded: {
    /** ISO timestamp of the recording run. */
    readonly at: string;
    /** Engine version. */
    readonly engineVersion: string;
    /** Graphics adapter, per backend recorded. */
    readonly adapters: Readonly<Record<string, string>>;
    /** Host CPU string. */
    readonly cpu: string;
    /**
     * Whether the recording machine was CONFIRMED idle by whoever ran it.
     *
     * `false` means the numbers are a usable reference point but not a release
     * reference: the gate says so on every run rather than letting a
     * conveniently-recorded baseline quietly become the standard.
     */
    readonly confirmedIdle: boolean;
  };
  /** Every baselined cell, in a stable order. */
  readonly cells: readonly TimingBaselineCell[];
}

/** One cell's comparison against its baseline. */
export interface TimingComparison {
  /** The cell. */
  readonly cell: TimingCellKey;
  /** Baseline median (ms). */
  readonly baselineMs: number;
  /** Measured median (ms). */
  readonly measuredMs: number;
  /** Signed fractional change: `+0.30` is 30 % slower. */
  readonly change: number;
  /** Baseline p95 (ms) - reported for context. */
  readonly baselineP95: number;
  /** Measured p95 (ms). */
  readonly measuredP95: number;
  /** True when the median exceeded the threshold. */
  readonly failed: boolean;
}

/** Outcome of one timing-gate run. */
export interface TimingOutcome {
  /** Every compared cell, worst regression first. */
  readonly comparisons: readonly TimingComparison[];
  /** Baselined cells the run did not produce. */
  readonly missing: readonly TimingCellKey[];
  /** Cells the run produced that the baseline does not know. */
  readonly unknown: readonly TimingCellKey[];
  /** Whether the recording run declared its machine idle. */
  readonly baselineConfirmedIdle: boolean;
}

/** Stable identity string for a cell. */
export const timingCellId = (cell: TimingCellKey): string => `${cell.engine}/${cell.config}/${cell.backend}/${cell.archetype}/${cell.nodeCount}`;

/** The cell key of a measured result. */
const keyOf = (result: CellResult): TimingCellKey => ({
  engine: result.spec.engine,
  config: result.spec.config,
  backend: result.spec.backend,
  archetype: result.spec.archetype,
  nodeCount: result.spec.nodeCount,
});

/** Turn a run's results into a baseline, keeping only the cells that measured successfully. */
export const recordTimingBaseline = (results: readonly CellResult[], recorded: TimingBaseline['recorded']): TimingBaseline => ({
  recorded,
  cells: results
    .filter(result => result.status === 'ok')
    .map(result => ({ ...keyOf(result), cpuMsMedian: result.cpuMsMedian, cpuMsP95: result.cpuMsP95, timedFrames: result.spec.timedFrames }))
    .sort((left, right) => timingCellId(left).localeCompare(timingCellId(right))),
});

/**
 * Compare a run against the timing baseline.
 *
 * A cell that improved is reported like any other: the point of the gate is to
 * see the whole distribution move, and a run that only prints regressions hides
 * the case where one cell got 40 % faster because another quietly took its work.
 * Only a median above the threshold fails.
 */
export const compareToTimingBaseline = (baseline: TimingBaseline, results: readonly CellResult[]): TimingOutcome => {
  const measured = new Map(results.filter(result => result.status === 'ok').map(result => [timingCellId(keyOf(result)), result]));
  const baselineIds = new Set(baseline.cells.map(timingCellId));
  const comparisons: TimingComparison[] = [];
  const missing: TimingCellKey[] = [];

  for (const expected of baseline.cells) {
    const result = measured.get(timingCellId(expected));

    if (result === undefined) {
      missing.push(expected);

      continue;
    }

    const change = expected.cpuMsMedian > 0 ? (result.cpuMsMedian - expected.cpuMsMedian) / expected.cpuMsMedian : 0;

    comparisons.push({
      cell: expected,
      baselineMs: expected.cpuMsMedian,
      measuredMs: result.cpuMsMedian,
      change,
      baselineP95: expected.cpuMsP95,
      measuredP95: result.cpuMsP95,
      failed: change > TIMING_THRESHOLD && result.cpuMsMedian - expected.cpuMsMedian >= TIMING_FLOOR_MS,
    });
  }

  const unknown = [...measured.values()].filter(result => !baselineIds.has(timingCellId(keyOf(result)))).map(keyOf);

  return {
    comparisons: comparisons.sort((left, right) => right.change - left.change),
    missing,
    unknown,
    baselineConfirmedIdle: baseline.recorded.confirmedIdle,
  };
};

/**
 * Whether an outcome fails the gate.
 *
 * A missing cell does NOT fail here, unlike in the structural gate. The timing
 * gate is invoked by hand on a subset a maintainer chose, so an absent cell
 * usually means "not measured this time" rather than "disappeared"; it is
 * reported, and the maintainer decides.
 */
export const isTimingFailure = (outcome: TimingOutcome): boolean => outcome.comparisons.some(comparison => comparison.failed);

/** Human-readable timing report: the worst regressions first, then the rest. */
export const formatTimingOutcome = (outcome: TimingOutcome): string => {
  const lines: string[] = [];

  if (!outcome.baselineConfirmedIdle) {
    lines.push('NOTE the baseline was not recorded on a confirmed-idle machine, so it is a reference point rather than a release reference.');
  }

  for (const comparison of outcome.comparisons) {
    const percent = `${comparison.change >= 0 ? '+' : ''}${(comparison.change * 100).toFixed(1)}%`;

    lines.push(
      `${comparison.failed ? 'FAIL' : 'ok  '} ${timingCellId(comparison.cell)}: median ${comparison.baselineMs.toFixed(3)} -> ${comparison.measuredMs.toFixed(3)} ms (${percent}); p95 ${comparison.baselineP95.toFixed(3)} -> ${comparison.measuredP95.toFixed(3)} ms (reported, not gated)`,
    );
  }

  for (const cell of outcome.missing) {
    lines.push(`----  ${timingCellId(cell)}: baselined but not measured in this run`);
  }

  for (const cell of outcome.unknown) {
    lines.push(`NEW   ${timingCellId(cell)}: not in the baseline; re-record with --update once the cell is intended`);
  }

  const failures = outcome.comparisons.filter(comparison => comparison.failed).length;

  lines.push(
    `${String(outcome.comparisons.length)} cell(s) compared against a ${String(TIMING_THRESHOLD * 100)}% threshold with a ${String(TIMING_FLOOR_MS)}ms floor, ${String(failures)} over both.`,
  );

  return lines.join('\n');
};
