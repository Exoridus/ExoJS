/**
 * Enforces the `no-check` fence-meta convention in the guide content:
 *
 *   ```ts no-check -- <reason>
 *
 * A `no-check` block tells `extract-guide-snippets.ts` to skip a fenced
 * ts/tsx/js/javascript block entirely — nothing ever type-checks it. Until now
 * that was a bare opt-out: any author could silence any block with no record
 * of why. This closes that gap the same way `guide-partial-baseline.ts` closes
 * the `partial`-block one (imported and reused here, unmodified — the ratchet
 * shape is identical, only what gets counted differs): a per-file,
 * monotonically-decreasing budget of "no-check blocks that still lack a
 * reason", frozen at the count measured when this gate shipped — see
 * `guide-no-check-baseline.json`.
 *
 * Deliberately NOT a hard "every no-check needs a reason, starting today"
 * rule: none of the pre-existing no-check blocks carried one yet when this
 * gate was written, and retrofitting all of them is follow-up work, not this
 * gate (converting guide content is explicitly out of scope here). Instead:
 *   - A NEW no-check-without-reason block pushes its file's count over the
 *     recorded budget -> ratchet regression -> fails, exactly like `partial`.
 *   - Giving an EXISTING no-check block a reason removes it from the count,
 *     shrinking the budget -> improvement -> `--update-baseline` records it.
 *   - A no-check block WITH a reason never counts against the budget at all,
 *     new or old — so the practical effect is "a no-check needs a reason
 *     unless you are (knowingly) spending down inherited, reviewed debt in
 *     that same file."
 *
 * This does not replace `extract-guide-snippets.ts`'s own `no-check` handling
 * (a plain `meta.includes('no-check')` check) — a reason sits right after
 * `no-check` on the same fence-meta line without breaking that check, so no
 * change there is needed or made. This script re-parses the same fences
 * independently (mirroring `extract-guide-snippets.ts`'s own `CHECKED_LANGS` +
 * `FENCE_RE`) rather than importing from the extractor, so the count matches
 * what that script actually processes — NOT a raw text grep, which also
 * matches fences the extractor cannot see at all (`FENCE_RE` anchors
 * `` ^``` `` at column 0, so a list-indented fence is invisible to both the
 * extractor and this gate) — and so this gate can run standalone, before the
 * much heavier extraction + typecheck pass.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  diffPartialBaseline,
  isBaselineClean,
  mergePartialBaseline,
  readPartialBaseline,
  writePartialBaseline,
  type BaselineDiff,
} from './guide-partial-baseline.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const GUIDE_DIR = join(REPO_ROOT, 'site', 'src', 'content', 'guide');
const BASELINE_PATH = join(REPO_ROOT, 'scripts', 'guide-no-check-baseline.json');
const BASELINE_REL = 'scripts/guide-no-check-baseline.json';
const UPDATE_COMMAND = 'pnpm typecheck:guides:no-check:update-baseline';
const UPDATE_BASELINE = process.argv.includes('--update-baseline');

const BASELINE_NOTE =
  'Per-guide budget of `no-check` code blocks with no recorded reason (```ts no-check -- <reason>). ' +
  'A no-check block silences the guide typecheck gate entirely, so a bare no-check with nothing ' +
  'after it must be spending down this frozen, file-scoped budget, not a fresh, unreviewed decision. ' +
  'The count may only go down; both an increase and an un-recorded decrease fail ' +
  '`pnpm typecheck:guides:no-check`. ' +
  `Run \`${UPDATE_COMMAND}\` to record a decrease (adding a reason, or removing the block, both shrink it). ` +
  'A guide with no such blocks is absent from this file.';

// Mirrors extract-guide-snippets.ts's own fence scan (CHECKED_LANGS + FENCE_RE)
// exactly, so the count here matches what that script actually processes.
const CHECKED_LANGS = new Set(['ts', 'tsx', 'typescript', 'js', 'javascript']);
const FENCE_RE = /^```(?<lang>[a-zA-Z]+)?(?<meta>[^\n]*)?\n(?<body>[\s\S]*?)^```/gm;

// A reason is anything non-whitespace after `no-check`, once an optional
// `--` / `:` / em-dash separator is stripped: ```ts no-check -- pseudo-code```
// and ```ts no-check: pseudo-code``` both count; a bare ```ts no-check``` does not.
const NO_CHECK_REASON_RE = /\bno-check\b\s*(?:--|:|—)?\s*(.*)$/;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function walkFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...walkFiles(full, predicate));
    } else if (predicate(entry.name)) {
      results.push(full);
    }
  }

  return results;
}

interface NoCheckBlock {
  readonly file: string;
  readonly hasReason: boolean;
}

/** Every `no-check` fenced ts/tsx/js/javascript block in the guide tree, with whether its meta carries a reason. */
function scanGuide(): NoCheckBlock[] {
  const files = walkFiles(GUIDE_DIR, name => name.endsWith('.mdx') || name.endsWith('.md'));
  const blocks: NoCheckBlock[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const rel = relative(GUIDE_DIR, file).replaceAll('\\', '/');

    for (const match of content.matchAll(FENCE_RE)) {
      const lang = (match.groups?.lang ?? '').toLowerCase();
      const meta = match.groups?.meta ?? '';

      if (!CHECKED_LANGS.has(lang) || !meta.includes('no-check')) continue;

      const reason = (NO_CHECK_REASON_RE.exec(meta)?.[1] ?? '').trim();

      blocks.push({ file: rel, hasReason: reason.length > 0 });
    }
  }

  return blocks;
}

