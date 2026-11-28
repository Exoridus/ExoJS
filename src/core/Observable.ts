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
   * A read-only value computed from this one by `project`. It subscribes to
   * this value only while it has subscribers itself, computes on every read of
   * its `value`, and notifies only when the result differs from the last one it
   * notified (`Object.is`), or when the result is an object, which may have
   * been mutated in place.
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

declare const structTag: unique symbol;

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

const structs = new WeakSet();

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
        // A failed connection must not leave a listener the caller has no handle for, or a state that never reconnects.
        listeners.remove(listener);
        this._connected = false;

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
    if (!this._queued) {
      this._queued = true;
      queue.push(this as ObservableBase<unknown>);
    }
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
 * Delivers every queued notification in the order the values first changed.
 * Changes made by listeners are queued behind the current ones and delivered in
 * the same pass. Every queued value is delivered even when a listener throws;
 * the first error is rethrown afterwards.
 */
const flush = (): void => {
  flushing = true;

  const deliveries = new Map<ObservableBase<unknown>, number>();
  let failure: { readonly error: unknown } | null = null;

  try {
    for (let i = 0; i < queue.length; i++) {
      const observable = queue[i]!;
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
    flushing = false;
  }

  if (failure !== null) {
    throw failure.error;
  }
};

const isSettled = (previous: unknown, next: unknown): boolean =>
  Object.is(previous, next) && (typeof next !== 'object' || next === null) && typeof next !== 'function';

/** A read-only value computed from other observables. */
class DerivedObservable<T> extends ObservableBase<T> {
  private readonly _sources: ReadonlyArray<ReadonlyObservable<unknown>>;
  private readonly _compute: () => T;
  private readonly _unsubscribers: Array<() => void> = [];
  private _last: T | undefined = undefined;

  public constructor(sources: ReadonlyArray<ReadonlyObservable<unknown>>, compute: () => T) {
    super();

    this._sources = sources;
    this._compute = compute;
  }

  public get value(): T {
    return this._compute();
  }

  protected override _connect(): void {
    this._last = this._compute();

    for (const source of this._sources) {
      this._unsubscribers.push(source.subscribe(this._onSourceChange));
    }
  }

  protected override _disconnect(): void {
    for (const unsubscribe of this._unsubscribers) {
      unsubscribe();
    }

    this._unsubscribers.length = 0;
    this._last = undefined;
  }

  protected override _current(): T {
    return this._last as T;
  }

  protected override _refresh(): boolean {
    const next = this._compute();

    if (isSettled(this._last, next)) {
      return false;
    }

    this._last = next;

    return true;
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
 * {@link markChanged} or {@link mutate} to notify. Primitive assignments
 * allocate nothing; outside a batch, a listener throwing aborts the remaining
 * listeners of that notification and propagates to the assignment.
 */
export class Observable<T> extends ObservableBase<T> {
  private _value: T;

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
      this._notify();
    }
  }

  /** Notifies subscribers without assigning, for an object value that was changed in place. */
  public markChanged(): void {
    this._notify();
  }

  /** Calls `mutate` with the current value, then notifies subscribers once. */
  public mutate(mutate: (value: T) => void): void {
    mutate(this._value);
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
   * Each own enumerable member becomes an {@link Observable} holding that
   * value. Members that already are observables (including derived values,
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

    const struct: Record<string, unknown> = {};

    for (const key of Object.keys(members)) {
      const member = members[key];

      struct[key] = isObservable(member) || structs.has(member as object) ? member : new Observable(member);
    }

    structs.add(struct);

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
   * - Values are delivered in the order they first changed. A derived value
   *   recomputes once after all of its changed sources and notifies only if
   *   its result changed, so a text built from several changed values is
   *   applied once.
   * - Batches nest; only the outermost one delivers. Changes made by
   *   listeners during the delivery are delivered in the same pass.
   * - There is no rollback. When `update` throws, the writes made so far stay,
   *   their notifications are delivered, and the error is rethrown. When
   *   listeners throw, every queued notification is still delivered and the
   *   first listener error is rethrown.
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
      throw failure.error;
    }

    requireSynchronousHook(
      result,
      'Observable.batch() callback',
      'Run asynchronous work outside the batch and batch each synchronous step.',
    );
  }
}
