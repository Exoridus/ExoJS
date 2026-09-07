import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { LibraryProvenance } from './provenance';
import type { BaseCellResult } from './result';

/**
 * Domain-agnostic report-writing primitives.
 *
 * Both domains emit the same three artifacts - a full-fidelity `results.json`, a
 * machine-parseable `results.csv`, and a human-readable `results.md` - and share
 * the same value-formatting and CSV-escaping rules. What differs is the COLUMN
 * SET (draw calls / GPU frame time for rendering, body/contact counts / step
 * time for physics); each domain builds its own rows and table, then hands the
 * three rendered strings here to be written together.
 *
 * A report directory accumulates: a run narrowed to a few cells merges into the
 * `results.json` already there instead of replacing it, so a matrix built up
 * over several invocations (one archetype re-measured after a change, one
 * backend at a time) keeps every cell it has collected. The merge rules live in
 * {@link mergeCellResults} and {@link mergeLibraries}; each domain decides how
 * its provenance stamp combines.
 */

/** Formats a millisecond figure to three decimals, or `n/a` when unavailable. */
export const formatMs = (value: number | null): string => (value === null ? 'n/a' : value.toFixed(3));

/** Formats a structural counter: integers stay integers, uneven per-step/frame totals keep two decimals. */
export const formatCount = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(2));

/** Escapes a CSV field, quoting when it holds a comma, quote or newline. */
export const csvField = (value: string): string => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

/**
 * A spec's identity as a string: every field in a fixed key order, so two
 * results describe the same cell exactly when their specs are field-for-field
 * equal. Spec types hold only primitives, which is what makes this exact.
 */
const specKey = (spec: object): string => JSON.stringify(Object.fromEntries(Object.entries(spec).sort(([a], [b]) => a.localeCompare(b))));

/**
 * Merge one run's cell results into the results a report directory already
 * holds.
 *
 * An incoming cell replaces the existing cell with the same spec only when it
 * completed (`status: 'ok'`); an `exceeded` or `unavailable` result never
 * overwrites a measurement, because it carries no value that could stand in for
 * one. A cell with no existing counterpart is appended whatever its status, so
 * a first attempt that aborted is still on record. Existing cells keep their
 * position; new ones follow in incoming order.
 *
 * A cell kept from an earlier run keeps that run's provenance. Re-measuring the
 * whole matrix on a machine where a cell that used to pass now aborts leaves
 * the old value in place under the new stamp, and the `results.md` table does
 * not flag it. Delete `results.json` before a run that must stand on its own.
 */
export const mergeCellResults = <TResult extends BaseCellResult<object>>(existing: readonly TResult[], incoming: readonly TResult[]): TResult[] => {
  const merged = [...existing];
  const indexByKey = new Map(existing.map((result, index) => [specKey(result.spec), index]));

  for (const result of incoming) {
    const key = specKey(result.spec);
    const index = indexByKey.get(key);

    if (index === undefined) {
      indexByKey.set(key, merged.length);
      merged.push(result);
    } else if (result.status === 'ok') {
      merged[index] = result;
    }
  }

  return merged;
};

/**
 * Merge one run's library arm versions into those already on record. An
 * incoming entry that resolved replaces the existing one for that package; one
 * that did not (`not-installed`) is kept only when the package has no entry
 * yet, so a narrowed run that never loaded the competitors does not erase the
 * versions a full run recorded.
 */
export const mergeLibraries = (existing: readonly LibraryProvenance[], incoming: readonly LibraryProvenance[]): LibraryProvenance[] => {
  const merged = [...existing];
  const indexByName = new Map(existing.map((entry, index) => [entry.name, index]));

  for (const entry of incoming) {
    const index = indexByName.get(entry.name);

    if (index === undefined) {
      indexByName.set(entry.name, merged.length);
      merged.push(entry);
    } else if (entry.resolvedFrom.length > 0) {
      merged[index] = entry;
    }
  }

  return merged;
};

/**
 * The report `outDir` already holds, parsed, or `undefined` when there is none.
 * A `results.json` that exists but does not parse is an error rather than a
 * fresh start: replacing it would discard whatever the file still held, and the
 * caller could not tell that from an empty directory.
 */
export const readExistingReport = <TData>(outDir: string): TData | undefined => {
  const path = join(outDir, 'results.json');

  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as TData;
  } catch (error) {
    throw new Error(`could not parse the existing ${path}; move it aside before writing a new report`, { cause: error });
  }
};

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
