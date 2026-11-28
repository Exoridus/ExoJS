import { derive, ObservableBase, type ObservableListener, type ReadonlyObservable } from '#core/Observable';

import { AbstractVector } from './AbstractVector';

/**
 * Receiver of {@link ObservableVector} change notifications. The vector calls
 * `_onObservableChange(channel)` whenever a component actually changes, passing
 * the numeric `channel` it was constructed with so a single owner can tell
 * several vectors apart (e.g. a node's position vs. scale vs. origin) without
 * allocating a bound closure per vector.
 * @internal
 */
export interface ObservableVectorOwner {
  _onObservableChange(channel: number): void;
}

/** Owner slot of a destroyed vector: it receives nothing and marks later subscriptions as ignored. */
const destroyedOwner: ObservableVectorOwner = { _onObservableChange: () => undefined };

/**
 * Subscribers of one vector. It takes the vector's owner slot only while it has
 * subscribers and forwards every change to the original owner first, so an
 * unobserved vector carries no extra field, closure or allocation.
 */
class VectorObservation extends ObservableBase<ObservableVector> implements ObservableVectorOwner {
  public constructor(
    private readonly _vector: ObservableVector,
    public readonly inner: ObservableVectorOwner | null,
    private readonly _swapOwner: (owner: ObservableVectorOwner | null) => void,
  ) {
    super();
  }

  public get value(): ObservableVector {
    return this._vector;
  }

  public _onObservableChange(channel: number): void {
    this.inner?._onObservableChange(channel);
    this._notify();
  }

  public end(): void {
    this._end();
  }

  protected override _connect(): void {
    this._swapOwner(this);
  }

  protected override _disconnect(): void {
    this._swapOwner(this.inner);
  }
}

/**
 * An {@link AbstractVector} subclass that notifies an owner whenever its
 * components change. Used internally by {@link Rectangle}, `SceneNode`,
 * {@link View} and other types to invalidate cached state (normals, transforms)
 * on mutation.
 *
 * Instead of a per-instance callback closure, the vector holds a reference to
 * its `owner` plus a numeric `channel` and calls `owner._onObservableChange(channel)`
 * on change. This keeps hot per-node vectors closure-free - a `SceneNode`
 * carries four of these, so dropping the bound closures saves four allocations
 * per node. Pass `owner = null` for a plain, non-reactive vector.
 *
 * Setting individual components (`x`, `y`) notifies only when the value
 * actually changes. Batch mutations via `set()` notify at most once per call.
 *
 * It also implements {@link ReadonlyObservable} for optional observation by
 * application code, such as `` live`Position: ${node.position}` ``: its
 * {@link value} is the vector itself, and subscribers run after the owner was
 * notified. Observation costs nothing until the first subscription.
 *
 * Deliberately has no `clone()`. A clone is a value, not a second notification
 * channel into this vector's owner, so it would have to hand back a plain
 * `Vector` - and importing `Vector` here closes a module-evaluation cycle
 * (`Vector` imports `Rectangle`, which constructs at module scope). Copy
 * explicitly instead: `new Vector(v.x, v.y)`.
 */
export class ObservableVector extends AbstractVector {
  private _x: number;
  private _y: number;
  private _owner: ObservableVectorOwner | null;
  private readonly _channel: number;

  /** @internal */
  public constructor(owner: ObservableVectorOwner | null, channel = 0, x = 0, y = 0) {
    super();

    this._x = x;
    this._y = y;
    this._owner = owner;
    this._channel = channel;
  }

  public get x(): number {
    return this._x;
  }

  public set x(x: number) {
    if (this._x !== x) {
      this._x = x;
      this._owner?._onObservableChange(this._channel);
    }
  }

  public get y(): number {
    return this._y;
  }

  public set y(y: number) {
    if (this._y !== y) {
      this._y = y;
      this._owner?._onObservableChange(this._channel);
    }
  }

  // The getters must be redeclared alongside the setter overrides: a
  // setter-only accessor on the subclass prototype would shadow the whole
  // inherited accessor pair, leaving `get` undefined.
  public override get angle(): number {
    return Math.atan2(this._y, this._x);
  }

  public override set angle(angle: number) {
    const length = this.length;

    this.set(Math.cos(angle) * length, Math.sin(angle) * length);
  }

  public override get length(): number {
    return Math.sqrt(this._x * this._x + this._y * this._y);
  }

  public override set length(magnitude: number) {
    const angle = this.angle;

    this.set(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
  }

  public override set(x: number = this._x, y: number = this._y): this {
    if (this._x !== x || this._y !== y) {
      this._x = x;
      this._y = y;
      this._owner?._onObservableChange(this._channel);
    }

    return this;
  }

  public override add(x: number, y: number = x): this {
    return this.set(this._x + x, this._y + y);
  }

  public override subtract(x: number, y: number = x): this {
    return this.set(this._x - x, this._y - y);
  }

  public override multiply(x: number, y: number = x): this {
    return this.set(this._x * x, this._y * y);
  }

  public scale(x: number, y: number = x): this {
    return this.set(this._x * x, this._y * y);
  }

  public override divide(x: number, y: number = x): this {
    if (x !== 0 && y !== 0) {
      return this.set(this._x / x, this._y / y);
    }

    return this;
  }

  public copy(vector: AbstractVector): this {
    return this.set(vector.x, vector.y);
  }

  /** This vector, which keeps its identity while its components change. */
  public get value(): this {
    return this;
  }

  /**
   * Calls `listener` with this vector after each change until the returned
   * function is called. See {@link ReadonlyObservable.subscribe}.
   */
  public subscribe(listener: ObservableListener<this>): () => void {
    const owner = this._owner;

    if (owner === destroyedOwner) {
      return () => undefined;
    }

    const observation =
      owner instanceof VectorObservation
        ? owner
        : new VectorObservation(this, owner, next => {
            this._owner = next;
          });

    return observation.subscribe(listener as ObservableListener<ObservableVector>);
  }

  /** A read-only value computed from this vector; see {@link ReadonlyObservable.map}. */
  public map<U>(project: (value: this) => U): ReadonlyObservable<U> {
    return derive([this], () => project(this));
  }

  public destroy(): void {
    if (this._owner instanceof VectorObservation) {
      this._owner.end();
    }

    // Drop the owner reference to prevent leaks if this vector is retained by
    // an external scope after the owning object is destroyed.
    this._owner = destroyedOwner;
  }
}
