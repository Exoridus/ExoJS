import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { runCommand } from '../../scripts/lib/run-command.ts';

const fixture = resolve(import.meta.dirname, 'fixtures/validation-process.ts');
const temporary: string[] = [];
const directory = (): string => {
  const path = mkdtempSync(join(tmpdir(), 'exojs-validation-'));
  temporary.push(path);
  return path;
};
const run = (mode: string, cwd: string, extra: Partial<Parameters<typeof runCommand>[0]> = {}) =>
  runCommand({
    label: 'supervisor-test',
    command: process.execPath,
    args: [...process.execArgv, fixture, mode],
    cwd,
    output: 'silent',
    ...extra,
  });
const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux' && readFileSync(`/proc/${pid}/stat`, 'utf8').includes(') Z ')) return false;
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH' || (error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};
const waitForFile = async (path: string): Promise<number> => {
  for (let i = 0; i < 100; i++) {
    try {
      return Number(readFileSync(path, 'utf8'));
    } catch {
      await delay(20);
    }
  }
  throw new Error(`Fixture did not write ${path}`);
};

for (const output of ['silent', 'compact', 'normal', 'verbose'] as const) {
  void test(`records both streams and propagates ${output} mode`, async () => {
    const cwd = directory();
    const result = await run('streams', cwd, { output });
    assert.equal(result.status, 0);
    assert.ok(result.logPath?.startsWith(join(cwd, '.workspace', 'logs')));
    const log = readFileSync(result.logPath!, 'utf8');
    assert.match(log, new RegExp(`stdout:${output}`));
    assert.match(log, /stderr/);
  });
}

void test('preserves nonzero exit and the unterminated diagnostic line', async () => {
  const result = await run('failure', directory());
  assert.equal(result.status, 7);
  assert.match(readFileSync(result.logPath!, 'utf8'), /line-0[\s\S]*line-124[\s\S]*last-line/);
});

void test('same-label concurrent invocations never overwrite each other', async () => {
  const cwd = directory();
  const results = await Promise.all([run('streams', cwd), run('failure', cwd)]);
  assert.notEqual(results[0]!.logPath, results[1]!.logPath);
  assert.match(readFileSync(results[0]!.logPath!, 'utf8'), /stdout/);
  assert.match(readFileSync(results[1]!.logPath!, 'utf8'), /last-line/);
});

for (const mode of ['sleep', 'stubborn', 'tree', 'detached-tree']) {
  void test(`times out ${mode} without leaving its child running`, async () => {
    const cwd = directory();
    const pidFile = join(cwd, 'pid');
    const result = await run(mode, cwd, {
      args: [...process.execArgv, fixture, mode, pidFile],
      timeoutMs: 300,
      killGraceMs: 100,
    });
    assert.equal(result.status, 124);
    assert.equal(result.timedOut, true);
    assert.ok(result.durationMs < (process.platform === 'win32' ? 12_000 : 1600), `duration=${result.durationMs}`);
    const pid = await waitForFile(pidFile);
    for (let i = 0; i < 50 && isRunning(pid); i++) await delay(20);
    assert.equal(isRunning(pid), false, `owned child ${pid} survived`);
  });
}

void test('times out orphan without leaving its child running', async t => {
  const cwd = directory();
  const pidFile = join(cwd, 'pid');
  const result = await run('orphan', cwd, {
    args: [...process.execArgv, fixture, 'orphan', pidFile],
    timeoutMs: 300,
    killGraceMs: 100,
  });
  let pid = -1;
  for (let i = 0; i < 100; i++) {
    try {
      pid = Number(readFileSync(pidFile, 'utf8'));
      break;
    } catch {
      await delay(20);
    }
  }
  // Not every host lets a descendant outlive the process that created it. Where the
  // descendant ends with its parent, no orphan can reach the deadline and the
  // ownership path has nothing to prove.
  if (pid < 0) return t.skip('the host ended the descendant with its parent; no orphan exists here');
  assert.equal(result.status, 124);
  assert.equal(result.timedOut, true);
  for (let i = 0; i < 50 && isRunning(pid); i++) await delay(20);
  assert.equal(isRunning(pid), false, `owned child ${pid} survived`);
});