function formatRows(deltas: BaselineDiff['regressions']): string {
  const width = deltas.reduce((max, d) => Math.max(max, d.file.length), 0);

  return deltas.map(d => `    ${d.file.padEnd(width)}  ${d.baseline} -> ${d.actual}  (${d.actual > d.baseline ? '+' : ''}${d.actual - d.baseline})`).join('\n');
}

function formatFailure(diff: BaselineDiff): string {
  const sections: string[] = [];

  if (diff.regressions.length > 0) {
    sections.push(
      [
        `typecheck:guides:no-check: ${diff.regressions.length} guide file(s) gained a no-check block with no recorded reason.`,
        '',
        formatRows(diff.regressions),
        '',
        'A bare ```ts no-check has no record of why the block is unchecked. Resolve each new one by:',
        '',
        '  1. Adding a reason on the same fence-meta line: ```ts no-check -- <why this cannot type-check>.',
        '     This is the preferred fix — the decision then lives right where a reader sees it.',
        '',
        '  2. Making the block checkable instead (see the `partial`-block guidance in',
        '     guide-partial-baseline.ts) so it does not need `no-check` at all.',
        '',
        `If the new count is correct and reviewed, run \`${UPDATE_COMMAND}\` and commit ${BASELINE_REL}.`,
      ].join('\n'),
    );
  }

  if (diff.improvements.length > 0) {
    sections.push(
      [
        `typecheck:guides:no-check: ${diff.improvements.length} guide file(s) now have fewer reason-less no-check blocks than the baseline records.`,
        '',
        formatRows(diff.improvements),
        '',
        'Nothing is broken — the ratchet just needs tightening so the budget cannot drift back up later:',
        '',
        `    ${UPDATE_COMMAND}`,
        '',
        `Then commit ${BASELINE_REL}.`,
      ].join('\n'),
    );
  }

  return sections.join('\n\n');
}

const blocks = scanGuide();

if (blocks.length === 0) {
  fail(
    `typecheck:guides:no-check: found zero no-check blocks under ${relative(REPO_ROOT, GUIDE_DIR)} — the scan itself is almost certainly broken, not the guide content.`,
  );
}

const withReason = blocks.filter(b => b.hasReason).length;
const withoutReason = blocks.length - withReason;

const withoutReasonByFile = new Map<string, number>();

for (const block of blocks) {
  if (block.hasReason) continue;

  withoutReasonByFile.set(block.file, (withoutReasonByFile.get(block.file) ?? 0) + 1);
}

console.log(`typecheck:guides:no-check: ${blocks.length} no-check block(s) total — ${withReason} with a recorded reason, ${withoutReason} without.`);

const baseline = readPartialBaseline(BASELINE_PATH, BASELINE_NOTE);

if (UPDATE_BASELINE) {
  const next = mergePartialBaseline({ ...baseline, note: BASELINE_NOTE }, withoutReasonByFile);

  writePartialBaseline(BASELINE_PATH, next);

  const budget = Object.values(next.files).reduce((sum, count) => sum + count, 0);

  console.log(
    `typecheck:guides:no-check: baseline written to ${BASELINE_REL} — ${budget} reason-less no-check block(s) across ${Object.keys(next.files).length} file(s). Commit it.`,
  );
  process.exit(0);
}

const diff = diffPartialBaseline(baseline, withoutReasonByFile);

if (!isBaselineClean(diff)) {
  console.error(`\n${formatFailure(diff)}\n`);
  process.exit(1);
}

console.log('typecheck:guides:no-check: all within budget.');
