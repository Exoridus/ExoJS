import type { PackedTile } from './types';

/**
 * A compact, fixed-size chunk of tile data within a layer.
 *
 * Storage is a single {@link Uint32Array} of length `width * height`,
 * laid out row-major. Each cell is a packed tile word (0 = empty).
 * Chunk coordinates are signed to support future infinite maps.
 *
 * The chunk tracks a revision counter that increments on every mutation
 * so the future renderer can detect which chunks need GPU rebuilds.
 *
 * @advanced
 */
export class TileChunk {
  /** Signed chunk X coordinate. */
  public readonly cx: number;
  /** Signed chunk Y coordinate. */
  public readonly cy: number;

  /** Width of this chunk in tiles. */
  public readonly width: number;
  /** Height of this chunk in tiles. */
  public readonly height: number;

  /** Packed tile storage (row-major). Do not mutate externally. */
  public readonly tiles: Uint32Array;

  /** Whether every cell in this chunk is empty (0). Lazy-computed. */
  private _empty: boolean | null = null;

  /** Monotonic revision counter — incremented on every mutation. */
  private _revision: number = 0;

  /**
   * @param cx Signed chunk X coordinate.
   * @param cy Signed chunk Y coordinate.
   * @param width Chunk width in tiles (positive).
   * @param height Chunk height in tiles (positive).
   * @param source Optional source data to copy (must match length).
   */
  public constructor(cx: number, cy: number, width: number, height: number, source?: Uint32Array) {
    if (width <= 0 || height <= 0) {
      throw new Error(`TileChunk dimensions must be positive (got ${width}x${height}).`);
    }
    if (!Number.isSafeInteger(width * height)) {
      throw new Error(`TileChunk size overflow: ${width} * ${height} is not safe.`);
    }

    this.cx = cx;
    this.cy = cy;
    this.width = width;
    this.height = height;

    if (source) {
      if (source.length !== width * height) {
        throw new Error(
          `TileChunk source length ${source.length} != ${width * height}.`,
        );
      }
      this.tiles = new Uint32Array(source);
    } else {
      this.tiles = new Uint32Array(width * height);
    }
  }

  /** Row-major index for cell (lx, ly) within this chunk. */
  private index(lx: number, ly: number): number {
    return ly * this.width + lx;
  }

  /** Read a raw packed tile word at local-in-chunk coordinates. */
  public getRawAt(lx: number, ly: number): PackedTile {
    return this.tiles[this.index(lx, ly)]!;
  }

  /** Write a packed tile word at local-in-chunk coordinates. Returns true if the value changed. */
  public setRawAt(lx: number, ly: number, packed: PackedTile): boolean {
    const i = this.index(lx, ly);
    const prev = this.tiles[i]!;
    if (prev === packed) return false;
    this.tiles[i] = packed;
    this._revision++;
    this._empty = null; // invalidate cache
    return true;
  }

  /** Whether all cells are empty. Cached after first scan. */
  public get empty(): boolean {
    if (this._empty === null) {
      this._empty = this.tiles.every(v => v === 0);
    }
    return this._empty;
  }

  /**
   * Monotonic revision counter. Increments on every cell mutation.
   * No-ops (writing same value to same cell) do NOT increment.
   * @advanced
   */
  public get revision(): number {
    return this._revision;
  }

  /**
   * Mark the chunk as needing a GPU rebuild.
   * For future renderer integration. Currently sets the empty flag to null
   * to force re-evaluation.
   * @internal
   */
  public markDirty(): void {
    this._empty = null;
    this._revision++;
  }

  /**
   * Clear every cell in this chunk. Does not re-allocate storage.
   * Increments revision if any cell was non-zero.
   */
  public clear(): void {
    const hadContent = this.tiles.some(v => v !== 0);
    if (!hadContent) return;
    this.tiles.fill(0);
    this._revision++;
    this._empty = true;
  }

  /**
   * Create a defensive copy of the tile data. The caller owns the copy.
   */
  public cloneTiles(): Uint32Array {
    return new Uint32Array(this.tiles);
  }
}