void test('timeout does not kill an unrelated process', async () => {
  const unrelated = spawn(process.execPath, [...process.execArgv, fixture, 'sleep'], { stdio: 'ignore' });
  try {
    const result = await run('sleep', directory(), { timeoutMs: 200, killGraceMs: 80 });
    assert.equal(result.status, 124);
    assert.equal(isRunning(unrelated.pid!), true);
  } finally {
    unrelated.kill('SIGKILL');
  }
});

void test('an already aborted command never starts', async () => {
  const controller = new AbortController();
  controller.abort();
  const cwd = directory();
  const pidFile = join(cwd, 'pid');
  const result = await run('sleep', cwd, { args: [...process.execArgv, fixture, 'sleep', pidFile], signal: controller.signal });
  assert.equal(result.status, 130);
  assert.equal(result.aborted, true);
  assert.throws(() => readFileSync(pidFile));
});

void test('an explicit abort stops a running command and removes process listeners', async () => {
  const controller = new AbortController();
  const before = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
  const cwd = directory();
  const pidFile = join(cwd, 'pid');
  const running = run('stubborn', cwd, {
    args: [...process.execArgv, fixture, 'stubborn', pidFile],
    signal: controller.signal,
    killGraceMs: 80,
  });
  await waitForFile(pidFile);
  controller.abort();
  const result = await running;
  assert.equal(result.status, 130);
  assert.equal(result.aborted, true);
  assert.deepEqual(
    ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)),
    before,
  );
});

void test('rejects invalid budgets instead of silently disabling supervision', async () => {
  for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31]) {
    await assert.rejects(run('streams', directory(), { timeoutMs }), /timeoutMs/);
  }
});

void test('a log-directory failure is nonzero and does not launch the command', async () => {
  const cwd = directory();
  writeFileSync(join(cwd, '.workspace'), 'not a directory');
  const result = await run('sleep', cwd);
  assert.equal(result.status, 1);
  assert.ok(result.logError);
});

void test('spawn failure remains nonzero', async () => {
  const result = await runCommand({ label: 'missing', command: 'exojs-no-such-command', args: ['--test'], cwd: directory(), output: 'normal' });
  assert.equal(result.status, 1);
});

test.after(() => {
  for (const path of temporary) rmSync(path, { recursive: true, force: true });
});

void test('the shared lane budget is finite and preserves the longer bench timeout', async () => {
  const { LANES, laneTimeoutMinutes } = await import('../../scripts/ci/lanes.ts');
  assert.equal(typeof laneTimeoutMinutes, 'function');
  assert.equal(laneTimeoutMinutes(LANES.find(lane => lane.id === 'webgpu')!), 20);
  assert.equal(laneTimeoutMinutes(LANES.find(lane => lane.id === 'bench')!), 30);
});

void test('local WebGPU bounds file concurrency without narrowing the CI test inventory', async () => {
  const { LANES } = await import('../../scripts/ci/lanes.ts');
  const lane = LANES.find(item => item.id === 'webgpu')!;
  assert.match(lane.run, /--no-file-parallelism/);
  assert.match(lane.ciRun!, /test:browser:webgpu --reporter=minimal/);
  assert.doesNotMatch(lane.run + lane.ciRun, /--retry|--exclude|--bail|\|\| true/);
});

void test('single-lane diagnostics reject unknown names and flag combinations', async () => {
  const { parseLocalLaneOptions } = await import('../../scripts/ci/local-lanes.ts');
  assert.deepEqual(parseLocalLaneOptions(['--run', '--only=webgpu,bench']).only, ['webgpu', 'bench']);
  assert.throws(() => parseLocalLaneOptions(['--only', 'webgup']), /Unknown local lane/);
  assert.throws(() => parseLocalLaneOptions(['--only']), /requires/);
  assert.throws(() => parseLocalLaneOptions(['--base']), /requires/);
  assert.throws(() => parseLocalLaneOptions(['--wat']), /Unknown option/);
  assert.throws(() => parseLocalLaneOptions(['--only=webgpu', '--quick']), /cannot combine/);
});

void test('repository lock rejects a second owner and releases only its own token', async () => {
  const { acquireValidationLock } = await import('../../scripts/lib/validation-lock.ts');
  const cwd = directory();
  const { spawnSync } = await import('node:child_process');
  assert.equal(spawnSync('git', ['init', '-q', cwd]).status, 0);
  const first = acquireValidationLock(cwd);
  assert.throws(() => acquireValidationLock(cwd), /Validation already owns/);
  first.release();
  const second = acquireValidationLock(cwd);
  first.release();
  assert.throws(() => acquireValidationLock(cwd), /Validation already owns/);
  second.release();
});

