import type { PackedTile } from './types';
import { validateInteger } from './types';

/**
 * Public readonly view of a tile chunk.
 *
 * Provides read-only inspection access for iteration, queries, and the
 * future renderer. The underlying storage is never exposed directly.
 *
 * @advanced
 */
export interface ReadonlyTileChunk {
  /** Signed chunk X coordinate. */
  readonly cx: number;
  /** Signed chunk Y coordinate. */
  readonly cy: number;
  /** Width of this chunk in tiles. */
  readonly width: number;
  /** Height of this chunk in tiles. */
  readonly height: number;
  /** Whether every cell is empty (all-zero). */
  readonly empty: boolean;
  /**
   * Monotonic revision counter. Increments on every cell mutation
   * within this chunk. No-ops (writing same value) do NOT increment.
   */
  readonly revision: number;

  /**
   * Read the raw packed tile word at local-in-chunk coordinates.
   * Returns 0 for empty.
   * @throws If coordinates are invalid.
   */
  getRawAt(lx: number, ly: number): PackedTile;

  /**
   * Create a defensive copy of the tile data. The caller owns the copy;
   * mutation of the returned array cannot affect the chunk.
   */
  cloneTiles(): Uint32Array;
}

/**
 * A compact, fixed-size chunk of tile data within a layer.
 *
 * Storage is a single {@link Uint32Array} of length `width * height`,
 * laid out row-major. Each cell is a packed tile word (0 = empty).
 * Chunk coordinates are signed to support future infinite maps.
 *
 * The backing array is **private** — external code cannot mutate storage
 * directly. All mutation must flow through {@link TileLayer} public APIs,
 * which call the package-internal `_setRawAt` method.
 *
 * The chunk tracks a revision counter that increments on every mutation
 * so the future renderer can detect which chunks need GPU rebuilds.
 *
 * @advanced
 */
export class TileChunk implements ReadonlyTileChunk {
  /** Signed chunk X coordinate. */
  public readonly cx: number;
  /** Signed chunk Y coordinate. */
  public readonly cy: number;

  /** Width of this chunk in tiles. */
  public readonly width: number;
  /** Height of this chunk in tiles. */
  public readonly height: number;

  /** Packed tile storage (row-major). Private — never exposed directly. */
  private readonly _tiles: Uint32Array;

  /** Whether every cell in this chunk is empty (0). Lazy-computed. */
  private _empty: boolean | null = null;

  /** Monotonic revision counter — incremented on every mutation. */
  private _revision = 0;

  /**
   * @param cx Signed chunk X coordinate (must be finite safe integer).
   * @param cy Signed chunk Y coordinate (must be finite safe integer).
   * @param width Chunk width in tiles (positive safe integer).
   * @param height Chunk height in tiles (positive safe integer).
   * @param source Optional source data to copy (must match length).
   */
  public constructor(cx: number, cy: number, width: number, height: number, source?: Uint32Array) {
    // Validate chunk coordinates as finite safe integers (negative OK).
    if (!Number.isFinite(cx) || !Number.isInteger(cx) || !Number.isSafeInteger(cx)) {
      throw new Error(`TileChunk cx must be a finite safe integer (got ${cx}).`);
    }
    if (!Number.isFinite(cy) || !Number.isInteger(cy) || !Number.isSafeInteger(cy)) {
      throw new Error(`TileChunk cy must be a finite safe integer (got ${cy}).`);
    }

    if (width <= 0 || height <= 0) {
      throw new Error(`TileChunk dimensions must be positive (got ${width}x${height}).`);
    }
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
      throw new Error(`TileChunk dimensions must be safe integers (got ${width}x${height}).`);
    }

    const size = width * height;
    if (!Number.isSafeInteger(size)) {
      throw new Error(`TileChunk size overflow: ${width} * ${height} is not safe.`);
    }

    // Guard against TypedArray length limits.
    if (size > 0xFFFFFFFF) {
      throw new Error(`TileChunk size ${size} exceeds TypedArray maximum length.`);
    }

    this.cx = cx;
    this.cy = cy;
    this.width = width;
    this.height = height;

