import { Signal } from './Signal';
import { requireSynchronousHook } from './syncHooks';
import type { Synchronous } from './types';

/** Receives the current value each time an observed value changes. */
export type ObservableListener<T> = (value: T) => void;

/**
 * The shared observation contract: a current {@link value}, change
 * notifications through {@link subscribe}, and read-only derivation through
 * {@link map}. Implemented by {@link Observable}, the values {@link map} and
 * {@link live} derive, {@link ObservableVector} and {@link ObservableSize}.
 *
 * A notification means the value may have changed: observed objects that are
 * mutated in place notify with the same object identity.
 */
export interface ReadonlyObservable<T> {
  /** The current value. */
  readonly value: T;

  /**
   * Calls `listener` after every change until the returned function is called.
   * Listeners run in subscription order. Subscribing the same function again
   * has no effect, and calling the returned function more than once is safe.
   */
  subscribe(listener: ObservableListener<T>): () => void;

  /**
   * A read-only value computed from this one by `project`, which must depend
   * on its argument only. It subscribes to this value only while it has
   * subscribers itself, and notifies only when the result differs from the
   * last one it notified (`Object.is`), or when the result is a newly computed
   * object, which may have been mutated in place.
   *
   * The result is computed lazily and reused while nothing it depends on
   * changed, whether or not it has subscribers. Derived from writable
   * {@link Observable}s, each change computes every affected derived value at
   * most once, also across chains and shared dependencies, and never from a
   * mix of old and new values. Vectors, sizes and observables implemented
   * outside the engine cannot report changes while unobserved: a value
   * derived from one recomputes on every read.
   */
  map<U>(project: (value: T) => U): ReadonlyObservable<U>;
}

/** The value type a {@link ReadonlyObservable} holds. */
export type ObservedValue<O> = O extends ReadonlyObservable<infer T> ? T : never;

/**
 * Whether `value` implements the {@link ReadonlyObservable} contract. Functions,
 * promises, structs and plain objects without `subscribe` and `map` methods
 * are not observable.
 */
export const isObservable = (value: unknown): value is ReadonlyObservable<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  'value' in value &&
  typeof (value as Partial<ReadonlyObservable<unknown>>).subscribe === 'function' &&
  typeof (value as Partial<ReadonlyObservable<unknown>>).map === 'function';

// Enumerable so a spread copy of a struct, whose static type keeps the tag, is preserved like the struct itself.
const structTag: unique symbol = Symbol('ObservableStruct');

/** Type-only marker that tells an {@link ObservableStruct} apart from an ordinary object value. */
export interface ObservableStructTag {
  readonly [structTag]: true;
}

type Preserved = ReadonlyObservable<unknown> | ObservableStructTag;

/** What {@link Observable.struct} makes of a member of type `V`. */
export type ObservableStructMember<V> = [V] extends [Preserved]
  ? V
  : [Extract<V, Preserved>] extends [never]
    ? Observable<V>
    : Observable<Exclude<V, Preserved>> | Extract<V, Preserved>;

/**
 * A frozen record of observables built by {@link Observable.struct}: one
 * observable per member of `T`.
 */
export type ObservableStruct<T extends object> = { readonly [K in keyof T]: ObservableStructMember<T[K]> } & ObservableStructTag;

const isStruct = (value: unknown): boolean => typeof value === 'object' && value !== null && structTag in value;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

const maxNotificationRounds = 100;

const noop = (): void => undefined;

let batchDepth = 0;
let flushing = false;
let flushIndex = 0;
const queue: Array<ObservableBase<unknown>> = [];

/**
 * Listener storage, notification ordering, batching and derivation shared by
 * every observable the engine implements. Not exported from the package; public
 * subclasses expose its members.
 *
 * Outside a batch, a change made while listeners are being notified does not
 * start a nested notification: the current round finishes delivering, then a
 * new round delivers the latest value to every listener. Listeners therefore
 * never receive values out of order, and the last value each one receives is
 * the current one. Inside {@link Observable.batch}, notifications are queued
 * and delivered once the outermost batch completes.
 */
export abstract class ObservableBase<T> implements ReadonlyObservable<T> {
  private _listeners: Signal<[T]> | null = null;
  private _notifying = false;
  private _stale = false;
  private _connected = false;
  private _ended = false;
  private _queued = false;

  public abstract get value(): T;

  public subscribe(listener: ObservableListener<T>): () => void {
    if (this._ended) {
      return noop;
    }

    const listeners = (this._listeners ??= new Signal<[T]>());

    listeners.add(listener);

    if (!this._connected) {
      this._connected = true;

      try {
        this._connect();
      } catch (error) {
        // A failed connection must not leave a listener the caller has no handle for, upstream subscriptions, or a state that never reconnects.
        listeners.remove(listener);
        this._connected = false;
        this._disconnect();

        throw error;
      }
    }

    return (): void => {
      listeners.remove(listener);

      if (!this._notifying) {
        this._disconnectIfIdle();
      }
    };
  }

