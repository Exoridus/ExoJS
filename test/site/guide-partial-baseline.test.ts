/**
 * Tests for scripts/guide-partial-baseline.ts - the ratchet that keeps the
 * guide typecheck gate from silently growing a set of unchecked code blocks.
 *
 * The checked-in baseline itself is asserted against the real extractor output
 * by `pnpm typecheck:guides`; what is tested here is the comparison logic, in
 * particular the two properties that make the ratchet a ratchet: it fails on a
 * decrease as well as an increase, and it budgets per file so one guide's
 * improvement cannot pay for another's regression.
 */

import { diffPartialBaseline, formatBaselineFailure, isBaselineClean, mergePartialBaseline, type PartialBaseline } from '../../scripts/guide-partial-baseline';

const baselineOf = (files: Record<string, number>): PartialBaseline => {
  return { note: 'test', files };
};

describe('diffPartialBaseline', () => {
  test('matching counts are clean', () => {
    const diff = diffPartialBaseline(
      baselineOf({ 'a.mdx': 3, 'b.mdx': 1 }),
      new Map([
        ['a.mdx', 3],
        ['b.mdx', 1],
      ]),
    );

    expect(isBaselineClean(diff)).toBe(true);
  });

  test('an absent file with zero partial blocks is clean', () => {
    const diff = diffPartialBaseline(
      baselineOf({ 'a.mdx': 2 }),
      new Map([
        ['a.mdx', 2],
        ['clean.mdx', 0],
      ]),
    );

    expect(isBaselineClean(diff)).toBe(true);
  });

  test('an increase is a regression', () => {
    const diff = diffPartialBaseline(baselineOf({ 'a.mdx': 3 }), new Map([['a.mdx', 5]]));

    expect(diff.regressions).toEqual([{ file: 'a.mdx', baseline: 3, actual: 5 }]);
    expect(diff.improvements).toEqual([]);
  });

  test('a file that was never recorded regresses from zero', () => {
    const diff = diffPartialBaseline(baselineOf({}), new Map([['new.mdx', 2]]));

    expect(diff.regressions).toEqual([{ file: 'new.mdx', baseline: 0, actual: 2 }]);
  });

  test('a decrease fails too, as an improvement to record', () => {
    const diff = diffPartialBaseline(baselineOf({ 'a.mdx': 3 }), new Map([['a.mdx', 1]]));

    expect(diff.improvements).toEqual([{ file: 'a.mdx', baseline: 3, actual: 1 }]);
    expect(diff.regressions).toEqual([]);
    expect(isBaselineClean(diff)).toBe(false);
  });

  test('a deleted or renamed guide reads as an improvement to zero', () => {
    const diff = diffPartialBaseline(baselineOf({ 'gone.mdx': 4 }), new Map());

    expect(diff.improvements).toEqual([{ file: 'gone.mdx', baseline: 4, actual: 0 }]);
  });

  test('a per-file budget does not let one guide pay for another', () => {
    // Repository-wide the count is unchanged (4 → 4), which a single global
    // number would wave through. Per file it is one regression and one
    // improvement, and both are reported.
    const diff = diffPartialBaseline(
      baselineOf({ 'good.mdx': 3, 'bad.mdx': 1 }),
      new Map([
        ['good.mdx', 0],
        ['bad.mdx', 4],
      ]),
    );

    expect(diff.regressions).toEqual([{ file: 'bad.mdx', baseline: 1, actual: 4 }]);
    expect(diff.improvements).toEqual([{ file: 'good.mdx', baseline: 3, actual: 0 }]);
  });

  test('out-of-scope files are neither compared nor reported', () => {
    // A folder-filtered run never visits `other/`, so its absence from the
    // observed counts must not be read as "went to zero".
    const diff = diffPartialBaseline(baselineOf({ 'assets/a.mdx': 2, 'other/b.mdx': 5 }), new Map([['assets/a.mdx', 2]]), file => file.startsWith('assets/'));

    expect(isBaselineClean(diff)).toBe(true);
  });

  test('results are sorted by file', () => {
    const diff = diffPartialBaseline(
      baselineOf({}),
      new Map([
        ['z.mdx', 1],
        ['a.mdx', 1],
        ['m.mdx', 1],
      ]),
    );

    expect(diff.regressions.map(d => d.file)).toEqual(['a.mdx', 'm.mdx', 'z.mdx']);
  });
});

describe('mergePartialBaseline', () => {
  test('records observed counts and drops files that reached zero', () => {
    const next = mergePartialBaseline(
      baselineOf({ 'a.mdx': 3, 'b.mdx': 2 }),
      new Map([
        ['a.mdx', 0],
        ['b.mdx', 4],
        ['c.mdx', 1],
      ]),
    );

    expect(next.files).toEqual({ 'b.mdx': 4, 'c.mdx': 1 });
  });

  test('preserves entries for files the run did not visit', () => {
    const next = mergePartialBaseline(baselineOf({ 'assets/a.mdx': 3, 'other/b.mdx': 5 }), new Map([['assets/a.mdx', 1]]), file => file.startsWith('assets/'));

    expect(next.files).toEqual({ 'assets/a.mdx': 1, 'other/b.mdx': 5 });
  });

  test('keys are sorted so the committed file has a stable diff', () => {
    const next = mergePartialBaseline(
      baselineOf({}),
      new Map([
        ['z.mdx', 1],
        ['a.mdx', 1],
      ]),
    );

    expect(Object.keys(next.files)).toEqual(['a.mdx', 'z.mdx']);
  });

  test('the note is carried over', () => {
    const next = mergePartialBaseline(baselineOf({}), new Map());

    expect(next.note).toBe('test');
  });
});

describe('formatBaselineFailure', () => {
  test('a regression names the file, the delta and the three ways out', () => {
    const diff = diffPartialBaseline(baselineOf({ 'assets/a.mdx': 1 }), new Map([['assets/a.mdx', 3]]));
    const message = formatBaselineFailure(diff, 'scripts/guide-partial-baseline.json', 'pnpm typecheck:guides:update-baseline');

    expect(message).toContain('assets/a.mdx');
    expect(message).toContain('1 -> 3');
    expect(message).toContain('(+2)');
    expect(message).toContain('SourceSnippet');
    expect(message).toContain('no-check');
  });

  test('an improvement points at the update command instead', () => {
    const diff = diffPartialBaseline(baselineOf({ 'assets/a.mdx': 4 }), new Map([['assets/a.mdx', 0]]));
    const message = formatBaselineFailure(diff, 'scripts/guide-partial-baseline.json', 'pnpm typecheck:guides:update-baseline');

    expect(message).toContain('pnpm typecheck:guides:update-baseline');
    expect(message).toContain('(-4)');
    expect(message).not.toContain('SourceSnippet');
  });

  test('both directions are reported in one run', () => {
    const diff = diffPartialBaseline(
      baselineOf({ 'good.mdx': 3, 'bad.mdx': 1 }),
      new Map([
        ['good.mdx', 0],
        ['bad.mdx', 4],
      ]),
    );
    const message = formatBaselineFailure(diff, 'scripts/guide-partial-baseline.json', 'pnpm typecheck:guides:update-baseline');

    expect(message).toContain('good.mdx');
    expect(message).toContain('bad.mdx');
    expect(message).toContain('SourceSnippet');
    expect(message).toContain('pnpm typecheck:guides:update-baseline');
  });
});
