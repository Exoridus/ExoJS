import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { mock, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { stopProcessTree } from '../../scripts/lib/process-tree.ts';
import { runCommand } from '../../scripts/lib/run-command.ts';

// Git hooks export GIT_DIR and related variables. Inherited by the fixture's git
// calls, they would re-initialize, commit to and add worktrees to the repository
// running the hook instead of the temporary fixture repositories.
for (const name of Object.keys(process.env)) {
  if (name.startsWith('GIT_')) {
    delete process.env[name];
  }
}

const fixture = resolve(import.meta.dirname, 'fixtures/validation-process.ts');
const temporary: string[] = [];

const directory = (): string => {
  const path = mkdtempSync(join(tmpdir(), 'exojs-validation-'));
  temporary.push(path);

  return path;
};

const retainCleanupEvidence = (result: Awaited<ReturnType<typeof runCommand>>, cwd: string): string | undefined => {
  if (result.logPath && (result.cleanupError || process.env['EXOJS_VALIDATION_DIAGNOSTICS'] === '1')) {
    try {
      const directory = resolve('.workspace/logs');
      const retained = join(directory, `validation-cleanup-${basename(result.logPath)}`);
      mkdirSync(directory, { recursive: true });
      copyFileSync(result.logPath, retained, constants.COPYFILE_EXCL);

      if (result.cleanupError) {
        let pid: number | null = null;
        let running: boolean | null = null;

        try {
          const value = Number(readFileSync(join(cwd, 'pid'), 'utf8').slice(0, 32));

          if (Number.isSafeInteger(value) && value > 0) {
            pid = value;
            running = isRunning(value);
          }
        } catch {
          // Missing markers or inaccessible processes cannot confirm liveness.
        }

        writeFileSync(
          `${retained}.cleanup.json`,
          `${JSON.stringify({
            checkedAt: new Date().toISOString(),
            pid,
            running,
            expired: existsSync(join(cwd, 'pid.expired')),
            rootExpired: existsSync(join(cwd, 'pid.root-expired')),
          })}\n`,
          { flag: 'wx' },
        );
      }

      process.stderr.write(`Retained cleanup trace: ${relative(process.cwd(), retained)}\n`);

      return retained;
    } catch (error) {
      process.stderr.write(`Cannot retain cleanup trace: ${String(error)}\n`);
    }
  }

  return undefined;
};

const run = async (mode: string, cwd: string, extra: Partial<Parameters<typeof runCommand>[0]> = {}) => {
  const result = await runCommand({
    label: 'supervisor-test',
    command: process.execPath,
    args: [fixture, mode],
    cwd,
    output: 'silent',
    ...extra,
  });
  retainCleanupEvidence(result, cwd);

  return result;
};

// The supervisor announces a failed run on the process streams, so a test that
// provokes one would print a fake `FAIL` block into an otherwise green run. A
// capture keeps those announcements, asserts them and restores the streams.
// Scoping matters in both directions: only the labels this file supervises are
// captured, because a supervised command may legitimately print text of the same
// shape, and everything else is forwarded untouched so the runner's own result
// lines and a live child's mirrored output stay visible.
const SUPERVISED = '(?:supervisor-test|missing|invalid-spawn)';
const ANNOUNCEMENT = new RegExp(`^(?:(?:FAIL|STOP|RUN|PASS) ${SUPERVISED}\\b|Failed to start ${SUPERVISED}:)`);
// The tail and the full-log pointer carry no label. They belong to the failure
// report a labelled announcement opens, and the supervisor never writes them
// before it, so they are only taken once one has been seen.
const REPORT = /^(?:--- diagnostic tail ---|Full log: )/;

const capture = async <T>(block: () => Promise<T>): Promise<{ result: T; stdout: string; stderr: string }> => {
  let stdout = '';
  let stderr = '';
  let announced = false;

  const patch = (stream: NodeJS.WriteStream, sink: (text: string) => void): (() => void) => {
    const original = stream.write;
    stream.write = ((chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
      const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();

      if (ANNOUNCEMENT.test(text)) {
        announced = true;
      } else if (!announced || !REPORT.test(text)) {
        return (original as (...args: unknown[]) => boolean).call(stream, chunk, ...rest);
      }

      sink(text);

      return true;
    }) as typeof stream.write;

    return () => {
      stream.write = original;
    };
  };

  const restore = [patch(process.stdout, text => (stdout += text)), patch(process.stderr, text => (stderr += text))];

  try {
    const result = await block();

    return { result, stdout, stderr };
  } finally {
    for (const undo of restore) {
      undo();
    }
  }
};

const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);

    if (process.platform === 'linux' && readFileSync(`/proc/${pid}/stat`, 'utf8').includes(') Z ')) {
      return false;
    }

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH' || (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }

    throw error;
  }
};

const waitForFile = async (path: string): Promise<number> => {
  for (let i = 0; i < 100; i++) {
    try {
      const pid = Number(readFileSync(path, 'utf8'));

      if (Number.isSafeInteger(pid) && pid > 0) {
        return pid;
      }
    } catch {
      // The fixture may not have opened its PID file yet.
    }

    await delay(20);
  }

  throw new Error(`Fixture did not write ${path}`);
};

