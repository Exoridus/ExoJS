export enum LogSeverity {
  Debug = 0,
  Info = 1,
  Warning = 2,
  Error = 3,
}

/**
 * Per-call metadata for {@link Logger.debug}/{@link Logger.info}/{@link Logger.warn}/{@link Logger.error}.
 *
 * - `source` renders as `[ExoJS][source]` in the default console sink (omit
 *   it for a bare `[ExoJS]` prefix).
 * - `once` deduplicates by key: the second and later calls sharing the same
 *   key are dropped before severity filtering or sink dispatch, so pass a
 *   stable per-callsite key (e.g. `` `bitmaptext:${fontId}:${codepoint}` ``)
 *   to avoid per-frame spam.
 */
export interface LogOptions {
  source?: string;
  data?: Record<string, unknown>;
  error?: Error;
  once?: string;
}

/** The normalized record dispatched to every {@link LogSink}. */
export interface LogEntry {
  readonly severity: LogSeverity;
  readonly message: string;
  readonly source?: string;
  readonly data?: Record<string, unknown>;
  readonly error?: Error;
}

/** A subscriber invoked with every dispatched {@link LogEntry}. */
export type LogSink = (entry: LogEntry) => void;

/**
 * Engine-wide log dispatcher. Below `LogSeverity.Error`, calls are dropped
 * outright in production builds (`__DEV__` is `false`); `error()` always
 * reaches every registered sink. In development a {@link createConsoleSink}
 * is installed by default — see {@link logger}.
 */
export class Logger {
  private readonly _sinks: LogSink[] = [];
  private readonly _seenOnce = new Set<string>();

  private _log(severity: LogSeverity, message: string, options?: LogOptions): void {
    if (options?.once !== undefined) {
      if (this._seenOnce.has(options.once)) {
        return;
      }

      this._seenOnce.add(options.once);
    }

    if (!__DEV__ && severity < LogSeverity.Error) {
      return;
    }

    const entry: LogEntry = {
      severity,
      message,
      ...(options?.source !== undefined && { source: options.source }),
      ...(options?.data !== undefined && { data: options.data }),
      ...(options?.error !== undefined && { error: options.error }),
    };

    for (const sink of this._sinks) {
      sink(entry);
    }
  }

  public debug(message: string, options?: LogOptions): void {
    this._log(LogSeverity.Debug, message, options);
  }

  public info(message: string, options?: LogOptions): void {
    this._log(LogSeverity.Info, message, options);
  }

  public warn(message: string, options?: LogOptions): void {
    this._log(LogSeverity.Warning, message, options);
  }

  public error(message: string, options?: LogOptions): void {
    this._log(LogSeverity.Error, message, options);
  }

  /** Register a sink; call the returned function to unsubscribe it. */
  public addSink(sink: LogSink): () => void {
    this._sinks.push(sink);

    return () => {
      const idx = this._sinks.indexOf(sink);
      if (idx >= 0) this._sinks.splice(idx, 1);
    };
  }

  /** @internal — clears the {@link LogOptions.once} dedup set. For unit tests only. */
  public _resetOnce(): void {
    this._seenOnce.clear();
  }
}

export const logger = new Logger();

const consolePrefixStyle = 'color:#7dd3fc;font-weight:bold;';

/**
 * Create the default browser console {@link LogSink}: renders a `%c`-styled
 * `[ExoJS]` (or `[ExoJS][source]`) badge ahead of the message, routing to
 * `console.error`/`console.warn`/`console.log` by severity and forwarding
 * `entry.error`/`entry.data` as extra arguments. Browser-targeted only — no
 * Node/Deno console detection.
 */
export function createConsoleSink(): LogSink {
  return entry => {
    const prefix = entry.source !== undefined ? `%c[ExoJS][${entry.source}]` : '%c[ExoJS]';
    let method: 'log' | 'warn' | 'error' = 'log';

    if (entry.severity >= LogSeverity.Error) method = 'error';
    else if (entry.severity >= LogSeverity.Warning) method = 'warn';

    /* eslint-disable no-console -- the single sanctioned console sink that default DEV logging routes through. */
    if (entry.error) {
      console[method](prefix, consolePrefixStyle, entry.message, entry.error);
    } else if (entry.data) {
      console[method](prefix, consolePrefixStyle, entry.message, entry.data);
    } else {
      console[method](prefix, consolePrefixStyle, entry.message);
    }
    /* eslint-enable no-console */
  };
}

if (__DEV__) {
  logger.addSink(createConsoleSink());
}

let _helloShown = false;

/**
 * Print a one-time `%c`-styled startup banner (`ExoJS v{version}`, plus the
 * render backend when known). No-op outside development builds and no-op
 * after the first call in a process — safe to call unconditionally from
 * {@link Application} startup. Opt out via `new Application({ hello: false })`.
 * @internal
 */
export function hello(info?: { backend?: string }): void {
  if (!__DEV__ || _helloShown) {
    return;
  }

  _helloShown = true;

  const suffix = info?.backend !== undefined ? ` (${info.backend})` : '';

  /* eslint-disable-next-line no-console -- one-time DEV startup banner, not a routed log entry. */
  console.log(`%cExoJS v${__VERSION__}${suffix}`, consolePrefixStyle);
}

/** @internal — clears the {@link hello} one-time latch. For unit tests only. */
export function _resetHello(): void {
  _helloShown = false;
}
