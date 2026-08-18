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

/** Provenance of one browser's rows. Owned by the runner, except `release`. */
export interface EvidenceStamp {
  commit: string;
  measuredAt?: string;
  platform?: string;
  release?: string;
}

export interface EvidenceRow {
  browser: string;
  [key: string]: unknown;
}

/**
 * The artifact: one stamp per browser, then the observations.
 *
 * Provenance lives beside the rows rather than on them so a re-measurement that
 * finds nothing new changes one line instead of every one - see
 * `test/rendering/parity/evidenceSink.ts` for the full reasoning.
 */
export interface EvidenceDocument {
  stamps: Record<string, EvidenceStamp>;
  rows: EvidenceRow[];
}

export function parseEvidence(json: string): EvidenceDocument {
  const parsed: unknown = JSON.parse(json);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${EVIDENCE_PATH} must contain an object with "stamps" and "rows".`);
  }

  const { stamps, rows } = parsed as Partial<EvidenceDocument>;

  if (typeof stamps !== 'object' || stamps === null || Array.isArray(stamps)) {
    throw new Error(`${EVIDENCE_PATH} must contain a "stamps" object keyed by browser.`);
  }

  if (!Array.isArray(rows)) {
    throw new Error(`${EVIDENCE_PATH} must contain a "rows" array.`);
  }

  return { stamps, rows };
}

export function readEvidence(repoRoot: string): EvidenceDocument {
  return parseEvidence(readFileSync(`${repoRoot}/${EVIDENCE_PATH}`, 'utf8'));
}

/**
 * Why the evidence cannot be claimed for `head`, one line per guaranteed
 * browser. Empty means it is current and the cut may proceed.
 *
 * `head` is HEAD as it stands *before* the release script creates its bump
 * commit — that is the tree the measurement ran against.
 */
export function staleEvidenceReasons(doc: EvidenceDocument, head: string): string[] {
  const reasons: string[] = [];

  for (const browser of GUARANTEED_BROWSERS) {
    if (!doc.rows.some(row => row.browser === browser)) {
      reasons.push(`${browser}: no rows at all`);
      continue;
    }

    const stamp = doc.stamps[browser];

    if (stamp === undefined) {
      reasons.push(`${browser}: rows present but never stamped`);
      continue;
    }

    if (stamp.commit !== head) {
      reasons.push(`${browser}: measured at ${stamp.commit}, HEAD is ${head}`);
    }
  }

  return reasons;
}

/**
 * Stamps the release onto every guaranteed browser, returning a new document.
 *
 * The parity runner cannot do this: it executes before the release, when
 * `package.json` still carries the previous version. It owns
 * `measuredAt`/`commit`/`platform`; `release` is the release step's field.
 *
 * Non-guaranteed browsers are left untouched - stamping them would extend the
 * claim to rows nobody promised to keep current.
 */
export function stampRelease(doc: EvidenceDocument, version: string): EvidenceDocument {
  const stamps: Record<string, EvidenceStamp> = {};

  for (const [browser, stamp] of Object.entries(doc.stamps)) {
    stamps[browser] = (GUARANTEED_BROWSERS as readonly string[]).includes(browser) ? { ...stamp, release: version } : stamp;
  }

  return { stamps, rows: doc.rows };
}

export function writeEvidence(repoRoot: string, doc: EvidenceDocument): void {
  writeFileSync(`${repoRoot}/${EVIDENCE_PATH}`, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}
