import type { TextureRegion } from '@codexo/exojs';

import type { TileDefinition, TileProperties } from './types';
import { validateNonNegativeInteger, validatePositiveInteger } from './types';

/**
 * Options shared by both kinds of {@link TileSet}.
 * @advanced
 */
export interface TileSetBaseOptions {
  /** Stable runtime name (unique within a {@link TileMap}). */
  readonly name: string;
  /** Width of each tile in pixels. For an image collection, the widest tile; it sizes the set, not the drawn tiles. */
  readonly tileWidth: number;
  /** Height of each tile in pixels. For an image collection, the tallest tile; it sizes the set, not the drawn tiles. */
  readonly tileHeight: number;
  /** Tileset class/type string (Tiled `class`). Defaults to `''`. */
  readonly class?: string;
  /** Visual drawing offset in pixels applied to every tile of this set drawn by a tile layer. Defaults to 0. */
  readonly offsetX?: number;
  /** Visual drawing offset in pixels applied to every tile of this set drawn by a tile layer. Defaults to 0. */
  readonly offsetY?: number;
}

/**
 * Options for a {@link TileSet} cut from one atlas texture as a uniform grid.
 * @advanced
 */
export interface AtlasTileSetOptions extends TileSetBaseOptions {
  /** Texture atlas for this tileset. Textures are Loader-owned. */
  readonly texture: TextureRegion;
  /** Total number of tiles in this tileset. */
  readonly tileCount: number;
  /** Number of tile columns in the atlas grid. Computed from texture width / tileWidth if omitted. */
  readonly columns?: number;
  /** Pixel spacing between tiles in the atlas. Defaults to 0. */
  readonly spacing?: number;
  /** Pixel margin around the atlas. Defaults to 0. */
  readonly margin?: number;
}

/**
 * Options for a {@link TileSet} whose tiles are separate images.
 * @advanced
 */
export interface ImageCollectionTileSetOptions extends TileSetBaseOptions {
  /**
   * One image per local tile id; `null` leaves that id without a tile, as
   * removed tiles of an editor collection do. Every image keeps its own size
   * and is drawn bottom-left aligned in its cell, so images larger than the
   * cell extend up and to the right. Textures are Loader-owned.
   */
  readonly tileImages: ReadonlyArray<TextureRegion | null>;
}

/**
 * Options for constructing a {@link TileSet}: an atlas grid or an image collection.
 * @advanced
 */
export type TileSetOptions = AtlasTileSetOptions | ImageCollectionTileSetOptions;

interface TileSetLayout {
  readonly texture: TextureRegion | null;
  readonly tileImages: ReadonlyArray<TextureRegion | null> | null;
  readonly tileCount: number;
  readonly columns: number;
  readonly rows: number;
  readonly spacing: number;
  readonly margin: number;
}

const collectionLayout = (options: ImageCollectionTileSetOptions): TileSetLayout => {
  if (options.tileImages.length === 0) {
    throw new Error(`TileSet "${options.name}" needs at least one tile image.`);
  }

  return {
    texture: null,
    tileImages: Object.freeze([...options.tileImages]),
    tileCount: options.tileImages.length,
    columns: 0,
    rows: 0,
    spacing: 0,
    margin: 0,
  };
};

const atlasLayout = (options: AtlasTileSetOptions): TileSetLayout => {
  if (!options.texture) {
    throw new Error('TileSet requires a valid TextureRegion.');
  }

  validatePositiveInteger(options.tileCount, 'tileCount');

  const spacing = options.spacing ?? 0;
  const margin = options.margin ?? 0;
  validateNonNegativeInteger(spacing, 'spacing');
  validateNonNegativeInteger(margin, 'margin');

  // A tile grid is derived from the atlas dimensions and then fixed, so it
  // cannot be built against a texture that has not loaded yet - and the
  // dimension checks below would otherwise report the resulting zeros as a
  // bad tile size rather than as the real cause.
  if (options.texture.width <= 0 || options.texture.height <= 0) {
    throw new Error(
      `TileSet needs a loaded texture to derive its grid, but "${options.name}" was given one measuring ` +
        `${options.texture.width}x${options.texture.height}. Await it (loader.load(...) or texture.loaded) before constructing the tile set.`,
    );
  }

  const atlasWidth = options.texture.width - margin * 2;
  const atlasHeight = options.texture.height - margin * 2;

  const columns = options.columns ?? Math.floor(atlasWidth / options.tileWidth);

  validatePositiveInteger(columns, 'columns');

  if (columns <= 0) {
    throw new Error(`TileSet columns must be positive (got ${columns}).`);
  }

  if (options.tileWidth * columns + spacing * (columns - 1) > atlasWidth) {
    throw new Error(`TileSet grid width exceeds atlas: ${options.tileWidth}*${columns}` + ` + ${spacing}*${columns - 1} > ${atlasWidth}.`);
  }

  const rows = Math.ceil(options.tileCount / columns);

  if (rows > 0 && options.tileHeight * rows + spacing * (rows - 1) > atlasHeight) {
    throw new Error(`TileSet grid height exceeds atlas: ${options.tileHeight}*${rows}` + ` + ${spacing}*${rows - 1} > ${atlasHeight}.`);
  }

  return { texture: options.texture, tileImages: null, tileCount: options.tileCount, columns, rows, spacing, margin };
};

