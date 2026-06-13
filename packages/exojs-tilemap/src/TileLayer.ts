import type { ReadonlyTileChunk } from './TileChunk';
import { TileChunk } from './TileChunk';
import type { TileSet } from './TileSet';
import type { TileProperties } from './types';
import type { PackedTile, ResolvedTile } from './types';
import {
  packTile,
  unpackTile,
  validateInteger,
  validateNonNegativeInteger,
  validatePositiveInteger,
} from './types';
import { tileToChunkCoord, tileToLocalInChunk } from './types';

/**
 * Options for constructing a {@link TileLayer}.
 * @advanced
 */
export interface TileLayerOptions {
  /** Stable layer ID (unique within the map). */
  readonly id: number;
  /** Display name (need not be unique). */
  readonly name: string;
  /** Layer width in tiles. */
  readonly width: number;
  /** Layer height in tiles. */
  readonly height: number;
  /** Chunk width in tiles (default 32). */
  readonly chunkWidth?: number;
  /** Chunk height in tiles (default 32). */
  readonly chunkHeight?: number;
  /** Tilesets available to this layer (shared with the map). */
  readonly tilesets: readonly TileSet[];
  /** Tile width in pixels (for coordinate conversion). */
  readonly tileWidth: number;
  /** Tile height in pixels (for coordinate conversion). */
  readonly tileHeight: number;
  /** Initial visibility. Default true. */
  readonly visible?: boolean;
  /** Opacity 0..1. Default 1. */
  readonly opacity?: number;
  /** Layer pixel offset X. Default 0. */
  readonly offsetX?: number;
  /** Layer pixel offset Y. Default 0. */
  readonly offsetY?: number;
  /** Layer properties (copied and frozen). */
  readonly properties?: TileProperties;
}

const DEFAULT_CHUNK_SIZE = 32;

/**
 * A generic, format-independent tile layer with chunk-first storage.
 *
 * Tile data is stored in fixed-size {@link TileChunk}s indexed by signed
 * chunk coordinates. For finite maps, only chunks that intersect the layer
 * bounds exist.
 *
 * **Mutation must go through the layer's public APIs only.**
 * `setTileAt` / `clearTileAt` validate coordinates, tileset references,
 * and increment revision counters only when the stored value actually
 * changes. Direct chunk mutation is not supported — the layer owns chunk
 * storage and exposes only a {@link ReadonlyTileChunk} view.
 *
 * The layer is NOT a SceneNode — that integration lives in the future
 * renderer slice.
 *
 * @advanced
 */
export class TileLayer {
  /** Stable unique ID within the map. */
  public readonly id: number;
  /** Display name (may not be unique). */
  public readonly name: string;

  /** Width in tiles. */
  public readonly width: number;
  /** Height in tiles. */
  public readonly height: number;

  /** Chunk width (tiles). */
  public readonly chunkWidth: number;
  /** Chunk height (tiles). */
  public readonly chunkHeight: number;

  /** Tile width in pixels. */
  public readonly tileWidth: number;
  /** Tile height in pixels. */
  public readonly tileHeight: number;

  /** Pixel width. */
  public get pixelWidth(): number { return this.width * this.tileWidth; }
  /** Pixel height. */
  public get pixelHeight(): number { return this.height * this.tileHeight; }

  /** Visibility flag (mutable). */
  public visible: boolean;
  /** Opacity 0..1 (mutable). */
  public opacity: number;
  /** Horizontal pixel offset (mutable). */
  public offsetX: number;
  /** Vertical pixel offset (mutable). */
  public offsetY: number;

  /** Immutable layer properties. */
  public readonly properties: TileProperties;

  /** The tilesets available to this layer (shared array reference). */
  public readonly tilesets: readonly TileSet[];

  /** Chunk storage: chunkKey → mutable TileChunk (internal). */
  private readonly _chunks = new Map<string, TileChunk>();

  /**
   * Monotonic layer revision counter.
   * Increments on every cell mutation that actually changes a stored value.
   * Does NOT increment on no-op writes or failed mutations.
   */
  private _revision = 0;

  /** Whether the layer has been destroyed. */
  private _destroyed = false;

