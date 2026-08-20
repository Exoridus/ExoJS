import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findFiles, isTranspiledExampleSource, transpileExampleSource } from './transpile-examples.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const examplesDir = path.resolve(repoRoot, 'examples');
const tmpDir = path.resolve(repoRoot, '.workspace', 'tmp-examples-check');

const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;

// The generator always emits LF; a Windows checkout may have normalized the
// committed files to CRLF (core.autocrlf). Compare content, not bytes, so a
// line-ending-only difference never triggers a false positive.
const normalizeNewlines = (content: string): string => content.replace(/\r\n/g, '\n');

const toDisplayPath = (relPath: string): string => `examples/${relPath.split(path.sep).join('/')}`;

// Only files carrying the generator's header are ours to police - a few
// example `.js` files (e.g. examples/shared/runtime.js) are hand-authored
// with no `.ts` source and must not be flagged as stale.
const isGeneratedJs = (filePath: string): boolean => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const prefix = Buffer.alloc('// Auto-generated from '.length);
    fs.readSync(fd, prefix, 0, prefix.length, 0);
    return prefix.toString('utf8') === '// Auto-generated from ';
  } finally {
    fs.closeSync(fd);
  }
};

function main(): void {
  console.log('Checking example .js/.ts synchronization...\n');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log('Regenerating example .js files in a scratch directory...');

  const tsFiles = findFiles(examplesDir, isTranspiledExampleSource);
  const expectedJsRelPaths = new Set<string>();
  const diffs: string[] = [];

  for (const tsFile of tsFiles) {
    const relJs = path.relative(examplesDir, tsFile).replace(/\.ts$/, '.js');
    expectedJsRelPaths.add(relJs);

    const committedPath = path.join(examplesDir, relJs);
    const generated = transpileExampleSource(fs.readFileSync(tsFile, 'utf8'), tsFile);

    // Materialize the regenerated output in the scratch directory so a
    // failing run leaves something diffable on disk, not just a verdict.
    const scratchPath = path.join(tmpDir, relJs);
    fs.mkdirSync(path.dirname(scratchPath), { recursive: true });
    fs.writeFileSync(scratchPath, generated, 'utf8');

    if (!fs.existsSync(committedPath)) {
      diffs.push(`  + ${toDisplayPath(relJs)} (missing)`);
      continue;
    }

    const committed = fs.readFileSync(committedPath, 'utf8');
    if (normalizeNewlines(committed) !== normalizeNewlines(generated)) {
      diffs.push(`  ~ ${toDisplayPath(relJs)}`);
    }
  }

  // Catch the reverse case too: a committed generated .js whose .ts source
  // was removed (or renamed) but the stale output was left behind.
  const allJsFiles = findFiles(examplesDir, name => name.endsWith('.js'));
  for (const jsFile of allJsFiles) {
    const relJs = path.relative(examplesDir, jsFile);
    if (expectedJsRelPaths.has(relJs)) continue;
    if (!isGeneratedJs(jsFile)) continue;
    diffs.push(`  - ${toDisplayPath(relJs)} (stale — no matching .ts source)`);
  }

  console.log('\nComparing regenerated output against committed content...');

  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (diffs.length > 0) {
    console.log(red(`Example .js files are out of sync with their .ts sources — ${diffs.length} file(s) differ:`));
    for (const d of diffs) console.log(d);
    console.log(red('\nRun `pnpm --filter @codexo/exojs-examples examples:sync` to regenerate, then commit the changed examples/**/*.js files.'));
    process.exit(1);
  }

  console.log(green('\nExample .js files are in sync with their .ts sources.'));
  process.exit(0);
}

void main();
