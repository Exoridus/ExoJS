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
  validatePairedDimensions,
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
  /**
   * Layer width in tiles. Omit together with {@link height} for an
   * unbounded layer — chunk storage then accepts any signed chunk
   * coordinate instead of being clamped to a fixed grid.
   */
  readonly width?: number;
  /** Layer height in tiles. Must be provided iff {@link width} is. */
  readonly height?: number;
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
  /**
   * Parallax scroll factor on the X axis. `1.0` = full camera speed (normal),
   * `0.5` = half speed (farther away), `0.0` = stationary. Default 1.
   */
  readonly parallaxX?: number;
  /**
   * Parallax scroll factor on the Y axis. `1.0` = full camera speed (normal),
   * `0.5` = half speed (farther away), `0.0` = stationary. Default 1.
   */
  readonly parallaxY?: number;
  /** Layer class/type string (Tiled `class`). Defaults to `''`. */
  readonly class?: string;
  /**
   * Multiplicative layer tint as a `0xRRGGBB` integer, or `null` for none
   * (Tiled `tintcolor`). Applied to every chunk's render tint. Default `null`.
   */
  readonly tintColor?: number | null;
  /** Layer properties (copied and frozen). */
  readonly properties?: TileProperties;
}

const DEFAULT_CHUNK_SIZE = 32;

/**
 * The inclusive range of chunk coordinates that intersect a bounded
 * {@link TileLayer}. `null` for an unbounded layer (no range limit).
 * @advanced
 */
export interface ChunkRange {
  readonly minCx: number;
  readonly minCy: number;
  readonly maxCx: number;
  readonly maxCy: number;
}

/**
 * Fired via {@link TileLayer._addStructuralListener} whenever a chunk is
 * installed ({@link TileLayer._adoptChunk}) or evicted
 * ({@link TileLayer._evictChunk}) — structural changes only, not per-tile
 * edits (see {@link import('./TileChunk').TileChunk._addDirtyListener} for
 * those). `chunk` is `null` on eviction.
 * @internal
 */
export interface ChunkStructuralEvent {
  readonly cx: number;
  readonly cy: number;
  readonly chunk: ReadonlyTileChunk | null;
}

/**
 * Resolved, defaulted subset of {@link TileLayerOptions} produced by
 * {@link validateTileLayerOptions}.
 */
interface ResolvedTileLayerOptions {
  readonly chunkWidth: number;
  readonly chunkHeight: number;
  readonly opacity: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly parallaxX: number;
  readonly parallaxY: number;
}

/**
 * Validate a {@link TileLayerOptions} bag and resolve its optional fields
 * (chunk size, opacity, offset, parallax) to concrete defaults.
 * @throws When dimensions, chunk size, or other options are invalid.
 */
function validateTileLayerOptions(options: TileLayerOptions): ResolvedTileLayerOptions {
  validateNonNegativeInteger(options.id, 'layer.id');
  if (!options.name || typeof options.name !== 'string') {
    throw new Error('TileLayer name must be a non-empty string.');
  }
  validatePairedDimensions(options.width, options.height, 'TileLayer', 'layer');
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

  const parallaxX = options.parallaxX ?? 1;
  const parallaxY = options.parallaxY ?? 1;
  if (!Number.isFinite(parallaxX) || !Number.isFinite(parallaxY)) {
    throw new Error('TileLayer parallax must be finite numbers.');
  }

  return { chunkWidth, chunkHeight, opacity, offsetX, offsetY, parallaxX, parallaxY };
}

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
 * The layer is NOT a SceneNode — that integration lives in
 * {@link import('./TileLayerNode').TileLayerNode}.
 *
 * @advanced
 */
export class TileLayer {
  /** Stable unique ID within the map. */
  public readonly id: number;
  /** Display name (may not be unique). */
  public readonly name: string;

  /** Width in tiles, or `undefined` if unbounded. */
  public readonly width: number | undefined;
  /** Height in tiles, or `undefined` if unbounded. */
  public readonly height: number | undefined;