void test('cleanup evidence retains only the owned PID, sentinel state and log', () => {
  const cwd = directory();
  const logPath = join(cwd, `${basename(cwd)}.log`);
  writeFileSync(logPath, 'owned cleanup log\n');
  writeFileSync(join(cwd, 'pid'), String(process.pid));
  writeFileSync(join(cwd, 'pid.expired'), 'expired');
  writeFileSync(join(cwd, 'unrelated.json'), 'not part of cleanup evidence');
  const retained = retainCleanupEvidence({ status: 130, signal: null, durationMs: 1, cleanupError: 'diagnostic contract', logPath }, cwd);
  assert.ok(retained);
  assert.equal(readFileSync(retained, 'utf8'), 'owned cleanup log\n');
  const snapshot = JSON.parse(readFileSync(`${retained}.cleanup.json`, 'utf8'));
  assert.deepEqual(Object.keys(snapshot).sort(), ['checkedAt', 'expired', 'pid', 'rootExpired', 'running']);
  assert.equal(snapshot.pid, process.pid);
  assert.equal(snapshot.running, true);
  assert.equal(snapshot.expired, true);
  assert.equal(snapshot.rootExpired, false);
  assert.ok(Number.isFinite(Date.parse(snapshot.checkedAt)));
});

void test('cleanup evidence never treats a missing or invalid PID marker as a process', () => {
  for (const marker of [undefined, '', '0', '-1', 'not a PID']) {
    const cwd = directory();
    const logPath = join(cwd, `${basename(cwd)}.log`);
    writeFileSync(logPath, 'owned cleanup log\n');

    if (marker !== undefined) {
      writeFileSync(join(cwd, 'pid'), marker);
    }

    const retained = retainCleanupEvidence({ status: 130, signal: null, durationMs: 1, cleanupError: 'diagnostic contract', logPath }, cwd);
    assert.ok(retained);
    const snapshot = JSON.parse(readFileSync(`${retained}.cleanup.json`, 'utf8'));
    assert.equal(snapshot.pid, null);
    assert.equal(snapshot.running, null);
    assert.equal(snapshot.expired, false);
    assert.equal(snapshot.rootExpired, false);
  }
});

if (process.platform === 'win32') {
  void test('Windows cleanup phases remain bounded and preserve terminal phases after truncation', async () => {
    const { spawnSync } = await import('node:child_process');
    const script = resolve(import.meta.dirname, '../../scripts/lib/stop-process-tree.ps1').replaceAll("'", "''");
    const command = `
      $ProgressPreference = 'SilentlyContinue'
      $tokens = $null; $errors = $null
      $ast = [Management.Automation.Language.Parser]::ParseFile('${script}', [ref]$tokens, [ref]$errors)
      if ($errors.Count) { throw 'Invalid cleanup script' }
      $writer = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Write-CleanupPhase' }, $true)
      foreach ($statement in $ast.EndBlock.Statements) {
        if ($statement.Extent.StartOffset -ge $writer.Extent.StartOffset) { break }
        if ($statement -is [Management.Automation.Language.AssignmentStatementAst]) { Invoke-Expression $statement.Extent.Text }
      }
      Invoke-Expression $writer.Extent.Text
      foreach ($phase in @('entry', 'cim-begin', 'cim-end', 'root-identity-begin', 'root-identity-end', 'targets')) { Write-CleanupPhase $phase }
      for ($index = 0; $index -lt 100; $index++) { Write-CleanupPhase 'identity-begin' "target=$index" -TargetDetail }
      Write-CleanupPhase 'remaining-begin'
      Write-CleanupPhase 'remaining-end' 'count=0'
      Write-CleanupPhase 'exit'
    `;
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
      { encoding: 'utf8', windowsHide: true, timeout: 8000 },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const phases = result.stderr.trim().split(/\r?\n/);
    assert.ok(phases.length <= 32, `Diagnostic output must stay bounded: ${result.stderr}`);
    assert.match(result.stderr, /details-truncated/);
    assert.match(result.stderr, /remaining-begin/);
    assert.match(result.stderr, /remaining-end count=0/);
    assert.match(phases.at(-1)!, / exit\s*$/);
  });
}

void test('PID readiness waits for a positive integer after an empty publication', async () => {
  const path = join(directory(), 'pid');
  writeFileSync(path, '');
  const ready = waitForFile(path);
  writeFileSync(path, String(process.pid));
  assert.equal(await ready, process.pid);
});

for (const output of ['silent', 'compact', 'normal', 'verbose'] as const) {
  void test(`records both streams and propagates ${output} mode`, async () => {
    const cwd = directory();
    const { result, stdout } = await capture(() => run('streams', cwd, { output }));
    assert.equal(result.status, 0);
    assert.ok(result.logPath?.startsWith(join(cwd, '.workspace', 'logs')));
    const log = readFileSync(result.logPath!, 'utf8');
    assert.match(log, new RegExp(`stdout:${output}`));
    assert.match(log, /stderr/);
    // Only the live modes mirror the child's own streams, and every mode but
    // `silent` reports its progress on stdout.
    assert.equal(stdout.includes('PASS supervisor-test'), output !== 'silent');
  });
}

void test('a supervised command keeps its own announcement-shaped output', async () => {
  const { result, stdout, stderr } = await capture(() => run('lookalike', directory(), { output: 'normal' }));
  const log = readFileSync(result.logPath!, 'utf8');
  assert.equal(result.status, 0);
  assert.match(log, /PASS stage one/);
  assert.match(log, /RUN benchmark/);
  // The capture is scoped to the supervisor's own labels, so a command that
  // prints `PASS` or `RUN` of its own is forwarded instead of being taken for an
  // announcement, and a successful run announces only its progress.
  assert.equal(stdout.includes('PASS stage one'), false);
  assert.equal(stderr.includes('RUN benchmark'), false);
  assert.match(stdout, /^RUN supervisor-test; PID \d+/);
});

