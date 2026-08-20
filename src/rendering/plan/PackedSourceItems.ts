import type { Drawable } from '#rendering/Drawable';
import { SOURCE_QUAD_FLOATS } from '#rendering/sourceQuadRecord';
import { packTintRow, packTransformRow, TRANSFORM_FLOATS_PER_ROW, TRANSFORM_TINT_BYTES_PER_ROW } from '#rendering/TransformBuffer';

const initialCapacity = 64;

/**
 * @internal
 *
 * The persistent draw items of ONE source scope, stored as parallel typed
 * arrays instead of one object per item.
 *
 * The shape is what a million items forces. Cut 1 stored a `PersistentDrawItem`
 * object per drawable and measured 235.8 bytes per item at 1M - an object
 * header, eight named slots and the array pointer for seven numbers and one
 * reference. Here the same seven numbers cost 44 bytes in four typed arrays and
 * the reference stays in a plain side table, which is the only field that
 * genuinely has to be one.
 *
 * Bounds are `Float64Array`, not `Float32Array`. They feed the cull test, and
 * rounding an extent to f32 moves the decision for an item lying exactly on the
 * rect boundary - a visible-set difference, i.e. a pixel difference, bought for
 * 16 bytes an item. `zIndex` is f64 for the same reason: it is a sort key, and a
 * narrowed key can tie two entries a wider one separates.
 *
 * Items of one scope are CONTIGUOUS here and in the scope's recorded order,
 * which is what lets a membership bitset be scanned in draw order over a plain
 * index range rather than through an indirection table.
 */
export class PackedSourceItems {
  private _count = 0;
  private _capacity = 0;

  private _minX: Float64Array<ArrayBuffer> = new Float64Array(0);
  private _minY: Float64Array<ArrayBuffer> = new Float64Array(0);
  private _maxX: Float64Array<ArrayBuffer> = new Float64Array(0);
  private _maxY: Float64Array<ArrayBuffer> = new Float64Array(0);
  private _seq = new Int32Array(0);
  private _zIndex: Float64Array<ArrayBuffer> = new Float64Array(0);

  /**
   * The one field that cannot be a number. Parallel to the typed arrays; index
   * `i` is the drawable of item `i`.
   */
  public readonly drawables: Drawable[] = [];

  /**
   * Canonical prepacked render data, or empty until {@link prepack} runs.
   *
   * Sized only for a source a backend has accepted for the persistent-indexed
   * path, because that is the only case where it pays: an item entering the view
   * there is otherwise read out of the scene graph cold - its world transform,
   * its local bounds and its texture frame all resolved through objects nothing
   * has touched for hundreds of frames - and that read, not the write, was the
   * measured cost of a camera step. Prepacked, an ENTER is a fixed-size copy
   * between typed arrays.
   *
   * Backend-NEUTRAL by construction: the transform row and tint row use the
   * engine's canonical packers, and the quad record is the drawable's own
   * description of itself ({@link Drawable._packSourceQuad}). Nothing here knows
   * a texel address, a buffer offset, a derived slot or a batch.
   */
  private _rows = new Float32Array(0);
  private _tints = new Uint8Array(0);
  private _quads = new Float32Array(0);
  private _prepacked = false;

  public get count(): number {
    return this._count;
  }

  public get minX(): Float64Array {
    return this._minX;
  }

  public get minY(): Float64Array {
    return this._minY;
  }

  public get maxX(): Float64Array {
    return this._maxX;
  }

  public get maxY(): Float64Array {
    return this._maxY;
  }

  public get seq(): Int32Array {
    return this._seq;
  }

  public get zIndex(): Float64Array {
    return this._zIndex;
  }

  /** Canonical transform rows, `TRANSFORM_FLOATS_PER_ROW` per item. @internal */
  public get rows(): Float32Array {
    return this._rows;
  }

  /** Canonical tint rows, `TRANSFORM_TINT_BYTES_PER_ROW` per item. @internal */
  public get tints(): Uint8Array {
    return this._tints;
  }

  /** Canonical quad records, `SOURCE_QUAD_FLOATS` per item. @internal */
  public get quads(): Float32Array {
    return this._quads;
  }