  /** Chunk width (tiles). */
  public readonly chunkWidth: number;
  /** Chunk height (tiles). */
  public readonly chunkHeight: number;

  /** Tile width in pixels. */
  public readonly tileWidth: number;
  /** Tile height in pixels. */
  public readonly tileHeight: number;

  /** `true` if this layer has a fixed width/height; `false` if unbounded. */
  public get bounded(): boolean {
    return this.width !== undefined && this.height !== undefined;
  }

  /** Pixel width, or `undefined` if unbounded. */
  public get pixelWidth(): number | undefined {
    return this.width === undefined ? undefined : this.width * this.tileWidth;
  }
  /** Pixel height, or `undefined` if unbounded. */
  public get pixelHeight(): number | undefined {
    return this.height === undefined ? undefined : this.height * this.tileHeight;
  }

  /** Visibility flag (mutable). */
  public visible: boolean;
  /** Opacity 0..1 (mutable). */
  public opacity: number;
  /** Horizontal pixel offset (mutable). */
  public offsetX: number;
  /** Vertical pixel offset (mutable). */
  public offsetY: number;
  /**
   * Parallax scroll factor on the X axis.
   * `1.0` = full camera speed, `0.5` = half speed, `0.0` = stationary.
   */
  public readonly parallaxX: number;
  /**
   * Parallax scroll factor on the Y axis.
   * `1.0` = full camera speed, `0.5` = half speed, `0.0` = stationary.
   */
  public readonly parallaxY: number;

  /** Layer class/type string (Tiled `class`; may be empty). */
  public readonly class: string;
  /** Multiplicative layer tint as `0xRRGGBB`, or `null` for no tint. */
  public readonly tintColor: number | null;

  /** Immutable layer properties. */
  public readonly properties: TileProperties;

  /** The tilesets available to this layer (shared array reference). */
  public readonly tilesets: readonly TileSet[];

  /** Chunk storage: chunkKey → mutable TileChunk (internal). */
  private readonly _chunks = new Map<string, TileChunk>();

