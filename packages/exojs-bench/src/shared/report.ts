import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Domain-agnostic report-writing primitives (review #325: the report skeleton
 * was rendering-coupled and living under `rendering/`).
 *
 * Both domains emit the same three artifacts — a full-fidelity `results.json`, a
 * machine-parseable `results.csv`, and a human-readable `results.md` — and share
 * the same value-formatting and CSV-escaping rules. What differs is the COLUMN
 * SET (draw calls / GPU frame time for rendering, body/contact counts / step
 * time for physics); each domain builds its own rows and table, then hands the
 * three rendered strings here to be written together.
 */

/** Formats a millisecond figure to three decimals, or `n/a` when unavailable. */
export const formatMs = (value: number | null): string => (value === null ? 'n/a' : value.toFixed(3));

/** Formats a structural counter: integers stay integers, uneven per-step/frame totals keep two decimals. */
export const formatCount = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(2));

/** Escapes a CSV field, quoting when it holds a comma, quote or newline. */
export const csvField = (value: string): string => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

/** The three rendered report artifacts, already formatted by the domain. */
export interface ReportArtifacts {
  /** Full-fidelity JSON (provenance + every result field). */
  readonly json: string;
  /** One row per cell, machine-parseable. */
  readonly csv: string;
  /** Provenance block plus a human-readable table. */
  readonly md: string;
}

/**
 * Write the three report artifacts into `outDir` as `results.{json,csv,md}`,
 * creating the directory if needed. The domain renders the strings; this writes
 * them with one consistent naming/layout contract.
 */
export const writeReportArtifacts = (outDir: string, artifacts: ReportArtifacts): void => {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'results.json'), artifacts.json);
  writeFileSync(join(outDir, 'results.csv'), artifacts.csv);
  writeFileSync(join(outDir, 'results.md'), artifacts.md);
};
