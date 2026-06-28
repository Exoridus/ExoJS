import type { TextureRegion } from '@codexo/exojs';

import type { TileDefinition, TileProperties } from './types';
import { validateNonNegativeInteger, validatePositiveInteger } from './types';

/**
 * Options for constructing a {@link TileSet}.
 * @advanced
 */
export interface TileSetOptions {
  /** Stable runtime name (unique within a {@link TileMap}). */
  readonly name: string;
  /** Texture atlas for this tileset. Textures are Loader-owned. */
  readonly texture: TextureRegion;
  /** Width of each tile in pixels. */
  readonly tileWidth: number;
  /** Height of each tile in pixels. */
  readonly tileHeight: number;
  /** Total number of tiles in this tileset. */
  readonly tileCount: number;
  /** Number of tile columns in the atlas grid. Computed from texture width / tileWidth if omitted. */
  readonly columns?: number;
  /** Pixel spacing between tiles in the atlas. Defaults to 0. */
  readonly spacing?: number;
  /** Pixel margin around the atlas. Defaults to 0. */
  readonly margin?: number;
  /** Tileset class/type string (Tiled `class`). Defaults to `''`. */
  readonly class?: string;
  /** Visual drawing offset in pixels applied to every tile of this set. Defaults to 0. */
  readonly offsetX?: number;
  /** Visual drawing offset in pixels applied to every tile of this set. Defaults to 0. */
  readonly offsetY?: number;
}

/**
 * A resolved tileset: a uniform grid of tiles within a texture atlas.
 *
 * Does **not** own its texture — the Loader or application code retains
 * texture ownership. Tileset dimensions are validated at construction and
 * frozen thereafter.
 *
 * Multiple tilesets are supported per {@link TileMap}; each carries its own
 * tile dimensions, spacing, and optional per-tile metadata.
 * @advanced
 */
export class TileSet {
  /** Stable runtime name. */
  public readonly name: string;

  /** Atlas texture region — Loader-owned, never destroyed by the tileset. */
  public readonly texture: TextureRegion;

  /** Tile width in pixels. */
  public readonly tileWidth: number;
  /** Tile height in pixels. */
  public readonly tileHeight: number;

  /** Total number of tiles in the tileset. */
  public readonly tileCount: number;

  /** Number of columns in the atlas grid. */
  public readonly columns: number;
  /** Number of rows implied by tileCount and columns. */
  public readonly rows: number;

  /** Pixel spacing between tiles in the atlas. */
  public readonly spacing: number;
  /** Pixel margin around the atlas. */
  public readonly margin: number;

  /** Tileset class/type string (Tiled `class`; may be empty). */
  public readonly class: string;
  /** Visual drawing offset X in pixels, applied to every tile of this set. */
  public readonly offsetX: number;
  /** Visual drawing offset Y in pixels, applied to every tile of this set. */
  public readonly offsetY: number;

  private readonly _definitions: ReadonlyMap<number, TileDefinition>;

  /**
   * @throws When dimensions, counts, or spacing values are invalid.
   */
  public constructor(options: TileSetOptions) {
    if (!options.name || typeof options.name !== 'string') {
      throw new Error('TileSet name must be a non-empty string.');
    }

    if (!options.texture) {
      throw new Error('TileSet requires a valid TextureRegion.');
    }

    validatePositiveInteger(options.tileWidth, 'tileWidth');
    validatePositiveInteger(options.tileHeight, 'tileHeight');
    validatePositiveInteger(options.tileCount, 'tileCount');

    const spacing = options.spacing ?? 0;
    const margin = options.margin ?? 0;
    validateNonNegativeInteger(spacing, 'spacing');
    validateNonNegativeInteger(margin, 'margin');

    const atlasWidth = options.texture.width - margin * 2;
    const atlasHeight = options.texture.height - margin * 2;

    const columns = options.columns ?? Math.floor(atlasWidth / options.tileWidth);

    validatePositiveInteger(columns, 'columns');
    if (columns <= 0) {
      throw new Error(`TileSet columns must be positive (got ${columns}).`);
    }

    if (options.tileWidth * columns + spacing * (columns - 1) > atlasWidth) {
      throw new Error(
        `TileSet grid width exceeds atlas: ${options.tileWidth}*${columns}` +
        ` + ${spacing}*${columns - 1} > ${atlasWidth}.`,
      );
    }

    const rows = Math.ceil(options.tileCount / columns);
    if (rows > 0 && options.tileHeight * rows + spacing * (rows - 1) > atlasHeight) {
      throw new Error(
        `TileSet grid height exceeds atlas: ${options.tileHeight}*${rows}` +
        ` + ${spacing}*${rows - 1} > ${atlasHeight}.`,
      );
    }

    this.name = options.name;
    this.texture = options.texture;
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;
    this.tileCount = options.tileCount;
    this.columns = columns;
    this.rows = rows;
    this.spacing = spacing;
    this.margin = margin;
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
      throw new Error(
        `Tile definition localTileId ${localTileId} out of range [0, ${this.tileCount - 1}].`,
      );
    }
    const props = definition.properties
      ? Object.freeze({ ...definition.properties })
      : undefined;
    const animation = definition.animation
      ? Object.freeze(definition.animation.map(frame => Object.freeze({ ...frame })))
      : undefined;
    const collision = definition.collision
      ? Object.freeze([...definition.collision])
      : undefined;
    (this._definitions as Map<number, TileDefinition>).set(localTileId, {
      localTileId,
      ...(props !== undefined && { properties: props }),
      ...(animation !== undefined && { animation }),
      ...(collision !== undefined && { collision }),
    });
  }

  /**
   * Build definitions from an array, replacing the internal definitions map.
   * Each entry's properties are copied and frozen.
   * @internal
   */
  public _setDefinitions(definitions: readonly TileDefinition[]): void {
    const map = (this._definitions as Map<number, TileDefinition>);
    map.clear();
    for (const def of definitions) {
      const props = def.properties
        ? Object.freeze({ ...def.properties })
        : undefined;
      const animation = def.animation
        ? Object.freeze(def.animation.map(frame => Object.freeze({ ...frame })))
        : undefined;
      const collision = def.collision
        ? Object.freeze([...def.collision])
        : undefined;
      map.set(def.localTileId, {
        localTileId: def.localTileId,
        ...(props !== undefined && { properties: props }),
        ...(animation !== undefined && { animation }),
        ...(collision !== undefined && { collision }),
      });
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
   * Compute the pixel-space source rectangle for a local tile ID
   * within the atlas, accounting for columns, spacing, and margin.
   * @advanced
   */
  public getTileRect(localTileId: number): { x: number; y: number; width: number; height: number } {
    if (localTileId < 0 || localTileId >= this.tileCount) {
      throw new Error(
        `getTileRect: localTileId ${localTileId} out of range [0, ${this.tileCount - 1}].`,
      );
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
   * Read-only snapshot of all per-tile definitions.
   * The returned record is a caller-owned copy.
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
