/**
 * The release-time half of the parity matrix: whether the evidence may be
 * claimed for a version, and what the claim looks like once stamped.
 *
 * The measurement half lives in `test/rendering/parity/` and runs in browsers.
 * These are pure functions over already-recorded rows, so they run anywhere.
 */
import { describe, expect, it } from 'vitest';

import { type EvidenceRow, GUARANTEED_BROWSERS, parseEvidence, staleEvidenceReasons, stampRelease } from '../../scripts/release/parity-evidence';

const row = (browser: string, commit: string, extra: Partial<EvidenceRow> = {}): EvidenceRow => ({
  browser,
  commit,
  backend: 'webgl2',
  support: 'supported',
  ...extra,
});

describe('staleEvidenceReasons', () => {
  it('accepts evidence measured on the released commit', () => {
    const rows = [row('chromium', 'abc1234'), row('firefox', 'abc1234')];

    expect(staleEvidenceReasons(rows, 'abc1234')).toEqual([]);
  });

  it('rejects a browser measured on an older commit, naming both commits', () => {
    const rows = [row('chromium', 'abc1234'), row('firefox', 'old0000')];
    const [reason, ...rest] = staleEvidenceReasons(rows, 'abc1234');

    expect(rest).toEqual([]);
    expect(reason).toContain('firefox');
    expect(reason).toContain('old0000');
    expect(reason).toContain('abc1234');
  });

  it('rejects a guaranteed browser with no rows at all', () => {
    const rows = [row('chromium', 'abc1234')];

    expect(staleEvidenceReasons(rows, 'abc1234')).toEqual(['firefox: no rows at all']);
  });

  it('reports every stale browser rather than stopping at the first', () => {
    const rows = [row('chromium', 'old0000'), row('firefox', 'old0000')];

    expect(staleEvidenceReasons(rows, 'abc1234')).toHaveLength(GUARANTEED_BROWSERS.length);
  });

  it('ignores browsers outside the guarantee, however stale', () => {
    // They still render in the table as data — they are simply not something a
    // release promises to keep current, so they must never block a cut.
    const rows = [row('chromium', 'abc1234'), row('firefox', 'abc1234'), row('webkit', 'ancient')];

    expect(staleEvidenceReasons(rows, 'abc1234')).toEqual([]);
  });

  it('collapses repeated stale commits instead of listing one per row', () => {
    const rows = [row('chromium', 'abc1234'), row('firefox', 'old0000'), row('firefox', 'old0000'), row('firefox', 'old0000')];
    const [reason] = staleEvidenceReasons(rows, 'abc1234');

    expect(reason.match(/old0000/g)).toHaveLength(1);
  });
});

describe('stampRelease', () => {
  it('stamps the version onto guaranteed browsers only', () => {
    const rows = [row('chromium', 'abc1234'), row('firefox', 'abc1234'), row('webkit', 'abc1234')];
    const stamped = stampRelease(rows, '0.16.0');

    expect(stamped.filter(r => r.release === '0.16.0').map(r => r.browser)).toEqual(['chromium', 'firefox']);
    expect(stamped.find(r => r.browser === 'webkit')?.release).toBeUndefined();
  });

  it('overwrites a previous release rather than accumulating claims', () => {
    const rows = [row('chromium', 'abc1234', { release: '0.15.2' })];

    expect(stampRelease(rows, '0.16.0')[0]?.release).toBe('0.16.0');
  });

  it('does not mutate the rows it was given', () => {
    const rows = [row('chromium', 'abc1234')];

    stampRelease(rows, '0.16.0');

    expect(rows[0]?.release).toBeUndefined();
  });

  it('leaves every other field untouched', () => {
    const rows = [row('chromium', 'abc1234', { measuredAt: '2026-08-03', platform: 'win32' })];
    const [stamped] = stampRelease(rows, '0.16.0');

    expect(stamped).toMatchObject({ measuredAt: '2026-08-03', platform: 'win32', commit: 'abc1234' });
  });
});

describe('parseEvidence', () => {
  it('rejects a payload that is not an array', () => {
    expect(() => parseEvidence('{"browser":"chromium"}')).toThrow(/must contain an array/i);
  });

  it('reads a well-formed array', () => {
    expect(parseEvidence(JSON.stringify([row('chromium', 'abc1234')]))).toHaveLength(1);
  });
});
