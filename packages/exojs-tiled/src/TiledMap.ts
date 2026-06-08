import type { Texture } from '@codexo/exojs';

// ---------------------------------------------------------------------------
// Tiled JSON format types (TMJ / Tiled JSON Map Format)
// ---------------------------------------------------------------------------

export interface TiledTileset {
  readonly firstgid: number;
  readonly source?: string;
  readonly image?: string;
  readonly name?: string;
  readonly tilewidth?: number;
  readonly tileheight?: number;
  readonly columns?: number;
  readonly tilecount?: number;
  readonly spacing?: number;
  readonly margin?: number;
}

export interface TiledLayer {
  readonly id: number;
  readonly name: string;
  readonly type: 'tilelayer' | 'objectgroup' | 'imagelayer' | 'group';
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly data?: number[];
  readonly objects?: TiledObject[];
  readonly opacity: number;
}

export interface TiledObject {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly visible: boolean;
  readonly gid?: number;
  readonly properties?: TiledProperty[];
}

export interface TiledProperty {
  readonly name: string;
  readonly type: string;
  readonly value: unknown;
}

/** Raw data shape parsed from a Tiled JSON (.tmj) file. */
export interface TiledMapData {
  readonly width: number;
  readonly height: number;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly infinite?: boolean;
  readonly orientation?: string;
  readonly renderorder?: string;
  readonly layers: readonly TiledLayer[];
  readonly tilesets: readonly TiledTileset[];
  readonly version?: string | number;
  readonly type?: string;
}

// ---------------------------------------------------------------------------
// TiledMap runtime object
// ---------------------------------------------------------------------------

/**
 * Runtime representation of a loaded Tiled map.
 *
 * Exposes map metadata, layers, and tileset textures. Tileset textures
 * are owned by the Loader cache — `TiledMap.destroy()` does NOT destroy them.
 *
 * Only the initial proof scope is implemented: orthogonal tile layers,
 * basic tilesets, and basic object layers. TMX/XML, infinite maps, and
 * world streaming are not supported.
 */
export class TiledMap {
  public readonly data: TiledMapData;
  public readonly tilesetTextures: readonly Texture[];

  public readonly width: number;
  public readonly height: number;
  public readonly tileWidth: number;
  public readonly tileHeight: number;

  public readonly layers: readonly TiledLayer[];
  public readonly tilesets: readonly TiledTileset[];

  public constructor(data: TiledMapData, tilesetTextures: readonly Texture[]) {
    this.data = data;
    this.tilesetTextures = tilesetTextures;
    this.width = data.width;
    this.height = data.height;
    this.tileWidth = data.tilewidth;
    this.tileHeight = data.tileheight;
    this.layers = data.layers;
    this.tilesets = data.tilesets;
  }

  /** Tile layers only. */
  public get tileLayers(): readonly TiledLayer[] {
    return this.layers.filter(l => l.type === 'tilelayer');
  }

  /** Object group layers only. */
  public get objectLayers(): readonly TiledLayer[] {
    return this.layers.filter(l => l.type === 'objectgroup');
  }

  /**
   * Destroy this TiledMap. Does NOT destroy tileset textures — they are
   * owned by the Loader's cache and may be shared with other callers.
   */
  public destroy(): void {
    // Intentionally empty: tileset textures are Loader-owned.
  }
}
