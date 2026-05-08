/**
 * Shared benchmark harness for ExoJS performance benchmarks.
 *
 * Each domain (rendering, audio, collision, scene-graph, interaction) imports
 * the types and helpers it needs.  The harness itself has no domain
 * knowledge — it only measures wall-clock time and writes JSON + Markdown
 * output to test/perf/results/.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BenchmarkScenario {
  readonly name: string;
  /** Optional setup called once before the timed loop. */
  setup?(): void;
  /** Called once per iteration (frame). */
  tick(iteration: number): void;
  /** Optional teardown called once after the timed loop. */
  teardown?(): void;
}

export interface BenchmarkResult {
  readonly scenario: string;
  readonly iterations: number;
  readonly avgMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  /** Domain-specific extra columns — may be undefined for non-rendering runs. */
  readonly extra?: Readonly<Record<string, number | string>>;
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

export const runScenario = (scenario: BenchmarkScenario, iterations = 240): BenchmarkResult => {
  scenario.setup?.();

  const times = new Array<number>(iterations);

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    scenario.tick(i);
    times[i] = performance.now() - t0;
  }

  scenario.teardown?.();

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const t of times) {
    sum += t;
    if (t < min) min = t;
    if (t > max) max = t;
  }

  return {
    scenario: scenario.name,
    iterations,
    avgMs: Number((sum / iterations).toFixed(4)),
    minMs: Number(min.toFixed(4)),
    maxMs: Number(max.toFixed(4)),
  };
};

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const resultsDir = resolve(dirname(fileURLToPath(import.meta.url)), 'results');

export interface ColumnDef {
  key: keyof BenchmarkResult | string;
  header: string;
  align?: 'left' | 'right';
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'scenario', header: 'Scenario', align: 'left' },
  { key: 'iterations', header: 'Iterations', align: 'right' },
  { key: 'avgMs', header: 'Avg ms', align: 'right' },
  { key: 'minMs', header: 'Min ms', align: 'right' },
  { key: 'maxMs', header: 'Max ms', align: 'right' },
];

const getCellValue = (result: BenchmarkResult, key: string): string => {
  if (key in result) {
    return String(result[key as keyof BenchmarkResult] ?? '');
  }

  // Peek into extra fields
  return String(result.extra?.[key] ?? '');
};

export const formatResults = (results: readonly BenchmarkResult[], columns: readonly ColumnDef[] = DEFAULT_COLUMNS): string => {
  // Build widths
  const widths = columns.map(col => Math.max(col.header.length, ...results.map(r => getCellValue(r, col.key).length)));

  const pad = (s: string, w: number, align: 'left' | 'right' = 'left'): string => (align === 'right' ? s.padStart(w) : s.padEnd(w));

  const header = `| ${columns.map((col, i) => pad(col.header, widths[i], col.align)).join(' | ')} |`;
  const separator = `| ${widths.map((w, i) => (columns[i].align === 'right' ? '-'.repeat(w - 1) + ':' : '-'.repeat(w))).join(' | ')} |`;
  const rows = results.map(r => `| ${columns.map((col, i) => pad(getCellValue(r, col.key), widths[i], col.align)).join(' | ')} |`);

  return [header, separator, ...rows].join('\n');
};

/**
 * Returns a short identifier for the current build state, used as a suffix
 * for benchmark output files. Format: `{version}-{shortSha}`, e.g.
 * `0.7.11-c2cb133`. Falls back to just `{version}` when not in a git
 * repository or git is unavailable.
 *
 * Files are commit-named so multiple local runs over time accumulate in
 * `test/perf/results/` without overwriting each other — useful for diffing
 * perf characteristics across versions / commits. All result files are
 * gitignored; the suffix is purely a local-retention convenience.
 */
const buildIdentifier = (() => {
  let version = 'unknown';
  try {
    const pkg = JSON.parse(readFileSync(resolve(resultsDir, '../../../package.json'), 'utf-8')) as { version?: string };
    if (typeof pkg.version === 'string') version = pkg.version;
  } catch {
    // ignore
  }

  let sha = '';
  try {
    sha = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    // ignore — not in a git repo or git unavailable
  }

  return sha ? `${version}-${sha}` : version;
})();

export const writeResults = (filename: string, sectionTitle: string, results: readonly BenchmarkResult[], columns?: readonly ColumnDef[]): void => {
  mkdirSync(resultsDir, { recursive: true });

  const suffixedName = `${filename}-${buildIdentifier}`;

  // JSON
  const jsonPath = resolve(resultsDir, `${suffixedName}.json`);
  writeFileSync(jsonPath, JSON.stringify(results, null, 2) + '\n', 'utf-8');

  // Markdown
  const table = formatResults(results, columns);
  const md = `# ${sectionTitle} (${buildIdentifier})\n\n${table}\n`;
  const mdPath = resolve(resultsDir, `${suffixedName}.md`);
  writeFileSync(mdPath, md, 'utf-8');

  console.log(`\nResults written to:\n  ${jsonPath}\n  ${mdPath}`);
};
