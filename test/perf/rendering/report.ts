/**
 * Machine-readable output for the renderer benchmark sweep: a JSON array of
 * per-scenario results plus a flat CSV summary. Written under
 * `.workspace/output/render-perf/` (gitignored) by `sweep.test.ts`.
 *
 * @internal Test/perf-only.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { FrameMetrics } from './harness';

export interface ScenarioTiming {
  readonly cpuMeanMs: number;
  readonly cpuMedianMs: number;
  readonly cpuP95Ms: number;
}

export interface ScenarioResult {
  readonly scenario: string;
  readonly family: string;
  readonly backend: string;
  readonly frames: number;
  readonly tags: Readonly<Record<string, string | number>>;
  readonly metrics: FrameMetrics & { readonly geometryRebuilds: number };
  readonly timing: ScenarioTiming;
}

export interface SweepMeta {
  readonly profile: string;
  readonly commit: string;
  readonly timestamp: string;
  readonly node: string;
}

export const median = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

export const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));

  return sorted[rank];
};

export const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

const round = (value: number, digits = 4): number => {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
};

const CSV_COLUMNS: Array<[string, (r: ScenarioResult) => string | number]> = [
  ['scenario', r => r.scenario],
  ['family', r => r.family],
  ['backend', r => r.backend],
  ['frames', r => r.frames],
  ['drawCalls', r => r.metrics.drawCalls],
  ['batches', r => r.metrics.batches],
  ['instances', r => r.metrics.instances],
  ['visibleNodes', r => r.metrics.visibleNodes],
  ['culledNodes', r => r.metrics.culledNodes],
  ['textureBinds', r => r.metrics.textureBinds],
  ['samplerBinds', r => r.metrics.samplerBinds],
  ['programChanges', r => r.metrics.programChanges],
  ['blendChanges', r => r.metrics.blendChanges],
  ['bufferUploads', r => r.metrics.bufferUploads],
  ['uploadedBufferBytes', r => r.metrics.uploadedBufferBytes],
  ['transformRows', r => r.metrics.transformRows],
  ['transformUploads', r => r.metrics.transformUploads],
  ['transformUploadBytes', r => r.metrics.transformUploadBytes],
  ['geometryRebuilds', r => r.metrics.geometryRebuilds],
  ['cpuMedianMs', r => round(r.timing.cpuMedianMs)],
  ['cpuP95Ms', r => round(r.timing.cpuP95Ms)],
  ['cpuMeanMs', r => round(r.timing.cpuMeanMs)],
];

export const resultsToCsv = (results: readonly ScenarioResult[]): string => {
  const header = CSV_COLUMNS.map(([name]) => name).join(',');
  const rows = results.map(result => CSV_COLUMNS.map(([, get]) => get(result)).join(','));

  return [header, ...rows].join('\n');
};

/** A scenarios-only CSV (no measurements) describing the catalog axes. */
export const scenariosToCsv = (results: readonly ScenarioResult[]): string => {
  const tagKeys = [...new Set(results.flatMap(r => Object.keys(r.tags)))];
  const header = ['scenario', 'family', ...tagKeys].join(',');
  const rows = results.map(r => ['scenario' in r ? r.scenario : '', r.family, ...tagKeys.map(k => r.tags[k] ?? '')].join(','));

  return [header, ...rows].join('\n');
};

const writeFile = (path: string, content: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

/** Write `results.json`, `results.csv`, and `scenarios.csv` to `dir`. */
export const writeSweepOutput = (dir: string, results: readonly ScenarioResult[], meta: SweepMeta): void => {
  writeFile(join(dir, 'results.json'), JSON.stringify({ meta, results }, null, 2));
  writeFile(join(dir, 'results.csv'), resultsToCsv(results));
  writeFile(join(dir, 'scenarios.csv'), scenariosToCsv(results));
};
