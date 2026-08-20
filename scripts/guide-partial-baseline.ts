/**
 * Ratchet for guide code blocks the snippet extractor cannot check.
 *
 * `extract-guide-snippets.ts` sorts every fenced ts/js block in the guide into
 * four buckets: STANDALONE and BARE are type-checked, `no-check` blocks are
 * skipped because the author explicitly said so, and `partial` blocks are
 * skipped because the extractor could not make sense of them - silently, and
 * with nothing in the MDX to show for it. That last bucket is the hole this
 * module closes: it is the only one where a block escapes the gate without
 * anyone having decided that it should.
 *
 * The budget is kept PER GUIDE FILE rather than as one repository-wide number.
 * A single total lets a migrated chapter pay for a newly sloppy one - the
 * count stays flat while coverage quietly moves from a well-covered page to a
 * bad one. Per file, that trade is impossible: an increase anywhere is a
 * failure regardless of what happened elsewhere.
 *
 * The ratchet turns in both directions:
 *   - actual > baseline → failure. A new unchecked block appeared.
 *   - actual < baseline → failure too, with a friendlier message. Without it
 *     the recorded numbers would drift upward from reality and stop being a
 *     budget at all; `--update-baseline` writes the improvement back.
 *
 * Guides with no `partial` blocks are simply absent from the baseline, so the
 * file shrinks as chapters are migrated and disappears entirely once the last
 * one is done.
 */

import { readFileSync, writeFileSync } from 'node:fs';

/** On-disk shape of `guide-partial-baseline.json`. */
export interface PartialBaseline {
  /** Human-readable reminder of what the numbers mean, carried in the file itself. */
  note: string;
  /** Guide-relative MDX path (forward slashes) → accepted count of `partial` blocks. */
  files: Record<string, number>;
}

/** One guide file whose `partial` count no longer matches its recorded budget. */
export interface BaselineDelta {
  file: string;
  baseline: number;
  actual: number;
}

export interface BaselineDiff {
  /** Files that gained `partial` blocks (or appeared with some, unrecorded). */
  regressions: BaselineDelta[];
  /** Files that lost `partial` blocks - the baseline needs to follow them down. */
  improvements: BaselineDelta[];
}

/** True when the diff is clean and the gate should pass. */
export function isBaselineClean(diff: BaselineDiff): boolean {
  return diff.regressions.length === 0 && diff.improvements.length === 0;
}

function byFile(a: BaselineDelta, b: BaselineDelta): number {
  return a.file.localeCompare(b.file);
}

/**
 * Compares the counts observed in this run against the recorded budget.
 *
 * @param baseline  - Recorded budget, keyed by guide-relative MDX path.
 * @param actual    - Counts observed in this run. Files with zero `partial`
 *                    blocks may be omitted or present as `0` - both mean the
 *                    same thing.
 * @param inScope   - Whether a guide file was visited by this run at all.
 *                    A folder-filtered run (`GUIDE_SNIPPET_FOLDERS`) never sees
 *                    the other folders' files, and their absence from `actual`
 *                    must not read as "went to zero".
 */
export function diffPartialBaseline(
  baseline: PartialBaseline,
  actual: ReadonlyMap<string, number>,
  inScope: (file: string) => boolean = () => true,
): BaselineDiff {
  const regressions: BaselineDelta[] = [];
  const improvements: BaselineDelta[] = [];

  const files = new Set<string>([...Object.keys(baseline.files), ...actual.keys()]);

  for (const file of files) {
    if (!inScope(file)) continue;

    const recorded = baseline.files[file] ?? 0;
    const observed = actual.get(file) ?? 0;

    if (observed > recorded) {
      regressions.push({ file, baseline: recorded, actual: observed });
    } else if (observed < recorded) {
      improvements.push({ file, baseline: recorded, actual: observed });
    }
  }

  return { regressions: regressions.sort(byFile), improvements: improvements.sort(byFile) };
}