    if (source) {
      if (source.length !== size) {
        throw new Error(
          `TileChunk source length ${source.length} != ${size}.`,
        );
      }
      // Defensive copy — caller mutation of source array will not affect storage.
      this._tiles = new Uint32Array(source);
    } else {
      this._tiles = new Uint32Array(size);
    }
  }

  /** Row-major index for cell (lx, ly) within this chunk. */
  private _index(lx: number, ly: number): number {
    return ly * this.width + lx;
  }

  /**
   * Validate local-in-chunk coordinates before access.
   * @throws If lx or ly is not a finite integer or out of [0, dimension).
   */
  private _validateLocalCoord(lx: number, ly: number): void {
    validateInteger(lx, 'lx');
    validateInteger(ly, 'ly');
    if (lx < 0 || lx >= this.width) {
      throw new Error(`lx ${lx} out of chunk bounds [0, ${this.width - 1}].`);
    }
    if (ly < 0 || ly >= this.height) {
      throw new Error(`ly ${ly} out of chunk bounds [0, ${this.height - 1}].`);
    }
  }

  // ── Readonly public API (ReadonlyTileChunk) ──────────────────────────

  /** @inheritdoc */
  public getRawAt(lx: number, ly: number): PackedTile {
    this._validateLocalCoord(lx, ly);
    return this._tiles[this._index(lx, ly)]!;
  }

  /** @inheritdoc */
  public get empty(): boolean {
    if (this._empty === null) {
      this._empty = this._tiles.every(v => v === 0);
    }
    return this._empty;
  }

  /** @inheritdoc */
  public get revision(): number {
    return this._revision;
  }

  /** @inheritdoc */
  public cloneTiles(): Uint32Array {
    return new Uint32Array(this._tiles);
  }

  // ── Internal mutation (package-private, NOT public API) ──────────────

  /**
   * Package-internal access to the underlying tile storage.
   * Returns the actual mutable `Uint32Array` — DO NOT USE publicly.
   *
   * Provided for the future tilemap renderer (same package) so it can
   * read chunk data efficiently without a full `cloneTiles()` copy per frame.
   *
   * External consumers and other packages MUST NOT call this.
   * @internal
   */
  public _getRawStorage(): Uint32Array {
    return this._tiles;
  }

  /**
   * Validate a packed tile value before storing.
   * Accepts any finite integer — `Uint32Array` stores via unsigned 32-bit
   * truncation (`ToUint32`). Negative values produced by JavaScript's
   * signed bitwise ops (e.g. when the transform bits set bit 31) are valid.
   * @throws If the value is NaN, Infinity, or non-integer.
   * @internal
   */
  private _validatePacked(packed: PackedTile): void {
    if (typeof packed !== 'number' || !Number.isFinite(packed) || !Number.isInteger(packed)) {
      throw new Error(`Packed tile must be a finite integer (got ${packed}).`);
    }
  }

  /**
   * Write a packed tile word at local-in-chunk coordinates.
   * Returns true if the stored value actually changed.
   *
   * Package-internal: only {@link TileLayer} may call this.
   * @internal
   */
  public _setRawAt(lx: number, ly: number, packed: PackedTile): boolean {
    this._validateLocalCoord(lx, ly);
    this._validatePacked(packed);
    const i = this._index(lx, ly);
    const prev = this._tiles[i];
    if (prev === packed) return false;
    this._tiles[i] = packed;
    this._revision++;
    this._empty = null; // invalidate cache
    return true;
  }

  /**
   * Mark the chunk as needing a GPU rebuild.
   * Invalidates the empty cache and increments revision.
   *
   * Package-internal: for future renderer use only.
   * @internal
   */
  public _markDirty(): void {
    this._empty = null;
    this._revision++;
  }

  /**
   * Clear every cell in this chunk. Does not re-allocate storage.
   * Increments revision if any cell was non-zero.
   *
   * Package-internal: only {@link TileLayer} may call this.
   * @internal
   */
  public _clear(): void {
    const hadContent = this._tiles.some(v => v !== 0);
    if (!hadContent) return;
    this._tiles.fill(0);
    this._revision++;
    this._empty = true;
  }
}
