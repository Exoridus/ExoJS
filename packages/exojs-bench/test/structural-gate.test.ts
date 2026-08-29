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
      [cell({ archetype: 'overdraw', drawCalls: 1 }), cell({ archetype: 'deep-hierarchy', drawCalls: 1 }), cell({ archetype: 'mask-clip', drawCalls: 4 })],
      recorded,
    );
    const ids = baseline.cells.map(gateCellId);

    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
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
    const report = formatGateOutcome(compareToBaseline(baseline, [cell({ archetype: 'static-heavy', drawCalls: 25_000, bufferUploads: 2 })]));

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

  test('records integer counters only - these values do not drift, so a fraction would mean a harness bug', () => {
    for (const entry of baseline.cells) {
      expect(Number.isInteger(entry.drawCalls)).toBe(true);
      expect(Number.isInteger(entry.textureBinds)).toBe(true);
      expect(Number.isInteger(entry.bufferUploads)).toBe(true);
    }
  });
});
