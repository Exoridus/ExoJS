import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream, mkdirSync, openSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Readable } from 'node:stream';

import type { EffectiveOutputMode } from './output.ts';
import { stopProcessTree } from './process-tree.ts';

const DEFAULT_TAIL_LINES = 120;
const MAX_TAIL_CHARS = 64 * 1024;

export interface RunCommandOptions {
  readonly label: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly output: EffectiveOutputMode;
  readonly minimumTailLines?: number;
  readonly timeoutMs?: number;
  readonly killGraceMs?: number;
  readonly signal?: AbortSignal;
}

export interface RunCommandResult {
  readonly status: number;
  readonly signal: NodeJS.Signals | null;
  readonly durationMs: number;
  readonly logPath?: string;
  readonly logError?: string;
  readonly timedOut?: boolean;
  readonly aborted?: boolean;
  readonly cleanupError?: string;
}

const duration = (milliseconds: number): string => `${(milliseconds / 1000).toFixed(1)}s`;
const positiveTimer = (value: number, name: string): number => {
  if (!Number.isInteger(value) || value <= 0 || value > 2_147_483_647) throw new Error(`${name} must be a positive timer value below 2^31 ms.`);
  return value;
};

class TailBuffer {
  private value = '';
  private readonly limit: number;

  public constructor(limit: number) {
    this.limit = limit;
  }

  public append(chunk: string): void {
    // A single unterminated shader/compiler diagnostic must also be bounded.
    const lines = (this.value + chunk.slice(-MAX_TAIL_CHARS)).slice(-MAX_TAIL_CHARS).split('\n');
    this.value = lines.slice(-this.limit).join('\n');
  }

  public text(): string {
    return this.value;
  }
}

/**
 * Read-only listing of the process tree this run owns. Uses the same ownership
 * rule as the stop path - descendants of the child, never a sweep by executable
 * name - and terminates nothing.
 */
const describeOwnedTree = (root: number | undefined): string[] => {
  if (root === undefined) return ['(no pid)'];
  const script =
    '$rootPid = [int]$env:EXOJS_TREE_ROOT;' +
    '$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name;' +
    '$ids = New-Object System.Collections.Generic.HashSet[int];' +
    '[void]$ids.Add($rootPid);' +
    'do { $added = $false; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) { [void]$ids.Add([int]$p.ProcessId); $added = $true } } } while ($added);' +
    '$all | Where-Object { $ids.Contains([int]$_.ProcessId) } | ForEach-Object { "$($_.ProcessId)<-$($_.ParentProcessId) $($_.Name)" }';
  const out = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, EXOJS_TREE_ROOT: String(root) },
  });
  const text = (out.stdout || out.stderr || 'snapshot failed').trim();
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
};

