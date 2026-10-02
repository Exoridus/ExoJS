import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createExecRunner, writeCommandLog } from '../../scripts/release/command-runner.ts';

const temporary: string[] = [];
const scratch = (): string => {
  const path = mkdtempSync(join(tmpdir(), 'exojs-command-runner-'));

  temporary.push(path);

  return path;
};

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('command logs', () => {
  it('keeps every invocation of the same command in its own file', () => {
    const directory = scratch();
    const invocation = { command: 'pnpm', args: ['pack', '--pack-destination', 'out'] };
    const first = writeCommandLog(directory, invocation, { code: 1, stdout: 'first out', stderr: 'first err' });
    const second = writeCommandLog(directory, invocation, { code: 0, stdout: 'second out', stderr: '' });

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
    expect(readdirSync(directory)).toHaveLength(2);
    expect(readFileSync(first!, 'utf8')).toContain('first err');
  });

  it('records the command, its exit code and both streams', () => {
    const directory = scratch();
    const path = writeCommandLog(directory, { command: 'git', args: ['status'], cwd: '/repo' }, { code: 7, stdout: 'to stdout', stderr: 'to stderr' })!;
    const text = readFileSync(path, 'utf8');

    expect(text).toContain('$ git status');
    expect(text).toContain('exit=7');
    expect(text).toContain('to stdout');
    expect(text).toContain('to stderr');
  });

  it('reports an unwritable log as absent instead of throwing', () => {
    const directory = scratch();
    const blocker = join(directory, 'blocker');

    writeFileSync(blocker, '');

    expect(writeCommandLog(join(blocker, 'logs'), { command: 'a', args: [] }, { code: 0, stdout: '', stderr: '' })).toBeUndefined();
  });

  it('runs a real command, returns the log of a failure and leaves the first run intact after a second', () => {
    const directory = scratch();
    const runner = createExecRunner({ logDirectory: directory });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const failed = runner.run({ command: 'node', args: ['-e', 'process.exit(3)'] });
    const passed = runner.run({ command: 'node', args: ['--version'] });
    const diagnostic = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
    stderr.mockRestore();

    expect(failed.code).toBe(3);
    expect(passed.code).toBe(0);
    expect(failed.logPath).toBeDefined();
    expect(passed.logPath).not.toBe(failed.logPath);
    expect(existsSync(failed.logPath!)).toBe(true);
    expect(readFileSync(failed.logPath!, 'utf8')).toContain('exit=3');
    // The runner announces the failing exit code and points at its log. That
    // announcement is expected here, so it is asserted instead of printed into a
    // green run, and the successful command announces nothing.
    expect(diagnostic).toContain('exited 3');
    expect(diagnostic).toContain(failed.logPath!);
    expect(diagnostic).not.toContain('exited 0');
  });

  it('adds no log when none was asked for', () => {
    expect(createExecRunner().run({ command: 'node', args: ['--version'] }).logPath).toBeUndefined();
  });

  it('passes arguments containing shell metacharacters without invoking a shell', () => {
    const expected = 'literal & | < >';
    const result = createExecRunner().run({ command: process.execPath, args: ['-e', 'process.stdout.write(process.argv[1])', expected] });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(expected);
  });

  it.each(['npm', 'pnpm'])('runs the %s Windows shim through its Node entry point', command => {
    if (process.platform !== 'win32') return;
    const result = createExecRunner().run({ command, args: ['--version'] });
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
  });
});
