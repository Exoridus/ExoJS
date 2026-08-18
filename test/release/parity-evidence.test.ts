/**
 * The release-time half of the parity matrix: whether the evidence may be
 * claimed for a version, and what the claim looks like once stamped.
 *
 * The measurement half lives in `test/rendering/parity/` and runs in browsers.
 * These are pure functions over an already-recorded document, so they run
 * anywhere.
 */
import { describe, expect, it } from 'vitest';

import {
  type EvidenceDocument,
  type EvidenceRow,
  type EvidenceStamp,
  GUARANTEED_BROWSERS,
  parseEvidence,
  staleEvidenceReasons,
  stampRelease,
} from '../../scripts/release/parity-evidence';

const row = (browser: string, extra: Partial<EvidenceRow> = {}): EvidenceRow => ({
  browser,
  backend: 'webgl2',
  support: 'supported',
  ...extra,
});

/** A document whose every named browser carries one row and one stamp. */
const doc = (stamps: Record<string, EvidenceStamp>, extraRows: readonly EvidenceRow[] = []): EvidenceDocument => ({
  stamps,
  rows: [...Object.keys(stamps).map(browser => row(browser)), ...extraRows],
});

describe('staleEvidenceReasons', () => {
  it('accepts evidence measured on the released commit', () => {
    expect(staleEvidenceReasons(doc({ chromium: { commit: 'abc1234' }, firefox: { commit: 'abc1234' } }), 'abc1234')).toEqual([]);
  });

  it('rejects a browser measured on an older commit, naming both commits', () => {
    const [reason, ...rest] = staleEvidenceReasons(doc({ chromium: { commit: 'abc1234' }, firefox: { commit: 'old0000' } }), 'abc1234');

    expect(rest).toEqual([]);
    expect(reason).toContain('firefox');
    expect(reason).toContain('old0000');
    expect(reason).toContain('abc1234');
  });

  it('rejects a guaranteed browser with no rows at all', () => {
    expect(staleEvidenceReasons(doc({ chromium: { commit: 'abc1234' } }), 'abc1234')).toEqual(['firefox: no rows at all']);
  });

  it('rejects rows whose browser was never stamped', () => {
    const orphaned: EvidenceDocument = { stamps: { chromium: { commit: 'abc1234' } }, rows: [row('chromium'), row('firefox')] };
    const [reason] = staleEvidenceReasons(orphaned, 'abc1234');

    expect(reason).toBe('firefox: rows present but never stamped');
  });

  it('reports every stale browser rather than stopping at the first', () => {
    const stale = staleEvidenceReasons(doc({ chromium: { commit: 'old0000' }, firefox: { commit: 'old0000' } }), 'abc1234');

    expect(stale).toHaveLength(GUARANTEED_BROWSERS.length);
  });

  it('ignores browsers outside the guarantee, however stale', () => {
    // They still render in the table as data — they are simply not something a
    // release promises to keep current, so they must never block a cut.
    const rows = doc({ chromium: { commit: 'abc1234' }, firefox: { commit: 'abc1234' }, webkit: { commit: 'ancient' } });

    expect(staleEvidenceReasons(rows, 'abc1234')).toEqual([]);
  });

  it('names a stale commit once however many rows that browser has', () => {
    const many = doc({ chromium: { commit: 'abc1234' }, firefox: { commit: 'old0000' } }, [row('firefox'), row('firefox')]);
    const [reason] = staleEvidenceReasons(many, 'abc1234');

    expect(reason.match(/old0000/g)).toHaveLength(1);
  });
});

describe('stampRelease', () => {
  it('stamps the version onto guaranteed browsers only', () => {
    const stamped = stampRelease(doc({ chromium: { commit: 'a' }, firefox: { commit: 'a' }, webkit: { commit: 'a' } }), '0.16.0');

    expect(
      Object.entries(stamped.stamps)
        .filter(([, stamp]) => stamp.release === '0.16.0')
        .map(([browser]) => browser),
    ).toEqual(['chromium', 'firefox']);
    expect(stamped.stamps.webkit?.release).toBeUndefined();
  });

  it('overwrites a previous release rather than accumulating claims', () => {
    const stamped = stampRelease(doc({ chromium: { commit: 'a', release: '0.15.2' } }), '0.16.0');

    expect(stamped.stamps.chromium?.release).toBe('0.16.0');
  });

  it('does not mutate the document it was given', () => {
    const original = doc({ chromium: { commit: 'a' } });

    stampRelease(original, '0.16.0');

    expect(original.stamps.chromium?.release).toBeUndefined();
  });

  it('leaves every other stamp field untouched', () => {
    const stamped = stampRelease(doc({ chromium: { commit: 'abc1234', measuredAt: '2026-08-03', platform: 'win32' } }), '0.16.0');

    expect(stamped.stamps.chromium).toMatchObject({ measuredAt: '2026-08-03', platform: 'win32', commit: 'abc1234' });
  });

  it('carries the rows through unchanged', () => {
    const original = doc({ chromium: { commit: 'a' } });

    expect(stampRelease(original, '0.16.0').rows).toEqual(original.rows);
  });
});

describe('parseEvidence', () => {
  it('rejects a bare array — the pre-stamp shape is no longer accepted', () => {
    expect(() => parseEvidence(JSON.stringify([row('chromium')]))).toThrow(/must contain an object/i);
  });

  it('rejects a payload without stamps', () => {
    expect(() => parseEvidence('{"rows":[]}')).toThrow(/"stamps" object/i);
  });

  it('rejects a payload without rows', () => {
    expect(() => parseEvidence('{"stamps":{}}')).toThrow(/"rows" array/i);
  });

  it('reads a well-formed document', () => {
    const parsed = parseEvidence(JSON.stringify(doc({ chromium: { commit: 'abc1234' } })));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.stamps.chromium?.commit).toBe('abc1234');
  });
});
