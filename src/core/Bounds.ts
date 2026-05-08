import type { Matrix } from '@/math/Matrix';
import { Rectangle } from '@/math/Rectangle';

/**
 * Mutable axis-aligned bounding box accumulator. Starts as the empty bounds
 * (`-Infinity..Infinity` reversed) and grows monotonically as points or
 * rectangles are merged in via {@link Bounds.addCoords} and
 * {@link Bounds.addRect}. Used during scene-graph traversal to accumulate a
 * subtree's combined extent for culling and hit-testing.
 *
 * The {@link Bounds.getRect} accessor lazily folds the current min/max into
 * a shared {@link Rectangle} — copy the result if you need to retain it
 * across further accumulation.
 */
export class Bounds {
  private _minX = Infinity;
  private _minY = Infinity;
  private _maxX = -Infinity;
  private _maxY = -Infinity;
  private _dirty = true;
  private _rect: Rectangle = new Rectangle();

  public get minX(): number {
    return this._minX;
  }

  public get minY(): number {
    return this._minY;
  }

  public get maxX(): number {
    return this._maxX;
  }

  public get maxY(): number {
    return this._maxY;
  }

  /** Expand the bounds to include `(x, y)`. */
  public addCoords(x: number, y: number): this {
    this._minX = Math.min(this._minX, x);
    this._minY = Math.min(this._minY, y);
    this._maxX = Math.max(this._maxX, x);
    this._maxY = Math.max(this._maxY, y);

    this._dirty = true;

    return this;
  }

  /**
   * Expand the bounds to include `rectangle`. When `transform` is provided
   * the rectangle's corners are transformed into the bounds' coordinate
   * space first (via `Rectangle.temp` — does not mutate `rectangle`).
   */
  public addRect(rectangle: Rectangle, transform?: Matrix): this {
    if (transform) {
      rectangle = rectangle.transform(transform, Rectangle.temp);
    }

    return this.addCoords(rectangle.left, rectangle.top).addCoords(rectangle.right, rectangle.bottom);
  }

  /**
   * Materialize the accumulated min/max as a {@link Rectangle}. Returns
   * the same instance across calls — copy if you need to retain it past
   * the next mutation.
   */
  public getRect(): Rectangle {
    if (this._dirty) {
      this._rect.set(this._minX, this._minY, this._maxX - this._minX, this._maxY - this._minY);

      this._dirty = false;
    }

    return this._rect;
  }

  /** Restore the empty-bounds state for reuse across frames. */
  public reset(): this {
    this._minX = Infinity;
    this._minY = Infinity;
    this._maxX = -Infinity;
    this._maxY = -Infinity;

    this._dirty = true;

    return this;
  }

  public destroy(): void {
    this._rect.destroy();
  }
}
