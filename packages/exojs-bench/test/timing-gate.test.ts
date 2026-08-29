import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ArchetypeId, CellResult } from '../src/rendering/EngineAdapter';
import type { TimingBaseline } from '../src/rendering/timingGate';
import {
  compareToTimingBaseline,
  formatTimingOutcome,
  isTimingFailure,
  recordTimingBaseline,
  TIMING_FLOOR_MS,
  TIMING_THRESHOLD,
  timingCellId,
} from '../src/rendering/timingGate';

/** A measured cell with the timings the gate reads. */
const cell = (options: { archetype: ArchetypeId; cpuMsMedian: number; cpuMsP95?: number; status?: 'ok' | 'exceeded' }): CellResult => ({
  spec: {
    engine: 'exojs',
    config: 'current',
    backend: 'webgl2',
    archetype: options.archetype,
    nodeCount: 5_000,
    timedFrames: 90,
    warmupFrames: 10,
  },
  cpuMsMedian: options.cpuMsMedian,
  cpuMsP95: options.cpuMsP95 ?? options.cpuMsMedian * 1.2,
  frameMsMedian: null,
  frameMsP95: null,
  queueMsMedian: null,
  queueMsP95: null,
  structural: { drawCalls: 1, textureBinds: 0, bufferUploads: 0 },
  status: options.status ?? 'ok',
});

const recorded = {
  at: '2026-08-29T00:00:00.000Z',
  engineVersion: '0.15.2',
  adapters: { webgl2: 'Test GPU' },
  cpu: 'Test CPU',
  confirmedIdle: true,
};

/** A baseline holding one cell at `baselineMs`. */
const baselineAt = (baselineMs: number): TimingBaseline => recordTimingBaseline([cell({ archetype: 'static-heavy', cpuMsMedian: baselineMs })], recorded);

