
import { type ImageLayer } from './ImageLayer';
import type { ObjectLayer, ObjectSchema } from './ObjectLayer';
import { type TileLayer } from './TileLayer';
import type { TileMapViewOptions } from './TileMapView';
import { TileMapView } from './TileMapView';
import { type TileSet } from './TileSet';
import type { ResolvedTile,TileProperties } from './types';
import { validatePairedDimensions, validatePositiveInteger } from './types';

/**
 * Options for constructing a {@link TileMap}.
 * @advanced
 */
export interface TileMapOptions {
  /** Map name (for debugging). */
  readonly name?: string;
  /**
   * Map width in tiles. Omit together with {@link height} for an unbounded
   * map — layers you add are then free to be unbounded too (this option
   * does not constrain per-layer dimensions either way).
   */
  readonly width?: number;
  /** Map height in tiles. Must be provided iff {@link width} is. */
  readonly height?: number;
  /** Width of each tile in pixels. */
  readonly tileWidth: number;
  /** Height of each tile in pixels. */
  readonly tileHeight: number;
  /** Tilesets available to this map. */
  readonly tilesets?: readonly TileSet[];
  /** Layers (constructed externally and owned by the map after construction). */
  readonly layers?: readonly TileLayer[];
  /** Object layers (data-only; spawn points, triggers, collision regions). */
  readonly objectLayers?: readonly ObjectLayer[];
  /** Image layers (data-only; background/foreground images from Tiled image layers). */
  readonly imageLayers?: readonly ImageLayer[];
  /** Chunk width for layers (default 32). */
  readonly chunkWidth?: number;
  /** Chunk height for layers (default 32). */
  readonly chunkHeight?: number;
  /** Map class/type string (Tiled `class`). Defaults to `''`. */
  readonly class?: string;
  /**
   * Map background colour as a `0xRRGGBB` integer, or `null` (Tiled
   * `backgroundcolor`). Informational — the renderer does not auto-clear to it.
   * Default `null`.
   */
  readonly backgroundColor?: number | null;
  /** Tile draw order (Tiled `renderorder`), informational. Default `'right-down'`. */
  readonly renderOrder?: string;
  /** Map-level properties (copied and frozen). */
  readonly properties?: TileProperties;
  /**
   * Combined document order across tile and image layers, as an ordered list
   * of layer ids — exposed via {@link TileMap.renderableLayers}. Every tile
   * and image layer passed to this map (via {@link layers} / {@link
   * imageLayers}) must appear exactly once; an id that belongs to neither
   * kind, or is listed more than once, throws. The list's length must also
   * equal the total number of tile/image layer instances — nothing enforces
   * unique ids across image layers, so two image layers sharing an id would
   * otherwise both satisfy the id-based checks while one silently drops out
   * of {@link TileMap.renderableLayers}; that mismatch throws too.
   *
   * A tile layer and an image layer sharing the same id makes the order
   * ambiguous — that combination throws when `documentOrder` is provided.
   * It is NOT rejected when this option is omitted: the fallback order below
   * is unambiguous by construction (tile layers are always listed before
   * image layers), so hand-built maps that predate this option are
   * unaffected even if such an id collision exists.
   *
   * Omit to fall back to all tile layers in insertion order, followed by all
   * image layers in insertion order — the map's implicit ordering before
   * this option existed.
   *
   * Named `documentOrder` rather than `renderOrder` to avoid colliding with
   * the unrelated {@link renderOrder} option above (Tiled's tile-draw-
   * direction string, e.g. `'right-down'`).
   */
  readonly documentOrder?: readonly number[];
}

/**
 * A generic, format-independent tile map.
 *
 * Owns a finite grid of {@link TileLayer}s and a shared set of {@link TileSet}s.
 * Tile data is stored in compact chunked arrays — no per-tile heap objects.
 *
 * The map does NOT own tileset textures (those are Loader-owned) and does
 * NOT own SceneNode children — see {@link import('./TileMapNode').TileMapNode},
 * which owns those.
 *
 * Multiple tilesets are supported: each cell stores a packed tileset index
 * and local tile ID, so different tilesets may have different tile dimensions.
 *
 * @advanced
 */
export class TileMap {

  /** Map name (debug). */
  public readonly name: string;

