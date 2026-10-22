import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type ConsoleWindow,
  formatConsoleArguments,
  formatValue,
  installConsoleBridge,
  PreviewConsole,
} from '../../site/src/lib/preview-console';

/** A scheduler the test flushes by hand, so coalescing is observable. */
const manualSchedule = (): { schedule: (callback: () => void) => () => void; flush: () => void; pending: () => number } => {
  const queue = new Set<() => void>();

  return {
    schedule: callback => {
      queue.add(callback);

      return () => queue.delete(callback);
    },
    flush: () => {
      for (const callback of [...queue]) {
        queue.delete(callback);
        callback();
      }
    },
    pending: () => queue.size,
  };
};

const frames: HTMLIFrameElement[] = [];

/** A same-origin window with its own realm, like the playground's preview iframe. */
const createPreviewWindow = (): ConsoleWindow => {
  const frame = document.createElement('iframe');

  document.body.append(frame);
  frames.push(frame);

  return frame.contentWindow as ConsoleWindow;
};

afterEach(() => {
  for (const frame of frames.splice(0)) {
    frame.remove();
  }
});

describe('preview console bridge', () => {
  it('captures all five severities and still calls the original methods', () => {
    const target = createPreviewWindow();
    const originals = Object.fromEntries((['log', 'info', 'debug', 'warn', 'error'] as const).map(method => [method, vi.fn()]));

    Object.assign(target.console, originals);

    const output = new PreviewConsole();

    output.attach(target);
    target.console.log('a log');
    target.console.info('an info');
    target.console.debug('a debug');
    target.console.warn('a warning');
    target.console.error('an error');

    expect(output.getSnapshot().entries.map(entry => [entry.severity, entry.text])).toEqual([
      ['log', 'a log'],
      ['info', 'an info'],
      ['debug', 'a debug'],
      ['warn', 'a warning'],
      ['error', 'an error'],
    ]);

    for (const method of ['log', 'info', 'debug', 'warn', 'error'] as const) {
      expect(originals[method]).toHaveBeenCalledTimes(1);
    }

    expect(originals.log).toHaveBeenCalledWith('a log');
  });

  it('formats several arguments and format specifiers', () => {
    const target = createPreviewWindow();

    target.console.log = vi.fn();

    const output = new PreviewConsole();

    output.attach(target);
    target.console.log('KeyDown:', 'Space', 3, true, null, undefined);
    target.console.log('%s pressed %d times, %c styled', 'Jump', 2.7, 'color: red');

    expect(output.getSnapshot().entries.map(entry => entry.text)).toEqual([
      'KeyDown: Space 3 true null undefined',
      'Jump pressed 2 times,  styled',
    ]);
  });

  it('keeps the stack of an error from another realm as details', () => {
    const target = createPreviewWindow();

    target.console.error = vi.fn();

    const output = new PreviewConsole();
    const error = new (target as unknown as { Error: ErrorConstructor }).Error('boom');

    expect(error instanceof Error).toBe(false);
    output.attach(target);
    target.console.error('Load failed:', error);

    const [entry] = output.getSnapshot().entries;

    expect(entry?.text).toBe('Load failed: Error: boom');
    expect(entry?.details).toContain('boom');
  });

  it('describes circular, deep and large values within bounds', () => {
    const circular: Record<string, unknown> = { name: 'node' };

    circular.self = circular;

    expect(formatValue(circular)).toBe('{name: "node", self: [Circular]}');
    expect(formatValue({ a: { b: { c: { d: { e: 1 } } } } })).toBe('{a: {b: {c: {...}}}}');
    expect(formatValue(Array.from({ length: 50 }, (_, index) => index))).toMatch(/^\[0, 1, .*19, \.\.\. 30 more\]$/);
    expect(formatValue(new Map([['k', 1]]))).toBe('Map(1) {"k" => 1}');

    const shared = { x: 1 };

    expect(formatValue([shared, shared])).toBe('[{x: 1}, {x: 1}]');

    const text = formatConsoleArguments(['x'.repeat(5000)], { maxLength: 100, maxDepth: 3, maxItems: 20 }).text;

    expect(text.length).toBeLessThan(160);
    expect(text).toContain('more characters');
  });

  it('survives getters that throw and never interprets text as markup', () => {
    const hostile = {
      get value(): never {
        throw new Error('no');
      },
    };

    expect(formatValue(hostile)).toBe('{value: "[Getter threw]"}');
    expect(formatConsoleArguments(['<img src=x onerror=alert(1)>']).text).toBe('<img src=x onerror=alert(1)>');
  });

  it('restores the original methods when detached', () => {
    const target = createPreviewWindow();
    const original = vi.fn();

    target.console.warn = original;

    const output = new PreviewConsole();

    output.attach(target);
    expect(target.console.warn).not.toBe(original);
    output.detach();
    expect(target.console.warn).toBe(original);
  });

  it('never lets a formatter failure reach the caller', () => {
    const target = createPreviewWindow();

    target.console.log = vi.fn();

    const detach = installConsoleBridge(target, () => {
      throw new Error('capture failed');
    });

    expect(() => target.console.log('still fine')).not.toThrow();
    detach();
  });
});

