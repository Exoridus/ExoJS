import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ARCHETYPES } from '../src/rendering/archetypes';
import type { ArchetypeId, CellResult } from '../src/rendering/EngineAdapter';
import type { GateBaseline } from '../src/rendering/structuralGate';
import {
  compareToBaseline,
  formatGateOutcome,
  gateCellId,
  isGateFailure,
  isGuarded,
  recordBaseline,
  UNGUARDED_ARCHETYPES,
} from '../src/rendering/structuralGate';
import type { ClockReport } from '../src/shared/clock';

/**
 * A clock fine enough that no fixture duration trips the timer check, so a test
 * asserts on the comparison it is about rather than on the grid it was read on.
 */
const FINE_CLOCK: ClockReport = { resolutionMs: 0.001, crossOriginIsolated: true };

/** A measured cell with the counters the gate reads. */
const cell = (options: {
  archetype: ArchetypeId;
  drawCalls: number;
  textureBinds?: number;
  bufferUploads?: number;
  config?: string;
  status?: 'ok' | 'exceeded' | 'unavailable';
  note?: string;
}): CellResult => ({
  spec: {
    engine: 'exojs',
    config: options.config ?? 'current',
    backend: 'webgl2',
    archetype: options.archetype,
    nodeCount: 1_000,
    timedFrames: 3,
    warmupFrames: 10,
  },
  cpuMsMedian: 1,
  cpuMsP95: 1,
  frameMsMedian: null,
  frameMsP95: null,
  queueMsMedian: null,
  queueMsP95: null,
  structural: { drawCalls: options.drawCalls, textureBinds: options.textureBinds ?? 0, bufferUploads: options.bufferUploads ?? 0 },
  structuralMeasurement: {
    schemaVersion: 1,
    basis: 'per-frame',
    frames: 3,
    totals: {
      drawCalls: options.drawCalls * 3,
      textureBinds: (options.textureBinds ?? 0) * 3,
      bufferUploads: (options.bufferUploads ?? 0) * 3,
    },
  },
  clock: FINE_CLOCK,
  status: options.status ?? 'ok',
  ...(options.note !== undefined && { note: options.note }),
});

const recorded = { at: '2026-08-29T00:00:00.000Z', engineVersion: '0.15.2', adapter: 'SwiftShader' };

describe('recordBaseline', () => {
  test('keeps only the guarded, successfully measured cells', () => {
    const baseline = recordBaseline(
      [
        cell({ archetype: 'static-heavy', drawCalls: 1 }),
        cell({ archetype: 'batch-breaking', drawCalls: 63 }),
        cell({ archetype: 'mask-clip', drawCalls: 4, status: 'exceeded' }),
      ],
      recorded,
    );

    expect(baseline.cells.map(entry => entry.archetype)).toEqual(['static-heavy']);
  });

  test('sorts cells so the committed file has a stable diff', () => {
    const baseline = recordBaseline(
      [
        cell({ archetype: 'overdraw', drawCalls: 1 }),
        cell({ archetype: 'deep-hierarchy', drawCalls: 1 }),
        cell({ archetype: 'mask-clip', drawCalls: 4 }),
      ],
      recorded,
    );
    const ids = baseline.cells.map(gateCellId);

    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
  });
});

describe('structural count units', () => {
  test('records explicit baseline schema and per-cell units', () => {
    const baseline = recordBaseline([cell({ archetype: 'static-heavy', drawCalls: 1 })], recorded);

    expect(baseline).toMatchObject({ schemaVersion: 1, countBasis: 'per-cell', cells: [{ countBasis: 'per-frame', frames: 3 }] });
  });

  test('refuses to record historical results whose count units are unknown', () => {
    const { structuralMeasurement: _measurement, ...historical } = cell({ archetype: 'static-heavy', drawCalls: 1 });

    expect(() => recordBaseline([historical], recorded)).toThrow('structural count basis');
  });

  test('rejects total counters instead of reporting a per-frame counter regression', () => {
    const baseline = recordBaseline([cell({ archetype: 'static-heavy', drawCalls: 1 })], recorded);
    const result = cell({ archetype: 'static-heavy', drawCalls: 4 });
    const total = {
      ...result,
      structuralMeasurement: { schemaVersion: 1 as const, basis: 'total' as const, frames: 3, totals: result.structural },
    };
    const outcome = compareToBaseline(baseline, [total]);

    expect(outcome.deviations).toEqual([]);
    expect(isGateFailure(outcome)).toBe(true);
    expect(outcome.unmeasured[0]?.note).toContain('total');
    expect(formatGateOutcome(outcome)).toContain('per-frame');
  });

  test('does not infer units for a historical result from an evenly divisible value', () => {
    const baseline = recordBaseline([cell({ archetype: 'static-heavy', drawCalls: 1 })], recorded);
    const { structuralMeasurement: _measurement, ...historical } = cell({ archetype: 'static-heavy', drawCalls: 1 });
    const outcome = compareToBaseline(baseline, [historical]);

    expect(isGateFailure(outcome)).toBe(true);
    expect(outcome.unmeasured[0]?.note).toContain('structural count basis');
  });

  test.each([{ frames: 0 }, { schemaVersion: 2 }, { totals: null }, { totals: { drawCalls: 4, textureBinds: 0, bufferUploads: 0 } }])(
    'rejects inconsistent or unsupported measurement metadata: %j',
    override => {
      const result = cell({ archetype: 'static-heavy', drawCalls: 1 });
      const baseline = recordBaseline([result], recorded);
      const malformed = { ...result, structuralMeasurement: { ...result.structuralMeasurement, ...override } } as unknown as CellResult;
      const outcome = compareToBaseline(baseline, [malformed]);

      expect(isGateFailure(outcome)).toBe(true);
      expect(outcome.unmeasured).toHaveLength(1);
      expect(outcome.deviations).toEqual([]);
    },
  );

  test('rejects an unversioned baseline without changing or guessing its counters', () => {
    const {
      schemaVersion: _schema,
      countBasis: _basis,
      ...historical
    } = recordBaseline([cell({ archetype: 'static-heavy', drawCalls: 1 })], recorded);

    expect(() => compareToBaseline(historical as GateBaseline, [cell({ archetype: 'static-heavy', drawCalls: 1 })])).toThrow(
      'baseline schema',
    );
  });
});