void test('preserves nonzero exit and the unterminated diagnostic line', async () => {
  const { result, stderr } = await capture(() => run('failure', directory()));
  assert.equal(result.status, 7);
  assert.match(readFileSync(result.logPath!, 'utf8'), /line-0[\s\S]*line-124[\s\S]*last-line/);
  assert.match(stderr, /FAIL supervisor-test \(exit 7,/);
  assert.match(stderr, /--- diagnostic tail ---[\s\S]*line-124/);
  assert.match(stderr, /Full log: /);
});

void test('same-label concurrent invocations never overwrite each other', async () => {
  const cwd = directory();
  const { result, stdout, stderr } = await capture(() => Promise.all([run('streams', cwd), run('failure', cwd)]));
  assert.notEqual(result[0]!.logPath, result[1]!.logPath);
  assert.match(readFileSync(result[0]!.logPath!, 'utf8'), /stdout/);
  assert.match(readFileSync(result[1]!.logPath!, 'utf8'), /last-line/);
  // The failing invocation announces itself exactly once even though its sibling
  // shares the label, and the silent sibling announces no progress at all.
  assert.equal(stderr.match(/FAIL supervisor-test \(exit 7,/g)?.length, 1);
  assert.equal(stdout, '');
});

for (const mode of ['sleep', 'stubborn', 'tree', 'detached-tree']) {
  void test(`times out ${mode} without leaving its child running`, async () => {
    const cwd = directory();
    const pidFile = join(cwd, 'pid');
    const { result, stderr } = await capture(() =>
      run(mode, cwd, {
        args: [fixture, mode, pidFile],
        timeoutMs: 300,
        killGraceMs: 100,
      }),
    );
    assert.equal(result.status, 124);
    assert.equal(result.timedOut, true);
    assert.match(stderr, /STOP supervisor-test: timeout; owned PID \d+/);
    assert.equal(stderr.match(/FAIL supervisor-test \(timeout,/g)?.length, 1);
    assert.ok(result.durationMs < (process.platform === 'win32' ? 12_000 : 1600), `duration=${result.durationMs}`);
    assert.equal(result.cleanupError, undefined);
    // A deadline can expire before fixture code runs, so ownership comes from the supervisor and spawn log.
    const pids = new Set([Number(/owned PID (\d+)/.exec(stderr)![1])]);

    for (const match of readFileSync(result.logPath!, 'utf8').matchAll(/child=(\d+)/g)) {
      pids.add(Number(match[1]));
    }

    if (existsSync(pidFile)) {
      const pid = Number(readFileSync(pidFile, 'utf8'));

      if (Number.isSafeInteger(pid) && pid > 0) {
        pids.add(pid);
      }
    }

    for (const pid of pids) {
      for (let i = 0; i < 50 && isRunning(pid); i++) {
        await delay(20);
      }

      assert.equal(isRunning(pid), false, `owned child ${pid} survived`);
    }

    assert.equal(existsSync(`${pidFile}.expired`), false, 'Fixture self-expiry must not substitute for cleanup');
    assert.equal(existsSync(`${pidFile}.root-expired`), false, 'Root self-expiry must not substitute for cleanup');
  });
}

void test('stops a running root even when the recorded spawn window misses the kernel creation time', async () => {
  // Windows stamps a process with a kernel time whose tick is coarser than Date.now() on a busy runner,
  // so the spawn window Node records can end before the creation time the OS reports. A root that Node
  // still holds a handle to cannot have had its PID reused, so that miss must not stop the cleanup.
  const cwd = directory();
  const pidFile = join(cwd, 'pid');
  const child = spawn(process.execPath, [fixture, 'stubborn', pidFile], { stdio: 'ignore', cwd });
  const now = Date.now();

  try {
    const grandchildless = await waitForFile(pidFile);
    assert.equal(grandchildless, child.pid);
    const problem = await stopProcessTree(child, 100, { earliest: now - 60_000, latest: now - 30_000 });
    assert.equal(problem, undefined);

    for (let i = 0; i < 100 && isRunning(child.pid!); i++) {
      await delay(20);
    }

    assert.equal(isRunning(child.pid!), false, `root ${child.pid} survived`);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }
});

void test('timeout diagnostics do not postpone owned process termination', async () => {
  const childProcess = (await import('node:child_process')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const originalSync = childProcess.spawnSync;
  const originalExecFile = childProcess.execFile;
  const originalSpawn = childProcess.spawn;
  const originalKill = process.kill;
  const events: string[] = [];
  mock.method(childProcess, 'spawnSync', (...args: unknown[]) => {
    if (args[0] === 'powershell') {
      events.push('snapshot-start', 'snapshot-end');

      return { stdout: 'diagnostic snapshot', stderr: '', status: 0 };
    }

    return Reflect.apply(originalSync, childProcess, args);
  });
  mock.method(childProcess, 'execFile', (...args: unknown[]) => {
    if (args[0] === 'powershell') {
      events.push('snapshot-start');
      const callback = args.at(-1) as (error: null, stdout: string, stderr: string) => void;

      return originalExecFile(process.execPath, ['-e', ''], () => {
        events.push('snapshot-end');
        callback(null, 'diagnostic snapshot', '');
      });
    }

    return Reflect.apply(originalExecFile, childProcess, args);
  });
  mock.method(childProcess, 'spawn', (...args: unknown[]) => {
    if (Array.isArray(args[1]) && args[1].includes('-RootProcessId')) {
      events.push('cleanup-start');
    }

    return Reflect.apply(originalSpawn, childProcess, args);
  });
  mock.method(process, 'kill', (...args: unknown[]) => {
    if (typeof args[0] === 'number' && args[0] < 0 && args[1] === 'SIGTERM') {
      events.push('cleanup-start');
    }

    return Reflect.apply(originalKill, process, args);
  });
  syncBuiltinESMExports();

  try {
    const { result } = await capture(() => run('stubborn', directory(), { timeoutMs: 300, killGraceMs: 100 }));
    assert.equal(result.status, 124);
    assert.ok(events.includes('cleanup-start'), events.join(','));
    assert.equal(events.includes('snapshot-start'), false, 'Stopping must not launch a competing process inspection');
  } finally {
    mock.restoreAll();
    syncBuiltinESMExports();
  }
});

void test('a completed command retires its pending idle diagnostic process before settling', async () => {
  const childProcess = (await import('node:child_process')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const originalExecFile = childProcess.execFile;
  const originalInterval = globalThis.setInterval;
  const originalNow = Date.now;
  let offset = 0;
  let diagnostic: ReturnType<typeof childProcess.execFile> | undefined;
  let diagnosticClosed = false;
  let observedIdle = false;
  mock.method(Date, 'now', () => originalNow() + offset);
  mock.method(globalThis, 'setInterval', (callback: () => void, milliseconds: number) =>
    milliseconds === 15_000
      ? originalInterval(() => {
          if (!observedIdle) {
            observedIdle = true;
            callback();
          }
        }, 1)
      : originalInterval(callback, milliseconds),
  );
  mock.method(childProcess, 'execFile', (...args: unknown[]) => {
    if (args[0] === 'powershell') {
      const options = args[2] as { signal?: AbortSignal };
      const callback = args.at(-1) as (error: Error | null, stdout: string, stderr: string) => void;
      diagnostic = originalExecFile(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { signal: options.signal }, callback);
      diagnostic.once('close', () => {
        diagnosticClosed = true;
      });

      return diagnostic;
    }

    return Reflect.apply(originalExecFile, childProcess, args);
  });
  syncBuiltinESMExports();

  try {
    const running = capture(() => run('streams', directory()));
    offset = 61_000;
    const { result } = await running;
    assert.equal(result.status, 0);
    assert.ok(diagnostic?.pid, 'The idle diagnostic must actually start');
    assert.equal(diagnosticClosed, true, 'Ownership was released before the diagnostic close event');
    assert.equal(isRunning(diagnostic.pid), false, 'The diagnostic process survived ownership release');
  } finally {
    if (diagnostic?.exitCode === null && diagnostic.signalCode === null) {
      diagnostic.kill();
    }

    mock.restoreAll();
    syncBuiltinESMExports();
  }
});

void test('idle inspection runs once per continuous stall and rearms on either output stream', async () => {
  const childProcess = (await import('node:child_process')).default;
  const { once } = await import('node:events');
  const { syncBuiltinESMExports } = await import('node:module');
  const originalExecFile = childProcess.execFile;
  const originalSpawn = childProcess.spawn;
  const originalInterval = globalThis.setInterval;
  const observers: Array<ReturnType<typeof childProcess.execFile>> = [];
  let command: ReturnType<typeof childProcess.spawn> | undefined;
  let clock = Date.now();
  let tick!: () => void;
  mock.method(Date, 'now', () => clock);
  mock.method(globalThis, 'setInterval', (callback: () => void, milliseconds: number) => {
    if (milliseconds === 15_000) {
      tick = callback;

      return originalInterval(() => {}, milliseconds);
    }

    return originalInterval(callback, milliseconds);
  });
  mock.method(childProcess, 'spawn', (...args: unknown[]) => {
    command = Reflect.apply(originalSpawn, childProcess, args);

    return command;
  });
  mock.method(childProcess, 'execFile', (...args: unknown[]) => {
    if (args[0] === 'powershell') {
      const options = args[2] as { signal?: AbortSignal };
      const callback = args.at(-1) as (error: Error | null, stdout: string, stderr: string) => void;
      const observer = originalExecFile(process.execPath, ['-e', ''], { signal: options.signal }, callback);
      observers.push(observer);

      return observer;
    }

    return Reflect.apply(originalExecFile, childProcess, args);
  });
  syncBuiltinESMExports();
  const control = join(directory(), 'activity');
  writeFileSync(control, 'ready');
  const script =
    "const fs = require('node:fs'); const path = process.argv[1];" +
    "fs.watchFile(path, { interval: 10 }, () => { const action = fs.readFileSync(path, 'utf8');" +
    "if (action === 'exit') process.exit(0); else if (action === 'stdout' || action === 'stderr') process[action].write('activity\\n'); });" +
    "process.stdout.write('ready\\n');";
  const running = capture(() => run('streams', directory(), { args: ['-e', script, control] }));

  const finishInspection = async (): Promise<void> => {
    await once(observers.at(-1)!, 'close');
    await new Promise<void>(resolve => setImmediate(resolve));
  };

  try {
    assert.ok(command?.stdout);
    await once(command.stdout, 'data');
    clock += 61_000;
    tick();
    await finishInspection();
    assert.equal(observers.length, 1);
    tick();
    assert.equal(observers.length, 1, 'A completed snapshot must not repeat without new output');

    for (const stream of ['stdout', 'stderr'] as const) {
      const activity = once(command[stream]!, 'data');
      writeFileSync(control, stream);
      await activity;
      clock += 61_000;
      const previous: number = observers.length;
      tick();
      assert.equal(observers.length, previous + 1, `${stream} must rearm idle inspection`);
      await finishInspection();
      tick();
      assert.equal(observers.length, previous + 1);
    }
  } finally {
    writeFileSync(control, 'exit');
    const { result } = await running;
    await Promise.all(
      observers.filter(observer => observer.exitCode === null && observer.signalCode === null).map(observer => once(observer, 'close')),
    );
    mock.restoreAll();
    syncBuiltinESMExports();
    assert.equal(result.status, 0, 'The idle control fixture must exit successfully');
  }
});

void test('stopping waits for an already aborted idle observer to close', { timeout: 12_000 }, async () => {
  const childProcess = (await import('node:child_process')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const originalExecFile = childProcess.execFile;
  const originalSpawn = childProcess.spawn;
  const originalKill = process.kill;
  const originalInterval = globalThis.setInterval;
  const originalNow = Date.now;
  const controller = new AbortController();
  let inspectedReady!: () => void;
  let cleanupReady!: () => void;
  const inspected = new Promise<void>(resolve => {
    inspectedReady = resolve;
  });
  const cleaned = new Promise<void>(resolve => {
    cleanupReady = resolve;
  });
  let observer: ReturnType<typeof childProcess.execFile> | undefined;
  let offset = 0;
  let settled = false;
  mock.method(Date, 'now', () => originalNow() + offset);
  mock.method(globalThis, 'setInterval', (callback: () => void, milliseconds: number) =>
    originalInterval(callback, milliseconds === 15_000 ? 1 : milliseconds),
  );
  mock.method(childProcess, 'execFile', (...args: unknown[]) => {
    if (args[0] === 'powershell') {
      const callback = args.at(-1) as (error: Error | null, stdout: string, stderr: string) => void;
      // Keep the actual observer open after abort to exercise callback/close ordering independently.
      observer = originalExecFile(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], callback);
      inspectedReady();

      return observer;
    }

    return Reflect.apply(originalExecFile, childProcess, args);
  });
  mock.method(childProcess, 'spawn', (...args: unknown[]) => {
    const child = Reflect.apply(originalSpawn, childProcess, args);

    if (Array.isArray(args[1]) && args[1].includes('-RootProcessId')) {
      child.once('close', cleanupReady);
    }

    return child;
  });
  mock.method(process, 'kill', (...args: unknown[]) => {
    const result = Reflect.apply(originalKill, process, args);

    if (typeof args[0] === 'number' && args[0] < 0 && args[1] === 'SIGKILL') {
      cleanupReady();
    }

    return result;
  });
  syncBuiltinESMExports();

  try {
    const cwd = directory();
    const pidFile = join(cwd, 'pid');
    const running = capture(() =>
      run('stubborn', cwd, { args: [fixture, 'stubborn', pidFile], signal: controller.signal, killGraceMs: 80 }),
    );
    void running.then(() => {
      settled = true;
    });
    await waitForFile(pidFile);
    offset = 61_000;
    await inspected;
    controller.abort();
    offset = 0;
    await cleaned;
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(settled, false, 'Ownership must outlive the observer');
    assert.ok(observer?.pid);
    observer.kill('SIGKILL');
    const { result } = await running;
    assert.equal(result.status, 130);
    assert.equal(result.cleanupError, undefined);
    assert.equal(isRunning(observer.pid), false);
    assert.equal(isRunning(Number(readFileSync(pidFile, 'utf8'))), false);
  } finally {
    controller.abort();
    observer?.kill('SIGKILL');
    mock.restoreAll();
    syncBuiltinESMExports();
  }
});

void test('times out orphan without leaving its child running', async t => {
  const cwd = directory();
  const pidFile = join(cwd, 'pid');
  const { result, stderr } = await capture(() =>
    run('orphan', cwd, {
      args: [fixture, 'orphan', pidFile],
      timeoutMs: 300,
      killGraceMs: 100,
    }),
  );
  let pid = -1;

  for (let i = 0; i < 100; i++) {
    try {
      const published = Number(readFileSync(pidFile, 'utf8'));

      if (Number.isSafeInteger(published) && published > 0) {
        pid = published;
        break;
      }
    } catch {
      // The descendant may not have opened its PID file yet.
    }

    await delay(20);
  }

  // Not every host lets a descendant outlive the process that created it. Where the
  // descendant ends with its parent, no orphan can reach the deadline and the
  // ownership path has nothing to prove.
  if (pid < 0) {
    return t.skip('the host ended the descendant with its parent; no orphan exists here');
  }

  assert.equal(result.status, 124);
  assert.equal(result.timedOut, true);
  assert.match(stderr, /STOP supervisor-test: timeout/);
  assert.match(stderr, /FAIL supervisor-test \(timeout,/);

  for (let i = 0; i < 50 && isRunning(pid); i++) {
    await delay(20);
  }

  assert.equal(isRunning(pid), false, `owned child ${pid} survived`);
});

void test('timeout does not kill an unrelated process', async () => {
  const unrelated = spawn(process.execPath, [fixture, 'sleep'], { stdio: 'ignore' });

  try {
    const { result, stderr } = await capture(() => run('sleep', directory(), { timeoutMs: 200, killGraceMs: 80 }));
    assert.equal(result.status, 124);
    assert.match(stderr, /STOP supervisor-test: timeout/);
    assert.match(stderr, /FAIL supervisor-test \(timeout,/);
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
  const { result, stdout, stderr } = await capture(() =>
    run('sleep', cwd, { args: [fixture, 'sleep', pidFile], signal: controller.signal }),
  );
  assert.equal(result.status, 130);
  assert.equal(result.aborted, true);
  // A run that never started has nothing to announce.
  assert.equal(stdout, '');
  assert.equal(stderr, '');
  assert.throws(() => readFileSync(pidFile));
});

for (const mode of ['stubborn', 'tree', 'detached-tree']) {
  void test(`an explicit abort stops a ready ${mode} and removes process listeners`, async () => {
    const controller = new AbortController();
    const before = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
    const cwd = directory();
    const pidFile = join(cwd, 'pid');
    const running = capture(() =>
      run(mode, cwd, {
        args: [fixture, mode, pidFile],
        signal: controller.signal,
        killGraceMs: 80,
      }),
    );
    const pid = await waitForFile(pidFile);
    assert.equal(isRunning(pid), true, 'The owned fixture must be running before cancellation');
    controller.abort();
    const { result, stderr } = await running;
    assert.equal(result.status, 130);
    assert.equal(result.aborted, true);
    assert.equal(result.cleanupError, undefined);
    assert.equal(isRunning(pid), false, `ready child ${pid} survived`);
    assert.equal(existsSync(`${pidFile}.expired`), false);
    assert.equal(existsSync(`${pidFile}.root-expired`), false);
    assert.match(stderr, /STOP supervisor-test: abort/);
    assert.match(stderr, /FAIL supervisor-test \(abort,/);
    assert.deepEqual(
      ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)),
      before,
    );
  });
}

void test('confirms descendant exit before releasing ownership even after the root closes', async () => {
  const originalKill = process.kill;
  const deliveries: Array<Promise<void>> = [];
  const controller = new AbortController();

  if (process.platform !== 'win32') {
    mock.method(process, 'kill', (...args: unknown[]) => {
      if (typeof args[0] === 'number' && args[0] < 0 && args[1] === 'SIGKILL') {
        // Signal delivery and process exit are separate from root pipe closure.
        deliveries.push(
          new Promise<void>((resolve, reject) => {
            setTimeout(() => {
              try {
                Reflect.apply(originalKill, process, args);
                resolve();
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
                  resolve();
                } else {
                  reject(error instanceof Error ? error : new Error(String(error)));
                }
              }
            }, 50);
          }),
        );

        return true;
      }

      return Reflect.apply(originalKill, process, args);
    });
  }

  try {
    const cwd = directory();
    const pidFile = join(cwd, 'pid');
    const running = capture(() =>
      run('quiet-tree', cwd, {
        args: [fixture, 'quiet-tree', pidFile],
        signal: controller.signal,
        killGraceMs: 80,
      }),
    );
    const pid = await waitForFile(pidFile);
    assert.equal(isRunning(pid), true);
    controller.abort();
    const { result } = await running;
    assert.equal(result.status, 130);
    assert.equal(result.cleanupError, undefined);
    assert.equal(isRunning(pid), false, `owned descendant ${pid} survived ownership release`);
    assert.equal(existsSync(`${pidFile}.expired`), false);

    if (process.platform !== 'win32') {
      assert.ok(deliveries.length > 0, 'The delayed signal must exercise the shutdown barrier');
    }
  } finally {
    controller.abort();
    await Promise.all(deliveries);
    mock.restoreAll();
  }
});

void test('rejects invalid budgets instead of silently disabling supervision', async () => {
  for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31]) {
    await assert.rejects(run('streams', directory(), { timeoutMs }), /timeoutMs/);
  }
});

void test('a log-directory failure is nonzero and does not launch the command', async () => {
  const cwd = directory();
  writeFileSync(join(cwd, '.workspace'), 'not a directory');
  const { result, stderr } = await capture(() => run('sleep', cwd));
  assert.equal(result.status, 1);
  assert.ok(result.logError);
  assert.match(stderr, /^FAIL supervisor-test: cannot open log: /);
  assert.ok(stderr.includes(result.logError), 'the announced reason is the reported one');
});

void test('spawn failure remains nonzero', async () => {
  const { result, stderr } = await capture(() =>
    runCommand({ label: 'missing', command: 'exojs-no-such-command', args: ['--test'], cwd: directory(), output: 'normal' }),
  );
  assert.equal(result.status, 1);
  assert.match(stderr, /Failed to start missing: .*ENOENT/);
  assert.match(stderr, /FAIL missing \(exit 1,/);
  assert.match(stderr, /Full log: /);
});

// A failed spawn settles on the child's `error` event, while the stdio pipes it
// had already opened close afterwards. Their lifecycle events must not write
// into a log that the settled run has already ended.
void test('child events after the run settled never write past the end of its log', async () => {
  const { result } = await capture(() =>
    runCommand({ label: 'missing', command: 'exojs-no-such-command', args: ['--test'], cwd: directory(), output: 'silent' }),
  );
  assert.equal(result.status, 1);
  assert.equal(result.logError, undefined);
  assert.match(readFileSync(result.logPath!, 'utf8'), /\nexit=1\nsignal=none\nreason=exit\ndurationMs=\d+\n$/);
});

test.after(() => {
  for (const path of temporary) {
    rmSync(path, { recursive: true, force: true });
  }
});

void test('the shared lane budget is finite and preserves the longer bench timeout', async () => {
  const { LANES, laneTimeoutMinutes } = await import('../../scripts/ci/lanes.ts');
  assert.equal(typeof laneTimeoutMinutes, 'function');
  assert.equal(laneTimeoutMinutes(LANES.find(lane => lane.id === 'webgpu')!), 30);
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

void test('validation lock waiting continues after a different process releases ownership', async () => {
  const { fork, spawnSync } = await import('node:child_process');
  const { once } = await import('node:events');
  const { waitForValidationLock } = await import('../../scripts/lib/validation-lock.ts');
  const cwd = directory();
  assert.equal(spawnSync('git', ['init', '-q', cwd]).status, 0);
  const owner = fork(resolve(import.meta.dirname, 'fixtures/validation-lock-owner.ts'), [cwd], { silent: true });

  try {
    await once(owner, 'message');
    const exited = once(owner, 'exit');
    let waits = 0;
    const lock = await waitForValidationLock(cwd, new AbortController().signal, () => {
      waits++;
      owner.send('release');
    });

    try {
      await exited;
      assert.equal(waits, 1);
      assert.equal(JSON.parse(readFileSync(lock.path, 'utf8')).pid, process.pid);
    } finally {
      lock.release();
    }
  } finally {
    if (owner.exitCode === null && owner.signalCode === null) {
      owner.kill();
    }
  }
});

void test('validation lock waiting aborts without removing an owner or a replacement token', async () => {
  const { spawnSync } = await import('node:child_process');
  const { acquireValidationLock, waitForValidationLock } = await import('../../scripts/lib/validation-lock.ts');
  const cwd = directory();
  assert.equal(spawnSync('git', ['init', '-q', cwd]).status, 0);
  const owner = acquireValidationLock(cwd);
  const controller = new AbortController();
  const original = readFileSync(owner.path, 'utf8');
  const replacement = JSON.stringify({ ...JSON.parse(original), token: 'replacement' });

  try {
    await assert.rejects(
      waitForValidationLock(cwd, controller.signal, () => {
        writeFileSync(owner.path, replacement);
        controller.abort();
      }),
      { name: 'AbortError' },
    );
    owner.release();
    assert.equal(readFileSync(owner.path, 'utf8'), replacement);
  } finally {
    rmSync(owner.path);
  }
});

void test('validation lock waiting preserves crashed owners until explicit recovery', async () => {
  const { fork, spawnSync } = await import('node:child_process');
  const { once } = await import('node:events');
  const { waitForValidationLock } = await import('../../scripts/lib/validation-lock.ts');
  const cwd = directory();
  assert.equal(spawnSync('git', ['init', '-q', cwd]).status, 0);
  const owner = fork(resolve(import.meta.dirname, 'fixtures/validation-lock-owner.ts'), [cwd], { silent: true });
  await once(owner, 'message');
  const path = join(cwd, '.git/exojs-validation.lock');
  const original = readFileSync(path, 'utf8');
  const exited = once(owner, 'exit');
  owner.kill('SIGKILL');
  await exited;
  const controller = new AbortController();
  await assert.rejects(
    waitForValidationLock(cwd, controller.signal, () => controller.abort()),
    { name: 'AbortError' },
  );
  assert.equal(readFileSync(path, 'utf8'), original);
  rmSync(path);
  const recovered = await waitForValidationLock(cwd, new AbortController().signal, () => assert.fail('Recovered lock should be free'));
  recovered.release();
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
    const supervisor = fork(resolve(import.meta.dirname, 'fixtures/validation-supervisor.ts'), ['stubborn', pidFile], {
      cwd,
      silent: true,
    });
    const output: Buffer[] = [];
    supervisor.stdout!.on('data', (chunk: Buffer) => output.push(chunk));
    supervisor.stderr!.resume();
    const finished = new Promise<number | null>(resolveExit => supervisor.once('exit', resolveExit));

    try {
      const pid = await waitForFile(pidFile);

      // Node.kill is forceful on Windows; IPC exercises the same console-signal handler without killing the supervisor first.
      if (process.platform === 'win32') {
        supervisor.send(signal);
      } else {
        supervisor.kill(signal);
      }

      assert.equal(await finished, signal === 'SIGINT' ? 130 : 143);
      const record = JSON.parse(Buffer.concat(output).toString().trim()) as { status: number; aborted: boolean };
      assert.equal(record.aborted, true);

      for (let i = 0; i < 50 && isRunning(pid); i++) {
        await delay(20);
      }

      assert.equal(isRunning(pid), false, `owned child ${pid} survived`);
    } finally {
      if (supervisor.exitCode === null) {
        supervisor.kill('SIGKILL');
      }
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

  // Test-runner filters can contain shell operators; this fixture needs only Node's native TypeScript support.
  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'pnpm.cmd'), `@"${process.execPath}" "${executable}" %*\r\n`);
  } else {
    const shim = join(bin, 'pnpm');
    writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${executable}" "$@"\n`);
    chmodSync(shim, 0o755);
  }

  writeFileSync(join(cwd, 'pnpm-behaviour.json'), JSON.stringify({ status }));
  const { delimiter } = await import('node:path');

  return { cwd, env: { ...process.env, PATH: `${bin}${delimiter}${process.env['PATH'] ?? process.env['Path'] ?? ''}` } };
};

void test('CLI checkout-only gates do not wait for another checkout resource lane', async () => {
  const { spawnSync } = await import('node:child_process');
  const { acquireValidationLock } = await import('../../scripts/lib/validation-lock.ts');
  const { cwd, env } = await prepareCli(0);
  const repository = acquireValidationLock(cwd);

  try {
    const result = spawnSync(
      process.execPath,
      [...process.execArgv, resolve(import.meta.dirname, '../../scripts/lanes.ts'), '--run', '--only=typecheck', '--output=silent'],
      { cwd, env, encoding: 'utf8', timeout: 3000 },
    );
    assert.equal(result.status, 0, `${String(result.error)} ${result.stderr}`);
    assert.equal(JSON.parse(readFileSync(repository.path, 'utf8')).pid, process.pid);
    assert.match(readFileSync(join(cwd, 'pnpm-calls.jsonl'), 'utf8'), /gates.*typecheck/);
    assert.throws(() => readFileSync(join(cwd, '.git/exojs-checkout-validation.lock')));
  } finally {
    repository.release();
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  void test(`CLI ${signal} cancels resource waiting and releases only its checkout`, { timeout: 10_000 }, async t => {
    const { fork } = await import('node:child_process');
    const { once } = await import('node:events');
    const { acquireValidationLock } = await import('../../scripts/lib/validation-lock.ts');
    const { cwd, env } = await prepareCli(0);
    const owner = acquireValidationLock(cwd);
    const original = readFileSync(owner.path, 'utf8');
    const runner = fork(resolve(import.meta.dirname, 'fixtures/validation-lane-runner.ts'), [], { cwd, env, silent: true });

    try {
      let stderr = '';

      while (!stderr.includes('waiting for validation ownership')) {
        const [chunk] = await once(runner.stderr!, 'data', { signal: t.signal });
        stderr += String(chunk);
      }

      const finished = once(runner, 'exit', { signal: t.signal });
      runner.send(signal);
      const [code] = await finished;
      assert.equal(code, signal === 'SIGINT' ? 130 : 143);
      assert.equal(readFileSync(owner.path, 'utf8'), original);
      assert.throws(() => readFileSync(join(cwd, '.git/exojs-checkout-validation.lock')));
      assert.throws(() => readFileSync(join(cwd, 'pnpm-calls.jsonl')));
    } finally {
      owner.release();

      if (runner.exitCode === null && runner.signalCode === null) {
        runner.kill();
      }
    }
  });
}

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
  assert.deepEqual(calls, [['test:browser:webgpu', '--no-file-parallelism'], ['test:browser:webgpu:media']]);
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
  assert.match(readFileSync(summary.results[0]!.result.logPath, 'utf8'), /timeoutMs=1800000/);
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
  const result = spawnSync(
    process.execPath,
    [...process.execArgv, resolve(import.meta.dirname, '../../scripts/lanes.ts'), '--only=webgup'],
    {
      cwd,
      encoding: 'utf8',
      timeout: 8000,
    },
  );
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
    spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], {
      cwd,
    }).status,
    0,
  );
  assert.equal(spawnSync('git', ['worktree', 'add', '--detach', worktree], { cwd }).status, 0);
  const first = acquireValidationLock(cwd);

  try {
    assert.throws(() => acquireValidationLock(worktree), /Validation already owns/);
    const checkout = acquireValidationLock(cwd, 'checkout');
    const linked = acquireValidationLock(worktree, 'checkout');

    try {
      assert.notEqual(checkout.path, linked.path);
      assert.throws(() => acquireValidationLock(cwd, 'checkout'), /Validation already owns/);
      assert.throws(() => acquireValidationLock(worktree, 'checkout'), /Validation already owns/);
    } finally {
      checkout.release();
      linked.release();
    }
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
  assert.match(
    plan.test.find(lane => lane.id === 'unit')!.run,
    /node --test test\/ci\/validation.node.ts test\/ci\/qualify.node.ts && EXOJS_REQUIRE_NAGA=1 pnpm test:coverage/,
  );
  assert.match(plan.test.find(lane => lane.id === 'webgpu')!.run, /test-results\/webgpu.junit.xml/);
  assert.ok(LANES.find(lane => lane.id === 'unit')!.run.endsWith('pnpm test && pnpm test:alloc && pnpm test:physics-perf'));
});

void test('a synchronous spawn error is reported without leaking the log stream', async () => {
  const { result, stderr } = await capture(() =>
    runCommand({ label: 'invalid-spawn', command: '', args: ['--test'], cwd: directory(), output: 'silent' }),
  );
  assert.equal(result.status, 1);
  assert.match(stderr, /^Failed to start invalid-spawn: /);
  assert.doesNotMatch(stderr, /FAIL invalid-spawn/, 'a command that never spawned is not a supervised failure');
  assert.match(readFileSync(result.logPath!, 'utf8'), /Failed to start invalid-spawn/);
});

void test('successful commands do not leave signal listeners behind', async () => {
  const before = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));

  for (let i = 0; i < 5; i++) {
    const { result, stdout, stderr } = await capture(() => run('streams', directory()));
    assert.equal(result.status, 0);
    assert.equal(stdout + stderr, '');
  }

  assert.deepEqual(
    ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)),
    before,
  );
});

void test('unconfigured generic commands retain their unlimited deadline contract', async () => {
  const { result, stdout, stderr } = await capture(() => run('streams', directory()));
  assert.match(readFileSync(result.logPath!, 'utf8'), /timeoutMs=none/);
  assert.equal(stdout + stderr, '', 'a silent success announces nothing');
});
