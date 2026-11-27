import type { ObservableVectorOwner } from './ObservableVector';
import { Vector } from './Vector';

/** A Vector-compatible reactive component owned by a Math shape. @internal */
export class ShapeVector extends Vector {
  private _shapeX: number;
  private _shapeY: number;
  private _owner: ObservableVectorOwner | null;

  // Shared descriptors preserve Vector's public data-property type contract
  // without allocating per-instance accessor closures.
  private static readonly _components: PropertyDescriptorMap = {
    x: {
      enumerable: true,
      configurable: true,
      get(this: ShapeVector): number {
        return this._shapeX;
      },
      set(this: ShapeVector, value: number) {
        if (this._shapeX !== value) {
          this._shapeX = value;
          this._owner?._onObservableChange(0);
        }
      },
    },
    y: {
      enumerable: true,
      configurable: true,
      get(this: ShapeVector): number {
        return this._shapeY;
      },
      set(this: ShapeVector, value: number) {
        if (this._shapeY !== value) {
          this._shapeY = value;
          this._owner?._onObservableChange(0);
        }
      },
    },
  };

  static {
    Object.defineProperties(this.prototype, this._components);
  }

  public constructor(owner: ObservableVectorOwner, x: number, y: number) {
    super(x, y);
    this._shapeX = x;
    this._shapeY = y;
    this._owner = owner;
  }

  public override set(x: number, y = x): this {
    if (this._setSilently(x, y)) {
      this._owner?._onObservableChange(0);
    }

    return this;
  }

  /** @internal */
  public _setSilently(x: number, y: number): boolean {
    if (this._shapeX === x && this._shapeY === y) {
      return false;
    }

    this._shapeX = x;
    this._shapeY = y;

    return true;
  }

  public override copy(vector: Vector): this {
    return this.set(vector.x, vector.y);
  }

  public toJSON(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  public override destroy(): void {
    this._owner = null;
  }
}
