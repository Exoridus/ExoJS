import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Readable } from 'node:stream';

import type { EffectiveOutputMode } from './output.ts';

const DEFAULT_TAIL_LINES = 120;
const LOG_DIR = resolve(process.cwd(), '.workspace/logs');

export interface RunCommandOptions {
  readonly label: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly output: EffectiveOutputMode;
  readonly minimumTailLines?: number;
}

export interface RunCommandResult {
  readonly status: number;
  readonly signal: NodeJS.Signals | null;
  readonly durationMs: number;
  readonly logPath?: string;
  readonly logError?: string;
}

const logName = (label: string): string => {
  const safe = label
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${safe || 'command'}.log`;
};

const displayPath = (path: string): string => relative(process.cwd(), path).replaceAll('\\', '/');

const duration = (durationMs: number): string => `${(durationMs / 1000).toFixed(1)}s`;

class TailBuffer {
  private readonly lines: string[] = [];
  private pending = '';

  public constructor(private readonly limit: number) {}

  public append(chunk: string): void {
    const parts = `${this.pending}${chunk}`.split(/\r?\n/);
    this.pending = parts.pop() ?? '';
    for (const line of parts) {
      this.lines.push(line);
      if (this.lines.length > this.limit) this.lines.shift();
    }
  }

  public finish(): void {
    if (this.pending !== '') {
      this.lines.push(this.pending);
      if (this.lines.length > this.limit) this.lines.shift();
      this.pending = '';
    }
  }

  public text(): string {
    return this.lines.join('\n');
  }
}

const writeFailure = (options: RunCommandOptions, result: RunCommandResult, tail: string): void => {
  const code = result.signal ? `signal ${result.signal}` : `exit ${result.status}`;
  process.stderr.write(`FAIL ${options.label} (${code})\n`);
  if (result.logError) process.stderr.write(`Log write failed: ${result.logError}\n`);
  if (tail !== '') process.stderr.write(`\n--- last ${options.minimumTailLines ?? DEFAULT_TAIL_LINES} lines ---\n${tail}\n`);
  if (result.logPath) process.stderr.write(`\nFull log: ${displayPath(result.logPath)}\n`);
};

const writeCompactSuccess = (label: string, durationMs: number): void => {
  process.stdout.write(`PASS ${label} ${duration(durationMs)}\n`);
};

const hasArguments = (options: RunCommandOptions): boolean => (options.args?.length ?? 0) > 0;

const executable = (options: RunCommandOptions): string =>
  hasArguments(options) && process.platform === 'win32' && options.command === 'pnpm' ? 'pnpm.cmd' : options.command;

const usesWindowsShell = (options: RunCommandOptions): boolean =>
  process.platform === 'win32' && (options.command === 'pnpm' || options.command.endsWith('.cmd'));

const windowsCommandLine = (options: RunCommandOptions): string =>
  [executable(options), ...(options.args ?? [])].map(argument => (/\s/.test(argument) ? JSON.stringify(argument) : argument)).join(' ');

const childEnvironment = (options: RunCommandOptions): NodeJS.ProcessEnv => ({
  ...process.env,
  EXOJS_OUTPUT: options.output,
});

const spawnCommand = (options: RunCommandOptions, stdio: Parameters<typeof spawn>[2]['stdio']): ReturnType<typeof spawn> => {
  const common = { cwd: options.cwd, env: childEnvironment(options), stdio };
  if (usesWindowsShell(options)) {
    return spawn(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', windowsCommandLine(options)], common);
  }
  if (hasArguments(options)) return spawn(executable(options), [...(options.args ?? [])], common);
  return spawn(options.command, { ...common, shell: true });
};

const capture = (options: RunCommandOptions): Promise<RunCommandResult> =>
  new Promise(resolveResult => {
    const path = resolve(LOG_DIR, logName(options.label));
    const tail = new TailBuffer(options.minimumTailLines ?? DEFAULT_TAIL_LINES);
    const started = Date.now();
    let log: WriteStream;

    try {
      mkdirSync(LOG_DIR, { recursive: true });
      log = createWriteStream(path, { encoding: 'utf8' });
    } catch (error) {
      const result: RunCommandResult = {
        status: 1,
        signal: null,
        durationMs: Date.now() - started,
        logPath: path,
        logError: String(error),
      };
      writeFailure(options, result, '');
      resolveResult(result);
      return;
    }

    let settled = false;
    let finishing = false;
    let logError: string | undefined;
    const paused = new Set<Readable>();

    const resumePaused = (): void => {
      for (const stream of paused) stream.resume();
      paused.clear();
    };

    const report = (result: RunCommandResult, tailText: string): void => {
      if (result.status === 0) {
        if (options.output === 'compact') writeCompactSuccess(options.label, result.durationMs);
      } else {
        writeFailure(options, result, tailText);
      }
      resolveResult(result);
    };

    log.write(`$ ${options.command}${options.args?.length ? ` ${options.args.join(' ')}` : ''}\n`);
    const child = spawnCommand(options, ['inherit', 'pipe', 'pipe']);

    const finishCommand = (status: number, signal: NodeJS.Signals | null): void => {
      if (settled || finishing) return;
      finishing = true;
      tail.finish();
      const result: RunCommandResult = {
        status: logError ? 1 : status,
        signal,
        durationMs: Date.now() - started,
        logPath: path,
        ...(logError !== undefined && { logError }),
      };
      if (logError) {
        settled = true;
        report(result, tail.text());
        return;
      }
      log.end(() => {
        if (settled) return;
        settled = true;
        report(result, tail.text());
      });
    };

    const failLog = (error: unknown): void => {
      if (logError) return;
      logError = String(error instanceof Error ? error.message : error);
      resumePaused();
      if (child && !child.killed) child.kill();
      if (finishing && !settled) {
        settled = true;
        tail.finish();
        report({ status: 1, signal: null, durationMs: Date.now() - started, logPath: path, logError }, tail.text());
      }
    };

    log.once('error', failLog);
    log.on('drain', resumePaused);
    const consume = (stream: Readable, source: string): void => {
      stream.on('data', chunk => {
        if (logError) return;
        const text = typeof chunk === 'string' ? chunk : chunk.toString();
        tail.append(text);
        try {
          if (!log.write(chunk)) {
            stream.pause();
            paused.add(stream);
          }
        } catch (error) {
          failLog(error);
        }
      });
      stream.on('error', error => {
        const text = `[${source} error] ${String(error)}\n`;
        tail.append(text);
        if (!logError) {
          try {
            log.write(text);
          } catch (writeError) {
            failLog(writeError);
          }
        }
      });
    };
    consume(child.stdout!, 'stdout');
    consume(child.stderr!, 'stderr');
    child.once('error', error => {
      const text = `${String(error.message ?? error)}\n`;
      tail.append(text);
      if (!logError) {
        try {
          log.write(text);
        } catch (writeError) {
          failLog(writeError);
        }
      }
      finishCommand(1, null);
    });
    child.once('close', (status, signal) => finishCommand(status ?? 1, signal));
  });

/** Runs a command without buffering its complete output in memory. */
export const runCommand = (options: RunCommandOptions): Promise<RunCommandResult> => {
  if (options.output === 'compact' || options.output === 'silent') return capture(options);

  return new Promise(resolveResult => {
    const started = Date.now();
    let settled = false;
    const finish = (status: number, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      resolveResult({ status, signal, durationMs: Date.now() - started });
    };
    const child = spawnCommand(options, 'inherit');
    child.once('error', error => {
      process.stderr.write(`Failed to start ${options.label}: ${error.message}\n`);
      finish(1, null);
    });
    child.once('close', (status, signal) => finish(status ?? 1, signal));
  });
};
