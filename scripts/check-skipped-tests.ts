/**
 * Ratchets how many tests a suite run is allowed to skip.
 *
 * A skipped test reports as neither pass nor fail, so it disappears from the
 * summary everyone reads. Every silent-skip defect found so far had the same
 * shape: a `runIf` guard on an environment condition that no lane satisfied, so
 * the test never ran anywhere while the run stayed green — the WeakRef
 * reclamation specs (no `--expose-gc`) and the production-stripping checks (no
 * `dist/` in the unit lane) both sat that way for their whole lifetime.
 *
 * The gate reads the JUnit report a run already produces and compares the skips
 * per file against `skipped-tests-baseline.json`. A file that skips more than
 * its budget fails, and so does a file that skips at all without a recorded
 * budget: a new conditional test has to be a deliberate, reviewed entry.
 *
 * Unlike the typecheck ratchet this one is deliberately one-directional. Skip
 * counts here depend on the environment, not on the tree: the production-
 * stripping checks skip in the unit lane and run in the build lane, so a
 * contributor with a `dist/` legitimately sees fewer skips than CI records.
 * Undershooting therefore prints a note instead of failing — tightening the
 * budget is a judgement call about which lane the number describes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const BASELINE_PATH = resolve(REPO_ROOT, 'scripts', 'skipped-tests-baseline.json');
const BASELINE_REL = 'scripts/skipped-tests-baseline.json';
const UPDATE_COMMAND = 'pnpm test:skips:update-baseline';
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const DEFAULT_REPORT = 'test-results/unit.junit.xml';

const BASELINE_NOTE =
  'Per-file budget of skipped tests, measured in the CI unit lane. Skipping more than the budget fails `pnpm test:skips`, and so does any skip in a file with no budget — a conditional test must be a reviewed entry, not a quiet default. Skipping fewer only prints a note, because the count depends on the environment (a local `dist/` unskips the production-stripping checks). Run `pnpm test:skips:update-baseline` to record a change.';

interface Baseline {
  note: string;
  files: Record<string, number>;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function reportPath(): string {
  const explicit = process.argv.slice(2).find(arg => !arg.startsWith('--'));

  return resolve(REPO_ROOT, explicit ?? DEFAULT_REPORT);
}

function readBaseline(): Baseline {
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Partial<Baseline>;

    return { note: parsed.note ?? BASELINE_NOTE, files: parsed.files ?? {} };
  } catch {
    return { note: BASELINE_NOTE, files: {} };
  }
}

function writeBaseline(files: Record<string, number>): void {
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));

  writeFileSync(BASELINE_PATH, `${JSON.stringify({ note: BASELINE_NOTE, files: sorted }, null, 2)}\n`, 'utf8');
}

/**
 * Sums the `skipped` attribute per suite file. Vitest emits one `<testsuite>`
 * per file per project, so a file collected by two projects contributes twice —
 * which is what we want to budget for.
 */
function readSkips(xml: string): Record<string, number> {
  const skips: Record<string, number> = {};

  for (const [, attributes] of xml.matchAll(/<testsuite\s([^>]*)>/g)) {
    const name = /\bname="([^"]*)"/.exec(attributes)?.[1];
    const skipped = Number(/\bskipped="(\d+)"/.exec(attributes)?.[1] ?? '0');

    if (name === undefined || skipped === 0) continue;

    skips[name] = (skips[name] ?? 0) + skipped;
  }

  return skips;
}

const path = reportPath();
let xml: string;

try {
  xml = readFileSync(path, 'utf8');
} catch {
  fail(`test:skips: no JUnit report at ${path}. Run the suite with \`--reporter=junit --outputFile.junit=${DEFAULT_REPORT}\` first.`);
}

// An empty or truncated report would read as "nothing skipped" and pass, which
// is the exact failure this gate exists to prevent.
if (!xml.includes('<testsuites')) {
  fail(`test:skips: ${path} is not a JUnit report — refusing to read it as zero skips.`);
}

const actual = readSkips(xml);

if (UPDATE_BASELINE) {
  writeBaseline(actual);

  const total = Object.values(actual).reduce((sum, count) => sum + count, 0);

  console.log(`test:skips: baseline written to ${BASELINE_REL} — ${total} skipped test(s) across ${Object.keys(actual).length} file(s). Commit it.`);
  process.exit(0);
}

const baseline = readBaseline();
const regressions: { file: string; budget: number; actual: number }[] = [];
const improvements: { file: string; budget: number; actual: number }[] = [];

for (const [file, count] of Object.entries(actual)) {
  const budget = baseline.files[file] ?? 0;

  if (count > budget) regressions.push({ file, budget, actual: count });
}

for (const [file, budget] of Object.entries(baseline.files)) {
  const count = actual[file] ?? 0;

  if (count < budget) improvements.push({ file, budget, actual: count });
}

if (regressions.length > 0) {
  for (const { file, budget, actual: count } of regressions.sort((a, b) => a.file.localeCompare(b.file))) {
    const reason = budget === 0 ? 'no recorded budget' : `budget ${budget}`;

    console.error(`  ${file}: ${count} skipped test(s), ${reason}.`);
  }

  fail(
    `test:skips: ${regressions.length} file(s) skip more tests than recorded in ${BASELINE_REL}. ` +
      `A skipped test verifies nothing — make it run, or record the budget with \`${UPDATE_COMMAND}\` and say why in review.`,
  );
}

for (const { file, budget, actual: count } of improvements.sort((a, b) => a.file.localeCompare(b.file))) {
  console.log(
    `  ${file}: ${count} skipped test(s), budget ${budget} — fewer than recorded (environment-dependent; tighten with \`${UPDATE_COMMAND}\` if this is the CI lane).`,
  );
}

const total = Object.values(actual).reduce((sum, count) => sum + count, 0);

console.log(`test:skips: ${total} skipped test(s) across ${Object.keys(actual).length} file(s), all within budget.`);