void test('bounds a large unterminated failure tail while keeping the full disk log', async () => {
  const { spawnSync } = await import('node:child_process');
  const cwd = directory();
  const supervisor = resolve(import.meta.dirname, 'fixtures/validation-supervisor.ts');
  const result = spawnSync(process.execPath, [...process.execArgv, supervisor, 'long-line'], { cwd, encoding: 'utf8', timeout: 8000 });
  assert.equal(result.status, 7);
  assert.ok(result.stderr.length < 70_000, `tail chars=${result.stderr.length}`);
  const record = JSON.parse(result.stdout.trim()) as { logPath: string };
  assert.ok(readFileSync(record.logPath, 'utf8').length > 200_000);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  void test(`${signal} terminates the owned child and returns its conventional failure code`, async () => {
    const { fork } = await import('node:child_process');
    const cwd = directory();
    const pidFile = join(cwd, 'pid');
    const supervisor = fork(resolve(import.meta.dirname, 'fixtures/validation-supervisor.ts'), ['stubborn', pidFile], { cwd, silent: true });
    const output: Buffer[] = [];
    supervisor.stdout!.on('data', (chunk: Buffer) => output.push(chunk));
    supervisor.stderr!.resume();
    const finished = new Promise<number | null>(resolveExit => supervisor.once('exit', resolveExit));
    try {
      const pid = await waitForFile(pidFile);
      // Node.kill is forceful on Windows; IPC exercises the same console-signal handler without killing the supervisor first.
      if (process.platform === 'win32') supervisor.send(signal);
      else supervisor.kill(signal);
      assert.equal(await finished, signal === 'SIGINT' ? 130 : 143);
      const record = JSON.parse(Buffer.concat(output).toString().trim()) as { status: number; aborted: boolean };
      assert.equal(record.aborted, true);
      assert.equal(isRunning(pid), false);
    } finally {
      if (supervisor.exitCode === null) supervisor.kill('SIGKILL');
    }
  });
}

const prepareCli = async (status: number): Promise<{ cwd: string; env: NodeJS.ProcessEnv }> => {
  const { chmodSync, mkdirSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const cwd = directory();
  assert.equal(spawnSync('git', ['init', '-q', cwd]).status, 0);
  const bin = join(cwd, 'bin');
  mkdirSync(bin);
  const executable = resolve(import.meta.dirname, 'fixtures/validation-pnpm.ts');
  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'pnpm.cmd'), `@"${process.execPath}" ${process.execArgv.join(' ')} "${executable}" %*\r\n`);
  } else {
    const shim = join(bin, 'pnpm');
    writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" ${process.execArgv.join(' ')} "${executable}" "$@"\n`);
    chmodSync(shim, 0o755);
  }
  writeFileSync(join(cwd, 'pnpm-behaviour.json'), JSON.stringify({ status }));
  const { delimiter } = await import('node:path');
  return { cwd, env: { ...process.env, PATH: `${bin}${delimiter}${process.env['PATH'] ?? process.env['Path'] ?? ''}` } };
};

