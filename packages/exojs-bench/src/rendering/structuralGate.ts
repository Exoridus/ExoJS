import type { ArchetypeId, Backend, CellResult, StructuralCounters } from './EngineAdapter';

/**
 * The structural regression gate: exact integer counters, compared against a
 * committed baseline.
 *
 * The gate exists for a defect class the test suite cannot see and the timing
 * matrix cannot catch reliably: a fault that looks correct and is merely
 * expensive. A batching collapse from 782 to 25 000 draw calls renders the
 * identical picture and passes every correctness test, while in a timing run it
 * has to compete with machine noise to be noticed.
 *
 * Three properties make it sharp where the timing gate has to be coarse:
 *
 * - The values are integers decided CPU-side, so they do not drift. The baseline
 *   therefore carries NO tolerance band - any deviation fails.
 * - It needs no GPU-accurate timing, so it runs on a software rasterizer, which
 *   is what makes CI execution possible at all.
 * - It compares ExoJS against its OWN baseline, never against a competitor:
 *   losing a leading position because Pixi got faster is not a defect and must
 *   not turn anything red.
 */

/**
 * Archetypes the gate does not guard, with the reason it cannot.
 *
 * The exclusions are deliberate and recorded per archetype in the mapping. A run
 * comparing every archetype's counters on a real GPU (RTX 5070 Ti / D3D11)
 * against SwiftShader at the gate's own node count showed byte-identical draw,
 * bind and upload counts for the archetypes that stayed in the gate - the
 * precondition the gate's CI residency rests on. A counter that had differed
 * would have been dropped from the gate rather than given a tolerance.
 */
export const UNGUARDED_ARCHETYPES: Readonly<Partial<Record<ArchetypeId, string>>> = {
  'batch-breaking':
    'the cell does not complete on a software rasterizer (40 distinct textures wedge it), so it has no counters there to compare',
  'text-dynamic': 'the cell aborts on a software rasterizer as too slow, so its counters cover an unpredictable number of frames',
  overdraw:
    'its fill cost dominates the gate wall clock in software (stacked full-viewport quads are hundreds of millions of shaded pixels per frame) while its draw structure is a single call that static-heavy already guards',
  'fill-layers':
    'the same stacked full-viewport geometry as overdraw, and unguarded for the same reason: enormous fill in software, no draw structure static-heavy does not already guard',
  'dirty-0': 'independent SwiftShader and hardware counter acquisition at the gate load is pending; no qualified baseline is recorded',
  'dirty-1': 'independent SwiftShader and hardware counter acquisition at the gate load is pending; no qualified baseline is recorded',
  'dirty-10': 'independent SwiftShader and hardware counter acquisition at the gate load is pending; no qualified baseline is recorded',
  'dirty-25': 'independent SwiftShader and hardware counter acquisition at the gate load is pending; no qualified baseline is recorded',
  'dirty-50': 'independent SwiftShader and hardware counter acquisition at the gate load is pending; no qualified baseline is recorded',
  'dirty-75': 'independent SwiftShader and hardware counter acquisition at the gate load is pending; no qualified baseline is recorded',
  'dirty-100': 'independent SwiftShader and hardware counter acquisition at the gate load is pending; no qualified baseline is recorded',
};

