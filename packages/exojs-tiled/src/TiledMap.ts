import type { TiledMapData, TiledOrientation, TiledPropertyData, TiledRenderOrder } from './data';
import { maskTiledGid } from './gid';
import { createTiledLayer, TiledGroupLayer, TiledObjectLayer, TiledTileLayer, type TiledLayer } from './TiledLayer';
import type { TiledTileset } from './TiledTileset';
import { TiledFormatError } from './validate';

/**
 * A parsed and validated Tiled map (`.tmj`).
 *
 * `TiledMap` represents the parsed Tiled source format. `TileMap` is the
 * format-independent ExoJS runtime map used for rendering, queries, and
 * mutation.
 *
 * Construction validates that {@link tilesets} cover a non-overlapping,
 * duplicate-free range of global tile ids, and that every GID referenced by
 * {@link layers} (tile layer cells, infinite-map chunks, and tile object
 * `gid`s) falls within one of those ranges. Both checks throw
 * {@link TiledFormatError} on failure.
 */
export class TiledMap {
  /** Resolved URL this map was loaded from. */
  public readonly source: string;
  /** The validated raw map data this instance was built from. */
  public readonly data: TiledMapData;

  public readonly orientation: TiledOrientation;
  public readonly renderOrder?: TiledRenderOrder;
  public readonly class: string;
  /** Map width in tiles. */
  public readonly width: number;
  /** Map height in tiles. */
  public readonly height: number;
  /** Tile grid cell width in pixels. */
  public readonly tileWidth: number;
  /** Tile grid cell height in pixels. */
  public readonly tileHeight: number;
  public readonly infinite: boolean;
  public readonly backgroundColor?: string;
  public readonly layers: readonly TiledLayer[];
  /** Tilesets used by this map, sorted by {@link TiledTileset.firstGid} ascending. */
  public readonly tilesets: readonly TiledTileset[];
  public readonly properties: readonly TiledPropertyData[];

  public constructor(source: string, data: TiledMapData, tilesets: readonly TiledTileset[]) {
    this.source = source;
    this.data = data;
    this.orientation = data.orientation;
    this.renderOrder = data.renderorder;
    this.class = data.class ?? '';
    this.width = data.width;
    this.height = data.height;
    this.tileWidth = data.tilewidth;
    this.tileHeight = data.tileheight;
    this.infinite = data.infinite;
    this.backgroundColor = data.backgroundcolor;
    this.properties = data.properties ?? [];
    this.layers = data.layers.map(createTiledLayer);
    this.tilesets = sortAndValidateTilesetRanges(tilesets, source);

    checkGidCoverage(this, source);
  }

  /**
   * Returns the tileset that owns `gid`, or `undefined` if `gid` is `0`
   * (the empty-cell sentinel) or is not covered by any tileset.
   *
   * Flip/rotation flag bits are masked off before the range lookup, so the
   * raw GID values found in {@link TiledTileLayer.data}/`chunks` and
   * {@link TiledObject.gid} can be passed directly.
   */
  public findTilesetForGid(gid: number): TiledTileset | undefined {
    const id = maskTiledGid(gid);

    if (id === 0) {
      return undefined;
    }

    for (const tileset of this.tilesets) {
      if (id >= tileset.firstGid && id <= tileset.lastGid) {
        return tileset;
      }
    }

    return undefined;
  }

  /** Looks up a custom property by name. */
  public getProperty(name: string): TiledPropertyData | undefined {
    return this.properties.find(property => property.name === name);
  }

  /**
   * Releases this map's reference to its parsed source. Tileset textures are
   * Loader-owned and may be shared with other maps; this does NOT destroy
   * them.
   */
  public destroy(): void {
    // Intentionally empty: all sub-resources (textures) are Loader-owned.
  }
}

function sortAndValidateTilesetRanges(tilesets: readonly TiledTileset[], source: string): readonly TiledTileset[] {
  const sorted = [...tilesets].sort((a, b) => a.firstGid - b.firstGid);

  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];

    if (current.firstGid === previous.firstGid) {
      throw new TiledFormatError(source, 'tilesets', `duplicate firstgid ${current.firstGid} (tilesets "${previous.name}" and "${current.name}")`);
    }

    if (current.firstGid <= previous.lastGid) {
      throw new TiledFormatError(
        source,
        'tilesets',
        `tileset "${current.name}" (firstgid ${current.firstGid}) overlaps tileset "${previous.name}" (firstgid ${previous.firstGid}, last gid ${previous.lastGid})`,
      );
    }
  }

  return sorted;
}

function walkLayers(layers: readonly TiledLayer[], path: string, visit: (layer: TiledLayer, layerPath: string) => void): void {
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const layerPath = `${path}[${i}]`;

    visit(layer, layerPath);

    if (layer instanceof TiledGroupLayer) {
      walkLayers(layer.layers, `${layerPath}.layers`, visit);
    }
  }
}

function checkGidArray(gids: readonly number[], map: TiledMap, source: string, path: string): void {
  for (let i = 0; i < gids.length; i++) {
    const gid = gids[i];

    if (gid !== 0 && map.findTilesetForGid(gid) === undefined) {
      throw new TiledFormatError(source, `${path}[${i}]`, `gid ${gid} (masked: ${maskTiledGid(gid)}) is not covered by any tileset`);
    }
  }
}

function checkGidCoverage(map: TiledMap, source: string): void {
  walkLayers(map.layers, 'layers', (layer, layerPath) => {
    if (layer instanceof TiledTileLayer) {
      if (layer.data !== undefined) {
        checkGidArray(layer.data, map, source, `${layerPath}.data`);
      }

      if (layer.chunks !== undefined) {
        for (let c = 0; c < layer.chunks.length; c++) {
          checkGidArray(layer.chunks[c].data, map, source, `${layerPath}.chunks[${c}].data`);
        }
      }
    } else if (layer instanceof TiledObjectLayer) {
      for (let o = 0; o < layer.objects.length; o++) {
        const gid = layer.objects[o].gid;

        if (gid !== undefined && map.findTilesetForGid(gid) === undefined) {
          throw new TiledFormatError(source, `${layerPath}.objects[${o}].gid`, `gid ${gid} (masked: ${maskTiledGid(gid)}) is not covered by any tileset`);
        }
      }
    }
  });
}
