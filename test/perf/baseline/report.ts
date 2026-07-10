import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Provenance } from './driver';
import type { CellResult } from './EngineAdapter';

/** Node count at or above which a full-frame time is beyond any interactive budget. */
const FRAME_BUDGET_NODE_THRESHOLD = 100_000;

/** Marker appended to timing columns when the run used a software rasterizer. */
const UNTRUSTED_MARK = 'UNTRUSTED (software rasterizer)';

/** Everything one baseline run produces: the provenance stamps and the per-cell results. */
export interface ReportData {
  /** One provenance stamp per backend exercised. */
  readonly provenance: readonly Provenance[];
  /** One result per matrix cell. */
  readonly results: readonly CellResult[];
}

/** Formats a millisecond figure to three decimals, or `n/a` when unavailable. */
const ms = (value: number | null): string => (value === null ? 'n/a' : value.toFixed(3));

/** Formats a structural counter: integers stay integers, uneven per-frame totals keep two decimals. */
const count = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(2));

/** True when any provenance stamp reports a software rasterizer. */
const isSoftware = (data: ReportData): boolean => data.provenance.some(entry => entry.software);

/** The `frameMsMedian` cell text, suffixed `beyond-frame-budget` past the node threshold. */
const frameMedianCell = (result: CellResult): string => {
  const base = ms(result.frameMsMedian);

  return result.spec.nodeCount >= FRAME_BUDGET_NODE_THRESHOLD ? `${base} beyond-frame-budget` : base;
};

/** Ordered columns shared by the CSV and the Markdown table. */
const CSV_HEADER = [
  'engine',
  'config',
  'backend',
  'archetype',
  'nodeCount',
  'timedFrames',
  'cpuMsMedian',
  'cpuMsP95',
  'frameMsMedian',
  'frameMsP95',
  'drawCalls',
  'textureBinds',
  'bufferUploads',
  'frameBudget',
  'status',
  'note',
] as const;

/** Escapes a CSV field, quoting when it holds a comma, quote or newline. */
const csvField = (value: string): string => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

const toCsvRow = (result: CellResult): string => {
  const { spec, structural } = result;
  const beyondBudget = spec.nodeCount >= FRAME_BUDGET_NODE_THRESHOLD ? 'beyond-frame-budget' : '';
  const fields = [
    spec.engine,
    spec.config,
    spec.backend,
    spec.archetype,
    String(spec.nodeCount),
    String(spec.timedFrames),
    ms(result.cpuMsMedian),
    ms(result.cpuMsP95),
    ms(result.frameMsMedian),
    ms(result.frameMsP95),
    count(structural.drawCalls),
    count(structural.textureBinds),
    count(structural.bufferUploads),
    beyondBudget,
    result.status,
    result.note ?? '',
  ];

  return fields.map(csvField).join(',');
};

const toCsv = (data: ReportData): string => [CSV_HEADER.join(','), ...data.results.map(toCsvRow)].join('\n');

/**
 * Human-readable Markdown: the provenance block first (so a reader knows which
 * GPU produced the numbers), then one table with the structural counters sitting
 * BESIDE the timings — a timing win that came from doing less work must be
 * visible in the same row.
 */
const toMarkdown = (data: ReportData): string => {
  const software = isSoftware(data);
  const first = data.provenance[0];
  const backends = data.provenance.map(entry => entry.backend).join(', ');
  const lines: string[] = [];

  lines.push('# Baseline Benchmark Results', '');
  lines.push('## Provenance', '');

  if (first !== undefined) {
    lines.push(`- Adapter (GPU): ${first.adapter}`);
    lines.push(`- Backend(s): ${backends}`);
    lines.push(`- Flags: ${first.flags.map(flag => `\`${flag}\``).join(' ')}`);
    lines.push(`- Headless: ${String(first.headless)}`);
    lines.push(`- Engine version: ${first.engineVersion}`);
    lines.push(`- Timestamp: ${first.timestamp}`);
    lines.push(`- Software rasterizer: ${String(software)}`);
  }

  lines.push('');

  if (software) {
    lines.push('**SOFTWARE RASTERIZER — TIMINGS UNTRUSTED**', '');
  }

  lines.push('## Results', '');

  // Annotate the timing column headers when timings are untrusted; structural
  // counters stay unannotated because they remain valid on a software rasterizer.
  const timingSuffix = software ? ` — ${UNTRUSTED_MARK}` : '';
  const header = [
    'engine',
    'config',
    'backend',
    'archetype',
    'nodeCount',
    `cpuMsMedian${timingSuffix}`,
    `cpuMsP95${timingSuffix}`,
    `frameMsMedian${timingSuffix}`,
    'drawCalls',
    'textureBinds',
    'bufferUploads',
    'timedFrames',
    'status',
  ];

  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);

  for (const result of data.results) {
    const { spec, structural } = result;
    const row = [
      spec.engine,
      spec.config,
      spec.backend,
      spec.archetype,
      String(spec.nodeCount),
      ms(result.cpuMsMedian),
      ms(result.cpuMsP95),
      frameMedianCell(result),
      count(structural.drawCalls),
      count(structural.textureBinds),
      count(structural.bufferUploads),
      String(spec.timedFrames),
      result.status,
    ];

    lines.push(`| ${row.join(' | ')} |`);
  }

  lines.push('');

  return lines.join('\n');
};

/**
 * Writes the three report artifacts into `outDir`:
 * - `results.json` — full fidelity (provenance + every result field).
 * - `results.csv` — one row per cell, machine-parseable.
 * - `results.md` — provenance block plus a human-readable table.
 */
export const writeReport = (data: ReportData, outDir: string): void => {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'results.json'), `${JSON.stringify(data, null, 2)}\n`);
  writeFileSync(join(outDir, 'results.csv'), `${toCsv(data)}\n`);
  writeFileSync(join(outDir, 'results.md'), toMarkdown(data));
};
