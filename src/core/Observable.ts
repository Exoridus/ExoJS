import { Signal } from './Signal';

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
 * Objects whose own properties are data, such as {@link ObservableObject}
 * instances, which {@link isObservable} must not mistake for the contract even
 * when their data has `value`, `subscribe` and `map` keys.
 * @internal
 */
export const observableData = new WeakSet();

/**
 * Whether `value` implements the {@link ReadonlyObservable} contract. Functions,
 * promises, plain objects without `subscribe` and `map` methods, and
 * {@link ObservableObject} instances are not observable.
 */
export const isObservable = (value: unknown): value is ReadonlyObservable<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !observableData.has(value) &&
  'value' in value &&
  typeof (value as Partial<ReadonlyObservable<unknown>>).subscribe === 'function' &&
  typeof (value as Partial<ReadonlyObservable<unknown>>).map === 'function';

const maxNotificationRounds = 100;

const noop = (): void => undefined;

/**
 * Listener storage, notification ordering and derivation shared by every
 * observable the engine implements.
 *
 * A change made while listeners are being notified does not start a nested
 * notification: the current round finishes delivering, then a new round
 * delivers the latest value to every listener. Listeners therefore never
 * receive values out of order, and the last value each one receives is the
 * current one.
 * @internal
 */
export abstract class ObservableBase<T> implements ReadonlyObservable<T> {
  private _listeners: Signal<[T]> | null = null;
  private _notifying = false;
  private _stale = false;
  private _connected = false;
  private _ended = false;

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

  protected _notify(): void {
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

  /** Removes every listener and stops observing upstream sources. Later subscriptions are ignored. */
  protected _end(): void {
    this._ended = true;
    this._listeners?.destroy();
    this._listeners = null;
    this._disconnectIfIdle();
  }

  private _disconnectIfIdle(): void {
    if (this._connected && (this._listeners === null || this._listeners.count === 0)) {
      this._connected = false;
      this._disconnect();
    }
  }
}

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

  private readonly _onSourceChange = (): void => {
    const next = this._compute();

    if (isSettled(this._last, next)) {
      return;
    }

    this._last = next;
    this._notify();
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
 * allocate nothing; a listener throwing aborts the remaining listeners of that
 * notification and propagates to the assignment.
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
}