/** Runs a noninteractive validation command with optional deadlines and persistent logs in every output mode. */
export const runCommand = async (options: RunCommandOptions): Promise<RunCommandResult> => {
  const timeoutMs = options.timeoutMs === undefined ? undefined : positiveTimer(options.timeoutMs, 'timeoutMs');
  const graceMs = positiveTimer(options.killGraceMs ?? 2000, 'killGraceMs');
  const started = Date.now();
  if (options.signal?.aborted) return { status: 130, signal: null, durationMs: 0, aborted: true };

  const cwd = resolve(options.cwd ?? process.cwd());
  const logDirectory = resolve(cwd, '.workspace/logs');
  const safe =
    options.label
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'command';
  const path = resolve(logDirectory, `${safe}-${Date.now()}-${process.pid}-${randomUUID()}.log`);
  let fd: number;
  try {
    mkdirSync(logDirectory, { recursive: true });
    fd = openSync(path, 'wx');
  } catch (error) {
    process.stderr.write(`FAIL ${options.label}: cannot open log: ${String(error)}\n`);
    return { status: 1, signal: null, durationMs: Date.now() - started, logPath: path, logError: String(error) };
  }
  const log = createWriteStream(path, { fd, autoClose: true });
  const tail = new TailBuffer(options.minimumTailLines ?? DEFAULT_TAIL_LINES);
  const live = options.output === 'normal' || options.output === 'verbose';
  const showProgress = options.output !== 'silent';
  const displayPath = relative(process.cwd(), path).replaceAll('\\', '/');

  return new Promise<RunCommandResult>(resolveResult => {
    let finished = false;
    let closing = false;
    let logError: string | undefined;
    let cleanupError: string | undefined;
    let reason: 'timeout' | 'abort' | 'log' | undefined;
    let requestedSignal: NodeJS.Signals | null = null;
    let closed: { status: number; signal: NodeJS.Signals | null } | undefined;
    let stopping: Promise<void> | undefined;
    let cleanupDone = false;
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    const paused = new Set<Readable>();
    const hasArguments = (options.args?.length ?? 0) > 0;
    const windowsShell = process.platform === 'win32' && (options.command === 'pnpm' || options.command.endsWith('.cmd'));
    const executable = hasArguments && process.platform === 'win32' && options.command === 'pnpm' ? 'pnpm.cmd' : options.command;
    const common: SpawnOptions = {
      cwd,
      env: { ...process.env, EXOJS_OUTPUT: options.output },
      stdio: ['inherit', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    };
    let child: ChildProcess;
    const spawnStarted = Date.now();
    let exitedAt: number | undefined;

    // `runCommand` settles on `close`, which only fires once every inherited
    // stdio handle is released. A finished command held open by a surviving
    // descendant and a command that never finished look identical from outside,
    // and they need opposite fixes - so each transition is timestamped into the
    // run's own log while the hang is still observable.
    const trace = (event: string, extra = ''): void => {
      // Stdio and child events still arrive after `report` has ended the log: a
      // failed spawn settles on `error` before its pipes close, and the child's
      // `close` is emitted from inside the last pipe's `close`, ahead of the
      // listeners registered here. `writable` is false once the log is ended,
      // errored or destroyed.
      if (!log.writable) return;
      const at = Date.now() - spawnStarted;
      const streams = (['stdout', 'stderr'] as const)
        .map(name => {
          const stream = child[name];
          if (!stream) return `${name}=absent`;
          const readable = stream as Readable & { readableLength?: number };
          return `${name}[ended=${readable.readableEnded ?? false} destroyed=${stream.destroyed} paused=${readable.isPaused?.() ?? false} buffered=${readable.readableLength ?? 0}]`;
        })
        .join(' ');
      log.write(`trace t+${at}ms pid=${child.pid ?? '?'} ${event} exitedAt=${exitedAt === undefined ? 'no' : 'yes'} ${streams} ${extra}\n`);
    };
    try {
      child = windowsShell
        ? spawn(
            process.env['ComSpec'] ?? 'cmd.exe',
            ['/d', '/s', '/c', [executable, ...(options.args ?? [])].map(arg => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(' ')],
            common,
          )
        : hasArguments
          ? spawn(executable, [...options.args!], common)
          : spawn(options.command, { ...common, shell: true });
    } catch (error) {
      const message = `Failed to start ${options.label}: ${String(error)}\n`;
      process.stderr.write(message);
      const result = { status: 1, signal: null, durationMs: Date.now() - started, logPath: path };
      log.once('error', () => resolveResult(result));
      log.end(message, () => resolveResult(result));
      return;
    }

    const spawnFinished = Date.now();
    trace('spawn');
    child.once('exit', (code, signal) => {
      exitedAt = Date.now();
      trace('child-exit', `code=${code} signal=${signal}`);
    });
    for (const name of ['stdout', 'stderr'] as const) {
      const stream = child[name];
      if (!stream) continue;
      stream.once('end', () => trace(`${name}-end`));
      stream.once('close', () => trace(`${name}-close`));
      stream.once('error', error => trace(`${name}-error`, error.message));
    }

    const resume = (): void => {
      for (const stream of paused) stream.resume();
      paused.clear();
    };
    const report = (): void => {
      if (finished || closing || !closed || (reason && !cleanupDone)) return;
      closing = true;
      clearTimeout(timeout);
      clearInterval(heartbeat);
      clearInterval(idle);
      clearTimeout(drainTimer);
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onTerminate);
      options.signal?.removeEventListener('abort', onAbort);
      resume();
      const result: RunCommandResult = {
        status: reason === 'timeout' ? 124 : reason === 'abort' ? (requestedSignal === 'SIGTERM' ? 143 : 130) : logError ? 1 : closed.status,
        signal: requestedSignal ?? closed.signal,
        durationMs: Date.now() - started,
        logPath: path,
        ...(logError ? { logError } : {}),
        ...(cleanupError ? { cleanupError } : {}),
        ...(reason === 'timeout' ? { timedOut: true } : {}),
        ...(reason === 'abort' ? { aborted: true } : {}),
      };
      const complete = (): void => {
        if (finished) return;
        finished = true;
        if (logError) {
          // A late filesystem failure must not turn into a successful result.
          if (result.status === 0) Object.assign(result, { status: 1 });
          Object.assign(result, { logError });
        }
        if (result.status !== 0) {
          process.stderr.write(`FAIL ${options.label} (${reason ?? `exit ${result.status}`}, ${duration(result.durationMs)})\n`);
          if (logError) process.stderr.write(`Log write failed: ${logError}\n`);
          if (cleanupError) process.stderr.write(`Cleanup: ${cleanupError}\n`);
          if (!live && tail.text()) process.stderr.write(`--- diagnostic tail ---\n${tail.text()}\n`);
          process.stderr.write(`Full log: ${displayPath}\n`);
        } else if (showProgress) process.stdout.write(`PASS ${options.label} ${duration(result.durationMs)}\n`);
        resolveResult(result);
      };
      if (!log.destroyed)
        log.write(
          `\nexit=${result.status}\nsignal=${result.signal ?? 'none'}\nreason=${reason ?? (logError ? 'log' : 'exit')}\ndurationMs=${result.durationMs}\n`,
        );
      if (log.destroyed) complete();
      else {
        log.once('close', complete);
        log.end();
      }
    };
    const stop = (why: 'timeout' | 'abort' | 'log', signal: NodeJS.Signals | null = null): void => {
      if (finished || closing || stopping) return;
      reason = why;
      requestedSignal = signal;
      trace('stop', `why=${why} signal=${signal ?? 'none'} tree=[${describeOwnedTree(child.pid).join(' | ')}]`);
      process.stderr.write(`STOP ${options.label}: ${why}; owned PID ${child.pid ?? 'not started'}; log ${displayPath}\n`);
      stopping = stopProcessTree(child, graceMs, { earliest: spawnStarted, latest: spawnFinished, ...(exitedAt === undefined ? {} : { exitedAt }) })
        .then(error => {
          cleanupError = error;
          cleanupDone = true;
          if (closed) report();
          else {
            // Broken inherited pipes or a failed OS cleanup cannot keep the supervisor alive forever.
            drainTimer = setTimeout(() => {
              cleanupError ??= 'Owned process did not close after termination; inspect descendants before retrying.';
              child.stdout?.destroy();
              child.stderr?.destroy();
              child.unref();
              closed ??= { status: 1, signal: null };
              report();
            }, 1000);
          }
        })
        .catch(error => {
          cleanupError = String(error);
          cleanupDone = true;
          child.stdout?.destroy();
          child.stderr?.destroy();
          child.unref();
          closed ??= { status: 1, signal: null };
          report();
        });
    };
    const onInterrupt = (): void => stop('abort', 'SIGINT');
    const onTerminate = (): void => stop('abort', 'SIGTERM');
    const onAbort = (): void => stop('abort', options.signal?.reason === 'SIGTERM' ? 'SIGTERM' : null);
    const timeout = timeoutMs === undefined ? undefined : setTimeout(() => stop('timeout'), timeoutMs);
    const heartbeat = setInterval(() => {
      if (showProgress)
        process.stdout.write(
          `RUN ${options.label} ${duration(Date.now() - started)} / ${timeoutMs === undefined ? 'no deadline' : duration(timeoutMs)}; PID ${child.pid ?? '?'}; log ${displayPath}\n`,
        );
    }, 30_000);
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onTerminate);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    // Covers an abort between the preflight check and listener registration.
    if (options.signal?.aborted) onAbort();
    log.on('error', error => {
      logError ??= error.message;
      resume();
      stop('log');
    });
    log.on('drain', resume);
    log.write(`$ ${options.command}${options.args?.length ? ` ${options.args.join(' ')}` : ''}\ncwd=${cwd}\ntimeoutMs=${timeoutMs ?? 'none'}\n`);

    // A stall is only diagnosable while it is happening. After a minute without
    // output the owned tree is recorded, so a log that later ends in a deadline
    // says which processes were still alive at the moment nothing was happening.
    // Observation only - nothing here terminates anything.
    const IDLE_MS = 60_000;
    let lastActivity = Date.now();
    child.stdout?.on('data', () => {
      lastActivity = Date.now();
    });
    child.stderr?.on('data', () => {
      lastActivity = Date.now();
    });
    const idle = setInterval(() => {
      const idleMs = Date.now() - lastActivity;
      if (finished || closing || idleMs < IDLE_MS) return;
      const tree = describeOwnedTree(child.pid);
      trace('idle-snapshot', `idleMs=${idleMs} tree=[${tree.join(' | ')}]`);
    }, 15_000);
    idle.unref?.();
    if (showProgress)
      process.stdout.write(
        `RUN ${options.label}; PID ${child.pid ?? '?'}; timeout ${timeoutMs === undefined ? 'no deadline' : duration(timeoutMs)}; log ${displayPath}\n`,
      );
    const consume = (stream: Readable, destination: NodeJS.WriteStream): void => {
      stream.on('data', (chunk: Buffer) => {
        tail.append(chunk.toString());
        if (live) destination.write(chunk);
        if (!logError && !log.destroyed && !log.write(chunk)) {
          stream.pause();
          paused.add(stream);
          trace('log-backpressure', `paused=${paused.size} needDrain=${log.writableNeedDrain ?? 'n/a'}`);
        }
      });
      stream.on('error', error => {
        tail.append(`\nStream error: ${error.message}\n`);
        logError ??= error.message;
        stop('log');
      });
    };
    consume(child.stdout!, process.stdout);
    consume(child.stderr!, process.stderr);
    child.once('error', error => {
      const diagnostic = `Failed to start ${options.label}: ${error.message}\n`;
      tail.append(diagnostic);
      if (live) process.stderr.write(diagnostic);
      if (!logError && !log.destroyed) log.write(diagnostic);
      closed = { status: 1, signal: null };
      report();
    });
    child.once('close', (status, signal) => {
      closed = { status: status ?? 1, signal };
      trace('child-close', `code=${status} signal=${signal}`);
      report();
    });
  });
};