  /**
   * @throws When dimensions, chunk size, or other options are invalid.
   */
  public constructor(options: TileLayerOptions) {
    validateNonNegativeInteger(options.id, 'layer.id');
    if (!options.name || typeof options.name !== 'string') {
      throw new Error('TileLayer name must be a non-empty string.');
    }
    validatePositiveInteger(options.width, 'layer.width');
    validatePositiveInteger(options.height, 'layer.height');
    validatePositiveInteger(options.tileWidth, 'layer.tileWidth');
    validatePositiveInteger(options.tileHeight, 'layer.tileHeight');

    const chunkWidth = options.chunkWidth ?? DEFAULT_CHUNK_SIZE;
    const chunkHeight = options.chunkHeight ?? DEFAULT_CHUNK_SIZE;
    validatePositiveInteger(chunkWidth, 'chunkWidth');
    validatePositiveInteger(chunkHeight, 'chunkHeight');

    if (!Array.isArray(options.tilesets)) {
      throw new Error('TileLayer tilesets must be an array.');
    }

    const opacity = options.opacity ?? 1;
    if (typeof opacity !== 'number' || opacity < 0 || opacity > 1) {
      throw new Error(`TileLayer opacity must be 0..1 (got ${opacity}).`);
    }

    const offsetX = options.offsetX ?? 0;
    const offsetY = options.offsetY ?? 0;
    if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
      throw new Error('TileLayer offset must be finite numbers.');
    }