/**
 * A resolved tileset: either a uniform grid of tiles within one texture atlas,
 * or a collection of separate tile images.
 *
 * Does **not** own its textures - the Loader or application code retains
 * texture ownership. Tileset dimensions are validated at construction and
 * frozen thereafter.
 *
 * Multiple tilesets are supported per {@link TileMap}; each carries its own
 * tile dimensions, spacing, and optional per-tile metadata. Tiles that stay
 * inside their cells batch into one draw per texture and chunk, so an atlas
 * costs one draw where a collection costs one per image. Artwork that overhangs
 * its cell, and the tiles drawn over it, keep cell order, and each change of
 * texture in that order costs another draw, so prefer atlases for dense layers.
 * @advanced
 */
export class TileSet {
  /** Stable runtime name. */
  public readonly name: string;

  /** Atlas texture region - Loader-owned, never destroyed by the tileset. `null` for an image collection. */
  public readonly texture: TextureRegion | null;

  /**
   * Per-tile images of an image collection, indexed by local tile id, or
   * `null` for an atlas set. Use {@link getTileTexture} to read either kind.
   */
  public readonly tileImages: ReadonlyArray<TextureRegion | null> | null;

  /** Tile width in pixels. */
  public readonly tileWidth: number;
  /** Tile height in pixels. */
  public readonly tileHeight: number;

  /** Total number of tiles in the tileset. */
  public readonly tileCount: number;

  /** Number of columns in the atlas grid; `0` for an image collection. */
  public readonly columns: number;
  /** Number of rows implied by tileCount and columns; `0` for an image collection. */
  public readonly rows: number;

  /** Pixel spacing between tiles in the atlas; `0` for an image collection. */
  public readonly spacing: number;
  /** Pixel margin around the atlas; `0` for an image collection. */
  public readonly margin: number;

  /** Tileset class/type string (Tiled `class`; may be empty). */
  public readonly class: string;
  /**
   * Visual drawing offset X in pixels (Tiled `tileoffset`).
   *
   * Applied by the tile-layer geometry builder and by the tile-collision
   * helpers - i.e. wherever this package places a tile on a grid. It is **not**
   * folded into a {@link TileObject}'s `x`/`y`: object layers are data-only, so
   * code that draws a tile object itself has to add this offset the way a tile
   * layer would.
   */
  public readonly offsetX: number;
  /** Visual drawing offset Y in pixels (Tiled `tileoffset`) - see {@link offsetX} for where it applies. */
  public readonly offsetY: number;

  private readonly _definitions: ReadonlyMap<number, TileDefinition>;

  /**
   * @throws When dimensions, counts, or spacing values are invalid.
   */
  public constructor(options: TileSetOptions) {
    if (!options.name || typeof options.name !== 'string') {
      throw new Error('TileSet name must be a non-empty string.');
    }

    validatePositiveInteger(options.tileWidth, 'tileWidth');
    validatePositiveInteger(options.tileHeight, 'tileHeight');

    const layout = 'tileImages' in options ? collectionLayout(options) : atlasLayout(options);

    this.name = options.name;
    this.texture = layout.texture;
    this.tileImages = layout.tileImages;
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;
    this.tileCount = layout.tileCount;
    this.columns = layout.columns;
    this.rows = layout.rows;
    this.spacing = layout.spacing;
    this.margin = layout.margin;
    this.class = options.class ?? '';
    this.offsetX = options.offsetX ?? 0;
    this.offsetY = options.offsetY ?? 0;

    this._definitions = new Map();

    if (__DEV__) {
      Object.freeze(this);
    }
  }

