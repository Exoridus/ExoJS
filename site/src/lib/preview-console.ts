/**
 * The playground's preview console: captures what an example writes to the
 * console of its preview iframe, plus the uncaught errors the preview reports,
 * and keeps a bounded, generation-scoped record for the Output panel.
 *
 * Capture is a same-origin patch of the preview window's `console` methods,
 * installed by the parent before the example's module is appended. Each patch
 * calls the original method first, so DevTools keeps every message. Workers
 * and audio worklets have consoles of their own that are not patched; their
 * output stays in DevTools only.
 */

export type ConsoleSeverity = 'log' | 'info' | 'debug' | 'warn' | 'error';

export const CONSOLE_METHODS: readonly ConsoleSeverity[] = ['log', 'info', 'debug', 'warn', 'error'];

/** A window whose console the bridge can patch; `Window` itself does not declare `console`. */
export type ConsoleWindow = Window & { readonly console: Console };

/**
 * - `console`: a console call made by the preview.
 * - `exception`: an uncaught error or unhandled rejection; the example stopped.
 * - `suppressed`: stands in for messages dropped by the rate limit.
 */
export type OutputEntryKind = 'console' | 'exception' | 'suppressed';

export interface OutputEntry {
  readonly id: number;
  readonly kind: OutputEntryKind;
  readonly severity: ConsoleSeverity;
  readonly text: string;
  readonly details: string | null;
  /** Milliseconds since the preview generation started. */
  readonly time: number;
  /** How many identical consecutive messages this entry stands for. */
  readonly count: number;
}

export interface OutputCounts {
  readonly log: number;
  readonly info: number;
  readonly debug: number;
  readonly warn: number;
  readonly error: number;
}

export interface OutputSnapshot {
  readonly generation: number;
  readonly entries: readonly OutputEntry[];
  readonly counts: OutputCounts;
  /** Uncaught errors in this generation, counted separately from `console.error`. */
  readonly exceptions: number;
  /** Messages the rate limit dropped in this generation. */
  readonly suppressed: number;
  /** Entries evicted from the front of the ring buffer in this generation. */
  readonly evicted: number;
}

export interface FormatLimits {
  readonly maxLength: number;
  readonly maxDepth: number;
  readonly maxItems: number;
}

export interface PreviewConsoleOptions {
  readonly capacity?: number;
  readonly limits?: Partial<FormatLimits>;
  /** Messages accepted in a burst before the rate limit applies. */
  readonly burst?: number;
  /** Sustained messages per second the rate limit lets through. */
  readonly ratePerSecond?: number;
  /** Delay before subscribers hear about a change; changes in between coalesce. */
  readonly notifyDelay?: number;
  readonly schedule?: (callback: () => void, delay: number) => () => void;
}

export const DEFAULT_FORMAT_LIMITS: FormatLimits = { maxLength: 2000, maxDepth: 3, maxItems: 20 };
const MAX_DETAILS_LENGTH = 6000;
// An engine that reports a failure through `console.error` and then throws
// the same error produces two records of one event within the same task.
const EXCEPTION_MERGE_WINDOW_MS = 250;

const EMPTY_COUNTS: OutputCounts = { log: 0, info: 0, debug: 0, warn: 0, error: 0 };

const defaultSchedule = (callback: () => void, delay: number): (() => void) => {
  const handle = setTimeout(callback, delay);

  return () => clearTimeout(handle);
};

interface MutableEntry {
  id: number;
  kind: OutputEntryKind;
  severity: ConsoleSeverity;
  text: string;
  details: string | null;
  time: number;
  count: number;
}

export class PreviewConsole {
  private readonly _capacity: number;
  private readonly _limits: FormatLimits;
  private readonly _burst: number;
  private readonly _ratePerSecond: number;
  private readonly _notifyDelay: number;
  private readonly _schedule: (callback: () => void, delay: number) => () => void;
  private readonly _listeners = new Set<() => void>();