  /** Map width in tiles, or `undefined` if unbounded. */
  public readonly width: number | undefined;
  /** Map height in tiles, or `undefined` if unbounded. */
  public readonly height: number | undefined;

  /** Tile width in pixels. */
  public readonly tileWidth: number;
  /** Tile height in pixels. */
  public readonly tileHeight: number;

  /** Pixel width, or `undefined` if unbounded. */
  public get pixelWidth(): number | undefined {
    return this.width === undefined ? undefined : this.width * this.tileWidth;
  }
  /** Pixel height, or `undefined` if unbounded. */
  public get pixelHeight(): number | undefined {
    return this.height === undefined ? undefined : this.height * this.tileHeight;
  }
  /** `true` if this map has a fixed width/height; `false` if unbounded. */
  public get bounded(): boolean {
    return this.width !== undefined && this.height !== undefined;
  }

  /** Default chunk width for layers. */
  public readonly chunkWidth: number;
  /** Default chunk height for layers. */
  public readonly chunkHeight: number;

  /** Map class/type string (Tiled `class`; may be empty). */
  public readonly class: string;
  /** Map background colour as `0xRRGGBB`, or `null`. Informational. */
  public readonly backgroundColor: number | null;
  /** Tile draw order (Tiled `renderorder`). Informational. */
  public readonly renderOrder: string;

  /** Map-level properties (immutable). */
  public readonly properties: TileProperties;

  private readonly _tilesets: TileSet[];
  private readonly _layers: TileLayer[] = [];
  private readonly _layerById = new Map<number, TileLayer>();
  private readonly _objectLayers: ObjectLayer[] = [];
  private readonly _imageLayers: ImageLayer[] = [];
  private readonly _documentOrder: Array<TileLayer | ImageLayer> = [];

  private _revision = 0;
  private _destroyed = false;

  /**
   * @throws When dimensions or other options are invalid.
   */
  public constructor(options: TileMapOptions) {
    validatePairedDimensions(options.width, options.height, 'TileMap', 'map');
    validatePositiveInteger(options.tileWidth, 'map.tileWidth');
    validatePositiveInteger(options.tileHeight, 'map.tileHeight');

    const chunkWidth = options.chunkWidth ?? 32;
    const chunkHeight = options.chunkHeight ?? 32;
    validatePositiveInteger(chunkWidth, 'chunkWidth');
    validatePositiveInteger(chunkHeight, 'chunkHeight');

    this.name = options.name ?? 'TileMap';
    this.width = options.width;
    this.height = options.height;
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;
    this.chunkWidth = chunkWidth;
    this.chunkHeight = chunkHeight;
    this.class = options.class ?? '';
    this.backgroundColor = options.backgroundColor ?? null;
    this.renderOrder = options.renderOrder ?? 'right-down';

    this._tilesets = options.tilesets ? [...options.tilesets] : [];
    this.properties = options.properties
      ? Object.freeze({ ...options.properties })
      : Object.freeze({});

    if (options.layers) {
      for (const layer of options.layers) {
        this._addLayer(layer);
      }
    }

    if (options.objectLayers) {
      this._objectLayers.push(...options.objectLayers);
    }

    if (options.imageLayers) {
      for (const layer of options.imageLayers) {
        this._addImageLayer(layer);
      }
    }

    this._documentOrder.push(...this._buildDocumentOrder(options.documentOrder));
  }

