/**
 * Node-side sink for the parity runner's evidence rows.
 *
 * The runner executes inside the browser and cannot write files, so it hands
 * its rows to this vitest browser command, which runs in the node process.
 * Registered in `vitest.config.ts` under the rendering projects' `browser.commands`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * How much a (scene, property) pair actually proves on one backend.
 *
 * This is the strength of the check, never its outcome — `delta` carries the
 * outcome. A row can read `frame-equal` with `delta: 0` and still be weaker
 * evidence than a `traced` row with the same delta, because a solid-colour
 * texture renders identically whether or not the UVs were mirrored.
 *
 * - `traced` — every output pixel checked against the one texel it must have
 *   come from. Needs a self-describing fixture under nearest sampling.
 * - `frame-equal` — every pixel compared, but no pixel traceable to a source
 *   texel: the frames match, which is weaker than each pixel being right.
 * - `oracle` — compared against an expectation computed independently of the
 *   renderer, so agreeing backends can still both be wrong and be caught.
 * - `tolerant` — compared within a tolerance rather than for equality.
 * - `sampled` — only some pixels looked at.
 * - `none` — nothing established; see `note` for why.
 */
export type EvidenceClass = 'traced' | 'frame-equal' | 'oracle' | 'tolerant' | 'sampled' | 'none';

/**
 * Whether the feature actually worked there — distinct from how well it was checked.
 *
 * `unavailable` is a finding, not a gap: the browser has no such backend, so
 * there is nothing to verify and never will be until it ships one. `unknown`
 * means the check could have run and did not — a lost device, a browser we
 * have not measured yet.
 */
export type SupportState = 'supported' | 'divergent' | 'unavailable' | 'unknown';

export interface EvidenceRow {
  readonly scene: string;
  readonly property: string;
  readonly feature: string;
  readonly browser: string;
  readonly backend: 'webgl2' | 'webgpu';
  readonly support: SupportState;
  /** How strong the check was — not what it found. */
  readonly evidence: EvidenceClass;
  /** Largest per-channel deviation observed, when the property measured one. */
  readonly delta: number | null;
  /** Why the row is `unavailable`/`unknown`/`none`, when it is. */
  readonly note?: string;
}

/**
 * A row as it is stored: what the runner observed, plus when and from where.
 *
 * Chromium re-measures on every CI run, Firefox and WebKit only when someone
 * runs them on a machine with a display. Without a stamp the file would read
 * as uniformly current, so a stale WebKit row would look exactly like a fresh
 * Chromium one. Day resolution keeps the diff quiet — the question a reader
 * has is "how old is this", not "at what second".
 */
export interface StampedEvidenceRow extends EvidenceRow {
  /** `YYYY-MM-DD` of the run that produced this row. */
  readonly measuredAt: string;
  /** Short commit the run was made from, or `unknown` outside a git checkout. */
  readonly commit: string;
  /**
   * Host platform of the run (`win32`, `darwin`, `linux`).
   *
   * The same browser name means different things per platform: Playwright's
   * WebKit on Windows has no WebGPU at all, while Safari on macOS may. Without
   * this, a Windows probe would file an `unavailable` that reads as a statement
   * about Safari.
   */
  readonly platform: string;
}

const OUTPUT = 'test/rendering/parity/evidence.json';

/**
 * Rows accumulate across spec files within one vitest run: each browser spec
 * calls this as it finishes, and the last write holds the full set.
 */
const collected = new Map<string, StampedEvidenceRow>();

const keyOf = (row: EvidenceRow): string => `${row.browser}|${row.backend}|${row.scene}|${row.property}`;

/** Rows already on disk, minus every browser the current run is reporting on. */
const carriedOverRows = (target: string, reportedBrowsers: ReadonlySet<string>): StampedEvidenceRow[] => {
  if (!existsSync(target)) return [];

  try {
    const previous = JSON.parse(readFileSync(target, 'utf8')) as StampedEvidenceRow[];

    return previous.filter(row => !reportedBrowsers.has(row.browser));
  } catch {
    // A corrupt or hand-edited artifact is replaced rather than merged into.
    return [];
  }
};

/** The commit under measurement; `unknown` when git is absent or the call fails. */
const currentCommit = (): string => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
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
  const measuredAt = new Date().toISOString().slice(0, 10);
  const commit = currentCommit();
  const { platform } = process;

  for (const row of rows) {
    collected.set(keyOf(row), { ...row, measuredAt, commit, platform });
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
