import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { LibraryProvenance, Provenance } from './driver';
import type { CellResult } from './EngineAdapter';

/** Node count at or above which a full-frame time is beyond any interactive budget. */
const FRAME_BUDGET_NODE_THRESHOLD = 100_000;

/** Marker appended to timing columns when the run used a software rasterizer. */
const UNTRUSTED_MARK = 'UNTRUSTED (software rasterizer)';

/** Everything one baseline run produces: the provenance stamps and the per-cell results. */
export interface ReportData {
  /** One provenance stamp per backend exercised. */
  readonly provenance: readonly Provenance[];
  /** Version + resolution provenance for each committed competitor library arm. */
  readonly libraries: readonly LibraryProvenance[];
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
  'warmupFrames',
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
    String(spec.warmupFrames),
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
 * Human-readable Markdown: one provenance block PER BACKEND first (so a reader
 * knows which GPU produced which backend's numbers — presenting a WebGPU row
 * under WebGL2's adapter string would misattribute it), then one table with the
 * structural counters sitting BESIDE the timings — a timing win that came from
 * doing less work must be visible in the same row — and a `note` column so the
 * reason behind an `unavailable`/`exceeded` cell, or a timing sourced from an
 * rAF delta rather than a real GPU timer, is visible in the row it belongs to.
 */
const toMarkdown = (data: ReportData): string => {
  const software = isSoftware(data);
  const lines: string[] = [];

  lines.push('# Baseline Benchmark Results', '');

  // Competitor-library provenance first: any "ExoJS vs X" number is only
  // auditable if the reader can see the exact library version it was measured
  // against and where it resolved from. Versions are pinned exact in
  // `@codexo/exojs-bench`'s devDependencies, so this is the reproducibility
  // receipt, not a moving target.
  lines.push('## Library arms', '');

  if (data.libraries.length === 0) {
    lines.push('- (none — ExoJS-only run)', '');
  } else {
    for (const library of data.libraries) {
      const provenance = library.resolvedFrom.length > 0 ? library.resolvedFrom : 'not resolved';

      lines.push(`- \`${library.name}\` @ **${library.version}** (resolved from: ${provenance})`);
    }

    lines.push('');
  }

  lines.push('## Provenance', '');

  for (const entry of data.provenance) {
    lines.push(`### ${entry.backend}`, '');
    lines.push(`- Adapter (GPU): ${entry.adapter}`);
    lines.push(`- Flags: ${entry.flags.map(flag => `\`${flag}\``).join(' ')}`);
    lines.push(`- Headless: ${String(entry.headless)}`);
    lines.push(`- Engine version: ${entry.engineVersion}`);
    lines.push(`- Timestamp: ${entry.timestamp}`);
    lines.push(`- Software rasterizer: ${String(entry.software)}`);

    if (entry.software) {
      lines.push('', `**SOFTWARE RASTERIZER — TIMINGS UNTRUSTED FOR ${entry.backend}**`);
    }

    lines.push('');
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
    'warmupFrames',
    'timedFrames',
    'status',
    'note',
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
      String(spec.warmupFrames),
      String(spec.timedFrames),
      result.status,
      (result.note ?? '').replaceAll('|', '\\|'),
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