void test('CLI executes only the requested lane, passes its budget, and labels the result diagnostic', async () => {
  const { spawnSync } = await import('node:child_process');
  const { readdirSync } = await import('node:fs');
  const { cwd, env } = await prepareCli(0);
  const result = spawnSync(
    process.execPath,
    [...process.execArgv, resolve(import.meta.dirname, '../../scripts/lanes.ts'), '--run', '--only=webgpu', '--output=compact'],
    { cwd, env, encoding: 'utf8', timeout: 8000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /diagnostic subset passed; full validation is still required/);
  const calls = readFileSync(join(cwd, 'pnpm-calls.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as string[]);
  assert.deepEqual(calls, [['test:browser:webgpu', '--no-file-parallelism']]);
  const logs = join(cwd, '.workspace/logs');
  const summary = JSON.parse(
    readFileSync(
      join(
        logs,
        readdirSync(logs).find(name => name.endsWith('.json'))!,
      ),
      'utf8',
    ),
  ) as { completed: boolean; diagnostic: boolean; results: Array<{ result: { logPath: string } }> };
  assert.equal(summary.completed, true);
  assert.equal(summary.diagnostic, true);
  assert.match(readFileSync(summary.results[0]!.result.logPath, 'utf8'), /timeoutMs=1200000/);
  assert.throws(() => readFileSync(join(cwd, '.git/exojs-validation.lock')));
});

void test('CLI is fail-fast and records not-completed instead of running the next lane after a failure', async () => {
  const { spawnSync } = await import('node:child_process');
  const { readdirSync } = await import('node:fs');
  const { cwd, env } = await prepareCli(7);
  const result = spawnSync(
    process.execPath,
    [...process.execArgv, resolve(import.meta.dirname, '../../scripts/lanes.ts'), '--run', '--only=webgpu,bench', '--output=silent'],
    { cwd, env, encoding: 'utf8', timeout: 8000 },
  );
  assert.equal(result.status, 7);
  assert.equal(readFileSync(join(cwd, 'pnpm-calls.jsonl'), 'utf8').trim().split('\n').length, 1);
  const logs = join(cwd, '.workspace/logs');
  const summary = JSON.parse(
    readFileSync(
      join(
        logs,
        readdirSync(logs).find(name => name.endsWith('.json'))!,
      ),
      'utf8',
    ),
  ) as { completed: boolean; selected: string[]; results: unknown[] };
  assert.equal(summary.completed, false);
  assert.deepEqual(summary.selected, ['webgpu', 'bench']);
  assert.equal(summary.results.length, 1);
});

void test('dry-run typo fails before spawning a lane or claiming success', async () => {
  const { spawnSync } = await import('node:child_process');
  const cwd = directory();
  const result = spawnSync(process.execPath, [...process.execArgv, resolve(import.meta.dirname, '../../scripts/lanes.ts'), '--only=webgup'], {
    cwd,
    encoding: 'utf8',
    timeout: 8000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown local lane/);
  assert.throws(() => readFileSync(join(cwd, 'pnpm-calls.jsonl')));
});

void test('linked worktrees contend for the same repository validation lock', async () => {
  const { spawnSync } = await import('node:child_process');
  const { acquireValidationLock } = await import('../../scripts/lib/validation-lock.ts');
  const cwd = directory();
  const worktree = join(directory(), 'linked');
  assert.equal(spawnSync('git', ['init', '-q', cwd]).status, 0);
  assert.equal(
    spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd }).status,
    0,
  );
  assert.equal(spawnSync('git', ['worktree', 'add', '--detach', worktree], { cwd }).status, 0);
  const first = acquireValidationLock(cwd);
  try {
    assert.throws(() => acquireValidationLock(worktree), /Validation already owns/);
  } finally {
    first.release();
  }
});

void test('all existing stage selections, coverage mode and JUnit names remain available', async () => {
  const { LANES, planCi } = await import('../../scripts/ci/lanes.ts');
  const plan = planCi({ eventName: 'push', changedFiles: ['src/rendering/Texture.ts'], refName: 'next' });
  assert.equal(plan.coverage, true);
  assert.deepEqual(
    plan.test.map(lane => lane.id),
    ['unit', 'webgl', 'webgpu', 'firefox', 'bench'],
  );
  assert.match(plan.test.find(lane => lane.id === 'unit')!.run, /node --test test\/ci\/validation.node.ts && EXOJS_REQUIRE_NAGA=1 pnpm test:coverage/);
  assert.match(plan.test.find(lane => lane.id === 'webgpu')!.run, /test-results\/webgpu.junit.xml/);
  assert.ok(LANES.find(lane => lane.id === 'unit')!.run.endsWith('pnpm test && pnpm test:alloc && pnpm test:physics-perf'));
});

void test('a synchronous spawn error is reported without leaking the log stream', async () => {
  const result = await runCommand({ label: 'invalid-spawn', command: '', args: ['--test'], cwd: directory(), output: 'silent' });
  assert.equal(result.status, 1);
  assert.match(readFileSync(result.logPath!, 'utf8'), /Failed to start invalid-spawn/);
});

void test('successful commands do not leave signal listeners behind', async () => {
  const before = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
  for (let i = 0; i < 5; i++) assert.equal((await run('streams', directory())).status, 0);
  assert.deepEqual(
    ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)),
    before,
  );
});

void test('unconfigured generic commands retain their unlimited deadline contract', async () => {
  const result = await run('streams', directory());
  assert.match(readFileSync(result.logPath!, 'utf8'), /timeoutMs=none/);
});