  public map<U>(project: (value: T) => U): ReadonlyObservable<U> {
    return derive([this], () => project(this.value));
  }

  /** Number of listeners currently subscribed. */
  public get subscriberCount(): number {
    return this._listeners?.count ?? 0;
  }

  /** Starts observing upstream sources; called when the first listener subscribes. */
  protected _connect(): void {}

  /** Stops observing upstream sources; called after the last listener unsubscribed. */
  protected _disconnect(): void {}

  /** The value delivered to listeners. */
  protected _current(): T {
    return this.value;
  }

  /** @internal Distance from the writable sources: queued deliveries run in ascending rank, so a derived value follows everything it depends on. */
  public _rank(): number {
    return 0;
  }

  /** @internal Changes whenever the value may have changed; `NaN`, never equal to itself, for an observable that cannot tell. */
  public _version(): number {
    return Number.NaN;
  }

  /** Recomputes before a queued delivery; returns `false` when there is nothing to deliver. */
  protected _refresh(): boolean {
    return true;
  }

  /** Delivers now, or queues the delivery while a batch is open or being delivered. */
  protected _notify(): void {
    if (this._listeners === null) {
      return;
    }

    if (batchDepth > 0 || flushing) {
      this._enqueue();

      return;
    }

    this._deliver();
  }

  protected _enqueue(): void {
    if (this._queued) {
      return;
    }

    this._queued = true;

    const rank = this._rank();
    let index = queue.length;

    // Behind the delivery in progress, keep pending entries in ascending rank, stable for equal ranks.
    while (index > flushIndex + 1 && queue[index - 1]!._rank() > rank) {
      index--;
    }

    queue.splice(index, 0, this as ObservableBase<unknown>);
  }

  /** @internal Forgets a queued delivery that will not run. */
  public _dequeue(): void {
    this._queued = false;
  }

  /** @internal Runs one queued delivery. */
  public _flushQueued(): void {
    this._queued = false;

    if (this._refresh()) {
      this._deliver();
    }
  }

  /** Removes every listener and stops observing upstream sources. Later subscriptions are ignored. */
  protected _end(): void {
    this._ended = true;
    this._listeners?.destroy();
    this._listeners = null;
    this._disconnectIfIdle();
  }

  private _deliver(): void {
    const listeners = this._listeners;

    if (listeners === null) {
      return;
    }

    if (this._notifying) {
      this._stale = true;

      return;
    }

    this._notifying = true;

    try {
      let rounds = 0;

      do {
        if (++rounds > maxNotificationRounds) {
          throw new RangeError(`Observable: listeners kept changing the value for ${maxNotificationRounds} rounds without settling.`);
        }

        this._stale = false;
        listeners.dispatch(this._current());
      } while (this._stale && !this._ended);
    } finally {
      this._notifying = false;
      this._stale = false;
      this._disconnectIfIdle();
    }
  }

  private _disconnectIfIdle(): void {
    if (this._connected && (this._listeners === null || this._listeners.count === 0)) {
      this._connected = false;
      this._disconnect();
    }
  }
}

/**
 * Delivers every queued notification: writable values in the order they first
 * changed, each derived value after everything it depends on. Changes made by
 * listeners are queued behind the current delivery and delivered in the same
 * pass. Every queued value is delivered even when a listener of another value
 * throws; the first error is rethrown afterwards.
 */
const flush = (): void => {
  flushing = true;

  const deliveries = new Map<ObservableBase<unknown>, number>();
  let failure: { readonly error: unknown } | null = null;

  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const observable = queue[flushIndex]!;
      const count = (deliveries.get(observable) ?? 0) + 1;

      deliveries.set(observable, count);

      try {
        if (count > maxNotificationRounds) {
          throw new RangeError(`Observable.batch: listeners kept changing a value for ${maxNotificationRounds} rounds without settling.`);
        }

        observable._flushQueued();
      } catch (error) {
        failure ??= { error };

        if (error instanceof RangeError && count > maxNotificationRounds) {
          break;
        }
      }
    }
  } finally {
    for (const observable of queue) {
      observable._dequeue();
    }

    queue.length = 0;
    flushIndex = 0;
    flushing = false;
  }

  if (failure !== null) {
    throw failure.error;
  }
};

const isSettled = (previous: unknown, next: unknown): boolean =>
  Object.is(previous, next) && (typeof next !== 'object' || next === null) && typeof next !== 'function';

/**
 * A number that changes whenever `source` may have changed, or `NaN`, never
 * equal to itself, for a source that cannot tell.
 * @internal
 */
export const versionOf = (source: ReadonlyObservable<unknown>): number =>
  source instanceof ObservableBase ? source._version() : Number.NaN;

