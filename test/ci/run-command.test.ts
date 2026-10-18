import { readFileSync, rmSync } from 'node:fs';

import { afterEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { runCommand, type RunCommandResult } from '../../scripts/lib/run-command.ts';

const createdLogs: string[] = [];
let sequence = 0;

const runNode = async (script: string, output: 'compact' | 'silent' | 'normal' = 'silent'): Promise<RunCommandResult> => {
  const result = await runCommand({
    label: `run-command-test-${sequence++}`,
    command: process.execPath,
    args: ['-e', script],
    output,
  });

  if (result.logPath) {
    createdLogs.push(result.logPath);
  }

  return result;
};

/**
 * Runs a supervised command with both process streams captured, so what it
 * announces is asserted rather than printed into a green run. The spies are
 * restored even when the command throws, otherwise a rejected command would
 * leave `process.stdout.write` swallowed for every test that follows.
 */
const capture = async <T>(block: () => Promise<T>): Promise<{ result: T; stdout: string; stderr: string }> => {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const announced = (spy: MockInstance): string => spy.mock.calls.map(([chunk]) => String(chunk)).join('');

  try {
    const result = await block();

    return { result, stdout: announced(stdout), stderr: announced(stderr) };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
};

afterEach(() => {
  for (const path of createdLogs.splice(0)) {
    rmSync(path, { force: true });
  }
});

describe('runCommand', () => {
  it('captures both output streams in silent mode', async () => {
    const result = await runNode("process.stdout.write('stdout'); process.stderr.write('stderr');");

    expect(result.status).toBe(0);
    expect(readFileSync(result.logPath!, 'utf8')).toContain('stdout');
    expect(readFileSync(result.logPath!, 'utf8')).toContain('stderr');
  });

  it('keeps the final unterminated line and limits the failure tail', async () => {
    const { result, stdout, stderr } = await capture(() =>
      runNode(
        "for (let i = 0; i < 125; i++) process.stdout.write(`line-${i}\\n`); process.stdout.write('last-line'); process.exitCode = 2;",
        'compact',
      ),
    );

    const log = readFileSync(result.logPath!, 'utf8');
    expect(result.status).toBe(2);
    expect(stderr).toContain('line-124');
    expect(stderr).toContain('Full log:');
    expect(stderr).not.toContain('line-0');
    expect(stdout).toMatch(/RUN run-command-test-\d+; PID \d+/);
    expect(log).toContain('line-0');
    expect(log).toContain('line-124');
    expect(log).toContain('last-line');
  });

  it('propagates the resolved output mode to child processes', async () => {
    const result = await runNode("process.stdout.write(process.env.EXOJS_OUTPUT ?? 'missing');");

    expect(readFileSync(result.logPath!, 'utf8')).toContain('silent');
  });

  it('propagates verbose mode through the live path', async () => {
    const { result, stdout } = await capture(() =>
      runCommand({
        label: `run-command-verbose-${sequence++}`,
        command: process.execPath,
        args: ['-e', "process.exit(process.env.EXOJS_OUTPUT === 'verbose' ? 0 : 1)"],
        output: 'verbose',
      }),
    );

    expect(result.status).toBe(0);
    expect(stdout).toMatch(/PASS run-command-verbose-\d+/);
  });

  it('reports a live spawn error instead of hiding it', async () => {
    const { result, stdout, stderr } = await capture(() =>
      runCommand({
        label: `run-command-missing-${sequence++}`,
        command: 'exojs-command-that-does-not-exist',
        args: ['--test'],
        output: 'normal',
      }),
    );

    expect(result.status).toBe(1);
    expect(stderr).toContain('Failed to start run-command-missing');
    // The spawn never produced a pid, and the announcement says so rather than
    // inventing one.
    expect(stdout).toMatch(/RUN run-command-missing-\d+; PID \?/);
  });

  it('writes a compact success result without losing the full log', async () => {
    const { result, stdout } = await capture(() => runNode("process.stdout.write('complete output');", 'compact'));

    expect(result.status).toBe(0);
    expect(stdout).toMatch(/PASS run-command-test-\d+/);
    expect(readFileSync(result.logPath!, 'utf8')).toContain('complete output');
    expect(readFileSync(result.logPath!, 'utf8')).toMatch(/exit=0\nsignal=none\nreason=exit\ndurationMs=\d+/);
  });
});