describe('compareToBaseline', () => {
  const baseline: GateBaseline = recordBaseline([cell({ archetype: 'static-heavy', drawCalls: 1, bufferUploads: 2 })], recorded);

  test('passes when every counter matches', () => {
    const outcome = compareToBaseline(baseline, [cell({ archetype: 'static-heavy', drawCalls: 1, bufferUploads: 2 })]);

    expect(isGateFailure(outcome)).toBe(false);
    expect(outcome.compared).toBe(1);
  });

  test('fails on any deviation, with no tolerance band', () => {
    const outcome = compareToBaseline(baseline, [cell({ archetype: 'static-heavy', drawCalls: 2, bufferUploads: 2 })]);

    expect(isGateFailure(outcome)).toBe(true);
    expect(outcome.deviations).toEqual([{ cell: baseline.cells[0]!, counter: 'drawCalls', expected: 1, actual: 2 }]);
  });

  test('reports every deviating counter of a cell, not just the first', () => {
    const outcome = compareToBaseline(baseline, [cell({ archetype: 'static-heavy', drawCalls: 5, textureBinds: 7, bufferUploads: 9 })]);

    expect(outcome.deviations.map(deviation => deviation.counter)).toEqual(['drawCalls', 'textureBinds', 'bufferUploads']);
  });

  test('does not pass when the baseline and run contain no guarded cells', () => {
    const outcome = compareToBaseline({ schemaVersion: 1, countBasis: 'per-cell', recorded, cells: [] }, []);

    expect(isGateFailure(outcome)).toBe(true);
    expect(formatGateOutcome(outcome)).toContain('no guarded cell was compared');
  });

  test('fails when a guarded cell is absent, rather than passing by omission', () => {
    const outcome = compareToBaseline(baseline, []);

    expect(outcome.missing).toHaveLength(1);
    expect(isGateFailure(outcome)).toBe(true);
  });

  test('fails when a guarded cell did not measure, and says why', () => {
    const outcome = compareToBaseline(baseline, [cell({ archetype: 'static-heavy', drawCalls: 1, status: 'exceeded', note: 'aborted' })]);

    expect(isGateFailure(outcome)).toBe(true);
    expect(outcome.unmeasured[0]!.note).toBe('aborted');
  });

  test('a cell the baseline does not know is reported but does not fail the gate', () => {
    const outcome = compareToBaseline(baseline, [
      cell({ archetype: 'static-heavy', drawCalls: 1, bufferUploads: 2 }),
      cell({ archetype: 'mask-clip', drawCalls: 4 }),
    ]);

    expect(outcome.unknown.map(entry => entry.archetype)).toEqual(['mask-clip']);
    expect(isGateFailure(outcome)).toBe(false);
  });

  test('the report names the cell and the counter that moved', () => {
    const report = formatGateOutcome(
      compareToBaseline(baseline, [cell({ archetype: 'static-heavy', drawCalls: 25_000, bufferUploads: 2 })]),
    );

    expect(report).toContain('exojs/current/webgl2/static-heavy/1000');
    expect(report).toContain('drawCalls 1 -> 25000');
  });
});

