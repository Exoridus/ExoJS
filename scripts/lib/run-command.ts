import { createWriteStream, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { relative, resolve } from 'node:path';

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
  if (tail !== '') process.stderr.write(`\n--- last ${options.minimumTailLines ?? DEFAULT_TAIL_LINES} lines ---\n${tail}\n`);
  if (result.logPath) process.stderr.write(`\nFull log: ${displayPath(result.logPath)}\n`);
};

const writeCompactSuccess = (label: string, durationMs: number): void => {
  process.stdout.write(`PASS ${label} ${duration(durationMs)}\n`);
};

const hasArguments = (options: RunCommandOptions): boolean => (options.args?.length ?? 0) > 0;

const executable = (options: RunCommandOptions): string =>
  hasArguments(options) && process.platform === 'win32' && options.command === 'pnpm' ? 'pnpm.cmd' : options.command;

const windowsCommandLine = (options: RunCommandOptions): string =>
  [executable(options), ...(options.args ?? [])].map(argument => (/\s/.test(argument) ? JSON.stringify(argument) : argument)).join(' ');

const spawnCommand = (options: RunCommandOptions, stdio: Parameters<typeof spawn>[2]['stdio']): ReturnType<typeof spawn> =>
  hasArguments(options) && process.platform === 'win32'
    ? spawn(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', windowsCommandLine(options)], { cwd: options.cwd, stdio })
    : hasArguments(options)
      ? spawn(executable(options), [...(options.args ?? [])], { cwd: options.cwd, stdio })
      : spawn(options.command, { cwd: options.cwd, shell: true, stdio });

const capture = (options: RunCommandOptions): Promise<RunCommandResult> =>
  new Promise(resolveResult => {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = resolve(LOG_DIR, logName(options.label));
    const log = createWriteStream(path, { encoding: 'utf8' });
    const tail = new TailBuffer(options.minimumTailLines ?? DEFAULT_TAIL_LINES);
    const started = Date.now();
    let settled = false;

    const finish = (status: number, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      tail.finish();
      const result: RunCommandResult = { status, signal, durationMs: Date.now() - started, logPath: path };
      log.end(() => {
        if (status === 0) {
          if (options.output === 'compact') writeCompactSuccess(options.label, result.durationMs);
        } else {
          writeFailure(options, result, tail.text());
        }
        resolveResult(result);
      });
    };

    log.write(`$ ${options.command}${options.args?.length ? ` ${options.args.join(' ')}` : ''}\n`);
    const child = spawnCommand(options, ['inherit', 'pipe', 'pipe']);
    const consume = (stream: NodeJS.ReadableStream, source: string): void => {
      stream.on('data', chunk => {
        log.write(chunk);
        const text = typeof chunk === 'string' ? chunk : chunk.toString();
        tail.append(text);
      });
      stream.on('error', error => {
        const text = `[${source} error] ${String(error)}\n`;
        log.write(text);
        tail.append(text);
      });
    };
    consume(child.stdout!, 'stdout');
    consume(child.stderr!, 'stderr');
    child.once('error', error => {
      const text = `${String(error.message ?? error)}\n`;
      log.write(text);
      tail.append(text);
      finish(1, null);
    });
    child.once('close', (status, signal) => finish(status ?? 1, signal));
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
    child.once('error', () => finish(1, null));
    child.once('close', (status, signal) => finish(status ?? 1, signal));
  });
};
