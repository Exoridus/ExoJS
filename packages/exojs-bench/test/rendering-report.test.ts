import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { CellResult } from '../src/rendering/EngineAdapter';
import { type ReportData, writeReport } from '../src/rendering/report';

const cell = (nodeCount: number, frameMsMedian: number | null): CellResult => ({
  spec: { engine: 'exojs', config: 'current', backend: 'webgl2', archetype: 'static-heavy', nodeCount, timedFrames: 60, warmupFrames: 10 },
  cpuMsMedian: 1,
  cpuMsP95: 1.2,
  frameMsMedian,
  frameMsP95: frameMsMedian,
  queueMsMedian: null,
  queueMsP95: null,
  structural: { drawCalls: 1, textureBinds: 1, bufferUploads: 1 },
  clock: { resolutionMs: 0.001, crossOriginIsolated: true },
  status: 'ok',
});

/** The values of one CSV column, keyed by the header rather than a position. */
const csvColumn = (csv: string, column: string): string[] => {
  const [header, ...rows] = csv.split('\n');
  const index = header!.split(',').indexOf(column);

  return rows.filter(line => line.length > 0).map(line => line.split(',')[index]!);
};

describe('rendering report frame budget mark', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'exojs-bench-frame-budget-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('marks a row by its measured frame time, not by its node count', () => {
    const data: ReportData = {
      provenance: [],
      libraries: [],
      results: [cell(1_000, 40), cell(200_000, 1)],
    };

    writeReport(data, dir);

    const csv = readFileSync(join(dir, 'results.csv'), 'utf8');
    const md = readFileSync(join(dir, 'results.md'), 'utf8');

    expect(csvColumn(csv, 'frameBudget')).toEqual(['beyond-frame-budget', '']);
    expect(md).toContain('40.000 beyond-frame-budget');
    expect(md).not.toContain('1.000 beyond-frame-budget');
  });

  test('carries no mark when no frame time was measured', () => {
    writeReport({ provenance: [], libraries: [], results: [cell(200_000, null)] }, dir);

    expect(csvColumn(readFileSync(join(dir, 'results.csv'), 'utf8'), 'frameBudget')).toEqual(['']);
  });
});