describe('compareToTimingBaseline', () => {
  test('passes a cell inside the threshold', () => {
    const outcome = compareToTimingBaseline(baselineAt(10), [cell({ archetype: 'static-heavy', cpuMsMedian: 12 })]);

    expect(outcome.comparisons[0]!.change).toBeCloseTo(0.2, 10);
    expect(isTimingFailure(outcome)).toBe(false);
  });

  test('fails a cell that exceeds both the threshold and the floor', () => {
    const outcome = compareToTimingBaseline(baselineAt(10), [cell({ archetype: 'static-heavy', cpuMsMedian: 13 })]);

    expect(outcome.comparisons[0]!.change).toBeGreaterThan(TIMING_THRESHOLD);
    expect(isTimingFailure(outcome)).toBe(true);
  });

  test('a sub-floor increase never fails, however large the ratio', () => {
    // 0.060 -> 0.095 ms is +58 %, and was one of 15 such cells between two
    // consecutive runs of the same code on the same machine.
    const outcome = compareToTimingBaseline(baselineAt(0.06), [cell({ archetype: 'static-heavy', cpuMsMedian: 0.095 })]);

    expect(outcome.comparisons[0]!.change).toBeGreaterThan(TIMING_THRESHOLD);
    expect(outcome.comparisons[0]!.failed).toBe(false);
    expect(isTimingFailure(outcome)).toBe(false);
  });

  test('exactly the threshold passes; a hair past it, at the floor, fails', () => {
    // At this baseline the floor and the threshold coincide, so the pair of cases
    // pins both boundaries at once: "more than 25 %" is strict.
    const baselineMs = TIMING_FLOOR_MS / TIMING_THRESHOLD;
    const atThreshold = compareToTimingBaseline(baselineAt(baselineMs), [cell({ archetype: 'static-heavy', cpuMsMedian: baselineMs + TIMING_FLOOR_MS })]);
    const past = compareToTimingBaseline(baselineAt(baselineMs), [cell({ archetype: 'static-heavy', cpuMsMedian: baselineMs + TIMING_FLOOR_MS + 0.001 })]);

    expect(atThreshold.comparisons[0]!.failed).toBe(false);
    expect(past.comparisons[0]!.failed).toBe(true);
  });

  test('an improvement is reported rather than dropped', () => {
    const outcome = compareToTimingBaseline(baselineAt(10), [cell({ archetype: 'static-heavy', cpuMsMedian: 4 })]);

    expect(outcome.comparisons[0]!.change).toBeCloseTo(-0.6, 10);
    expect(isTimingFailure(outcome)).toBe(false);
  });

  test('p95 is carried through but never decides the outcome', () => {
    const outcome = compareToTimingBaseline(baselineAt(10), [cell({ archetype: 'static-heavy', cpuMsMedian: 10, cpuMsP95: 400 })]);

    expect(outcome.comparisons[0]!.measuredP95).toBe(400);
    expect(isTimingFailure(outcome)).toBe(false);
  });

  test('a baselined cell absent from the run is reported without failing the gate', () => {
    const outcome = compareToTimingBaseline(baselineAt(10), []);

    expect(outcome.missing.map(timingCellId)).toEqual(['exojs/current/webgl2/static-heavy/5000']);
    expect(isTimingFailure(outcome)).toBe(false);
  });

  test('sorts the worst regression first, so the report leads with what matters', () => {
    const baseline = recordTimingBaseline([cell({ archetype: 'static-heavy', cpuMsMedian: 10 }), cell({ archetype: 'overdraw', cpuMsMedian: 10 })], recorded);
    const outcome = compareToTimingBaseline(baseline, [cell({ archetype: 'static-heavy', cpuMsMedian: 11 }), cell({ archetype: 'overdraw', cpuMsMedian: 20 })]);

    expect(outcome.comparisons.map(comparison => comparison.cell.archetype)).toEqual(['overdraw', 'static-heavy']);
  });

  test('an aborted cell is treated as unmeasured rather than as a fast one', () => {
    const outcome = compareToTimingBaseline(baselineAt(10), [cell({ archetype: 'static-heavy', cpuMsMedian: 0.1, status: 'exceeded' })]);

    expect(outcome.missing).toHaveLength(1);
    expect(outcome.comparisons).toHaveLength(0);
  });
});

describe('formatTimingOutcome', () => {
  test('says so when the baseline was not recorded on a confirmed-idle machine', () => {
    const loose = recordTimingBaseline([cell({ archetype: 'static-heavy', cpuMsMedian: 10 })], { ...recorded, confirmedIdle: false });
    const report = formatTimingOutcome(compareToTimingBaseline(loose, [cell({ archetype: 'static-heavy', cpuMsMedian: 10 })]));

    expect(report).toContain('not recorded on a confirmed-idle machine');
  });

  test('states both the threshold and the floor, so a reader can check any verdict', () => {
    const report = formatTimingOutcome(compareToTimingBaseline(baselineAt(10), [cell({ archetype: 'static-heavy', cpuMsMedian: 10 })]));

    expect(report).toContain('25% threshold');
    expect(report).toContain('0.5ms floor');
  });
});

describe('the committed timing baseline', () => {
  const baseline = JSON.parse(readFileSync(resolve(import.meta.dirname, '../baselines/timing.json'), 'utf8')) as TimingBaseline;

  test('records the GPU and CPU it was measured on - a wall-clock number without them is unusable', () => {
    expect(baseline.recorded.adapters.webgl2).toBeTruthy();
    expect(baseline.recorded.cpu).toBeTruthy();
  });

  test('was not measured on a software rasterizer', () => {
    expect(baseline.recorded.adapters.webgl2?.toLowerCase()).not.toContain('swiftshader');
  });

  test('covers both ExoJS arms', () => {
    expect([...new Set(baseline.cells.map(entry => entry.config))].sort()).toEqual(['current', 'retained']);
  });

  test('records the frame count each median rests on', () => {
    for (const entry of baseline.cells) {
      expect(entry.timedFrames).toBeGreaterThan(0);
    }
  });
});
