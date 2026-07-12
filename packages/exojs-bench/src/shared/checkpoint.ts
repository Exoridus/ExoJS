import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Incremental, crash-safe result sink for a benchmark run (domain-agnostic).
 *
 * The matrix historically wrote ONE report only after every cell had completed,
 * so a single late-cell crash (observed: the Pixi-WebGPU device probe) discarded
 * every already-measured cell in the whole run. This writer persists each cell's
 * result the instant it lands, so a later failure can never lose finished work:
 *
 *  - `checkpoint.jsonl` — one JSON line appended per cell, in completion order.
 *    Append-only, so even a hard process kill leaves every prior line intact.
 *  - `checkpoint.json` — the full array rewritten after each cell, a
 *    convenient single-object view of everything gathered so far.
 *
 * Both files live under the run's output directory and are overwritten fresh at
 * the start of each run (a stale checkpoint from a previous run must never bleed
 * into a new one). The final `results.{json,csv,md}` are still written by the
 * domain's report writer once the run completes; the checkpoint is the safety
 * net for the case where it never gets there.
 *
 * Generic over the record type so any domain (rendering cells today, physics
 * cells tomorrow) can reuse it without this module knowing the record shape.
 */
export interface CheckpointWriter<TRecord> {
  /** Persist one completed record: append a JSONL line and rewrite the aggregate JSON. */
  append(record: TRecord): void;
  /** Every record persisted so far, in completion order. */
  readonly records: readonly TRecord[];
  /** Absolute path of the append-only JSONL checkpoint file. */
  readonly jsonlPath: string;
}

/**
 * Create a {@link CheckpointWriter} rooted at `outDir`. Truncates any prior
 * checkpoint files so a fresh run never inherits stale cells, then persists each
 * appended record immediately (JSONL append + aggregate rewrite).
 */
export const createCheckpointWriter = <TRecord>(outDir: string): CheckpointWriter<TRecord> => {
  mkdirSync(outDir, { recursive: true });

  const jsonlPath = join(outDir, 'checkpoint.jsonl');
  const jsonPath = join(outDir, 'checkpoint.json');
  const records: TRecord[] = [];

  // Truncate both checkpoint files up front so a crash before the first cell
  // still leaves an empty, current-run checkpoint rather than a previous run's.
  writeFileSync(jsonlPath, '');
  writeFileSync(jsonPath, '[]\n');

  return {
    records,
    jsonlPath,
    append(record: TRecord): void {
      records.push(record);
      appendFileSync(jsonlPath, `${JSON.stringify(record)}\n`);
      writeFileSync(jsonPath, `${JSON.stringify(records, null, 2)}\n`);
    },
  };
};

/** Ensure the directory containing `filePath` exists (helper for domain report writers). */
export const ensureDirFor = (filePath: string): void => {
  mkdirSync(dirname(filePath), { recursive: true });
};