  private _generation = 0;
  private _entries: MutableEntry[] = [];
  private _counts: { -readonly [K in keyof OutputCounts]: number } = { ...EMPTY_COUNTS };
  private _exceptions = 0;
  private _suppressed = 0;
  private _evicted = 0;
  private _nextId = 1;
  private _tokens: number;
  private _tokensAt = 0;
  private _openSuppressed: MutableEntry | null = null;
  private _snapshot: OutputSnapshot | null = null;
  private _cancelNotify: (() => void) | null = null;
  private _detachBridge: (() => void) | null = null;
  private _elapsed: () => number = () => 0;

  public constructor(options: PreviewConsoleOptions = {}) {
    this._capacity = options.capacity ?? 500;
    this._limits = { ...DEFAULT_FORMAT_LIMITS, ...options.limits };
    this._burst = options.burst ?? 100;
    this._ratePerSecond = options.ratePerSecond ?? 50;
    this._notifyDelay = options.notifyDelay ?? 100;
    this._schedule = options.schedule ?? defaultSchedule;
    this._tokens = this._burst;
  }

  public get generation(): number {
    return this._generation;
  }

  /**
   * Starts a new preview generation: drops every entry, detaches the bridge of
   * the previous preview window and returns the token that later writes must
   * carry. Writes carrying an older token are ignored.
   */
  public begin(): number {
    this._detachBridge?.();
    this._detachBridge = null;
    this._generation += 1;
    this._resetRecord();
    this._changed(true);

    return this._generation;
  }

  /**
   * Starts a new generation for `target` and patches its console. Returns the
   * generation token, for reporting the window's uncaught errors.
   */
  public attach(target: ConsoleWindow): number {
    const generation = this.begin();
    const clock = target.performance;
    const start = clock.now();
    const elapsed = (): number => clock.now() - start;

    this._elapsed = elapsed;
    this._detachBridge = installConsoleBridge(target, (severity, args) => {
      this.write(generation, severity, args, elapsed());
    });

    return generation;
  }

  /** Restores the console of the attached window, if any, and stops accepting its writes. */
  public detach(): void {
    this._detachBridge?.();
    this._detachBridge = null;
    this._generation += 1;
    this._changed(true);
  }

  public write(generation: number, severity: ConsoleSeverity, args: readonly unknown[], time: number): void {
    if (generation !== this._generation) {
      return;
    }

    if (!this._takeToken(time)) {
      this._suppressed += 1;
      this._counts[severity] += 1;

      if (this._openSuppressed) {
        this._openSuppressed.count += 1;
        this._openSuppressed.text = suppressedText(this._openSuppressed.count);
      } else {
        this._openSuppressed = this._append({
          kind: 'suppressed',
          severity: 'warn',
          text: suppressedText(1),
          details: null,
          time,
          count: 1,
        });
      }

      this._changed(false);

      return;
    }

    this._openSuppressed = null;

    const { text, details } = formatConsoleArguments(args, this._limits);
    const last = this._entries[this._entries.length - 1];

    this._counts[severity] += 1;

    if (last?.kind === 'console' && last.severity === severity && last.text === text && last.details === details) {
      last.count += 1;
      last.time = time;
    } else {
      this._append({ kind: 'console', severity, text, details, time, count: 1 });
    }

    this._changed(false);
  }

  /**
   * Records an uncaught error. A `console.error` of the same message moments
   * earlier is upgraded in place rather than listed twice.
   */
  public writeException(generation: number, summary: string, details: string | null, time = this._elapsed()): void {
    if (generation !== this._generation) {
      return;
    }

    const text = truncate(summary, this._limits.maxLength);
    const fullDetails = details && details !== summary ? truncate(details, MAX_DETAILS_LENGTH) : null;

    this._exceptions += 1;

    for (let index = this._entries.length - 1; index >= 0 && index >= this._entries.length - 5; index -= 1) {
      const entry = this._entries[index];

      if (time - entry.time > EXCEPTION_MERGE_WINDOW_MS) {
        break;
      }

      if (entry.severity === 'error' && (entry.text === text || entry.text.endsWith(`: ${text}`) || entry.text.endsWith(` ${text}`))) {
        entry.kind = 'exception';
        entry.details = fullDetails ?? entry.details;
        this._changed(true);

        return;
      }
    }

    this._counts.error += 1;
    this._append({ kind: 'exception', severity: 'error', text, details: fullDetails, time, count: 1 });
    this._changed(true);
  }

