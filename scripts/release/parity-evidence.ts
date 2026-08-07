/**
 * The parity matrix as a release claim.
 *
 * `test/rendering/parity/evidence.json` is measured by the browser suite and
 * published on the site, linked from the deployment and troubleshooting guides.
 * A release therefore states "as of this version, this parity holds" — a claim
 * that is only honest if the evidence was measured on the commit being released.
 *
 * Kept apart from `cut.ts` so it can be tested without executing the release
 * script, whose module body runs the whole cut on import.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Browsers the published claim covers.
 *
 * Others may appear in the evidence and render in the table as data; they are
 * simply not part of what a release guarantees, so a missing or stale row for
 * them never blocks a cut.
 */
export const GUARANTEED_BROWSERS = ['chromium', 'firefox'] as const;

export const EVIDENCE_PATH = 'test/rendering/parity/evidence.json';

export interface EvidenceRow {
  browser: string;
  commit: string;
  release?: string;
  [key: string]: unknown;
}

export function parseEvidence(json: string): EvidenceRow[] {
  const parsed: unknown = JSON.parse(json);

  if (!Array.isArray(parsed)) {
    throw new Error(`${EVIDENCE_PATH} must contain an array of evidence rows.`);
  }

  return parsed as EvidenceRow[];
}

export function readEvidence(repoRoot: string): EvidenceRow[] {
  return parseEvidence(readFileSync(`${repoRoot}/${EVIDENCE_PATH}`, 'utf8'));
}

/**
 * Why the evidence cannot be claimed for `head`, one line per guaranteed
 * browser. Empty means it is current and the cut may proceed.
 *
 * `head` is HEAD as it stands *before* the release script creates its bump
 * commit — that is the tree the measurement ran against.
 */
export function staleEvidenceReasons(rows: readonly EvidenceRow[], head: string): string[] {
  const reasons: string[] = [];

  for (const browser of GUARANTEED_BROWSERS) {
    const forBrowser = rows.filter(row => row.browser === browser);

    if (forBrowser.length === 0) {
      reasons.push(`${browser}: no rows at all`);
      continue;
    }

    const mismatched = [...new Set(forBrowser.filter(row => row.commit !== head).map(row => row.commit))];

    if (mismatched.length > 0) {
      reasons.push(`${browser}: measured at ${mismatched.join(', ')}, HEAD is ${head}`);
    }
  }

  return reasons;
}

/**
 * Stamps the release onto every guaranteed-browser row, returning the new rows.
 *
 * The parity runner cannot do this: it executes before the release, when
 * `package.json` still carries the previous version. It owns
 * `measuredAt`/`commit`/`platform`; `release` is the release step's field.
 *
 * Non-guaranteed browsers are left untouched — stamping them would extend the
 * claim to rows nobody promised to keep current.
 */
export function stampRelease(rows: readonly EvidenceRow[], version: string): EvidenceRow[] {
  return rows.map(row => ((GUARANTEED_BROWSERS as readonly string[]).includes(row.browser) ? { ...row, release: version } : row));
}

export function writeEvidence(repoRoot: string, rows: readonly EvidenceRow[]): void {
  writeFileSync(`${repoRoot}/${EVIDENCE_PATH}`, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
}