    this.id = options.id;
    this.name = options.name;
    this.width = options.width;
    this.height = options.height;
    this.chunkWidth = chunkWidth;
    this.chunkHeight = chunkHeight;
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;
    this.tilesets = options.tilesets;
    this.visible = options.visible ?? true;
    this.opacity = opacity;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.properties = options.properties
      ? Object.freeze({ ...options.properties })
      : Object.freeze({});
  }

  // ── Bounds helpers ────────────────────────────────────────────────────

  /**
   * Check whether a tile coordinate lies within the layer bounds.
   * @advanced
   */
  public inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && tx < this.width && ty >= 0 && ty < this.height;
  }

  /** Compute the range of chunk coordinates that intersect this layer. */
  public chunkRange(): { minCx: number; minCy: number; maxCx: number; maxCy: number } {
    return {
      minCx: 0,
      minCy: 0,
      maxCx: Math.floor((this.width - 1) / this.chunkWidth),
      maxCy: Math.floor((this.height - 1) / this.chunkHeight),
    };
  }

  // ── Chunk keying ──────────────────────────────────────────────────────

  private _chunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  /**
   * Get a readonly view of a chunk by signed chunk coordinates,
   * or undefined if it does not exist (never been touched).
   * @advanced
   */
  public getChunk(cx: number, cy: number): ReadonlyTileChunk | undefined {
    return this._chunks.get(this._chunkKey(cx, cy));
  }

  /**
   * Get or create a chunk at the given coordinates.
   * For finite layers, creation is only allowed within the valid chunk range.
   *
   * @internal Package-private: used by {@link setTileAt}, {@link fillRect},
   *           and future adapter ingest. External users should not allocate
   *           chunks — use {@link setTileAt} to populate tiles.
   */
  public _ensureChunk(cx: number, cy: number): TileChunk {
    this._checkDestroyed();
    const key = this._chunkKey(cx, cy);
    let chunk = this._chunks.get(key);
    if (!chunk) {
      const range = this.chunkRange();
      if (cx < range.minCx || cx > range.maxCx || cy < range.minCy || cy > range.maxCy) {
        throw new Error(
          `Chunk (${cx}, ${cy}) outside layer chunk range ` +
          `[${range.minCx}..${range.maxCx}, ${range.minCy}..${range.maxCy}].`,
        );
      }
      // Compute the actual tile dimensions for this chunk (edge chunks may be smaller).
      const startTx = cx * this.chunkWidth;
      const startTy = cy * this.chunkHeight;
      const cw = Math.min(this.chunkWidth, this.width - startTx);
      const ch = Math.min(this.chunkHeight, this.height - startTy);
      chunk = new TileChunk(cx, cy, cw, ch);
      this._chunks.set(key, chunk);
    }
    return chunk;
  }

  /**
   * Iterate over all loaded chunks in deterministic (cy, cx) ascending order.
   * Returns readonly chunk views — callers cannot mutate storage.
   * @advanced
   */
  public loadedChunks(): IterableIterator<ReadonlyTileChunk> {
    const entries = [...this._chunks.values()];
    entries.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    return entries[Symbol.iterator]();
  }

  // ── Tile queries ──────────────────────────────────────────────────────

  /**
   * Get the raw packed tile word at (tx, ty). Returns 0 for empty or out-of-bounds.
   * @advanced
   */
  public getRawTileAt(tx: number, ty: number): PackedTile {
    validateInteger(tx, 'tx');
    validateInteger(ty, 'ty');
    if (!this.inBounds(tx, ty)) return 0;
    const { cx, cy } = tileToChunkCoord(tx, ty, this.chunkWidth, this.chunkHeight);
    const chunk = this._chunks.get(this._chunkKey(cx, cy));
    if (!chunk) return 0;
    const { lx, ly } = tileToLocalInChunk(tx, ty, this.chunkWidth, this.chunkHeight);
    return chunk.getRawAt(lx, ly);
  }

  /**
   * Query a resolved tile at (tx, ty). Returns null for empty or out-of-bounds.
   * @advanced
   */
  public getTileAt(tx: number, ty: number): ResolvedTile | null {
    const packed = this.getRawTileAt(tx, ty);
    if (packed === 0) return null;
    const decoded = unpackTile(packed);
    if (!decoded) return null;
    if (decoded.tilesetIndex >= this.tilesets.length) return null;
    const tileset = this.tilesets[decoded.tilesetIndex];
    if (decoded.localTileId >= tileset.tileCount) return null;
    return {
      tileset,
      localTileId: decoded.localTileId,
      transform: decoded.transform,
    };
  }

  // ── Mutation ──────────────────────────────────────────────────────────

  /**
   * Validate a tile reference against the layer's tilesets.
   * Returns the packed form or throws.
   */
  private _validateTileRef(tile: ResolvedTile): PackedTile {
    if (!tile?.tileset) {
      throw new Error('setTileAt requires a valid ResolvedTile.');
    }
    const tilesetIndex = this.tilesets.indexOf(tile.tileset);
    if (tilesetIndex === -1) {
      throw new Error(
        `Tileset "${tile.tileset.name}" is not available to layer "${this.name}".`,
      );
    }
    if (tile.localTileId < 0 || tile.localTileId >= tile.tileset.tileCount) {
      throw new Error(
        `localTileId ${tile.localTileId} out of range for tileset "${tile.tileset.name}" ` +
        `(max ${tile.tileset.tileCount - 1}).`,
      );
    }
    return packTile(tilesetIndex, tile.localTileId, tile.transform);
  }

  /**
   * Set a tile at the given tile coordinates.
   * No-op if the effective value is unchanged.
   * @throws If coordinates are out of bounds or the tile reference is invalid.
   * @advanced
   */
  public setTileAt(tx: number, ty: number, tile: ResolvedTile): void {
    this._checkDestroyed();
    validateInteger(tx, 'tx');
    validateInteger(ty, 'ty');
    if (!this.inBounds(tx, ty)) {
      throw new Error(
        `setTileAt (${tx}, ${ty}) out of bounds [0..${this.width - 1}, 0..${this.height - 1}].`,
      );
    }
    const packed = this._validateTileRef(tile);
    const { cx, cy } = tileToChunkCoord(tx, ty, this.chunkWidth, this.chunkHeight);
    const chunk = this._ensureChunk(cx, cy);
    const { lx, ly } = tileToLocalInChunk(tx, ty, this.chunkWidth, this.chunkHeight);
    if (chunk._setRawAt(lx, ly, packed)) {
      this._revision++;
    }
  }

  /**
   * Clear (erase) the tile at the given coordinates.
   * No-op if the cell is already empty.
   * @throws If coordinates are out of bounds.
   * @advanced
   */
  public clearTileAt(tx: number, ty: number): void {
    this._checkDestroyed();
    validateInteger(tx, 'tx');
    validateInteger(ty, 'ty');
    if (!this.inBounds(tx, ty)) {
      throw new Error(
        `clearTileAt (${tx}, ${ty}) out of bounds [0..${this.width - 1}, 0..${this.height - 1}].`,
      );
    }
    const { cx, cy } = tileToChunkCoord(tx, ty, this.chunkWidth, this.chunkHeight);
    const chunk = this._chunks.get(this._chunkKey(cx, cy));
    if (!chunk) return; // no chunk = already empty
    const { lx, ly } = tileToLocalInChunk(tx, ty, this.chunkWidth, this.chunkHeight);
    if (chunk._setRawAt(lx, ly, 0)) {
      this._revision++;
    }
  }

  // ── Bulk fill ─────────────────────────────────────────────────────────

  /**
   * Fill a rectangular region with a tile.
   * @advanced
   */
  public fillRect(
    x: number, y: number, w: number, h: number, tile: ResolvedTile,
  ): void {
    this._checkDestroyed();
    const packed = this._validateTileRef(tile);
    let changed = false;
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (!this.inBounds(tx, ty)) continue;
        const { cx, cy } = tileToChunkCoord(tx, ty, this.chunkWidth, this.chunkHeight);
        const chunk = this._ensureChunk(cx, cy);
        const { lx, ly } = tileToLocalInChunk(tx, ty, this.chunkWidth, this.chunkHeight);
        if (chunk._setRawAt(lx, ly, packed)) {
          changed = true;
        }
      }
    }
    if (changed) this._revision++;
  }

  /**
   * Clear a rectangular region.
   * @advanced
   */
  public clearRect(x: number, y: number, w: number, h: number): void {
    this._checkDestroyed();
    let changed = false;
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (!this.inBounds(tx, ty)) continue;
        const { cx, cy } = tileToChunkCoord(tx, ty, this.chunkWidth, this.chunkHeight);
        const chunk = this._chunks.get(this._chunkKey(cx, cy));
        if (!chunk) continue;
        const { lx, ly } = tileToLocalInChunk(tx, ty, this.chunkWidth, this.chunkHeight);
        if (chunk._setRawAt(lx, ly, 0)) {
          changed = true;
        }
      }
    }
    if (changed) this._revision++;
  }

  // ── Iteration ─────────────────────────────────────────────────────────

  /**
   * Iterate non-empty tiles within a rectangular region in row-major order.
   * Yields (tx, ty, resolvedTile) tuples. Skips empty cells.
   * @advanced
   */
  public *tilesInRect(
    x: number, y: number, w: number, h: number,
  ): Generator<{ tx: number; ty: number; tile: ResolvedTile }> {
    const startCx = Math.floor(x / this.chunkWidth);
    const endCx = Math.floor((x + w - 1) / this.chunkWidth);
    const startCy = Math.floor(y / this.chunkHeight);
    const endCy = Math.floor((y + h - 1) / this.chunkHeight);

    for (let cy = startCy; cy <= endCy; cy++) {
      for (let cx = startCx; cx <= endCx; cx++) {
        const chunk = this._chunks.get(this._chunkKey(cx, cy));
        if (!chunk || chunk.empty) continue;

        const chunkStartTx = cx * this.chunkWidth;
        const chunkStartTy = cy * this.chunkHeight;
        const minLx = Math.max(0, x - chunkStartTx);
        const maxLx = Math.min(chunk.width - 1, (x + w - 1) - chunkStartTx);
        const minLy = Math.max(0, y - chunkStartTy);
        const maxLy = Math.min(chunk.height - 1, (y + h - 1) - chunkStartTy);

        for (let ly = minLy; ly <= maxLy; ly++) {
          for (let lx = minLx; lx <= maxLx; lx++) {
            const packed = chunk.getRawAt(lx, ly);
            if (packed === 0) continue;
            const decoded = unpackTile(packed);
            if (!decoded) continue;
            if (decoded.tilesetIndex >= this.tilesets.length) continue;
            const tileset = this.tilesets[decoded.tilesetIndex];
            if (decoded.localTileId >= tileset.tileCount) continue;
            yield {
              tx: chunkStartTx + lx,
              ty: chunkStartTy + ly,
              tile: {
                tileset,
                localTileId: decoded.localTileId,
                transform: decoded.transform,
              },
            };
          }
        }
      }
    }
  }

  // ── Coordinate conversion ─────────────────────────────────────────────

  /**
   * Convert a tile coordinate to the pixel position of its top-left corner
   * in the layer's local space.
   * @advanced
   */
  public tileToPixel(tx: number, ty: number): { x: number; y: number } {
    return {
      x: tx * this.tileWidth + this.offsetX,
      y: ty * this.tileHeight + this.offsetY,
    };
  }

  /**
   * Convert a local pixel position to the tile coordinate that contains it.
   * Uses `floor`, so a point exactly on a tile boundary maps to the tile.
   * May return coordinates outside layer bounds.
   * @advanced
   */
  public pixelToTile(px: number, py: number): { tx: number; ty: number } {
    return {
      tx: Math.floor((px - this.offsetX) / this.tileWidth),
      ty: Math.floor((py - this.offsetY) / this.tileHeight),
    };
  }

  // ── Revision / lifecycle ──────────────────────────────────────────────

  /**
   * Monotonic layer revision counter.
   * Increments on every cell mutation that changes a stored value.
   * No-op writes and failed mutations do NOT increment.
   * @advanced
   */
  public get revision(): number {
    return this._revision;
  }

  /** Whether the layer has been destroyed. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  private _checkDestroyed(): void {
    if (this._destroyed) {
      throw new Error(`TileLayer "${this.name}" has been destroyed.`);
    }
  }

  /**
   * Destroy this layer: clear chunk storage and mark destroyed.
   * Does NOT destroy tileset textures or external resources.
   * Idempotent.
   */
  public destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._chunks.clear();
  }

  /**
   * Total number of non-empty tiles across all chunks.
   * Walk is cheap for dense layers; sparse layers benefit from empty-chunk fast path.
   * @advanced
   */
  public countNonEmptyTiles(): number {
    let count = 0;
    for (const chunk of this._chunks.values()) {
      for (let ly = 0; ly < chunk.height; ly++) {
        for (let lx = 0; lx < chunk.width; lx++) {
          if (chunk.getRawAt(lx, ly) !== 0) count++;
        }
      }
    }
    return count;
  }
}
