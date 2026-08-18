/**
 * Ratchets how many tests a suite run is allowed to skip.
 *
 * A skipped test reports as neither pass nor fail, so it disappears from the
 * summary everyone reads. Every silent-skip defect found so far had the same
 * shape: a `runIf` guard on an environment condition that no lane satisfied, so
 * the test never ran anywhere while the run stayed green - the WeakRef
 * reclamation specs (no `--expose-gc`) and the production-stripping checks (no
 * `dist/` in the unit lane) both sat that way for their whole lifetime. A
 * dynamic `ctx.skip('WebGPU device lost mid-test - …')` inside a test body is
 * the same class of blind spot, just runtime instead of `runIf` - it counts
 * here exactly like a statically-skipped test.
 *
 * The gate reads EVERY JUnit report under `test-results/*.junit.xml` - not
 * just the unit lane - and compares the summed skips per suite file against
 * `skipped-tests-baseline.json`. Each CI test lane (unit, browser-webgl,
 * browser-webgpu, browser-webgl-firefox, browser-audio, browser-tilemap-worker)
 * writes its own JUnit file; a dedicated `skip-budget` CI job downloads all of
 * them into `test-results/` before running this script, so the budget is ONE
 * global number per suite file, not one per lane - a file's runtime skips in
 * the WebGPU lane and its static skips in the unit lane land in the same
 * ledger entry. A file that skips more than its budget fails, and so does a
 * file that skips at all without a recorded budget: a new conditional test has
 * to be a deliberate, reviewed entry.
 *
 * Unlike the typecheck ratchet this one is deliberately one-directional. Skip
 * counts here depend on the environment, not on the tree: the production-
 * stripping checks skip in the unit lane and run in the build lane, so a
 * contributor running only some lanes locally legitimately sees fewer skips
 * than the full CI aggregate records. Undershooting therefore prints a note
 * instead of failing - tightening the budget is a judgement call about
 * whether the lower count describes every lane or just the ones that ran.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const BASELINE_PATH = resolve(REPO_ROOT, 'scripts', 'skipped-tests-baseline.json');
const BASELINE_REL = 'scripts/skipped-tests-baseline.json';
const UPDATE_COMMAND = 'pnpm test:skips:update-baseline';
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const DEFAULT_REPORT_DIR = 'test-results';
const DEFAULT_REPORT_GLOB = `${DEFAULT_REPORT_DIR}/*.junit.xml`;

const BASELINE_NOTE =
  "Per-file budget of skipped tests, measured as the SUM across every CI test lane (unit + browser-webgl + browser-webgpu + browser-webgl-firefox + browser-audio + browser-tilemap-worker), aggregated from each lane's own JUnit report — one global budget, not one per lane. Skipping more than the budget fails `pnpm test:skips`, and so does any skip in a file with no budget — a conditional test (including a runtime `ctx.skip(...)`) must be a reviewed entry, not a quiet default. Skipping fewer only prints a note, because the count depends on which lanes actually ran (a local partial run, or a local `dist/` that unskips the production-stripping checks). Run `pnpm test:skips:update-baseline` against a full set of lane reports to record a change.";

interface Baseline {
  note: string;
  files: Record<string, number>;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * Explicit report paths from the CLI, or every `*.junit.xml` under
 * `test-results/` sorted for determinism - one file per lane in CI (see the
 * `skip-budget` job), or whichever lanes a local run happened to produce.
 */
function reportPaths(): string[] {
  const explicit = process.argv.slice(2).filter(arg => !arg.startsWith('--'));

  if (explicit.length > 0) {
    return explicit.map(arg => resolve(REPO_ROOT, arg));
  }

  const dir = resolve(REPO_ROOT, DEFAULT_REPORT_DIR);

  try {
    return readdirSync(dir)
      .filter(name => name.endsWith('.junit.xml'))
      .sort()
      .map(name => resolve(dir, name));
  } catch {
    return [];
  }
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
 * per file per project, so a file collected by two projects - or, now, by two
 * separate CI lanes reading their own JUnit report - contributes twice, which
 * is what we want to budget for: one global count per file across everything.
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

function mergeSkips(perFile: readonly Record<string, number>[]): Record<string, number> {
  const merged: Record<string, number> = {};

  for (const skips of perFile) {
    for (const [name, count] of Object.entries(skips)) {
      merged[name] = (merged[name] ?? 0) + count;
    }
  }

  return merged;
}

const paths = reportPaths();

if (paths.length === 0) {
  fail(
    `test:skips: no JUnit reports found (looked for ${DEFAULT_REPORT_GLOB}). Run one or more lanes with ` +
      `\`--reporter=junit --outputFile.junit=./${DEFAULT_REPORT_DIR}/<lane>.junit.xml\` first, or pass explicit report paths.`,
  );
}

const perFileSkips = paths.map(path => {
  let xml: string;

  try {
    xml = readFileSync(path, 'utf8');
  } catch {
    return fail(`test:skips: no JUnit report at ${path}.`);
  }

  // An empty or truncated report would read as "nothing skipped" and pass,
  // which is the exact failure this gate exists to prevent.
  if (!xml.includes('<testsuites')) {
    fail(`test:skips: ${path} is not a JUnit report — refusing to read it as zero skips.`);
  }

  return readSkips(xml);
});

const actual = mergeSkips(perFileSkips);

if (UPDATE_BASELINE) {
  writeBaseline(actual);

  const total = Object.values(actual).reduce((sum, count) => sum + count, 0);

  console.log(
    `test:skips: baseline written to ${BASELINE_REL} — ${total} skipped test(s) across ${Object.keys(actual).length} file(s), ` +
      `aggregated from ${paths.length} JUnit report(s). Commit it.`,
  );
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

console.log(
  `test:skips: ${total} skipped test(s) across ${Object.keys(actual).length} file(s), aggregated from ${paths.length} JUnit report(s), all within budget.`,
);