describe('preview console record', () => {
  it('ignores writes from an earlier preview generation', () => {
    const first = createPreviewWindow();
    const second = createPreviewWindow();

    first.console.log = vi.fn();
    second.console.log = vi.fn();

    const output = new PreviewConsole();

    output.attach(first);
    const firstLog = first.console.log;

    first.console.log('first run');
    output.attach(second);
    firstLog('late message from the old preview');
    second.console.log('second run');

    expect(output.getSnapshot().entries.map(entry => entry.text)).toEqual(['second run']);
    expect(first.console.log).not.toBe(firstLog);
  });

  it('does not duplicate entries when the same window is attached twice', () => {
    const target = createPreviewWindow();

    target.console.log = vi.fn();

    const output = new PreviewConsole();

    output.attach(target);
    output.attach(target);
    target.console.log('once');

    expect(output.getSnapshot().entries).toHaveLength(1);
  });

  it('bounds the record and counts what the rate limit drops', () => {
    const output = new PreviewConsole({ capacity: 50, burst: 20, ratePerSecond: 10 });
    const generation = output.begin();

    for (let index = 0; index < 500; index += 1) {
      output.write(generation, 'log', [`message ${index}`], 0);
    }

    const snapshot = output.getSnapshot();

    expect(snapshot.entries.filter(entry => entry.kind === 'console')).toHaveLength(20);
    expect(snapshot.suppressed).toBe(480);
    expect(snapshot.counts.log).toBe(500);
    expect(snapshot.entries.at(-1)?.kind).toBe('suppressed');
    expect(snapshot.entries.at(-1)?.count).toBe(480);

    // Once the bucket refills, messages are recorded again.
    output.write(generation, 'log', ['after the burst'], 1000);
    expect(output.getSnapshot().entries.at(-1)?.text).toBe('after the burst');
  });

  it('evicts the oldest entries beyond its capacity', () => {
    const output = new PreviewConsole({ capacity: 10, burst: 1000 });
    const generation = output.begin();

    for (let index = 0; index < 25; index += 1) {
      output.write(generation, 'info', [`message ${index}`], index);
    }

    const snapshot = output.getSnapshot();

    expect(snapshot.entries).toHaveLength(10);
    expect(snapshot.entries[0]?.text).toBe('message 15');
    expect(snapshot.evicted).toBe(15);
  });

  it('collapses identical consecutive messages into one counted entry', () => {
    const output = new PreviewConsole();
    const generation = output.begin();

    output.write(generation, 'log', ['tick'], 0);
    output.write(generation, 'log', ['tick'], 5);
    output.write(generation, 'warn', ['tick'], 6);

    expect(output.getSnapshot().entries.map(entry => [entry.severity, entry.count])).toEqual([
      ['log', 2],
      ['warn', 1],
    ]);
  });

  it('records an uncaught error once even when it was also logged', () => {
    const output = new PreviewConsole();
    const generation = output.begin();

    output.write(
      generation,
      'error',
      ['Failed to start:', { name: 'TypeError', message: 'x is undefined', stack: 'TypeError: x is undefined\n at a.js:1' }],
      10,
    );
    output.writeException(generation, 'TypeError: x is undefined', 'TypeError: x is undefined\n at a.js:1', 12);
    output.writeException(generation, 'Another failure', null, 900);

    const snapshot = output.getSnapshot();

    expect(snapshot.entries.map(entry => [entry.kind, entry.text])).toEqual([
      ['exception', 'Failed to start: TypeError: x is undefined'],
      ['exception', 'Another failure'],
    ]);
    expect(snapshot.exceptions).toBe(2);
    expect(snapshot.counts.error).toBe(2);
  });

  it('never folds a second uncaught error into the first', () => {
    const output = new PreviewConsole();
    const generation = output.begin();

    output.writeException(generation, 'boom', null, 0);
    output.writeException(generation, 'boom', null, 10);

    expect(output.getSnapshot().entries).toHaveLength(2);
  });

  it('drops the record of a detached preview, failures included', () => {
    const output = new PreviewConsole();
    const generation = output.begin();

    output.write(generation, 'log', ['before the reload'], 0);
    output.writeException(generation, 'boom', null, 5);
    output.detach();

    const snapshot = output.getSnapshot();

    expect(snapshot.entries).toEqual([]);
    expect(snapshot.exceptions).toBe(0);
    expect(snapshot.counts.error).toBe(0);
  });

  it('keeps console.error and a later unrelated exception apart', () => {
    const output = new PreviewConsole();
    const generation = output.begin();

    output.write(generation, 'error', ['handled problem'], 0);
    output.writeException(generation, 'unhandled problem', null, 5);

    expect(output.getSnapshot().entries.map(entry => entry.kind)).toEqual(['console', 'exception']);
  });

  it('coalesces notifications and releases its subscribers', () => {
    const scheduler = manualSchedule();
    const output = new PreviewConsole({ schedule: scheduler.schedule });
    const listener = vi.fn();
    const unsubscribe = output.subscribe(listener);
    const generation = output.begin();

    listener.mockClear();

    for (let index = 0; index < 100; index += 1) {
      output.write(generation, 'log', [index], index);
    }

    expect(listener).not.toHaveBeenCalled();
    expect(scheduler.pending()).toBe(1);
    scheduler.flush();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(output.listenerCount).toBe(0);
    output.write(generation, 'log', ['after unsubscribe'], 200);
    output.dispose();
    expect(scheduler.pending()).toBe(0);
  });

  it('returns the same snapshot until something changes', () => {
    const output = new PreviewConsole();
    const generation = output.begin();
    const before = output.getSnapshot();

    expect(output.getSnapshot()).toBe(before);
    output.write(generation, 'log', ['changed'], 0);
    expect(output.getSnapshot()).not.toBe(before);
  });
});
