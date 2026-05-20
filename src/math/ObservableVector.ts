import { AbstractVector } from '@/math/AbstractVector';

/**
 * A {@link AbstractVector} subclass that fires a callback whenever its
 * components change. Used internally by {@link Rectangle} and other types to
 * invalidate cached state (e.g. normals) on position mutations.
 *
 * Setting individual components (`x`, `y`) fires the callback only when the
 * value actually changes. Batch mutations via `set()` fire at most one
 * callback per call.
 */
export class ObservableVector extends AbstractVector {
  private _x: number;
  private _y: number;
  private _callback: (() => void) | null;

  public constructor(callback: (() => void) | null, x = 0, y = 0) {
    super();

    this._x = x;
    this._y = y;
    this._callback = callback;
  }

  public get x(): number {
    return this._x;
  }

  public set x(x: number) {
    if (this._x !== x) {
      this._x = x;
      this._callback?.();
    }
  }

  public get y(): number {
    return this._y;
  }

  public set y(y: number) {
    if (this._y !== y) {
      this._y = y;
      this._callback?.();
    }
  }

  public override set angle(angle: number) {
    const length = this.length;

    this.set(Math.cos(angle) * length, Math.sin(angle) * length);
  }

  public override set length(magnitude: number) {
    const angle = this.angle;

    this.set(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
  }

  public override set(x: number = this._x, y: number = this._y): this {
    if (this._x !== x || this._y !== y) {
      this._x = x;
      this._y = y;
      this._callback?.();
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
    return new ObservableVector(this._callback ?? ((): void => {}), this._x, this._y) as this;
  }

  public copy(vector: AbstractVector): this {
    return this.set(vector.x, vector.y);
  }

  public destroy(): void {
    // Clear the callback to prevent leaks if this vector is retained by an
    // external scope after the owning object is destroyed.
    this._callback = null;
  }
}
