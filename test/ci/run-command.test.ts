import { readFileSync, rmSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

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
  if (result.logPath) createdLogs.push(result.logPath);
  return result;
};

afterEach(() => {
  for (const path of createdLogs.splice(0)) rmSync(path, { force: true });
});

describe('runCommand', () => {
  it('captures both output streams in silent mode', async () => {
    const result = await runNode("process.stdout.write('stdout'); process.stderr.write('stderr');");

    expect(result.status).toBe(0);
    expect(readFileSync(result.logPath!, 'utf8')).toContain('stdout');
    expect(readFileSync(result.logPath!, 'utf8')).toContain('stderr');
  });

  it('keeps the final unterminated line and limits the failure tail', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await runNode(
      "for (let i = 0; i < 125; i++) process.stdout.write(`line-${i}\\n`); process.stdout.write('last-line'); process.exitCode = 2;",
      'compact',
    );

    const log = readFileSync(result.logPath!, 'utf8');
    const diagnostic = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
    stderr.mockRestore();
    expect(result.status).toBe(2);
    expect(diagnostic).toContain('line-124');
    expect(diagnostic).not.toContain('line-0');
    expect(log).toContain('line-0');
    expect(log).toContain('line-124');
    expect(log).toContain('last-line');
  });

  it('propagates the resolved output mode to child processes', async () => {
    const result = await runNode("process.stdout.write(process.env.EXOJS_OUTPUT ?? 'missing');");

    expect(readFileSync(result.logPath!, 'utf8')).toContain('silent');
  });

  it('propagates verbose mode through the live path', async () => {
    const result = await runCommand({
      label: `run-command-verbose-${sequence++}`,
      command: process.execPath,
      args: ['-e', "process.exit(process.env.EXOJS_OUTPUT === 'verbose' ? 0 : 1)"],
      output: 'verbose',
    });

    expect(result.status).toBe(0);
  });

  it('reports a live spawn error instead of hiding it', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await runCommand({
      label: `run-command-missing-${sequence++}`,
      command: 'exojs-command-that-does-not-exist',
      args: ['--test'],
      output: 'normal',
    });
    const diagnostic = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
    stderr.mockRestore();

    expect(result.status).toBe(1);
    expect(diagnostic).toContain('Failed to start run-command-missing');
  });

  it('writes a compact success result without losing the full log', async () => {
    const result = await runNode("process.stdout.write('complete output');", 'compact');

    expect(result.status).toBe(0);
    expect(readFileSync(result.logPath!, 'utf8')).toContain('complete output');
  });
});