  /**
   * Validate an explicit `documentOrder` option against current tile/image
   * layer membership and resolve it to layer instances, or compute the
   * fallback order (tile layers in insertion order, then image layers) when
   * omitted. The order stores instance references — not ids — so a
   * cross-kind id collision in a fallback map can never resolve to the
   * wrong layer.
   * @throws Per the validation rules documented on {@link
   *         TileMapOptions.documentOrder}.
   */
  private _buildDocumentOrder(documentOrder: readonly number[] | undefined): Array<TileLayer | ImageLayer> {
    if (!documentOrder) {
      return [...this._layers, ...this._imageLayers];
    }

    const tileIds = new Set(this._layers.map(l => l.id));
    const imageIds = new Set(this._imageLayers.map(l => l.id));

    for (const id of tileIds) {
      if (imageIds.has(id)) {
        throw new Error(
          `Layer ID ${id} exists as both a tile layer and an image layer in map "${this.name}"; documentOrder cannot disambiguate them.`,
        );
      }
    }

    const seen = new Set<number>();
    for (const id of documentOrder) {
      if (!tileIds.has(id) && !imageIds.has(id)) {
        throw new Error(`documentOrder references unknown layer ID ${id} in map "${this.name}".`);
      }
      if (seen.has(id)) {
        throw new Error(`documentOrder lists layer ID ${id} more than once in map "${this.name}".`);
      }
      seen.add(id);
    }

    const totalLayers = tileIds.size + imageIds.size;
    if (seen.size !== totalLayers) {
      for (const id of [...tileIds, ...imageIds]) {
        if (!seen.has(id)) {
          throw new Error(`documentOrder is missing layer ID ${id} in map "${this.name}".`);
        }
      }
    }

    // The checks above are id-SET based, so they can't see a duplicate
    // image-layer id (nothing enforces image-layer id uniqueness): two
    // image layers sharing an id collapse to one entry in `imageIds`,
    // letting a documentOrder that covers every distinct id still be one
    // instance short. Compare against the actual instance counts so that
    // case throws instead of silently dropping an instance from
    // renderableLayers.
    const instanceCount = this._layers.length + this._imageLayers.length;
    if (documentOrder.length !== instanceCount) {
      throw new Error(
        `documentOrder has ${documentOrder.length} entries but map "${this.name}" has ${instanceCount} tile/image layer instances; check for a duplicate image-layer ID.`,
      );
    }

    // Ids are unique across kinds here (the cross-kind check above threw
    // otherwise), so resolving each id to an instance is unambiguous.
    return documentOrder.map(id =>
      this._layerById.get(id) ?? this._imageLayers.find(layer => layer.id === id)!,
    );
  }

  // ── Tilesets ──────────────────────────────────────────────────────────

  /** Immutable list of tilesets available to this map. */
  public get tilesets(): readonly TileSet[] {
    return this._tilesets;
  }

  /**
   * Add a tileset. Tilesets must have unique names.
   * @throws If a tileset with the same name already exists, or the map is destroyed.
   */
  public addTileset(tileset: TileSet): void {
    this._checkDestroyed();
    if (this._tilesets.some(ts => ts.name === tileset.name)) {
      throw new Error(`Tileset "${tileset.name}" already exists in map "${this.name}".`);
    }
    this._tilesets.push(tileset);
    this._revision++;
  }

  /**
   * Get a tileset by name, or undefined.
   */
  public getTileset(name: string): TileSet | undefined {
    return this._tilesets.find(ts => ts.name === name);
  }

  // ── Layers ────────────────────────────────────────────────────────────

  /** Immutable snapshot of layers (ordered). */
  public get layers(): readonly TileLayer[] {
    return this._layers;
  }

  private _addLayer(layer: TileLayer): void {
    if (this._layerById.has(layer.id)) {
      throw new Error(
        `Layer ID ${layer.id} already exists in map "${this.name}".`,
      );
    }
    this._layerById.set(layer.id, layer);
    this._layers.push(layer);
  }

  /**
   * Add a layer after construction. Appended to the end of {@link
   * renderableLayers}'s document order.
   * @throws If a layer with the same ID already exists.
   */
  public addLayer(layer: TileLayer): void {
    this._checkDestroyed();
    this._addLayer(layer);
    this._documentOrder.push(layer);
    this._revision++;
  }

  /**
   * Get a tile layer by ID.
   */
  public getTileLayerById(id: number): TileLayer | undefined {
    return this._layerById.get(id);
  }

  /**
   * Get a tile layer by name. Returns the first match in insertion order.
   */
  public getTileLayer(name: string): TileLayer | undefined {
    return this._layers.find(l => l.name === name);
  }

  /**
   * Remove a layer by ID. The layer is destroyed and spliced out of {@link
   * renderableLayers}'s document order.
   * @returns true if the layer was found and removed.
   */
  public removeLayer(id: number): boolean {
    this._checkDestroyed();
    const layer = this._layerById.get(id);
    if (!layer) return false;
    this._layers.splice(this._layers.indexOf(layer), 1);
    this._layerById.delete(id);
    const orderIndex = this._documentOrder.indexOf(layer);
    if (orderIndex !== -1) this._documentOrder.splice(orderIndex, 1);
    layer.destroy();
    this._revision++;
    return true;
  }

  // ── Object layers (data-only) ─────────────────────────────────────────

