/**
 * Runs the Khronos `ktx validate` tool over every committed colour fixture, hand-built and externally encoded.
 *
 * The validator is not a repository dependency: point `--ktx` (or `KTX_TOOL`) at a `ktx` executable from a
 * KTX-Software release. The recorded run used 4.4.2. Every fixture is checked with warnings treated as
 * errors, and the report - tool version, each fixture's SHA-256 and the validator's own messages - is
 * written next to the other private working output so a run can be attached to a review.
 *
 * ```sh
 * pnpm fixtures:color:validate --ktx path/to/ktx.exe
 * ```
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDirs = ['test/fixtures/color', 'test/fixtures/color-external'].map(directory => join(repoRoot, directory));
const reportPath = join(repoRoot, '.workspace/output/color-fixture-validation.json');

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
};

const tool = argument('--ktx') ?? process.env['KTX_TOOL'];

if (tool === undefined) {
  console.error('validate-color-fixtures: pass --ktx <path to ktx> or set KTX_TOOL. The tool is not a repository dependency.');
  process.exit(2);
}

const version = execFileSync(tool, ['--version'], { encoding: 'utf8' }).trim();
const results: Array<{ file: string; sha256: string; valid: boolean; exitCode: number | null; messages: unknown[] }> = [];

for (const path of fixtureDirs.flatMap(directory =>
  readdirSync(directory)
    .filter(name => name.endsWith('.ktx2'))
    .sort()
    .map(name => join(directory, name)),
)) {
  const file = relative(repoRoot, path).replaceAll(sep, '/');
  const run = spawnSync(tool, ['validate', '--format', 'json', '--warnings-as-errors', path], { encoding: 'utf8' });
  const messages = ((): unknown[] => {
    try {
      return (JSON.parse(run.stdout) as { messages?: unknown[] }).messages ?? [];
    } catch {
      return [{ type: 'error', message: `unparsable validator output: ${run.stdout.slice(0, 200)}` }];
    }
  })();

  results.push({
    file,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    valid: run.status === 0,
    exitCode: run.status,
    messages,
  });
}

const failed = results.filter(result => !result.valid);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify({ tool: version, checked: results.length, failed: failed.length, results }, null, 2)}\n`);
console.log(`${version}: ${results.length - failed.length}/${results.length} fixtures pass (warnings as errors). Report: ${reportPath}`);

for (const result of failed) {
  console.error(`FAIL ${result.file}: ${JSON.stringify(result.messages)}`);
}

process.exit(failed.length === 0 ? 0 : 1);
