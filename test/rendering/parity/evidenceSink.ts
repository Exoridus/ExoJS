/**
 * Node-side sink for the parity runner's evidence rows.
 *
 * The runner executes inside the browser and cannot write files, so it hands
 * its rows to this vitest browser command, which runs in the node process.
 * Registered in `vitest.config.ts` under the rendering projects' `browser.commands`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** How thoroughly a (scene, property) pair was proven on one backend. */
export type EvidenceClass = 'exact' | 'oracle' | 'tolerant' | 'sampled' | 'none';

/** Whether the feature actually worked there — distinct from how well it was checked. */
export type SupportState = 'supported' | 'divergent' | 'unknown';

export interface EvidenceRow {
  readonly scene: string;
  readonly property: string;
  readonly feature: string;
  readonly browser: string;
  readonly backend: 'webgl2' | 'webgpu';
  readonly support: SupportState;
  readonly evidence: EvidenceClass;
  /** Largest per-channel deviation observed, when the property measured one. */
  readonly delta: number | null;
  /** Why the row is `unknown`/`none`, when it is. */
  readonly note?: string;
}

const OUTPUT = 'test/rendering/parity/evidence.json';

/**
 * Rows accumulate across spec files within one vitest run: each browser spec
 * calls this as it finishes, and the last write holds the full set.
 */
const collected = new Map<string, EvidenceRow>();

const keyOf = (row: EvidenceRow): string => `${row.browser}|${row.backend}|${row.scene}|${row.property}`;

/** Rows already on disk, minus every browser the current run is reporting on. */
const carriedOverRows = (target: string, reportedBrowsers: ReadonlySet<string>): EvidenceRow[] => {
  if (!existsSync(target)) return [];

  try {
    const previous = JSON.parse(readFileSync(target, 'utf8')) as EvidenceRow[];

    return previous.filter(row => !reportedBrowsers.has(row.browser));
  } catch {
    // A corrupt or hand-edited artifact is replaced rather than merged into.
    return [];
  }
};

/**
 * Merges rows into the run's collection and rewrites the artifact.
 *
 * A run only ever speaks for the browsers it actually exercised: rows for other
 * browsers are carried over from the existing file, so running the Chromium
 * lane does not erase what the Firefox lane recorded. Rows for a browser that
 * *is* in this run are fully replaced, so stale combinations disappear when a
 * scene or property is removed.
 *
 * Returns the row count so a spec can assert the handoff happened rather than
 * trusting a silent void.
 */
export const writeParityEvidence = (_ctx: unknown, rows: readonly EvidenceRow[]): number => {
  for (const row of rows) {
    collected.set(keyOf(row), row);
  }

  const target = resolve(process.cwd(), OUTPUT);
  const reportedBrowsers = new Set([...collected.values()].map(row => row.browser));
  const merged = [...carriedOverRows(target, reportedBrowsers), ...collected.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

  return merged.length;
};

/** Drops everything collected so far; the runner calls this once per run. */
export const resetParityEvidence = (): number => {
  collected.clear();

  return 0;
};