/**
 * A read-only value computed from other observables. It caches its result
 * together with the versions of its sources and recomputes only when a source
 * version changed, so reading it, and reading values derived from it, costs a
 * version comparison per source while nothing changed.
 */
class DerivedObservable<T> extends ObservableBase<T> {
  private readonly _sources: ReadonlyArray<ReadonlyObservable<unknown>>;
  private readonly _compute: () => T;
  private readonly _unsubscribers: Array<() => void> = [];
  private readonly _depth: number;
  private readonly _seen: number[];
  private _computed = false;
  private _cached: T | undefined = undefined;
  private _changes = 0;
  private _delivered = 0;
  private _unversioned = false;

  public constructor(sources: ReadonlyArray<ReadonlyObservable<unknown>>, compute: () => T) {
    super();

    this._sources = sources;
    this._compute = compute;
    this._seen = sources.map(() => Number.NaN);

    let depth = 0;

    for (const source of sources) {
      if (source instanceof ObservableBase) {
        depth = Math.max(depth, source._rank());
      }
    }

    this._depth = depth + 1;
  }

  public override _rank(): number {
    return this._depth;
  }

  public override _version(): number {
    this._validate();

    // Derived from a source that cannot tell, an object result is new on every read, so its count says nothing.
    return this._unversioned ? Number.NaN : this._changes;
  }

  public get value(): T {
    this._validate();

    return this._cached as T;
  }

  protected override _connect(): void {
    this._validate();
    this._delivered = this._changes;

    for (const source of this._sources) {
      this._unsubscribers.push(source.subscribe(this._onSourceChange));
    }
  }

  protected override _disconnect(): void {
    for (const unsubscribe of this._unsubscribers) {
      unsubscribe();
    }

    this._unsubscribers.length = 0;
  }

  protected override _current(): T {
    // Every delivery follows a _refresh, so the cache is current; reading value would recompute again over unversioned sources.
    return this._cached as T;
  }

  protected override _refresh(): boolean {
    this._validate();

    if (this._changes === this._delivered) {
      return false;
    }

    this._delivered = this._changes;

    return true;
  }

  /** Recomputes unless every source still has the version seen by the last computation. */
  private _validate(): void {
    const sources = this._sources;
    const seen = this._seen;

    let current = this._computed;
    let unversioned = false;

    // Versions are recorded before computing: a source changed by the computation itself only causes another recomputation later.
    for (let index = 0; index < sources.length; index++) {
      const version = versionOf(sources[index]!);

      if (seen[index] !== version) {
        seen[index] = version;
        current = false;
        unversioned ||= Number.isNaN(version);
      }
    }

    this._unversioned = unversioned;

    if (current) {
      return;
    }

    // Cleared first so that a throwing computation is retried on the next read.
    this._computed = false;

    const next = this._compute();

    if (this._changes === 0 || !isSettled(this._cached, next)) {
      this._changes++;
    }

    this._cached = next;
    this._computed = true;
  }

  private readonly _onSourceChange = (): void => {
    // While notifications are being batched, a derived value recomputes once
    // after all of its changed sources delivered, never once per source.
    if (batchDepth > 0 || flushing) {
      this._enqueue();
    } else if (this._refresh()) {
      this._notify();
    }
  };
}

/**
 * A read-only observable computed by `compute` from `sources`, which it
 * subscribes to only while it has subscribers itself.
 * @internal
 */
export const derive = <T>(sources: ReadonlyArray<ReadonlyObservable<unknown>>, compute: () => T): ReadonlyObservable<T> =>
  new DerivedObservable(sources, compute);

/**
 * A mutable value that notifies its subscribers when it changes.
 *
 * ```ts
 * const health = new Observable(100);
 * const status = health.map(hp => (hp > 50 ? 'Healthy' : 'Wounded'));
 *
 * health.value -= 60; // status subscribers receive 'Wounded'
 * ```
 *
 * Assigning {@link value} notifies only when the new value differs by
 * `Object.is`, so repeated equal assignments cost a comparison and nothing else.
 * An object mutated in place keeps its identity and therefore needs
 * {@link markChanged} or {@link mutate} to notify and to make derived values
 * recompute. Primitive assignments
 * allocate nothing; outside a batch, a listener throwing aborts the remaining
 * listeners of that notification and propagates to the assignment.
 */
export class Observable<T> extends ObservableBase<T> {
  private _value: T;
  private _changes = 0;

  public constructor(value: T) {
    super();

    this._value = value;
  }

  public get value(): T {
    return this._value;
  }

  public set value(value: T) {
    if (!Object.is(this._value, value)) {
      this._value = value;
      this._changes++;
      this._notify();
    }
  }

  /** @internal */
  public override _version(): number {
    return this._changes;
  }

