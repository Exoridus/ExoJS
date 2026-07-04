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

/**
 * An {@link AbstractVector} subclass that notifies an owner whenever its
 * components change. Used internally by {@link Rectangle}, `SceneNode`,
 * {@link View} and other types to invalidate cached state (normals, transforms)
 * on mutation.
 *
 * Instead of a per-instance callback closure, the vector holds a reference to
 * its `owner` plus a numeric `channel` and calls `owner._onObservableChange(channel)`
 * on change. This keeps hot per-node vectors closure-free — a `SceneNode`
 * carries four of these, so dropping the bound closures saves four allocations
 * per node. Pass `owner = null` for a plain, non-reactive vector.
 *
 * Setting individual components (`x`, `y`) notifies only when the value
 * actually changes. Batch mutations via `set()` notify at most once per call.
 */
export class ObservableVector extends AbstractVector {
  private _x: number;
  private _y: number;
  private _owner: ObservableVectorOwner | null;
  private readonly _channel: number;

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

  public scale(x: number, y: number = x): this {
    return this.set(this._x * x, this._y * y);
  }

  public override divide(x: number, y: number = x): this {
    if (x !== 0 && y !== 0) {
      return this.set(this._x / x, this._y / y);
    }

    return this;
  }

  public clone(): this {
    return new ObservableVector(this._owner, this._channel, this._x, this._y) as this;
  }

  public copy(vector: AbstractVector): this {
    return this.set(vector.x, vector.y);
  }

  public destroy(): void {
    // Drop the owner reference to prevent leaks if this vector is retained by
    // an external scope after the owning object is destroyed.
    this._owner = null;
  }
}
