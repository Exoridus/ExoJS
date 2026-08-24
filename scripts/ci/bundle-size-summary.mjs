/**
 * Writes the current bundle sizes, their budgets and the headroom left to the
 * GitHub run summary (stdout when run outside Actions).
 *
 * This reports; it never judges. The budget is enforced by `pnpm size` itself,
 * which this deliberately runs a second time rather than sharing a process
 * with: a reporter that can turn a green gate red is a second gate.
 *
 * Base-vs-PR deltas come from Codecov's bundle analysis (see `.codecov.yml`),
 * which has the base commit's numbers; a single CI run does not.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

// `size-limit` does not export its bin from `exports`, and the `.bin` shim is a
// `.cmd` on Windows - spawning either needs a shell. Reading the bin entry out
// of the manifest keeps this a plain `node <file>` spawn everywhere.
const require = createRequire(import.meta.url);
const manifestPath = require.resolve('size-limit/package.json');
const sizeLimitBin = resolve(dirname(manifestPath), require(manifestPath).bin);

/** size-limit exits non-zero when a budget is exceeded, and still prints the report. */
function readSizeLimitReport() {
  const result = spawnSync(process.execPath, [sizeLimitBin, '--json'], { encoding: 'utf8' });

  if (result.error) {
    throw result.error;
  }

  const json = /\[[\s\S]*\]/.exec(result.stdout ?? '');

  if (!json) {
    throw new Error(`size-limit produced no JSON report (exit ${result.status}).\n${result.stderr ?? ''}`);
  }

  return JSON.parse(json[0]);
}

const KB = 1000;

function kb(bytes) {
  return `${(bytes / KB).toFixed(2)} kB`;
}

function row({ name, size, sizeLimit, passed }) {
  const headroom = sizeLimit - size;
  const used = ((size / sizeLimit) * 100).toFixed(1);

  return `| \`${name}\` | ${kb(size)} | ${kb(sizeLimit)} | ${used}% | ${headroom < 0 ? `-${kb(-headroom)}` : kb(headroom)} | ${passed ? 'ok' : 'over budget'} |`;
}

const report = readSizeLimitReport();
const summary = [
  '## Bundle budgets',
  '',
  'Sizes are gzipped. Base-vs-PR deltas are reported by Codecov bundle analysis on the pull request.',
  '',
  '| Artifact | Size | Budget | Used | Headroom | |',
  '| --- | ---: | ---: | ---: | ---: | --- |',
  ...report.map(row),
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
} else {
  process.stdout.write(`${summary}\n`);
}