  /** Empties the list of the current generation; the counters restart from zero. */
  public clear(): void {
    this._resetRecord();
    this._changed(true);
  }

  public subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);

    return () => {
      this._listeners.delete(listener);
    };
  };

  public getSnapshot = (): OutputSnapshot => {
    this._snapshot ??= Object.freeze({
      generation: this._generation,
      entries: Object.freeze(this._entries.map(entry => Object.freeze({ ...entry }))),
      counts: Object.freeze({ ...this._counts }),
      exceptions: this._exceptions,
      suppressed: this._suppressed,
      evicted: this._evicted,
    });

    return this._snapshot;
  };

  /** Number of live subscribers; exposed for leak checks. */
  public get listenerCount(): number {
    return this._listeners.size;
  }

  /** Detaches the bridge and cancels any pending notification. Subscribers are kept. */
  public dispose(): void {
    this._detachBridge?.();
    this._detachBridge = null;
    this._generation += 1;
    this._cancelNotify?.();
    this._cancelNotify = null;
  }

  private _resetRecord(): void {
    this._entries = [];
    this._counts = { ...EMPTY_COUNTS };
    this._exceptions = 0;
    this._suppressed = 0;
    this._evicted = 0;
    this._openSuppressed = null;
    this._tokens = this._burst;
    this._tokensAt = 0;
  }

  private _append(entry: Omit<MutableEntry, 'id'>): MutableEntry {
    const stored: MutableEntry = { id: this._nextId++, ...entry };

    this._entries.push(stored);

    if (this._entries.length > this._capacity) {
      const removed = this._entries.splice(0, this._entries.length - this._capacity);

      this._evicted += removed.length;
    }

    return stored;
  }

  private _takeToken(time: number): boolean {
    const elapsed = Math.max(0, time - this._tokensAt);

    this._tokensAt = time;
    this._tokens = Math.min(this._burst, this._tokens + (elapsed / 1000) * this._ratePerSecond);

    if (this._tokens < 1) {
      return false;
    }

    this._tokens -= 1;

    return true;
  }

  private _changed(immediate: boolean): void {
    this._snapshot = null;

    if (immediate) {
      this._cancelNotify?.();
      this._cancelNotify = null;
      this._notify();

      return;
    }

    this._cancelNotify ??= this._schedule(() => {
      this._cancelNotify = null;
      this._notify();
    }, this._notifyDelay);
  }

  private _notify(): void {
    for (const listener of [...this._listeners]) {
      listener();
    }
  }
}

const suppressedText = (count: number): string =>
  `${count} message${count === 1 ? '' : 's'} dropped: the preview logged faster than the Output panel records. DevTools still has them.`;

/**
 * Patches `log`, `info`, `debug`, `warn` and `error` on `target.console`. Each
 * patch calls the original method before `capture`, and a throwing `capture`
 * never reaches the caller. The returned function restores every method that
 * still holds its patch.
 */
export const installConsoleBridge = (
  target: ConsoleWindow,
  capture: (severity: ConsoleSeverity, args: readonly unknown[]) => void,
): (() => void) => {
  const console = target.console;
  const restore: Array<() => void> = [];

  for (const method of CONSOLE_METHODS) {
    const original = console[method];

    const patched = function (this: unknown, ...args: unknown[]): void {
      Reflect.apply(original, this ?? console, args);

      try {
        capture(method, args);
      } catch {
        // A formatter failure must never turn a log call into a crash.
      }
    };

    console[method] = patched;
    restore.push(() => {
      if (console[method] === patched) {
        console[method] = original;
      }
    });
  }

  return () => {
    for (const undo of restore.splice(0)) {
      undo();
    }
  };
};

/**
 * Formats console arguments the way a console shows them: `%s`, `%d`, `%i`,
 * `%f`, `%o`, `%O` and `%c` in a leading string are substituted, every other
 * argument is appended. Values from another realm are handled by shape, never
 * by `instanceof`. Output is plain text, bounded by `limits`.
 */
