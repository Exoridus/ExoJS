/**
 * Runs Vitest and tells a timeout caused by load apart from a test that hangs.
 *
 * A test that only ran out of time because the machine was busy - a compile in
 * another window, a second worktree testing - passes at once when it runs on
 * its own; one that really hangs times out there too. So when every failure of
 * a run is a timeout, exactly those files run once more, serially, and only a
 * repeated failure fails the run. Any other failure - an assertion, a file that
 * does not load, an unhandled error - fails immediately and is never retried,
 * which keeps a real intermittent bug from hiding behind a second attempt.
 *
 * Arguments pass through to `vitest run`. A coverage run is never rechecked:
 * the recheck would overwrite the report with the coverage of a few files.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The part of Vitest's JSON report the recheck reads. */
export interface VitestJsonReport {
  readonly testResults: ReadonlyArray<{
    readonly name: string;
    readonly status: string;
    readonly message?: string;
    readonly assertionResults: ReadonlyArray<{ readonly status: string; readonly failureMessages: readonly string[] }>;
  }>;
}

const TIMEOUT_FAILURE = /^(?:Error: )?(?:Test|Hook) timed out in \d+ms/;

/** Vitest's banner for errors raised outside any test; they belong to no file and cannot be rerun. */
const UNHANDLED_ERRORS = /Unhandled (?:Errors?|Rejections?)/;

/**
 * The files to recheck when every failure in `report` is a timeout, or `null`
 * when the run failed in a way a recheck must not excuse - or did not fail.
 */
export const timeoutOnlyFailures = (report: VitestJsonReport): string[] | null => {
  const files: string[] = [];

  for (const result of report.testResults) {
    if (result.status !== 'failed') {
      continue;
    }

    const failed = result.assertionResults.filter(assertion => assertion.status === 'failed');

    // A file can fail with no failed test of its own: it did not load, or a
    // suite-level error ended it. That is never a matter of time.
    if (failed.length === 0 || (result.message !== undefined && result.message !== '' && !TIMEOUT_FAILURE.test(result.message))) {
      return null;
    }

    if (
      !failed.every(
        assertion => assertion.failureMessages.length > 0 && assertion.failureMessages.every(message => TIMEOUT_FAILURE.test(message)),
      )
    ) {
      return null;
    }

    files.push(result.name);
  }

  return files.length === 0 ? null : files;
};

/** The arguments of the original run minus its reporters and output files, which the recheck replaces. */
export const recheckArguments = (args: readonly string[], files: readonly string[], cwd: string): string[] => [
  ...args.filter(arg => !arg.startsWith('--reporter') && !arg.startsWith('--outputFile')),
  '--no-file-parallelism',
  ...files.map(file => relative(cwd, resolve(file)).replaceAll('\\', '/')),
];

const vitestBin = (): string => join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');

/** Runs Vitest, echoing its output, and reports whether it printed unhandled errors. */
const runVitest = (args: readonly string[]): Promise<{ code: number; unhandled: boolean }> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [vitestBin(), 'run', ...args], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.stdout.isTTY && process.env.FORCE_COLOR === undefined ? { ...process.env, FORCE_COLOR: '1' } : process.env,
    });
    let unhandled = false;

    const forward = (target: NodeJS.WriteStream) => (chunk: Buffer) => {
      target.write(chunk);

      if (!unhandled && UNHANDLED_ERRORS.test(chunk.toString())) {
        unhandled = true;
      }
    };

    child.stdout.on('data', forward(process.stdout));
    child.stderr.on('data', forward(process.stderr));
    child.on('error', reject);
    child.on('close', code => resolvePromise({ code: code ?? 1, unhandled }));
  });

const withJsonReport = (args: readonly string[], file: string): string[] => {
  const reporters = args.some(arg => arg.startsWith('--reporter')) ? [] : ['--reporter=default'];

  return [...args, ...reporters, '--reporter=json', `--outputFile.json=${file}`];
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);

  if (args.includes('--coverage')) {
    process.exitCode = (await runVitest(args)).code;

    return;
  }

  const directory = mkdtempSync(join(tmpdir(), 'exojs-run-tests-'));
  const reportFile = join(directory, 'report.json');

  try {
    const first = await runVitest(withJsonReport(args, reportFile));

    if (first.code === 0) {
      return;
    }

    let report: VitestJsonReport | null = null;

    try {
      report = JSON.parse(readFileSync(reportFile, 'utf8')) as VitestJsonReport;
    } catch {
      // No report means Vitest itself failed before or while reporting.
    }

    const files = first.unhandled || report === null ? null : timeoutOnlyFailures(report);

    if (files === null) {
      process.exitCode = first.code;

      return;
    }

    console.log(`\n[run-tests] Every failure was a timeout. Rechecking ${files.length} file(s) on their own:`);

    for (const file of files) {
      console.log(`  ${relative(process.cwd(), file)}`);
    }

    const recheck = await runVitest(recheckArguments(args, files, process.cwd()));

    if (recheck.code !== 0 || recheck.unhandled) {
      console.error('\n[run-tests] The recheck failed too: these tests hang or fail, independent of load.');
      process.exitCode = recheck.code === 0 ? 1 : recheck.code;

      return;
    }

    const warning = `${files.length} test file(s) timed out under load and passed when rerun on their own.`;

    console.log(process.env.GITHUB_ACTIONS === 'true' ? `::warning title=Timeout under load::${warning}` : `\n[run-tests] ${warning}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