  /** Immutable snapshot of object layers (insertion order). */
  public get objectLayers(): readonly ObjectLayer[] {
    return this._objectLayers;
  }

  /**
   * Add an object layer after construction.
   * @throws If the map is destroyed.
   */
  public addObjectLayer(layer: ObjectLayer): void {
    this._checkDestroyed();
    this._objectLayers.push(layer);
    this._revision++;
  }

  /**
   * Get an object layer by name (first match in insertion order), or undefined.
   *
   * Supply an {@link ObjectSchema} type argument `S` to obtain a typed view of
   * the layer — `getObjectLayer<LevelObjects>('Entities')` returns an
   * `ObjectLayer<LevelObjects>` whose {@link ObjectLayer.byType} / {@link
   * ObjectLayer.where} accessors narrow `properties`. The schema is a static
   * developer promise only; no runtime validation is performed and the call
   * remains fully back-compatible when omitted.
   */
  public getObjectLayer<S extends ObjectSchema = ObjectSchema>(name: string): ObjectLayer<S> | undefined {
    return this._objectLayers.find(layer => layer.name === name) as ObjectLayer<S> | undefined;
  }

  /**
   * Get an object layer by ID.
   *
   * Supply an {@link ObjectSchema} type argument `S` to obtain a typed view of
   * the layer, as with {@link getObjectLayer}.
   */
  public getObjectLayerById<S extends ObjectSchema = ObjectSchema>(id: number): ObjectLayer<S> | undefined {
    return this._objectLayers.find(layer => layer.id === id) as ObjectLayer<S> | undefined;
  }

  /**
   * Remove an object layer by ID.
   * @returns true if the layer was found and removed.
   */
  public removeObjectLayer(id: number): boolean {
    this._checkDestroyed();
    const index = this._objectLayers.findIndex(layer => layer.id === id);
    if (index === -1) return false;
    this._objectLayers.splice(index, 1);
    this._revision++;
    return true;
  }

  // ── Image layers (data-only) ──────────────────────────────────────────

  /** Immutable snapshot of image layers (insertion order). */
  public get imageLayers(): readonly ImageLayer[] {
    return this._imageLayers;
  }

  /**
   * Add an image layer after construction. Appended to both {@link
   * imageLayers} and the end of {@link renderableLayers}'s document order.
   * @throws If an image layer with the same ID already exists. An ID shared
   *   with a *tile* layer is permitted — the two kinds keep separate ID
   *   spaces, and all internal bookkeeping is instance-based.
   */
  public addImageLayer(layer: ImageLayer): void {
    this._checkDestroyed();
    this._addImageLayer(layer);
    this._documentOrder.push(layer);
    this._revision++;
  }

  /** Shared by the constructor and {@link addImageLayer}: enforce ID uniqueness within the image-layer kind. */
  private _addImageLayer(layer: ImageLayer): void {
    if (this._imageLayers.some(existing => existing.id === layer.id)) {
      throw new Error(
        `Image layer ID ${layer.id} already exists in map "${this.name}".`,
      );
    }
    this._imageLayers.push(layer);
  }

  /**
   * Get an image layer by name (first match in insertion order), or undefined.
   */
  public getImageLayer(name: string): ImageLayer | undefined {
    return this._imageLayers.find(layer => layer.name === name);
  }

  /**
   * Get an image layer by ID.
   */
  public getImageLayerById(id: number): ImageLayer | undefined {
    return this._imageLayers.find(layer => layer.id === id);
  }

  /**
   * Remove an image layer by ID. Spliced out of {@link renderableLayers}'s
   * document order.
   * @returns true if the layer was found and removed.
   */
  public removeImageLayer(id: number): boolean {
    this._checkDestroyed();
    const layer = this._imageLayers.find(l => l.id === id);
    if (!layer) return false;
    this._imageLayers.splice(this._imageLayers.indexOf(layer), 1);
    const orderIndex = this._documentOrder.indexOf(layer);
    if (orderIndex !== -1) this._documentOrder.splice(orderIndex, 1);
    this._revision++;
    return true;
  }

  // ── Combined render order ─────────────────────────────────────────────

