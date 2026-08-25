/**
 * Typechecks the guide snippets extracted by extract-guide-snippets.ts.
 *
 * This exists instead of a plain `tsc -p tsconfig.guides.json` because that
 * config maps `@codexo/exojs` onto `src/index.ts`, which pulls the whole engine
 * into the program. `tsc` reports diagnostics for those dependency files too,
 * under a compiler configuration the engine and the packages never build with
 * - they have their own, stricter gate. Acting on such a diagnostic means
 * editing library source to satisfy a documentation check, which is backwards,
 * so this reports only diagnostics that belong to a generated snippet.
 *
 * Diagnostics with no file at all (bad config, missing lib) are always
 * reported: those are failures of the gate itself, not of a dependency.
 *
 * A `no-check`-tagged fence never reaches this program at all - it is dropped
 * before extraction (see `extract-guide-snippets.ts`), which is exactly the
 * blind spot `check-guide-no-check-reasons.ts` (run right before this script
 * in `pnpm typecheck:guides`, see package.json) exists to budget: a per-file,
 * frozen, monotonically-decreasing ratchet on `no-check` blocks that carry no
 * recorded reason, the same shape as this file's own `partial`-block budget
 * (`guide-partial-baseline.ts`) but for a different bucket.
 */
import { relative, resolve } from 'node:path';

import ts from 'typescript';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const CONFIG_PATH = resolve(REPO_ROOT, 'tsconfig.guides.json');
const SNIPPET_DIR = resolve(REPO_ROOT, process.env.GUIDE_SNIPPET_OUT ?? '.workspace/generated/guide-typecheck');

const FORMAT_HOST: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: fileName => fileName,
  getCurrentDirectory: () => REPO_ROOT,
  getNewLine: () => ts.sys.newLine,
};

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const configFile = ts.readConfigFile(CONFIG_PATH, ts.sys.readFile);

if (configFile.error) {
  fail(ts.formatDiagnosticsWithColorAndContext([configFile.error], FORMAT_HOST));
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, REPO_ROOT, undefined, CONFIG_PATH);

if (parsed.errors.length > 0) {
  fail(ts.formatDiagnosticsWithColorAndContext(parsed.errors, FORMAT_HOST));
}

const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });

const isSnippetDiagnostic = (diagnostic: ts.Diagnostic): boolean => {
  if (diagnostic.file === undefined) {
    return true;
  }

  const relativePath = relative(SNIPPET_DIR, resolve(diagnostic.file.fileName));

  return relativePath.length > 0 && !relativePath.startsWith('..');
};

const diagnostics = ts.getPreEmitDiagnostics(program).filter(isSnippetDiagnostic);

if (diagnostics.length > 0) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, FORMAT_HOST));
  console.error(`typecheck:guides: ${diagnostics.length} error(s) in extracted guide snippets.`);
  process.exit(1);
}

console.log(`typecheck:guides: ${parsed.fileNames.length} snippet file(s) checked, no errors.`);
