import { Size } from './Size';

/**
 * A {@link Size} subclass that fires a callback whenever `width` or `height`
 * changes. Used internally by layout-aware types to invalidate cached geometry
 * on dimension mutations.
 *
 * Batch mutations via `set()` fire at most one callback per call.
 */
export class ObservableSize extends Size {
  private readonly _callback: () => void;

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
      this._callback();
    }
  }

  public override get height(): number {
    return this._height;
  }

  public override set height(height: number) {
    if (this._height !== height) {
      this._height = height;
      this._callback();
    }
  }

  public override set(width: number = this._width, height: number = this._height): this {
    if (this._width !== width || this._height !== height) {
      this._width = width;
      this._height = height;
      this._callback();
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
}
