/**
 * Type-checks `test/**` against `test/tsconfig.json` and ratchets what is left.
 *
 * The root `tsconfig.json` includes `src/**` only, so until now no compiler
 * ever looked at the test tree. Vitest does not typecheck and esbuild only
 * strips annotations, which means a test can misuse an API and still pass -
 * the mock swallows the call, and the test protects nothing while looking like
 * protection.
 *
 * Turning the whole tree green in one go is not realistic, so the gate is a
 * ratchet instead: every file that still has errors carries its accepted count
 * in `test-typecheck-baseline.json`, and the numbers may only go down. A file
 * absent from the baseline must be clean. The ratchet turns in both
 * directions - an unrecorded improvement fails too, otherwise the recorded
 * numbers drift away from reality and stop being a budget. Run
 * `pnpm typecheck:test:update-baseline` to record a decrease.
 *
 * Only diagnostics for files under `test/` are considered. The program also
 * pulls in `src/`, the workspace packages and a few scripts as dependencies;
 * those compile under this config's deliberately looser options, not their own,
 * and each has its own gate. Acting on such a diagnostic would mean editing
 * library source to satisfy a test-tree check, which is backwards. Diagnostics
 * with no file at all (bad config, missing lib) are always reported: those are
 * failures of the gate itself.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import ts from 'typescript';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const TEST_DIR = resolve(REPO_ROOT, 'test');
const CONFIG_PATH = resolve(TEST_DIR, 'tsconfig.json');
const BASELINE_PATH = resolve(REPO_ROOT, 'scripts', 'test-typecheck-baseline.json');
const BASELINE_REL = 'scripts/test-typecheck-baseline.json';
const UPDATE_COMMAND = 'pnpm typecheck:test:update-baseline';
const UPDATE_BASELINE = process.argv.includes('--update-baseline');

const BASELINE_NOTE =
  'Per-file budget of type errors in `test/**` that predate the gate. The count may only go down; both an increase and an un-recorded decrease fail `pnpm typecheck:test`. Run `pnpm typecheck:test:update-baseline` to record a decrease. A clean test file is absent from this file.';

interface Baseline {
  note: string;
  files: Record<string, number>;
}

const FORMAT_HOST: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: fileName => fileName,
  getCurrentDirectory: () => REPO_ROOT,
  getNewLine: () => ts.sys.newLine,
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
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

const configFile = ts.readConfigFile(CONFIG_PATH, ts.sys.readFile);

if (configFile.error) {
  fail(ts.formatDiagnosticsWithColorAndContext([configFile.error], FORMAT_HOST));
}

// Relative paths in the config - `include`, `paths`, `exclude` - are resolved
// against the directory the config lives in, not the repository root. Passing
// the wrong base leaves every workspace `paths` mapping pointing one level off,
// which surfaces as a wall of TS2307 rather than as a config error.
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, TEST_DIR, undefined, CONFIG_PATH);

if (parsed.errors.length > 0) {
  fail(ts.formatDiagnosticsWithColorAndContext(parsed.errors, FORMAT_HOST));
}

const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });

/** Repo-relative, forward-slashed path, or `null` for anything outside `test/`. */
function testRelativePath(diagnostic: ts.Diagnostic): string | null {
  if (diagnostic.file === undefined) {
    return null;
  }

  const relativePath = relative(TEST_DIR, resolve(diagnostic.file.fileName));

  if (relativePath.length === 0 || relativePath.startsWith('..')) {
    return null;
  }

  return `test/${relativePath.split('\\').join('/')}`;
}

const all = ts.getPreEmitDiagnostics(program);
const configErrors = all.filter(diagnostic => diagnostic.file === undefined);

if (configErrors.length > 0) {
  fail(ts.formatDiagnosticsWithColorAndContext(configErrors, FORMAT_HOST));
}

const byFile = new Map<string, ts.Diagnostic[]>();

for (const diagnostic of all) {
  const file = testRelativePath(diagnostic);

  if (file === null) {
    continue;
  }

  const bucket = byFile.get(file);

  if (bucket === undefined) {
    byFile.set(file, [diagnostic]);
  } else {
    bucket.push(diagnostic);
  }
}

const actual: Record<string, number> = {};

for (const [file, diagnostics] of byFile) {
  actual[file] = diagnostics.length;
}

if (UPDATE_BASELINE) {
  writeBaseline(actual);

  const total = Object.values(actual).reduce((sum, count) => sum + count, 0);

  console.log(`typecheck:test: baseline written to ${BASELINE_REL} — ${total} error(s) across ${Object.keys(actual).length} file(s). Commit it.`);
  process.exit(0);
}

const baseline = readBaseline();
const regressions: { file: string; baseline: number; actual: number }[] = [];
const improvements: { file: string; baseline: number; actual: number }[] = [];

for (const [file, count] of Object.entries(actual)) {
  const budget = baseline.files[file] ?? 0;

  if (count > budget) {
    regressions.push({ file, baseline: budget, actual: count });
  } else if (count < budget) {
    improvements.push({ file, baseline: budget, actual: count });
  }
}

for (const [file, budget] of Object.entries(baseline.files)) {
  if (actual[file] === undefined && budget > 0) {
    improvements.push({ file, baseline: budget, actual: 0 });
  }
}

if (regressions.length > 0) {
  for (const { file, baseline: budget, actual: count } of regressions.sort((a, b) => a.file.localeCompare(b.file))) {
    const diagnostics = byFile.get(file) ?? [];

    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, FORMAT_HOST));
    console.error(`  ${file}: ${count} error(s), budget ${budget}.`);
  }

  fail(`typecheck:test: ${regressions.length} file(s) above their recorded budget in ${BASELINE_REL}.`);
}

if (improvements.length > 0) {
  for (const { file, baseline: budget, actual: count } of improvements.sort((a, b) => a.file.localeCompare(b.file))) {
    console.error(`  ${file}: ${count} error(s), budget ${budget} — the budget must follow it down.`);
  }

  fail(`typecheck:test: ${improvements.length} file(s) improved. Run \`${UPDATE_COMMAND}\` and commit ${BASELINE_REL}.`);
}

const total = Object.values(actual).reduce((sum, count) => sum + count, 0);

console.log(
  `typecheck:test: ${parsed.fileNames.length} file(s) checked, ${total} known error(s) across ${Object.keys(actual).length} file(s), all within budget.`,
);
