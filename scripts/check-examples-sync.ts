import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findFiles,
  findOrphanedOutputs,
  generatedOutputPath,
  isTranspiledExampleSource,
  transpileExampleSource,
} from './transpile-examples.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examplesDir = path.resolve(repoRoot, 'examples');

const green = (s: string): string => `\x1B[32m${s}\x1B[0m`;
const red = (s: string): string => `\x1B[31m${s}\x1B[0m`;

// The generator always emits LF; a stale file written by an older checkout may
// carry CRLF. Compare content, not bytes.
const normalizeNewlines = (content: string): string => content.replace(/\r\n/g, '\n');

const display = (file: string): string => path.relative(repoRoot, file).split(path.sep).join('/');

const trackedOutputs = (): string[] =>
  execFileSync('git', ['ls-files', '-z', '--', 'examples'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(file => file.endsWith('.js'));

const catalogSources = (): string[] => {
  const catalog = JSON.parse(fs.readFileSync(path.join(examplesDir, 'examples.json'), 'utf8')) as Record<string, Array<{ path: string }>>;

  return Object.values(catalog).flatMap(entries => entries.map(entry => path.join(examplesDir, entry.path.replace(/\.js$/, '.ts'))));
};

const problems: string[] = [];

// The `.ts` is the only versioned source. A tracked `.js` would shadow it again.
for (const file of trackedOutputs()) {
  problems.push(`${file} is tracked; example .js files are generated build output`);
}

const tsFiles = findFiles(examplesDir, isTranspiledExampleSource);
const present = new Set(tsFiles);

for (const source of catalogSources()) {
  if (!present.has(source)) {
    problems.push(`${display(source)} is listed in examples.json but does not exist`);
  }
}

// Generation must succeed for every source, give the same bytes twice, and
// match any output already on disk. A missing output is not an error: the
// files are generated on demand and a clean checkout has none.
for (const tsFile of tsFiles) {
  const source = fs.readFileSync(tsFile, 'utf8');
  let first: string;

  try {
    first = await transpileExampleSource(source, tsFile);
  } catch (error) {
    problems.push(`${display(tsFile)} does not generate: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  if (first !== (await transpileExampleSource(source, tsFile))) {
    problems.push(`${display(tsFile)} generates different output on a second run`);
    continue;
  }

  const output = generatedOutputPath(tsFile);

  if (fs.existsSync(output) && normalizeNewlines(fs.readFileSync(output, 'utf8')) !== first) {
    problems.push(`${display(output)} is stale; run \`pnpm examples:generate\``);
  }
}

for (const orphan of findOrphanedOutputs(examplesDir)) {
  problems.push(`${display(orphan)} has no .ts source; run \`pnpm examples:generate\` to remove it`);
}

if (problems.length > 0) {
  console.log(red(`Example generation check failed (${problems.length}):`));

  for (const problem of problems) {
    console.log(`  ${problem}`);
  }

  process.exit(1);
}

console.log(green(`${tsFiles.length} example sources generate deterministically; no tracked or orphaned .js files.`));
