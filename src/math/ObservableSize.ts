import { derive, nextChangeStamp, ObservableBase, type ObservableListener, type ReadonlyObservable } from '#core/Observable';

import { Size } from './Size';

/**
 * Subscribers of one size. While it has subscribers, the size's callback is
 * replaced by one that runs the original callback first and then notifies, so
 * an unobserved size carries no extra field, closure or allocation.
 */
class SizeObservation extends ObservableBase<ObservableSize> {
  private _stamp = nextChangeStamp();

  public readonly relay = (): void => {
    this._stamp = nextChangeStamp();
    this.inner?.();
    this._notify();
  };

  /** @internal Moves on every change, also while delivery waits for a batch to end. */
  public override _version(): number {
    return this._stamp;
  }

  public constructor(
    private readonly _size: ObservableSize,
    public readonly inner: (() => void) | null,
    private readonly _swapCallback: (callback: (() => void) | null, observation: SizeObservation | null) => void,
  ) {
    super();
  }

  public get value(): ObservableSize {
    return this._size;
  }

  public end(): void {
    this._end();
  }

  protected override _connect(): void {
    this._swapCallback(this.relay, this);
  }

  protected override _disconnect(): void {
    this._swapCallback(this.inner, null);
  }
}

const observations = new WeakMap<ObservableSize, SizeObservation>();

/** Callback slot of a destroyed size: it does nothing and marks later subscriptions as ignored. */
const destroyedCallback = (): void => undefined;

/**
 * A {@link Size} subclass that fires a callback whenever `width` or `height`
 * changes. Used internally by layout-aware types to invalidate cached geometry
 * on dimension mutations.
 *
 * Batch mutations via `set()` fire at most one callback per call.
 *
 * It also implements {@link ReadonlyObservable} for optional observation by
 * application code: its {@link value} is the size itself, and subscribers run
 * after the callback. Observation costs nothing until the first subscription.
 */
export class ObservableSize extends Size {
  private _callback: (() => void) | null;

  public constructor(callback: () => void, width = 0, height = 0) {
    super(width, height);

    this._callback = callback;
  }

  public override get width(): number {
    return this._width;
  }

  public override set width(width: number) {
    if (this._width !== width) {
      this._width = width;
      this._callback?.();
    }
  }

  public override get height(): number {
    return this._height;
  }

  public override set height(height: number) {
    if (this._height !== height) {
      this._height = height;
      this._callback?.();
    }
  }

  public override set(width: number = this._width, height?: number): this {
    // No-argument `set()` stays a no-op; a one-argument call follows Size's
    // uniform-width default. Both are part of the public contract.
    const nextHeight = height ?? (arguments.length === 0 ? this._height : width);

    if (this._width !== width || this._height !== nextHeight) {
      this._width = width;
      this._height = nextHeight;
      this._callback?.();
    }

    return this;
  }

  public override add(x: number, y: number = x): this {
    return this.set(this._width + x, this._height + y);
  }

  public override subtract(x: number, y: number = x): this {
    return this.set(this._width - x, this._height - y);
  }

  public override scale(x: number, y: number = x): this {
    return this.set(this._width * x, this._height * y);
  }

  public override divide(x: number, y: number = x): this {
    return this.set(this._width / x, this._height / y);
  }

  public override copy(size: Size): this {
    return this.set(size.width, size.height);
  }

  /**
   * A plain, callback-free {@link Size}. A clone is a value, not a second
   * observer of this size's owner: mutating the copy must not invalidate
   * geometry that belongs to something else. The return type says so, so a
   * caller cannot mistake the copy for a live one.
   */
  public override clone(): Size {
    return new Size(this._width, this._height);
  }

  /** This size, which keeps its identity while its dimensions change. */
  public get value(): this {
    return this;
  }

  /**
   * Calls `listener` with this size after each change until the returned
   * function is called. See {@link ReadonlyObservable.subscribe}.
   */
  public subscribe(listener: ObservableListener<this>): () => void {
    if (this._callback === destroyedCallback) {
      return () => undefined;
    }

    const observation =
      observations.get(this) ??
      new SizeObservation(this, this._callback, (callback, current) => {
        this._callback = callback;

        if (current === null) {
          observations.delete(this);
        } else {
          observations.set(this, current);
        }
      });

    return observation.subscribe(listener as ObservableListener<ObservableSize>);
  }

  /** @internal A change count while observed; `NaN` while not, as changes are then not counted. */
  public _version(): number {
    return observations.get(this)?._version() ?? Number.NaN;
  }

  /** A read-only value computed from this size; see {@link ReadonlyObservable.map}. */
  public map<U>(project: (value: this) => U): ReadonlyObservable<U> {
    return derive([this], () => project(this));
  }

  public override destroy(): void {
    observations.get(this)?.end();
    this._callback = destroyedCallback;
  }
}
