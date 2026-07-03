import { _resetHello, createConsoleSink, hello, type LogEntry, Logger, logger, LogSeverity } from '#core/logging';

// ---------------------------------------------------------------------------
// Logger — dispatch, options bag, once dedup, addSink
// ---------------------------------------------------------------------------

describe('Logger', () => {
  let instance: Logger;

  beforeEach(() => {
    // A fresh instance per test avoids interference from the module-level
    // `logger` singleton, which already carries the default DEV console sink
    // (registered as a side effect of importing `#core/logging`).
    instance = new Logger();
  });

  test('debug/info/warn/error dispatch a LogEntry with the matching severity and message', () => {
    const received: LogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    instance.debug('a debug message');
    instance.info('an info message');
    instance.warn('a warn message');
    instance.error('an error message');

    expect(received).toHaveLength(4);
    expect(received[0]).toMatchObject({ severity: LogSeverity.Debug, message: 'a debug message' });
    expect(received[1]).toMatchObject({ severity: LogSeverity.Info, message: 'an info message' });
    expect(received[2]).toMatchObject({ severity: LogSeverity.Warning, message: 'a warn message' });
    expect(received[3]).toMatchObject({ severity: LogSeverity.Error, message: 'an error message' });
  });

  test('omits `source` from the entry when not provided', () => {
    const received: LogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    instance.info('no source here');

    expect(received[0]?.source).toBeUndefined();
    expect('source' in received[0]!).toBe(false);
  });

  test('includes `source` on the entry when provided', () => {
    const received: LogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    instance.info('has a source', { source: 'my-subsystem' });

    expect(received[0]?.source).toBe('my-subsystem');
  });

  test('forwards `data` on the entry', () => {
    const received: LogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    instance.debug('with data', { data: { count: 3 } });

    expect(received[0]?.data).toEqual({ count: 3 });
  });

  test('forwards `error` on the entry', () => {
    const received: LogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    const err = new Error('boom');
    instance.error('failed', { error: err });

    expect(received[0]?.error).toBe(err);
  });

  test('addSink returns an unsubscribe function; the sink stops receiving entries after', () => {
    const received: LogEntry[] = [];
    const unsubscribe = instance.addSink(entry => received.push(entry));

    instance.info('before unsubscribe');
    unsubscribe();
    instance.info('after unsubscribe');

    expect(received).toHaveLength(1);
    expect(received[0]?.message).toBe('before unsubscribe');
  });

  test('dispatches to every registered sink', () => {
    const a: LogEntry[] = [];
    const b: LogEntry[] = [];
    instance.addSink(entry => a.push(entry));
    instance.addSink(entry => b.push(entry));

    instance.warn('fan-out');

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  // ── once dedup ─────────────────────────────────────────────────────────

  test('`once` suppresses every call after the first for a given key', () => {
    const received: LogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    instance.warn('first', { once: 'dup-key' });
    instance.warn('duplicate — should be silenced', { once: 'dup-key' });
    instance.warn('also silenced', { once: 'dup-key' });

    expect(received).toHaveLength(1);
    expect(received[0]?.message).toBe('first');
  });

  test('`once` dedup is independent per key', () => {
    const received: LogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    instance.warn('A', { once: 'key-a' });
    instance.warn('B', { once: 'key-b' });

    expect(received).toHaveLength(2);
  });

  test('`once` dedup applies across severities sharing the same key', () => {
    const received: LogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    instance.warn('as a warning', { once: 'shared-key' });
    instance.error('as an error — same key, should still be silenced', { once: 'shared-key' });

    expect(received).toHaveLength(1);
    expect(received[0]?.severity).toBe(LogSeverity.Warning);
  });

  test('calls without `once` are never deduped', () => {
    const received: LogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    instance.info('repeat me');
    instance.info('repeat me');

    expect(received).toHaveLength(2);
  });

  test('_resetOnce allows a key to fire again', () => {
    const received: LogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    instance.warn('before reset', { once: 'reset-key' });
    instance._resetOnce();
    instance.warn('after reset', { once: 'reset-key' });

    expect(received).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// createConsoleSink
// ---------------------------------------------------------------------------

describe('createConsoleSink', () => {
  test('routes Debug/Info severities to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const sink = createConsoleSink();

    sink({ severity: LogSeverity.Debug, message: 'dbg' });
    sink({ severity: LogSeverity.Info, message: 'info' });

    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  test('routes Warning severity to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sink = createConsoleSink();

    sink({ severity: LogSeverity.Warning, message: 'careful' });

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('routes Error severity to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sink = createConsoleSink();

    sink({ severity: LogSeverity.Error, message: 'boom' });

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('formats a bare [ExoJS] prefix with %c styling when source is absent', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const sink = createConsoleSink();

    sink({ severity: LogSeverity.Info, message: 'no source' });

    expect(spy).toHaveBeenCalledWith('%c[ExoJS]', expect.stringContaining('color'), 'no source');
    spy.mockRestore();
  });

  test('formats an [ExoJS][source] prefix when source is present', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const sink = createConsoleSink();

    sink({ severity: LogSeverity.Info, message: 'scoped', source: 'rendering' });

    expect(spy).toHaveBeenCalledWith('%c[ExoJS][rendering]', expect.stringContaining('color'), 'scoped');
    spy.mockRestore();
  });

  test('forwards `error` as a trailing console argument', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sink = createConsoleSink();
    const err = new Error('oops');

    sink({ severity: LogSeverity.Error, message: 'failed', error: err });

    expect(spy).toHaveBeenCalledWith('%c[ExoJS]', expect.stringContaining('color'), 'failed', err);
    spy.mockRestore();
  });

  test('forwards `data` as a trailing console argument', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const sink = createConsoleSink();

    sink({ severity: LogSeverity.Debug, message: 'with data', data: { n: 1 } });

    expect(spy).toHaveBeenCalledWith('%c[ExoJS]', expect.stringContaining('color'), 'with data', { n: 1 });
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// hello — one-time DEV startup banner
// ---------------------------------------------------------------------------

describe('hello', () => {
  beforeEach(() => {
    _resetHello();
  });

  afterEach(() => {
    _resetHello();
  });

  test('prints the version banner on the first call', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    hello();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain('ExoJS v');
    spy.mockRestore();
  });

  test('includes the backend when provided', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    hello({ backend: 'webgl2' });

    expect(spy.mock.calls[0]?.[0]).toContain('(webgl2)');
    spy.mockRestore();
  });

  test('only prints once, even across repeated calls', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    hello();
    hello();
    hello({ backend: 'webgpu' });

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('_resetHello allows the banner to print again', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    hello();
    _resetHello();
    hello();

    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// The shared `logger` singleton
// ---------------------------------------------------------------------------

describe('logger singleton', () => {
  afterEach(() => {
    logger._resetOnce();
  });

  test('is a Logger instance', () => {
    expect(logger).toBeInstanceOf(Logger);
  });

  test('carries the default DEV console sink already registered', () => {
    // In test builds `__DEV__` is `true`, so importing `#core/logging` has
    // already run `logger.addSink(createConsoleSink())` as a module side
    // effect. Exercise it end-to-end through the public API.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.error('singleton smoke test', { source: 'test', once: 'logging-test:singleton-smoke' });

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