export const formatConsoleArguments = (
  args: readonly unknown[],
  limits: FormatLimits = DEFAULT_FORMAT_LIMITS,
): { text: string; details: string | null } => {
  const parts: string[] = [];
  let details: string | null = null;
  let rest = args;

  const first = args[0];

  if (typeof first === 'string' && first.includes('%')) {
    let index = 1;
    const substituted = first.replace(/%([sdifoOc%])/g, (match, specifier: string) => {
      if (specifier === '%') {
        return '%';
      }

      if (index >= args.length) {
        return match;
      }

      const value = args[index++];

      switch (specifier) {
        case 'c':
          return '';
        case 's':
          return typeof value === 'string' ? value : formatValue(value, limits);
        case 'd':
        case 'i':
          return typeof value === 'bigint' ? `${value}n` : String(Math.trunc(Number(value)));
        case 'f':
          return String(Number(value));
        default:
          return formatValue(value, limits);
      }
    });

    parts.push(substituted);
    rest = args.slice(index);
  } else if (args.length > 0) {
    parts.push(typeof first === 'string' ? first : formatValue(first, limits));
    rest = args.slice(1);

    if (typeof first !== 'string') {
      details = errorStack(first);
    }
  }

  for (const value of rest) {
    parts.push(typeof value === 'string' ? value : formatValue(value, limits));
    details ??= errorStack(value);
  }

  return { text: truncate(parts.join(' '), limits.maxLength), details: details === null ? null : truncate(details, MAX_DETAILS_LENGTH) };
};

const truncate = (text: string, maxLength: number): string =>
  text.length <= maxLength ? text : `${text.slice(0, maxLength)}... (${text.length - maxLength} more characters)`;

const tagOf = (value: object): string => {
  try {
    return Object.prototype.toString.call(value).slice(8, -1);
  } catch {
    return 'Object';
  }
};

const isErrorLike = (value: unknown): value is { name?: unknown; message: string; stack?: unknown } => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  try {
    return (
      tagOf(value) === 'Error' ||
      (typeof (value as { message?: unknown }).message === 'string' && typeof (value as { stack?: unknown }).stack === 'string')
    );
  } catch {
    return false;
  }
};

const errorStack = (value: unknown): string | null => {
  if (!isErrorLike(value)) {
    return null;
  }

  try {
    return typeof value.stack === 'string' && value.stack.trim() ? value.stack : null;
  } catch {
    return null;
  }
};

const constructorName = (value: object): string | null => {
  try {
    const prototype: unknown = Object.getPrototypeOf(value);

    if (prototype === null) {
      return null;
    }

    const name: unknown = (prototype as { constructor?: { name?: unknown } }).constructor?.name;

    return typeof name === 'string' && name !== 'Object' && name !== '' ? name : null;
  } catch {
    return null;
  }
};

/** Formats one value as a bounded, single-line description. */
export const formatValue = (value: unknown, limits: FormatLimits = DEFAULT_FORMAT_LIMITS): string => {
  const budget = { remaining: limits.maxLength };

  return describe(value, 0, new Set(), limits, budget, false);
};

const describe = (
  value: unknown,
  depth: number,
  seen: Set<object>,
  limits: FormatLimits,
  budget: { remaining: number },
  nested: boolean,
): string => {
  if (budget.remaining <= 0) {
    return '...';
  }

  const result = describeUnbounded(value, depth, seen, limits, budget, nested);

  budget.remaining -= result.length;

  return result;
};

