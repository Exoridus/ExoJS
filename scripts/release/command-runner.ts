/**
 * Injectable command runner for the coordinated-release orchestration.
 *
 * The release logic (build-once verification, ordered publish, dist-tag
 * promotion) is expressed against this interface rather than calling
 * `child_process` directly. Production code injects {@link createExecRunner}
 * (real processes); tests inject a fake runner that pattern-matches argv and
 * returns scripted results - so every publish ordering, idempotent-resume and
 * partial-failure path is exercised without a real npm registry or network.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CommandInvocation {
  /** Executable, e.g. `'npm'` or `'git'`. */
  command: string;
  /** Argument vector, e.g. `['publish', 'pkg.tgz', '--dry-run']`. */
  args: readonly string[];
  /** Working directory for the invocation. */
  cwd?: string;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  /** Complete output of the invocation, when the runner was asked to keep logs. */
  logPath?: string;
}

export interface CommandRunner {
  run(invocation: CommandInvocation): CommandResult;
}

let logSequence = 0;

/**
 * Writes the full record of one invocation to a file no other invocation can
 * own: the name carries the time, the process and a per-process sequence, and
 * the file is created exclusively. A failing run's output therefore survives
 * the rerun that follows it. Returns the path, or `undefined` when the log
 * could not be written (a log failure never changes what the command did).
 */
export const writeCommandLog = (logDirectory: string, invocation: CommandInvocation, result: Omit<CommandResult, 'logPath'>): string | undefined => {
  const label =
    [invocation.command, ...invocation.args.filter(arg => !arg.startsWith('-'))]
      .slice(0, 3)
      .join('-')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'command';
  const path = resolve(logDirectory, `release-${label}-${Date.now()}-${process.pid}-${logSequence++}.log`);

  try {
    mkdirSync(logDirectory, { recursive: true });
    writeFileSync(
      path,
      `$ ${invocation.command} ${invocation.args.join(' ')}\ncwd=${invocation.cwd ?? process.cwd()}\nexit=${result.code}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}\n`,
      { flag: 'wx' },
    );
  } catch {
    return undefined;
  }

  return path;
};

export interface ExecRunnerOptions {
  echo?: boolean;
  /** Keep the complete output of every invocation here, one unique file each, and name it when a command fails. */
  logDirectory?: string;
}

/**
 * Real runner: executes the process synchronously and captures output. Never
 * throws on a non-zero exit - the orchestration inspects `code` and decides.
 */
export const createExecRunner = (options: ExecRunnerOptions = {}): CommandRunner => ({
  run(invocation) {
    const { command, args, cwd } = invocation;
    if (options.echo) {
      process.stdout.write(`$ ${command} ${args.join(' ')}\n`);
    }
    const spawned = spawnSync(command, [...args], {
      cwd,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 64 * 1024 * 1024,
    });
    const outcome: Omit<CommandResult, 'logPath'> = spawned.error
      ? { code: 1, stdout: spawned.stdout ?? '', stderr: String(spawned.error.message ?? spawned.error) }
      : { code: spawned.status ?? 1, stdout: spawned.stdout ?? '', stderr: spawned.stderr ?? '' };
    const logPath = options.logDirectory === undefined ? undefined : writeCommandLog(options.logDirectory, invocation, outcome);

    if (logPath !== undefined && outcome.code !== 0) {
      process.stderr.write(`  ${command} ${args.join(' ')} exited ${outcome.code}; full log: ${logPath}\n`);
    }

    return logPath === undefined ? outcome : { ...outcome, logPath };
  },
});

/**
 * Records every invocation it receives and answers via a caller-supplied
 * responder. Used by the release tests to script npm behaviour deterministically.
 */
export const createRecordingRunner = (
  responder: (invocation: CommandInvocation, index: number) => CommandResult,
): CommandRunner & { invocations: CommandInvocation[] } => {
  const invocations: CommandInvocation[] = [];
  return {
    invocations,
    run(invocation) {
      const index = invocations.length;
      invocations.push(invocation);
      return responder(invocation, index);
    },
  };
};

/** Convenience helper for fake responders. */
export const ok = (stdout = ''): CommandResult => ({ code: 0, stdout, stderr: '' });

/** Convenience helper for fake responders. */
export const fail = (stderr = 'error', code = 1): CommandResult => ({ code, stdout: '', stderr });