/**
 * Produces the next baseline: observed counts for every file this run visited,
 * recorded counts preserved for every file it did not (folder-filtered runs).
 * Zero-count files are dropped so the file only ever lists real debt.
 */
export function mergePartialBaseline(
  baseline: PartialBaseline,
  actual: ReadonlyMap<string, number>,
  inScope: (file: string) => boolean = () => true,
): PartialBaseline {
  const merged: Record<string, number> = {};

  for (const [file, count] of Object.entries(baseline.files)) {
    if (!inScope(file) && count > 0) merged[file] = count;
  }

  for (const [file, count] of actual) {
    if (inScope(file) && count > 0) merged[file] = count;
  }

  const files: Record<string, number> = {};
  for (const file of Object.keys(merged).sort()) files[file] = merged[file];

  return { note: baseline.note, files };
}

function formatRows(deltas: readonly BaselineDelta[]): string {
  const width = deltas.reduce((max, d) => Math.max(max, d.file.length), 0);

  return deltas
    .map(d => {
      const sign = d.actual > d.baseline ? '+' : '';

      return `    ${d.file.padEnd(width)}  ${d.baseline} -> ${d.actual}  (${sign}${d.actual - d.baseline})`;
    })
    .join('\n');
}

/**
 * The failure report. Both directions are reported together when both are
 * present, so one run tells the whole story.
 *
 * @param baselinePath - Repo-relative path of the baseline file, for the
 *                       "commit this" instruction.
 * @param updateCommand - The pnpm script that rewrites the baseline.
 */
export function formatBaselineFailure(diff: BaselineDiff, baselinePath: string, updateCommand: string): string {
  const sections: string[] = [];

  if (diff.regressions.length > 0) {
    sections.push(
      [
        `guide-snippets: ${diff.regressions.length} guide file(s) gained code blocks the typecheck gate cannot see.`,
        '',
        formatRows(diff.regressions),
        '',
        'A `partial` block is a ts/js fence the extractor could not turn into checkable',
        'code, so nothing verifies it against the engine. Resolve each new one by:',
        '',
        '  1. Moving the code into a real, type-checked source file (an example under',
        '     `examples/`), marking it with `// #region guide:<name>` … `// #endregion',
        '     guide:<name>`, and embedding it with',
        '     <SourceSnippet source="examples/<file>.ts" region="<name>" title="…" />.',
        '     This is the preferred fix — the snippet then cannot drift from working code.',
        '',
        '  2. Giving the block enough context to stand on its own (its `import` lines, or',
        '     the enclosing method signature), so the extractor can check it in place.',
        '',
        '  3. Tagging the fence ```ts no-check when the block genuinely is not checkable —',
        '     a bare configuration object literal, pseudo-code, a deliberately incomplete',
        '     line. That is a decision on the record, which is the point; it is not a way',
        '     to silence real code.',
      ].join('\n'),
    );
  }

  if (diff.improvements.length > 0) {
    sections.push(
      [
        `guide-snippets: ${diff.improvements.length} guide file(s) now have fewer unchecked blocks than the baseline records.`,
        '',
        formatRows(diff.improvements),
        '',
        'Nothing is broken — the ratchet just needs tightening so the budget cannot',
        'drift back up later:',
        '',
        `    ${updateCommand}`,
        '',
        `Then commit ${baselinePath}.`,
      ].join('\n'),
    );
  }

  return sections.join('\n\n');
}

/** Reads the baseline, tolerating a missing file (treated as "no budget anywhere"). */
export function readPartialBaseline(path: string, fallbackNote: string): PartialBaseline {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<PartialBaseline>;

    return { note: parsed.note ?? fallbackNote, files: parsed.files ?? {} };
  } catch {
    return { note: fallbackNote, files: {} };
  }
}

/** Writes the baseline with the repository's JSON formatting (2 spaces, trailing newline). */
export function writePartialBaseline(path: string, baseline: PartialBaseline): void {
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
}