const describeUnbounded = (
  value: unknown,
  depth: number,
  seen: Set<object>,
  limits: FormatLimits,
  budget: { remaining: number },
  nested: boolean,
): string => {
  switch (typeof value) {
    case 'string':
      return nested ? JSON.stringify(value.length > limits.maxLength ? `${value.slice(0, limits.maxLength)}...` : value) : value;
    case 'number':
      return Object.is(value, -0) ? '-0' : String(value);
    case 'bigint':
      return `${value}n`;
    case 'boolean':
    case 'undefined':
      return String(value);
    case 'symbol':
      return value.toString();
    case 'function': {
      const name = (value as { name?: unknown }).name;

      return `[Function${typeof name === 'string' && name ? `: ${name}` : ''}]`;
    }
    default:
      break;
  }

  if (value === null) {
    return 'null';
  }

  const object = value as object;

  if (isErrorLike(object)) {
    try {
      const name = typeof object.name === 'string' && object.name ? object.name : 'Error';

      return object.message ? `${name}: ${object.message}` : name;
    } catch {
      return 'Error';
    }
  }

  if (seen.has(object)) {
    return '[Circular]';
  }

  const tag = tagOf(object);

  if (typeof (object as { nodeType?: unknown }).nodeType === 'number' && typeof (object as { nodeName?: unknown }).nodeName === 'string') {
    return describeNode(object as { nodeName: string; id?: unknown; className?: unknown });
  }

  if (tag === 'Date') {
    try {
      return (object as Date).toISOString();
    } catch {
      return 'Invalid Date';
    }
  }

  if (tag === 'RegExp') {
    return RegExp.prototype.toString.call(object);
  }

  const name = constructorName(object);

  if (depth >= limits.maxDepth) {
    if (Array.isArray(object)) {
      return `Array(${object.length})`;
    }

    return name ? `${name} {...}` : '{...}';
  }

  seen.add(object);

  try {
    if (Array.isArray(object) || ArrayBuffer.isView(object)) {
      const list = object as ArrayLike<unknown>;
      const shown = Math.min(list.length, limits.maxItems);
      const items: string[] = [];

      for (let index = 0; index < shown && budget.remaining > 0; index += 1) {
        items.push(describe(list[index], depth + 1, seen, limits, budget, true));
      }

      if (list.length > items.length) {
        items.push(`... ${list.length - items.length} more`);
      }

      const prefix = Array.isArray(object) ? '' : `${tag}(${list.length}) `;

      return `${prefix}[${items.join(', ')}]`;
    }

    if (tag === 'Map' || tag === 'Set') {
      const collection = object as Map<unknown, unknown> | Set<unknown>;
      const items: string[] = [];
      let index = 0;

      for (const item of collection as Iterable<unknown>) {
        if (index >= limits.maxItems || budget.remaining <= 0) {
          break;
        }

        items.push(
          tag === 'Map'
            ? `${describe((item as [unknown, unknown])[0], depth + 1, seen, limits, budget, true)} => ${describe((item as [unknown, unknown])[1], depth + 1, seen, limits, budget, true)}`
            : describe(item, depth + 1, seen, limits, budget, true),
        );
        index += 1;
      }

      if (collection.size > items.length) {
        items.push(`... ${collection.size - items.length} more`);
      }

      return `${tag}(${collection.size}) {${items.join(', ')}}`;
    }

    let keys: string[];

    try {
      keys = Object.keys(object);
    } catch {
      return name ? `${name} {}` : '{}';
    }

    const fields: string[] = [];

    for (const key of keys.slice(0, limits.maxItems)) {
      if (budget.remaining <= 0) {
        break;
      }

      let field: unknown;

      try {
        field = (object as Record<string, unknown>)[key];
      } catch {
        field = '[Getter threw]';
      }

      fields.push(
        `${/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}: ${describe(field, depth + 1, seen, limits, budget, true)}`,
      );
    }

    if (keys.length > fields.length) {
      fields.push(`... ${keys.length - fields.length} more`);
    }

    const body = fields.length > 0 ? `{${fields.join(', ')}}` : '{}';

    return name ? `${name} ${body}` : body;
  } finally {
    seen.delete(object);
  }
};

const describeNode = (node: { nodeName: string; id?: unknown; className?: unknown }): string => {
  const tag = node.nodeName.toLowerCase();
  const id = typeof node.id === 'string' && node.id ? `#${node.id}` : '';
  const classes = typeof node.className === 'string' && node.className.trim() ? `.${node.className.trim().split(/\s+/).join('.')}` : '';

  return tag.startsWith('#') ? tag : `<${tag}${id}${classes}>`;
};