  /** Package-internal structural (adopt/evict) listeners. */
  private _structuralListeners: Set<(event: ChunkStructuralEvent) => void> | null = null;

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
    const { chunkWidth, chunkHeight, opacity, offsetX, offsetY, parallaxX, parallaxY } =
      validateTileLayerOptions(options);

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
    this.parallaxX = parallaxX;
    this.parallaxY = parallaxY;
    this.class = options.class ?? '';
    this.tintColor = options.tintColor ?? null;
    this.properties = options.properties
      ? Object.freeze({ ...options.properties })
      : Object.freeze({});
  }

  // ── Bounds helpers ────────────────────────────────────────────────────

  /**
   * Check whether a tile coordinate lies within the layer bounds.
   * Always `true` for an unbounded layer.
   * @advanced
   */
  public inBounds(tx: number, ty: number): boolean {
    if (this.width === undefined || this.height === undefined) return true;
    return tx >= 0 && tx < this.width && ty >= 0 && ty < this.height;
  }

  /**
   * Compute the range of chunk coordinates that intersect this layer, or
   * `null` if the layer is unbounded (any signed chunk coordinate is valid).
   */
  public chunkRange(): ChunkRange | null {
    if (this.width === undefined || this.height === undefined) return null;
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
   * For a bounded layer, creation is only allowed within the valid chunk
   * range and edge chunks are clamped to the layer's remaining size. For an
   * unbounded layer, any signed chunk coordinate is accepted and every
   * chunk is full-size ({@link chunkWidth} × {@link chunkHeight}).
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
      let cw = this.chunkWidth;
      let ch = this.chunkHeight;
      if (range !== null && this.width !== undefined && this.height !== undefined) {
        if (cx < range.minCx || cx > range.maxCx || cy < range.minCy || cy > range.maxCy) {
          throw new Error(
            `Chunk (${cx}, ${cy}) outside layer chunk range ` +
            `[${range.minCx}..${range.maxCx}, ${range.minCy}..${range.maxCy}].`,
          );
        }
        // Compute the actual tile dimensions for this chunk (edge chunks may be smaller).
        const startTx = cx * this.chunkWidth;
        const startTy = cy * this.chunkHeight;
        cw = Math.min(this.chunkWidth, this.width - startTx);
        ch = Math.min(this.chunkHeight, this.height - startTy);
      }
      chunk = new TileChunk(cx, cy, cw, ch);
      this._chunks.set(key, chunk);
    }
    return chunk;
  }

  /**
   * Install a chunk-provider-supplied payload directly, bypassing per-tile
   * `setTileAt` cost. Overwrites any existing chunk at `(cx, cy)`. Always
   * bumps the layer revision (installing a chunk is always a structural
   * change, even if the payload happens to be all-zero).
   *
   * Does not validate `(cx, cy)` against {@link chunkRange} — callers
   * (chunk-streaming controllers) are trusted to request coordinates within
   * whatever range they intend to manage.
   *
   * @internal Package-private: for future chunk-provider/streaming use.
   */
  public _adoptChunk(cx: number, cy: number, payload: { width: number; height: number; tiles: Uint32Array }): void {
    this._checkDestroyed();
    const chunk = new TileChunk(cx, cy, payload.width, payload.height, payload.tiles);
    this._chunks.set(this._chunkKey(cx, cy), chunk);
    this._revision++;
    this._notifyStructural({ cx, cy, chunk });
  }

  /**
   * Evict a chunk from storage, freeing it for garbage collection. No-op if
   * no chunk is loaded at `(cx, cy)`.
   *
   * @returns `true` if a chunk was found and removed, `false` otherwise.
   * @internal Package-private: for future chunk-streaming eviction use.
   */
  public _evictChunk(cx: number, cy: number): boolean {
    this._checkDestroyed();
    const key = this._chunkKey(cx, cy);
    if (!this._chunks.delete(key)) return false;
    this._revision++;
    this._notifyStructural({ cx, cy, chunk: null });
    return true;
  }

  /**
   * Register a callback invoked synchronously whenever a chunk is installed
   * ({@link _adoptChunk}) or evicted ({@link _evictChunk}). Package-internal:
   * {@link import('./TileLayerNode').TileLayerNode} subscribes to keep its
   * chunk-node children in sync with chunk-provider-driven adopt/evict calls
   * (e.g. from {@link import('./ChunkStreamer').ChunkStreamer}) without
   * needing a full {@link import('./TileLayerNode').TileLayerNode.refresh}.
   * @internal
   */
  public _addStructuralListener(listener: (event: ChunkStructuralEvent) => void): void {
    (this._structuralListeners ??= new Set()).add(listener);
  }

  /**
   * Unregister a listener added via {@link _addStructuralListener} (node destroy).
   * @internal
   */
  public _removeStructuralListener(listener: (event: ChunkStructuralEvent) => void): void {
    this._structuralListeners?.delete(listener);
  }

  private _notifyStructural(event: ChunkStructuralEvent): void {
    if (this._structuralListeners === null) return;
    for (const listener of this._structuralListeners) {
      listener(event);
    }
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
    const tileset = this.tilesets[decoded.tilesetIndex]!;
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
      const boundsMsg = this.width !== undefined && this.height !== undefined
        ? `[0..${this.width - 1}, 0..${this.height - 1}]`
        : '[unbounded]';
      throw new Error(`setTileAt (${tx}, ${ty}) out of bounds ${boundsMsg}.`);
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
      const boundsMsg = this.width !== undefined && this.height !== undefined
        ? `[0..${this.width - 1}, 0..${this.height - 1}]`
        : '[unbounded]';
      throw new Error(`clearTileAt (${tx}, ${ty}) out of bounds ${boundsMsg}.`);
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
            const tileset = this.tilesets[decoded.tilesetIndex]!;
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