  /**
   * Tile and image layers combined into a single document order (see {@link
   * TileMapOptions.documentOrder}), maintained live as membership changes.
   * Reflects `addLayer` / `addImageLayer` / `removeLayer` /
   * `removeImageLayer` calls made after construction. Holds instance
   * references, so entries stay correct even when a tile layer and an image
   * layer share an id in a fallback-ordered map. Object layers are
   * data-only and never appear here.
   */
  public get renderableLayers(): ReadonlyArray<TileLayer | ImageLayer> {
    return this._documentOrder;
  }

  // ── Scene composition ─────────────────────────────────────────────────

  /**
   * Create a new {@link TileMapView} that groups this map's layers into
   * independently placeable band / layer scene nodes for interleaving
   * application actors between tile layers.
   *
   * Each call returns a fresh, independent view — the map does **not** cache a
   * single global view, so multiple coexisting views of the same map are
   * allowed. The view references this map but never owns it: destroying the
   * view frees only its generated layer/band nodes — never the map, its layers,
   * tileset textures, or any application actors.
   *
   * @advanced
   */
  public createView(options?: TileMapViewOptions): TileMapView {
    return new TileMapView(this, options);
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /**
   * Get a resolved tile from a given layer at tile coordinates.
   * Convenience for `map.getTileLayerById(id)?.getTileAt(tx, ty)`.
   * Returns null for an empty cell, out-of-bounds, or missing layer.
   */
  public getTileAt(layerId: number, tx: number, ty: number): ResolvedTile | null {
    const layer = this._layerById.get(layerId);
    if (!layer) return null;
    return layer.getTileAt(tx, ty);
  }

  /**
   * Set a tile on a given layer at tile coordinates.
   * Convenience for `map.getTileLayerById(id)?.setTileAt(tx, ty, tile)`.
   * @throws If the layer does not exist, coordinates are out of bounds,
   *         or the tile reference is invalid.
   */
  public setTileAt(layerId: number, tx: number, ty: number, tile: ResolvedTile): void {
    const layer = this._layerById.get(layerId);
    if (!layer) throw new Error(`Layer ${layerId} not found in map "${this.name}".`);
    layer.setTileAt(tx, ty, tile);
  }

  /**
   * Clear a tile on a given layer at tile coordinates.
   * Convenience for `map.getTileLayerById(id)?.clearTileAt(tx, ty)`.
   * @throws If the layer does not exist or coordinates are out of bounds.
   */
  public clearTileAt(layerId: number, tx: number, ty: number): void {
    const layer = this._layerById.get(layerId);
    if (!layer) throw new Error(`Layer ${layerId} not found in map "${this.name}".`);
    layer.clearTileAt(tx, ty);
  }

  // ── Coordinate conversion (base layer) ────────────────────────────────

  /**
   * Convert a tile coordinate to the pixel position of its top-left corner
   * in map-local space (ignoring layer offsets).
   */
  public tileToPixel(tx: number, ty: number): { x: number; y: number } {
    return {
      x: tx * this.tileWidth,
      y: ty * this.tileHeight,
    };
  }

  /**
   * Convert a pixel position in map-local space to the tile coordinate
   * that contains it. Uses `floor`. May return coordinates outside map bounds.
   */
  public pixelToTile(px: number, py: number): { tx: number; ty: number } {
    return {
      tx: Math.floor(px / this.tileWidth),
      ty: Math.floor(py / this.tileHeight),
    };
  }

  // ── Revision / lifecycle ──────────────────────────────────────────────

  /**
   * Monotonic map revision counter. Increments on structural changes only
   * (add/remove layer, add tileset). Cell mutations are tracked per-chunk
   * and per-layer; the renderer reads chunk-level revisions directly.
   * @advanced
   */
  public get revision(): number {
    return this._revision;
  }

  /** Whether the map has been destroyed. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  private _checkDestroyed(): void {
    if (this._destroyed) {
      throw new Error(`TileMap "${this.name}" has been destroyed.`);
    }
  }

  /**
   * Destroy the map and all owned layers and chunk storage.
   *
   * Is idempotent. Does NOT destroy tileset textures (Loader-owned) or
   * any SceneNodes (those do not exist yet in this slice).
   */
  public destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const layer of this._layers) {
      layer.destroy();
    }
    this._layers.length = 0;
    this._layerById.clear();
    this._objectLayers.length = 0;
    this._imageLayers.length = 0;
    this._documentOrder.length = 0;
    this._tilesets.length = 0;
  }
}
