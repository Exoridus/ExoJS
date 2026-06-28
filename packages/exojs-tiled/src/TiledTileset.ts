import type { Texture } from '@codexo/exojs';

import type { TiledPointData, TiledPropertyData, TiledTileData, TiledTilesetData, TiledWangSetData } from './data';

/**
 * Loader-resolved resources for a {@link TiledTileset}: the absolute image
 * URL(s) and the {@link Texture} instance(s) loaded for them. All textures
 * are owned by the `Loader` cache — a {@link TiledTileset} never destroys
 * them.
 */
export interface TiledTilesetResources {
  /** Resolved URL of the external `.tsj` file, or `undefined` for an embedded tileset. */
  readonly source?: string | undefined;
  /** Resolved URL of the tileset's atlas {@link TiledTilesetData.image}, or `undefined` for a collection-of-images tileset. */
  readonly imageUrl?: string | undefined;
  /** Texture loaded for {@link imageUrl}. */
  readonly texture?: Texture | undefined;
  /** Textures loaded for collection-of-images {@link TiledTileData.image} entries, keyed by local tile id. */
  readonly tileTextures?: ReadonlyMap<number, Texture> | undefined;
}

/**
 * A parsed Tiled tileset — either embedded inline in a map's `tilesets`
 * array, or parsed from an external `.tsj` file referenced by it.
 *
 * {@link firstGid} and {@link lastGid} define the inclusive range of global
 * tile ids (after masking flip/rotation flags via `maskTiledGid`) that this
 * tileset owns within its owning {@link TiledMap}.
 */
export class TiledTileset {
  /** First global tile id owned by this tileset. */
  public readonly firstGid: number;
  /** Resolved URL of the external `.tsj` file, or `undefined` for an embedded tileset. */
  public readonly source?: string | undefined;
  public readonly name: string;
  public readonly class: string;
  public readonly tileWidth: number;
  public readonly tileHeight: number;
  public readonly tileCount: number;
  public readonly columns: number;
  public readonly spacing: number;
  public readonly margin: number;
  /** Resolved URL of the tileset's atlas image, or `undefined` for a collection-of-images tileset. */
  public readonly imageUrl?: string | undefined;
  public readonly imageWidth?: number | undefined;
  public readonly imageHeight?: number | undefined;
  /** Texture loaded for {@link imageUrl}. Loader-owned; not destroyed by {@link TiledMap.destroy}. */
  public readonly texture?: Texture | undefined;
  public readonly tileOffset: TiledPointData;
  public readonly objectAlignment?: string | undefined;
  public readonly tiles: readonly TiledTileData[];
  /** Wang sets (terrain/auto-tile definitions) declared on this tileset. Empty when none are defined. */
  public readonly wangSets: readonly TiledWangSetData[];
  /** Textures loaded for collection-of-images tiles, keyed by local tile id. Loader-owned. */
  public readonly tileTextures: ReadonlyMap<number, Texture>;
  public readonly properties: readonly TiledPropertyData[];

  public constructor(data: TiledTilesetData, firstGid: number, resources: TiledTilesetResources = {}) {
    this.firstGid = firstGid;
    this.source = resources.source;
    this.name = data.name;
    this.class = data.class ?? '';
    this.tileWidth = data.tilewidth;
    this.tileHeight = data.tileheight;
    this.tileCount = data.tilecount;
    this.columns = data.columns;
    this.spacing = data.spacing ?? 0;
    this.margin = data.margin ?? 0;
    this.imageUrl = resources.imageUrl;
    this.imageWidth = data.imagewidth;
    this.imageHeight = data.imageheight;
    this.texture = resources.texture;
    this.tileOffset = data.tileoffset ?? { x: 0, y: 0 };
    this.objectAlignment = data.objectalignment;
    this.tiles = data.tiles ?? [];
    this.wangSets = data.wangsets ?? [];
    this.tileTextures = resources.tileTextures ?? new Map();
    this.properties = data.properties ?? [];
  }

  /** Last global tile id (inclusive) owned by this tileset. Empty (`lastGid < firstGid`) when {@link tileCount} is `0`. */
  public get lastGid(): number {
    return this.firstGid + this.tileCount - 1;
  }

  /** Looks up a per-tile definition by local tile id. */
  public getTile(localId: number): TiledTileData | undefined {
    return this.tiles.find(tile => tile.id === localId);
  }

  /** Looks up a custom property by name. */
  public getProperty(name: string): TiledPropertyData | undefined {
    return this.properties.find(property => property.name === name);
  }
}
