/**
 * Injectable command runner for the coordinated-release orchestration.
 *
 * The release logic (build-once verification, ordered publish, dist-tag
 * promotion) is expressed against this interface rather than calling
 * `child_process` directly. Production code injects {@link createExecRunner}
 * (real processes); tests inject a fake runner that pattern-matches argv and
 * returns scripted results — so every publish ordering, idempotent-resume and
 * partial-failure path is exercised without a real npm registry or network.
 */
import { spawnSync } from 'node:child_process';

export interface CommandInvocation {
  /** Executable, e.g. `'npm'` or `'git'`. */
  command: string;
  /** Argument vector, e.g. `['publish', 'pkg.tgz', '--dry-run']`. */
  args: ReadonlyArray<string>;
  /** Working directory for the invocation. */
  cwd?: string;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(invocation: CommandInvocation): CommandResult;
}

/**
 * Real runner: executes the process synchronously and captures output. Never
 * throws on a non-zero exit — the orchestration inspects `code` and decides.
 */
export const createExecRunner = (options: { echo?: boolean } = {}): CommandRunner => ({
  run({ command, args, cwd }) {
    if (options.echo) {
      process.stdout.write(`$ ${command} ${args.join(' ')}\n`);
    }
    const result = spawnSync(command, [...args], {
      cwd,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) {
      return { code: 1, stdout: result.stdout ?? '', stderr: String(result.error.message ?? result.error) };
    }
    return {
      code: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
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