  /**
   * Set per-tile metadata for a local tile ID.
   * Copies input to prevent caller-owned mutation leaking into the tileset.
   * @internal
   */
  public _setDefinition(localTileId: number, definition: Partial<TileDefinition>): void {
    if (localTileId < 0 || localTileId >= this.tileCount) {
      throw new Error(`Tile definition localTileId ${localTileId} out of range [0, ${this.tileCount - 1}].`);
    }

    const props = definition.properties ? Object.freeze({ ...definition.properties }) : undefined;
    const animation = definition.animation ? Object.freeze(definition.animation.map(frame => Object.freeze({ ...frame }))) : undefined;
    const collision = definition.collision ? Object.freeze([...definition.collision]) : undefined;
    (this._definitions as Map<number, TileDefinition>).set(localTileId, {
      localTileId,
      ...(props !== undefined && { properties: props }),
      ...(animation !== undefined && { animation }),
      ...(collision !== undefined && { collision }),
    });
  }

  /**
   * Replace all tile definitions with the given array. Each entry's
   * properties are copied and frozen.
   *
   * Part of the tilemap SDK contract for extension packages that build
   * tilesets programmatically.
   */
  public setDefinitions(definitions: readonly TileDefinition[]): void {
    // Validate the whole batch before clearing, so a bad entry cannot wipe the
    // definitions that are already installed.
    for (const def of definitions) {
      if (def.localTileId < 0 || def.localTileId >= this.tileCount) {
        throw new Error(`Tile definition localTileId ${def.localTileId} out of range [0, ${this.tileCount - 1}].`);
      }
    }

    (this._definitions as Map<number, TileDefinition>).clear();

    for (const def of definitions) {
      this._setDefinition(def.localTileId, def);
    }
  }

  /**
   * Retrieve per-tile metadata, or undefined if none defined.
   * @advanced
   */
  public getTileDefinition(localTileId: number): TileDefinition | undefined {
    return this._definitions.get(localTileId);
  }

  /**
   * The texture region a local tile id samples from: the atlas for an atlas
   * set, the tile's own image for an image collection. `null` for an id
   * outside the set or a collection id without an image.
   * @advanced
   */
  public getTileTexture(localTileId: number): TextureRegion | null {
    if (localTileId < 0 || localTileId >= this.tileCount) {
      return null;
    }

    return this.tileImages === null ? this.texture : (this.tileImages[localTileId] ?? null);
  }

  /**
   * Compute the pixel-space source rectangle for a local tile ID, relative to
   * {@link getTileTexture}: the grid cell within the atlas (accounting for
   * columns, spacing, and margin), or the whole image of a collection tile.
   * @throws For an id outside the set or a collection id without an image.
   * @advanced
   */
  public getTileRect(localTileId: number): { x: number; y: number; width: number; height: number } {
    if (localTileId < 0 || localTileId >= this.tileCount) {
      throw new Error(`getTileRect: localTileId ${localTileId} out of range [0, ${this.tileCount - 1}].`);
    }

    if (this.tileImages !== null) {
      const image = this.tileImages[localTileId];

      if (!image) {
        throw new Error(`getTileRect: tile set "${this.name}" has no image for localTileId ${localTileId}.`);
      }

      return { x: 0, y: 0, width: image.width, height: image.height };
    }

    const col = localTileId % this.columns;
    const row = Math.floor(localTileId / this.columns);

    return {
      x: this.margin + col * (this.tileWidth + this.spacing),
      y: this.margin + row * (this.tileHeight + this.spacing),
      width: this.tileWidth,
      height: this.tileHeight,
    };
  }

  /**
   * Iterate over all defined tiles (sparse).
   * @advanced
   */
  public definedTiles(): IterableIterator<TileDefinition> {
    return this._definitions.values();
  }

  /**
   * Read-only snapshot of each defined tile's properties, keyed by local tile
   * id. Ids without a definition are absent. The returned record is frozen;
   * the property bags it references are the tileset's frozen ones.
   * @advanced
   */
  public get allDefinitions(): Readonly<Record<number, TileProperties | undefined>> {
    const result: Record<number, TileProperties | undefined> = {};

    for (const [id, def] of this._definitions) {
      result[id] = def.properties;
    }

    return Object.freeze(result);
  }
}