  public get isPrepacked(): boolean {
    return this._prepacked;
  }

  /**
   * Resolve every item's canonical render data once, so no later selection has
   * to touch a drawable again.
   *
   * Returns `false` - and allocates nothing - as soon as one item cannot
   * describe itself as a quad, because a store fed from a partial table would
   * silently draw stale rows for the rest.
   */
  public prepack(): boolean {
    if (this._prepacked) {
      return true;
    }

    const count = this._count;
    const rows = new Float32Array(count * TRANSFORM_FLOATS_PER_ROW);
    const tints = new Uint8Array(count * TRANSFORM_TINT_BYTES_PER_ROW);
    const quads = new Float32Array(count * SOURCE_QUAD_FLOATS);

    for (let i = 0; i < count; i++) {
      const drawable = this.drawables[i]!;

      if (!drawable._packSourceQuad(quads, i * SOURCE_QUAD_FLOATS)) {
        return false;
      }

      packTransformRow(rows, i * TRANSFORM_FLOATS_PER_ROW, drawable.getGlobalTransform(), drawable.pixelSnapMode);
      packTintRow(tints, i * TRANSFORM_TINT_BYTES_PER_ROW, drawable.tint);
    }

    this._rows = rows;
    this._tints = tints;
    this._quads = quads;
    this._prepacked = true;

    return true;
  }

  /** CPU bytes this store holds, for the memory report. */
  public get byteLength(): number {
    return (
      this._minX.byteLength +
      this._minY.byteLength +
      this._maxX.byteLength +
      this._maxY.byteLength +
      this._seq.byteLength +
      this._zIndex.byteLength +
      this._rows.byteLength +
      this._tints.byteLength +
      this._quads.byteLength +
      this.drawables.length * 8
    );
  }

  /** Append one item and return its scope-local index. */
  public push(drawable: Drawable, seq: number, zIndex: number, minX: number, minY: number, maxX: number, maxY: number): number {
    const index = this._count;

    if (index === this._capacity) {
      this._grow(index + 1);
    }

    this._minX[index] = minX;
    this._minY[index] = minY;
    this._maxX[index] = maxX;
    this._maxY[index] = maxY;
    this._seq[index] = seq;
    this._zIndex[index] = zIndex;
    this.drawables[index] = drawable;
    this._count = index + 1;

    return index;
  }

  /**
   * Drop everything back to `length` items.
   *
   * Discovery needs this because a producer that turns out to have read the view
   * is collapsed into one live entry AFTER its collect ran, so the items it
   * already contributed have to be withdrawn (see
   * `RenderPlanBuilder._resolveViewAttribution`).
   */
  public truncate(length: number): void {
    if (length < this._count) {
      this.drawables.length = length;
      this._count = length;
    }
  }

  /** Release the arrays (source invalidation / root destroy). */
  public clear(): void {
    this._count = 0;
    this._capacity = 0;
    this._minX = new Float64Array(0);
    this._minY = new Float64Array(0);
    this._maxX = new Float64Array(0);
    this._maxY = new Float64Array(0);
    this._seq = new Int32Array(0);
    this._zIndex = new Float64Array(0);
    this._rows = new Float32Array(0);
    this._tints = new Uint8Array(0);
    this._quads = new Float32Array(0);
    this._prepacked = false;
    this.drawables.length = 0;
  }

  private _grow(required: number): void {
    let next = Math.max(initialCapacity, this._capacity);

    while (next < required) {
      next *= 2;
    }

    this._minX = growF64(this._minX, next, this._count);
    this._minY = growF64(this._minY, next, this._count);
    this._maxX = growF64(this._maxX, next, this._count);
    this._maxY = growF64(this._maxY, next, this._count);
    this._zIndex = growF64(this._zIndex, next, this._count);

    const seq = new Int32Array(next);

    seq.set(this._seq.subarray(0, this._count));
    this._seq = seq;
    this._capacity = next;
  }
}

const growF64 = (source: Float64Array<ArrayBuffer>, capacity: number, used: number): Float64Array<ArrayBuffer> => {
  const next = new Float64Array(capacity);

  next.set(source.subarray(0, used));

  return next;
};