/** Identity of one guarded cell. */
export interface GateCellKey {
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

/** One baseline entry: a guarded cell and the counters it must produce. */
export interface GateBaselineCell extends GateCellKey, StructuralCounters {
  readonly countBasis: 'per-frame' | 'total';
  readonly frames: number;
}

/** The committed baseline file. */
export interface GateBaseline {
  readonly schemaVersion: 1;
  readonly countBasis: 'per-cell';
  /**
   * When and against what the baseline was recorded. Informational only - the
   * gate never compares versions, because a version bump is not a structural
   * change and must not fail the gate on its own.
   */
  readonly recorded: {
    /** ISO timestamp of the recording run. */
    readonly at: string;
    /** Engine version the recording run reported. */
    readonly engineVersion: string;
    /** Graphics adapter the recording run used - a software rasterizer, by design. */
    readonly adapter: string;
  };
  /** Every guarded cell, in a stable order. */
  readonly cells: readonly GateBaselineCell[];
}

/** One counter that deviated from its baseline. */
export interface GateDeviation {
  /** The cell it deviated in. */
  readonly cell: GateCellKey;
  /** Counter name. */
  readonly counter: keyof StructuralCounters;
  /** The value the baseline records. */
  readonly expected: number;
  /** The value the run produced. */
  readonly actual: number;
}

/** Outcome of one gate run. */
export interface GateOutcome {
  /** Cells compared successfully. */
  readonly compared: number;
  /** Counter deviations, empty when the gate passes. */
  readonly deviations: readonly GateDeviation[];
  /** Guarded cells the run did not produce at all - a failure, not a pass by absence. */
  readonly missing: readonly GateCellKey[];
  /** Cells the run produced that the baseline does not know - a prompt to update it, never a failure. */
  readonly unknown: readonly GateCellKey[];
  /** Cells that failed to measure in this run, with the note explaining why. */
  readonly unmeasured: ReadonlyArray<GateCellKey & { readonly note: string }>;
}

/** Stable identity string for a cell. */
export const gateCellId = (cell: GateCellKey): string =>
  `${cell.engine}/${cell.config}/${cell.backend}/${cell.archetype}/${cell.nodeCount}`;

/** Whether the gate guards this archetype; see {@link UNGUARDED_ARCHETYPES}. */
export const isGuarded = (archetype: string): boolean => !(archetype in UNGUARDED_ARCHETYPES);

/** The cell key of a measured result. */
const keyOf = (result: CellResult): GateCellKey => ({
  engine: result.spec.engine,
  config: result.spec.config,
  backend: result.spec.backend,
  archetype: result.spec.archetype,
  nodeCount: result.spec.nodeCount,
});

const structuralCountProblem = (result: CellResult): string | null => {
  const measurement = result.structuralMeasurement;

  if (measurement?.schemaVersion !== 1 || (measurement.basis !== 'per-frame' && measurement.basis !== 'total')) {
    return `structural count basis '${measurement?.basis ?? 'unknown'}' is not supported; schema 1 with explicit units is required`;
  }

  if (typeof measurement.totals !== 'object' || measurement.totals === null) {
    return 'structural count basis has no raw totals';
  }

  if (!Number.isSafeInteger(measurement.frames) || measurement.frames <= 0) {
    return 'structural count basis has no positive measured frame count';
  }

  for (const counter of ['drawCalls', 'textureBinds', 'bufferUploads'] as const) {
    const total = measurement.totals[counter];
    const count = result.structural[counter];

    if (
      !Number.isSafeInteger(total) ||
      total < 0 ||
      !Number.isSafeInteger(count) ||
      total / (measurement.basis === 'per-frame' ? measurement.frames : 1) !== count
    ) {
      return `structural count basis does not match the raw ${counter} total and measured frames`;
    }
  }

  return null;
};

/** Record guarded successful cells with explicit units and measured frames. Unknown or inconsistent units are rejected. */
export const recordBaseline = (results: readonly CellResult[], recorded: GateBaseline['recorded']): GateBaseline => ({
  schemaVersion: 1,
  countBasis: 'per-cell',
  recorded,
  cells: results
    .filter(result => result.status === 'ok' && isGuarded(result.spec.archetype))
    .map(result => {
      const problem = structuralCountProblem(result);

      if (problem !== null) {
        throw new Error(
          `Cannot record ${gateCellId(keyOf(result))}: ${problem}. Reacquire the cell with explicit units and measured frames.`,
        );
      }

      return {
        ...keyOf(result),
        ...result.structural,
        countBasis: result.structuralMeasurement!.basis,
        frames: result.structuralMeasurement!.frames,
      };
    })
    .sort((left, right) => gateCellId(left).localeCompare(gateCellId(right))),
});

/**
 * Compare a run against the baseline.
 *
 * A guarded cell the run failed to measure is reported as `unmeasured` and fails
 * the gate: a gate that passes because a cell disappeared is not a gate. A cell
 * the baseline does not know is reported separately and does NOT fail - that is
 * what a newly added archetype looks like, and the fix is to update the
 * baseline deliberately.
 */
export const compareToBaseline = (baseline: GateBaseline, results: readonly CellResult[]): GateOutcome => {
  if (baseline.schemaVersion !== 1 || baseline.countBasis !== 'per-cell') {
    throw new Error('Unsupported structural baseline schema or count basis. Qualify its units before migrating or re-recording it.');
  }

  const measured = new Map(results.map(result => [gateCellId(keyOf(result)), result]));
  const baselineIds = new Set(baseline.cells.map(gateCellId));
  const deviations: GateDeviation[] = [];
  const missing: GateCellKey[] = [];
  const unmeasured: Array<GateCellKey & { note: string }> = [];
  let compared = 0;

  for (const expected of baseline.cells) {
    if (
      (expected.countBasis !== 'per-frame' && expected.countBasis !== 'total') ||
      !Number.isSafeInteger(expected.frames) ||
      expected.frames <= 0 ||
      [expected.drawCalls, expected.textureBinds, expected.bufferUploads].some(count => !Number.isSafeInteger(count) || count < 0)
    ) {
      throw new Error(`Unsupported structural baseline units or frame count for ${gateCellId(expected)}.`);
    }

    const result = measured.get(gateCellId(expected));

    if (result === undefined) {
      missing.push(expected);

      continue;
    }

    if (result.status !== 'ok') {
      unmeasured.push({ ...expected, note: result.note ?? `cell status '${result.status}'` });

      continue;
    }

    const problem = structuralCountProblem(result);

    if (problem !== null) {
      unmeasured.push({ ...expected, note: problem });

      continue;
    }

    const measurement = result.structuralMeasurement!;

    if (measurement.basis !== expected.countBasis) {
      unmeasured.push({
        ...expected,
        note: `structural count basis '${measurement.basis}' does not match baseline '${expected.countBasis}'`,
      });

      continue;
    }

    if (expected.countBasis === 'total' && measurement.frames !== expected.frames) {
      unmeasured.push({ ...expected, note: `structural totals cover ${measurement.frames} frames; baseline covers ${expected.frames}` });

      continue;
    }

    compared++;

    for (const counter of ['drawCalls', 'textureBinds', 'bufferUploads'] as const) {
      if (result.structural[counter] !== expected[counter]) {
        deviations.push({ cell: expected, counter, expected: expected[counter], actual: result.structural[counter] });
      }
    }
  }

  const unknown = results
    .filter(result => result.status === 'ok' && isGuarded(result.spec.archetype) && !baselineIds.has(gateCellId(keyOf(result))))
    .map(keyOf);

  return { compared, deviations, missing, unknown, unmeasured };
};

/**
 * Whether an outcome fails the gate.
 *
 * A comparison that compared no cell fails too: an empty baseline would
 * otherwise be indistinguishable from a clean run.
 */
export const isGateFailure = (outcome: GateOutcome): boolean =>
  outcome.compared === 0 || outcome.deviations.length > 0 || outcome.missing.length > 0 || outcome.unmeasured.length > 0;

/** Human-readable gate report, one line per finding. */
export const formatGateOutcome = (outcome: GateOutcome): string => {
  const lines: string[] = [];

  if (outcome.compared === 0) {
    lines.push('FAIL no guarded cell was compared: the baseline holds no cell that this run measured');
  }

  for (const deviation of outcome.deviations) {
    lines.push(`FAIL ${gateCellId(deviation.cell)}: ${deviation.counter} ${String(deviation.expected)} -> ${String(deviation.actual)}`);
  }

  for (const cell of outcome.missing) {
    lines.push(`FAIL ${gateCellId(cell)}: guarded cell absent from the run`);
  }

  for (const cell of outcome.unmeasured) {
    lines.push(`FAIL ${gateCellId(cell)}: cell did not measure (${cell.note})`);
  }

  for (const cell of outcome.unknown) {
    lines.push(`NEW  ${gateCellId(cell)}: not in the baseline; re-record with --update once the cell is intended`);
  }

  lines.push(`${String(outcome.compared)} cell(s) compared, ${String(outcome.deviations.length)} deviation(s).`);

  return lines.join('\n');
};