  /**
   * Notifies subscribers without assigning, for an object value that was
   * changed in place. Derived values recompute on their next read.
   */
  public markChanged(): void {
    this._changes++;
    this._notify();
  }

  /**
   * Calls `mutate` with the current value, then notifies subscribers once.
   * When `mutate` throws, derived values still recompute on their next read,
   * as the value may have been changed partway, but nothing is notified.
   */
  public mutate(mutate: (value: T) => void): void {
    try {
      mutate(this._value);
    } finally {
      this._changes++;
    }

    this._notify();
  }

  /**
   * Removes every subscriber. The value stays readable and assignable, but
   * nothing is notified any more and later subscriptions are ignored. Values
   * derived from it keep their own subscribers and stop receiving changes.
   */
  public destroy(): void {
    this._end();
  }

  /**
   * Builds a frozen record with one observable per member of `members`:
   *
   * ```ts
   * const player = Observable.struct({
   *   name: 'Hero',
   *   health: 100,
   *   stats: Observable.struct({ ammo: 30, level: 1 }),
   * });
   *
   * player.health.value -= 10;
   * player.stats.ammo.value--;
   * ```
   *
   * Each own enumerable member, string or symbol keyed, becomes an
   * {@link Observable} holding that value; special names such as `__proto__`
   * are ordinary members. Members that already are observables (including derived values,
   * vectors and sizes) or structs are kept as they are, by identity, so several
   * structs can share them. Nothing is traversed: a nested object or array is
   * stored as the value of one observable; nest structs explicitly instead.
   * `members` itself is not modified.
   *
   * A struct owns nothing and has no teardown. The observables it created
   * belong to whoever holds the struct and need no cleanup beyond dropping it;
   * shared observables stay owned by their creator, and destroying one affects
   * every struct that holds it.
   *
   * @throws {TypeError} If `members` is not a plain object.
   */
  public static struct<T extends object>(members: T): ObservableStruct<T> {
    if (!isPlainObject(members)) {
      throw new TypeError('Observable.struct(): the members must be a plain object.');
    }

    const struct = {};

    for (const key of Reflect.ownKeys(members)) {
      // The tag of a spread struct copy is set below, not wrapped as a member.
      if (key === structTag || !Object.prototype.propertyIsEnumerable.call(members, key)) {
        continue;
      }

      const member = (members as Record<PropertyKey, unknown>)[key];

      // Defined rather than assigned: assigning `__proto__` would replace the prototype instead of adding a member.
      Object.defineProperty(struct, key, {
        value: isObservable(member) || isStruct(member) ? member : new Observable(member),
        enumerable: true,
      });
    }

    Object.defineProperty(struct, structTag, { value: true, enumerable: true });

    return Object.freeze(struct) as ObservableStruct<T>;
  }

  /**
   * Runs `update` with notifications deferred: every write takes effect
   * immediately, and subscribers are notified once, after the outermost batch
   * completes, with the final values.
   *
   * ```ts
   * Observable.batch(() => {
   *   player.health.value = 100;
   *   player.stats.ammo.value = 30;
   *   player.stats.level.value++;
   * });
   * ```
   *
   * - Reads inside the batch see the written values; derived values compute
   *   from the current sources.
   * - Values are delivered in the order they first changed, and each derived
   *   value after everything it depends on. A derived value recomputes once
   *   and notifies only if its result changed, so a text built from several
   *   changed values is computed and applied once.
   * - Batches nest; only the outermost one delivers. Changes made by
   *   listeners during the delivery are delivered in the same pass.
   * - There is no rollback. When `update` throws, the writes made so far stay,
   *   their notifications are delivered, and the error is rethrown. A
   *   throwing listener stops the remaining listeners of that value, as
   *   outside a batch, but every other queued value is still delivered; the
   *   first error is rethrown afterwards.
   * - Owner notifications of vectors and sizes, such as transform
   *   invalidation, are never deferred; only their subscribers are.
   *
   * @throws If `update` returns a promise: a batch is synchronous, and writes
   * after an `await` would not be batched.
   */
  public static batch(update: () => Synchronous): void {
    batchDepth++;

    let result: unknown;
    let failure: { readonly error: unknown } | null = null;

    try {
      result = update();
    } catch (error) {
      failure = { error };
    } finally {
      batchDepth--;
    }

    if (batchDepth === 0 && !flushing && queue.length > 0) {
      try {
        flush();
      } catch (error) {
        failure ??= { error };
      }
    }

    if (failure !== null) {
      if (isThenable(result)) {
        // The batch already failed; the abandoned promise must not also surface as an unhandled rejection.
        Promise.resolve(result).catch(noop);
      }

      throw failure.error;
    }

    requireSynchronousHook(
      result,
      'Observable.batch() callback',
      'Run asynchronous work outside the batch and batch each synchronous step.',
    );
  }
}
