export enum LogSeverity {
  Debug = 0,
  Info = 1,
  Warning = 2,
  Error = 3,
}

export type LogChannel = 'core' | 'rendering' | 'audio' | 'input' | 'assets' | 'physics' | 'ui' | 'animation' | 'scene' | (string & {});

export interface LogEntry {
  readonly severity: LogSeverity;
  readonly channel: LogChannel;
  readonly message: string;
  readonly data?: Record<string, unknown>;
  readonly error?: Error;
}

type LogHandler = (entry: LogEntry) => void;

export class Logger {
  private readonly _handlers: LogHandler[] = [];
  private readonly _warnedKeys = new Set<string>();

  public log(severity: LogSeverity, channel: LogChannel, message: string, options?: { data?: Record<string, unknown>; error?: Error }): void {
    if (!__DEV__ && severity < LogSeverity.Error) return;
    const entry: LogEntry = {
      severity,
      channel,
      message,
      ...(options?.data !== undefined && { data: options.data }),
      ...(options?.error !== undefined && { error: options.error }),
    };
    for (const handler of this._handlers) {
      handler(entry);
    }
  }

  public debug(channel: LogChannel, message: string, data?: Record<string, unknown>): void {
    this.log(LogSeverity.Debug, channel, message, data ? { data } : undefined);
  }

  public info(channel: LogChannel, message: string, data?: Record<string, unknown>): void {
    this.log(LogSeverity.Info, channel, message, data ? { data } : undefined);
  }

  public warn(channel: LogChannel, message: string, data?: Record<string, unknown>): void {
    this.log(LogSeverity.Warning, channel, message, data ? { data } : undefined);
  }

  public error(channel: LogChannel, message: string, error?: Error): void {
    this.log(LogSeverity.Error, channel, message, error ? { error } : undefined);
  }

  public warnOnce(key: string, channel: LogChannel, message: string): void {
    if (this._warnedKeys.has(key)) return;
    this._warnedKeys.add(key);
    this.warn(channel, message);
  }

  public addHandler(handler: LogHandler): () => void {
    this._handlers.push(handler);
    return () => {
      const idx = this._handlers.indexOf(handler);
      if (idx >= 0) this._handlers.splice(idx, 1);
    };
  }

  /** @internal */
  public _resetWarnedKeys(): void {
    this._warnedKeys.clear();
  }
}

export const logger = new Logger();

if (__DEV__) {
  logger.addHandler(entry => {
    const prefix = `[ExoJS:${entry.channel}]`;
    const method = entry.severity >= LogSeverity.Error ? 'error' : entry.severity >= LogSeverity.Warning ? 'warn' : 'log';
    if (entry.error) {
      console[method](prefix, entry.message, entry.error);
    } else if (entry.data) {
      console[method](prefix, entry.message, entry.data);
    } else {
      console[method](prefix, entry.message);
    }
  });
}
