/**
 * Runs one browser row of the qualification matrix and says what happened.
 *
 *   pnpm qualify --row "Firefox / WebGPU Core" --preflight firefox-webgpu \
 *     --requires webgpu-device --policy informational --timeout 10 -- pnpm test:browser:webgpu:firefox
 *
 * The row is probed first (`--preflight`), so a host that cannot provide what the
 * suite needs is reported in seconds instead of after minutes of failing tests.
 * The command then runs under the shared validation supervisor: a unique
 * persistent log, an outer deadline and owned-process-tree cleanup. The result is
 * recorded under `test-results/qualification/` and echoed to the GitHub step
 * summary, so a green job cannot be read as "everything listed was exercised".
 *
 *   pnpm qualify --report      prints the latest recorded row of each name
 *
 * Exit code: nonzero only for a `required` row that failed. An `informational`
 * row reports UNSUPPORTED HOST or FAIL loudly and leaves the job's status alone.
 */
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { atLeastOutputMode, type EffectiveOutputMode, readOutputOptions } from '../lib/output.ts';
import { runCommand } from '../lib/run-command.ts';
import { probeBrowser } from './browser-probe.ts';
import { BROWSER_PROFILE_IDS, type BrowserProfileId } from './browser-profiles.ts';
import {
  describeRow,
  formatProbe,
  isProbeFailure,
  judgePreflight,
  judgeRun,
  latestRows,
  type QualificationRow,
  type RowPolicy,
  type RowVerdict,
} from './capability.ts';

export const RECORD_DIRECTORY = 'test-results/qualification';

export interface QualifyOptions {
  readonly row: string;
  readonly policy: RowPolicy;
  readonly preflight?: BrowserProfileId;
  readonly requires: readonly string[];
  readonly timeoutMinutes?: number;
  readonly after?: string;
  readonly command: readonly string[];
}

export type ParsedArguments = { readonly report: true } | { readonly report: false; readonly options: QualifyOptions };

const value = (argv: readonly string[], index: number, flag: string): string => {
  const next = argv[index + 1];

  if (next === undefined || next.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }

  return next;
};

/** Strict parsing: a mistyped flag must not silently run a row under a different policy. */
export const parseQualifyArguments = (argv: readonly string[]): ParsedArguments => {
  if (argv.length === 1 && argv[0] === '--report') {
    return { report: true };
  }

  const separator = argv.indexOf('--');
  const flags = separator === -1 ? argv : argv.slice(0, separator);
  const command = separator === -1 ? [] : argv.slice(separator + 1);
  let row: string | undefined;
  let policy: RowPolicy = 'required';
  let preflight: BrowserProfileId | undefined;
  let requires: string[] = [];
  let timeoutMinutes: number | undefined;
  let after: string | undefined;

  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i]!;
    const next = value(flags, i, flag);

    if (flag === '--row') {
      row = next;
    } else if (flag === '--policy') {
      if (next !== 'required' && next !== 'informational') {
        throw new Error(`--policy must be 'required' or 'informational', got '${next}'.`);
      }

      policy = next;
    } else if (flag === '--preflight') {
      if (!(BROWSER_PROFILE_IDS as readonly string[]).includes(next)) {
        throw new Error(`Unknown --preflight profile '${next}'. Expected: ${BROWSER_PROFILE_IDS.join(', ')}.`);
      }

      preflight = next as BrowserProfileId;
    } else if (flag === '--requires') {
      requires = next.split(',').filter(Boolean);
    } else if (flag === '--timeout') {
      timeoutMinutes = Number(next);

      if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
        throw new Error(`--timeout must be a positive number of minutes, got '${next}'.`);
      }
    } else if (flag === '--after') {
      after = next;
    } else {
      throw new Error(`Unknown option '${flag}'.`);
    }
  }

  if (row === undefined) {
    throw new Error('--row is required.');
  }

  if (command.length === 0) {
    throw new Error('A command is required after `--`.');
  }

  if (requires.length > 0 && preflight === undefined) {
    throw new Error('--requires needs --preflight.');
  }

  return {
    report: false,
    options: {
      row,
      policy,
      requires,
      command,
      ...(preflight === undefined ? {} : { preflight }),
      ...(timeoutMinutes === undefined ? {} : { timeoutMinutes }),
      ...(after === undefined ? {} : { after }),
    },
  };
};

const slug = (text: string): string =>
  text
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

/** Every record is a new file: a failed run's evidence is never overwritten by the run after it. */
export const recordRow = (row: QualificationRow, directory = RECORD_DIRECTORY): string => {
  mkdirSync(directory, { recursive: true });

  const path = resolve(directory, `${slug(row.row)}-${Date.now()}-${process.pid}.json`);

  writeFileSync(path, `${JSON.stringify(row, null, 2)}\n`, { flag: 'wx' });

  return path;
};