describe('the committed baseline', () => {
  const baseline = JSON.parse(readFileSync(resolve(import.meta.dirname, '../baselines/structural.json'), 'utf8')) as GateBaseline;

  test('was recorded on a software rasterizer, which is what makes the gate machine-independent', () => {
    expect(baseline.recorded.adapter.toLowerCase()).toContain('swiftshader');
  });

  test('guards both ExoJS arms', () => {
    expect([...new Set(baseline.cells.map(entry => entry.config))].sort()).toEqual(['current', 'retained']);
  });

  test('covers every guarded archetype', () => {
    const guarded = ARCHETYPES.filter(archetype => isGuarded(archetype.id)).map(archetype => archetype.id);
    const covered = new Set(baseline.cells.map(entry => entry.archetype));

    expect(guarded.filter(id => !covered.has(id))).toEqual([]);
  });

  test('holds no cell for an unguarded archetype', () => {
    for (const archetype of Object.keys(UNGUARDED_ARCHETYPES)) {
      expect(baseline.cells.some(entry => entry.archetype === archetype)).toBe(false);
    }
  });

  test('qualifies both lifecycle baselines without changing their three-frame counters', () => {
    const lifecycle = baseline.cells.filter(entry => entry.archetype === 'particles-lifecycle');

    expect(lifecycle).toHaveLength(2);
    expect(lifecycle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ config: 'current', drawCalls: 6, textureBinds: 12, bufferUploads: 10, countBasis: 'total', frames: 3 }),
        expect.objectContaining({ config: 'retained', drawCalls: 6, textureBinds: 12, bufferUploads: 10, countBasis: 'total', frames: 3 }),
      ]),
    );
    expect(baseline.cells.filter(entry => entry.countBasis === 'per-frame')).toHaveLength(58);
  });
  test('records integer counters only - these values do not drift, so a fraction would mean a harness bug', () => {
    for (const entry of baseline.cells) {
      expect(Number.isInteger(entry.drawCalls)).toBe(true);
      expect(Number.isInteger(entry.textureBinds)).toBe(true);
      expect(Number.isInteger(entry.bufferUploads)).toBe(true);
    }
  });
});

describe('qualified lifecycle total baselines', () => {
  const lifecycle = (): CellResult => {
    const result = cell({ archetype: 'particles-lifecycle', drawCalls: 6, textureBinds: 12, bufferUploads: 10 });

    return {
      ...result,
      spec: { ...result.spec, nodeCount: 200 },
      structuralMeasurement: { schemaVersion: 1, basis: 'total', frames: 3, totals: { ...result.structural } },
    };
  };

  const qualifiedBaseline = () => ({
    schemaVersion: 1 as const,
    countBasis: 'per-cell' as const,
    recorded,
    cells: [
      {
        engine: 'exojs',
        config: 'current',
        backend: 'webgl2' as const,
        archetype: 'particles-lifecycle',
        nodeCount: 200,
        drawCalls: 6,
        textureBinds: 12,
        bufferUploads: 10,
        countBasis: 'total' as const,
        frames: 3,
      },
    ],
  });

  test('records the observed three-frame totals without rounding or relabeling them', () => {
    expect(recordBaseline([lifecycle()], recorded)).toEqual(qualifiedBaseline());
  });

  test('compares qualified lifecycle totals in the same three-frame window', () => {
    const outcome = compareToBaseline(qualifiedBaseline(), [lifecycle()]);

    expect(outcome.compared).toBe(1);
    expect(isGateFailure(outcome)).toBe(false);
  });

  test('keeps an additional lifecycle upload a counter regression', () => {
    const result = lifecycle();
    result.structural.bufferUploads += 1;
    const changed = { ...result, structuralMeasurement: { ...result.structuralMeasurement!, totals: { ...result.structural } } };
    const outcome = compareToBaseline(qualifiedBaseline(), [changed]);

    expect(outcome.deviations).toMatchObject([{ counter: 'bufferUploads', expected: 10, actual: 11 }]);
    expect(isGateFailure(outcome)).toBe(true);
  });

  test('rejects totals collected over a different frame count', () => {
    const result = lifecycle();
    const changed = { ...result, structuralMeasurement: { ...result.structuralMeasurement!, frames: 4 } };
    const outcome = compareToBaseline(qualifiedBaseline(), [changed]);

    expect(outcome.deviations).toEqual([]);
    expect(outcome.unmeasured[0]?.note).toContain('frame');
    expect(isGateFailure(outcome)).toBe(true);
  });

  test.each([{ countBasis: 'unknown' }, { frames: 0 }, { frames: undefined }])('rejects unknown baseline units or frames: %j', override => {
    const baseline = qualifiedBaseline();
    const invalid = { ...baseline, cells: [{ ...baseline.cells[0]!, ...override }] } as unknown as GateBaseline;

    expect(() => compareToBaseline(invalid, [lifecycle()])).toThrow('baseline');
  });
});