export const readRows = (directory = RECORD_DIRECTORY): QualificationRow[] => {
  try {
    return readdirSync(directory)
      .filter(name => name.endsWith('.json'))
      .map(name => JSON.parse(readFileSync(resolve(directory, name), 'utf8')) as QualificationRow);
  } catch {
    return [];
  }
};

const announce = (row: QualificationRow): void => {
  const text = describeRow(row);

  process.stdout.write(`QUALIFICATION ${row.row}  ${text}\n`);

  const summary = process.env['GITHUB_STEP_SUMMARY'];

  if (summary) {
    appendFileSync(summary, `- **${row.row}** (${row.policy}) - ${text}\n`);
  }

  if (process.env['GITHUB_ACTIONS'] === 'true' && row.status !== 'PASS') {
    const level = row.policy === 'required' && row.status === 'FAIL' ? 'error' : 'warning';

    process.stdout.write(`::${level} title=${row.row}::${text}\n`);
  }
};

export const printReport = (rows: readonly QualificationRow[]): number => {
  const latest = latestRows(rows);

  if (latest.length === 0) {
    process.stdout.write('No qualification rows recorded.\n');
  }

  for (const row of latest) {
    process.stdout.write(`${row.row.padEnd(34)} ${describeRow(row)}\n`);
  }

  return latest.some(row => row.policy === 'required' && row.status === 'FAIL') ? 1 : 0;
};

const verdictRow = (
  options: QualifyOptions,
  verdict: RowVerdict,
  durationMs: number,
  extra: Partial<QualificationRow> = {},
): QualificationRow => ({
  row: options.row,
  policy: options.policy,
  status: verdict.status,
  ...(verdict.failure === undefined ? {} : { failure: verdict.failure }),
  detail: verdict.detail,
  durationMs,
  finishedAt: new Date().toISOString(),
  ...extra,
});

export interface QualifyContext {
  /** Working directory of the row command; the supervisor keeps its log under this directory. */
  readonly cwd?: string;
  readonly recordDirectory?: string;
  readonly output?: EffectiveOutputMode;
}

export const qualify = async (options: QualifyOptions, context: QualifyContext = {}): Promise<number> => {
  const started = Date.now();
  const outputMode = context.output ?? atLeastOutputMode(readOutputOptions([]).mode, 'normal');
  const recordDirectory = context.recordDirectory ?? RECORD_DIRECTORY;
  let browser: string | undefined;
  let info: Readonly<Record<string, string>> | undefined;

  if (options.after !== undefined) {
    const parent = latestRows(readRows(recordDirectory)).find(row => row.row === options.after);
    const unavailable =
      parent !== undefined && (parent.status === 'UNSUPPORTED HOST' || (parent.status === 'FAIL' && parent.failure !== 'test'));

    if (unavailable) {
      const verdict: RowVerdict = {
        status: 'NOT RUN',
        detail: `parent capability unavailable (${options.after})`,
        proceed: false,
        exitCode: 0,
      };

      const row = verdictRow(options, verdict, Date.now() - started);

      recordRow(row, recordDirectory);
      announce(row);

      return 0;
    }
  }

  if (options.preflight !== undefined) {
    process.stdout.write(`PREFLIGHT ${options.row} (${options.preflight})\n`);

    const probe = await probeBrowser(options.preflight);

    if (isProbeFailure(probe)) {
      process.stdout.write(`Probe failed: ${probe.error}\n`);
    } else {
      for (const line of formatProbe(probe)) {
        process.stdout.write(`  ${line}\n`);
      }

      browser = probe.browser;
      info = probe.info;
    }

    const verdict = judgePreflight(probe, options.requires, options.policy);

    if (!verdict.proceed) {
      const row = verdictRow(options, verdict, Date.now() - started, {
        ...(browser === undefined ? {} : { browser }),
        ...(info === undefined ? {} : { info }),
      });

      recordRow(row, recordDirectory);
      announce(row);

      return verdict.exitCode;
    }
  }

  const [command, ...args] = options.command;
  const result = await runCommand({
    label: slug(options.row),
    command: command!,
    args,
    output: outputMode,
    ...(context.cwd === undefined ? {} : { cwd: context.cwd }),
    ...(options.timeoutMinutes === undefined ? {} : { timeoutMs: Math.round(options.timeoutMinutes * 60_000) }),
  });
  const verdict = judgeRun(result, options.policy);
  const row = verdictRow(options, verdict, Date.now() - started, {
    ...(result.logPath === undefined ? {} : { logPath: result.logPath }),
    ...(browser === undefined ? {} : { browser }),
    ...(info === undefined ? {} : { info }),
  });

  recordRow(row, recordDirectory);
  announce(row);

  return verdict.exitCode;
};

const main = async (): Promise<void> => {
  const parsed = parseQualifyArguments(process.argv.slice(2));

  process.exitCode = parsed.report ? printReport(readRows()) : await qualify(parsed.options);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(error => {
    process.stderr.write(`qualify: ${String(error instanceof Error ? error.message : error)}\n`);
    process.exitCode = 2;
  });
}
