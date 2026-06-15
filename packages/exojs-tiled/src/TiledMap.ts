import { TextureRegion } from '@codexo/exojs';
import type { ObjectPoint, ResolvedTile, TileMapObject, TileProperties, TilePropertyValue, TileTransform } from '@codexo/exojs-tilemap';
import { ObjectLayer, TileLayer, TileMap, TileSet } from '@codexo/exojs-tilemap';

import type { TiledMapData, TiledOrientation, TiledPropertyData, TiledRenderOrder } from './data';
import {
  maskTiledGid,
  TILED_FLIPPED_DIAGONALLY_FLAG,
  TILED_FLIPPED_HORIZONTALLY_FLAG,
  TILED_FLIPPED_VERTICALLY_FLAG,
} from './gid';
import { createTiledLayer, TiledGroupLayer, type TiledLayer,TiledObjectLayer, TiledTileLayer } from './TiledLayer';
import type { TiledObject } from './TiledObject';
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
   * Convert this parsed Tiled source model into a format-independent runtime
   * {@link TileMap} from `@codexo/exojs-tilemap`.
   *
   * Only finite orthogonal maps with atlas tilesets are supported. A
   * non-orthogonal or infinite map, or a collection-of-images tileset, throws
   * {@link TiledFormatError} rather than silently producing wrong (misplaced)
   * or empty geometry. Tile layers become renderable `TileLayer`s and object
   * groups become data-only `ObjectLayer`s; group layer children are flattened
   * in document order. Image layers are not yet converted.
   *
   * The returned `TileMap` does **not** own the tileset textures — they remain
   * in the Loader cache. Destroying the returned map does not unload textures.
   */
  public toTileMap(): TileMap {
    // The runtime TileMap is finite + orthogonal in this release. Reject maps
    // we cannot convert faithfully rather than silently producing misplaced
    // (isometric/staggered/hexagonal) or empty (infinite/chunked) geometry.
    if (this.orientation !== 'orthogonal') {
      throw new TiledFormatError(
        this.source,
        'orientation',
        `toTileMap() supports only orthogonal maps in this release, got "${this.orientation}"`,
      );
    }
    if (this.infinite) {
      throw new TiledFormatError(
        this.source,
        'infinite',
        'toTileMap() supports only finite maps in this release; infinite (chunked) maps are not yet convertible',
      );
    }

    // Build runtime tilesets. Tilesets with a per-tile image collection are
    // not yet supported; collection-of-images tilesets throw TiledFormatError.
    // Tilesets with no image at all (no texture, no tileTextures) are silently
    // skipped — their cells appear as empty in the runtime layer.
    const runtimeTilesets: TileSet[] = [];
    // indexToRuntime[i] = runtime TileSet for tilesets[i], or null if skipped.
    const indexToRuntime: Array<TileSet | null> = [];
    for (let i = 0; i < this.tilesets.length; i++) {
      const tiledTs = this.tilesets[i];
      if (!tiledTs.texture) {
        if (tiledTs.tileTextures.size > 0) {
          throw new TiledFormatError(
            this.source,
            `tilesets/${tiledTs.name}`,
            `tileset "${tiledTs.name}" is a collection-of-images tileset; ` +
            `toTileMap() requires atlas tilesets in this release`,
          );
        }
        // No atlas image and no per-tile images → skip; cells become empty.
        indexToRuntime.push(null);
        continue;
      }
      const tw = tiledTs.imageWidth ?? tiledTs.texture.width;
      const th = tiledTs.imageHeight ?? tiledTs.texture.height;
      const region = new TextureRegion(tiledTs.texture, { x: 0, y: 0, width: tw, height: th });
      const rts = new TileSet({
        name: tiledTs.name,
        texture: region,
        tileWidth: tiledTs.tileWidth,
        tileHeight: tiledTs.tileHeight,
        tileCount: tiledTs.tileCount,
        columns: tiledTs.columns,
        spacing: tiledTs.spacing,
        margin: tiledTs.margin,
      });
      runtimeTilesets.push(rts);
      indexToRuntime.push(rts);
    }

    // Collect and convert tile + object layers, flattening group layers.
    const runtimeLayers: TileLayer[] = [];
    const runtimeObjectLayers: ObjectLayer[] = [];
    const convertLayers = (layers: readonly TiledLayer[]): void => {
      for (const layer of layers) {
        if (layer instanceof TiledGroupLayer) {
          convertLayers(layer.layers);
        } else if (layer instanceof TiledTileLayer) {
          const rLayer = new TileLayer({
            id: layer.id,
            name: layer.name,
            width: layer.width,
            height: layer.height,
            tilesets: runtimeTilesets,
            tileWidth: this.tileWidth,
            tileHeight: this.tileHeight,
            visible: layer.visible,
            opacity: layer.opacity,
            offsetX: layer.offsetX,
            offsetY: layer.offsetY,
          });
          if (layer.data) {
            populateTileLayer(rLayer, layer.data, this.tilesets, indexToRuntime);
          }
          runtimeLayers.push(rLayer);
        } else if (layer instanceof TiledObjectLayer) {
          runtimeObjectLayers.push(convertObjectLayer(layer, this.tilesets, indexToRuntime));
        }
        // ImageLayer: not yet converted.
      }
    };
    convertLayers(this.layers);

    return new TileMap({
      name: this.source,
      width: this.width,
      height: this.height,
      tileWidth: this.tileWidth,
      tileHeight: this.tileHeight,
      tilesets: runtimeTilesets,
      layers: runtimeLayers,
      objectLayers: runtimeObjectLayers,
    });
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

/**
 * Resolve a raw (flag-bearing) Tiled GID to a runtime {@link ResolvedTile}, or
 * `null` for an empty cell or a GID whose tileset was skipped (no atlas image).
 */
function resolveGid(
  rawGid: number,
  tiledTilesets: readonly TiledTileset[],
  indexToRuntime: ReadonlyArray<TileSet | null>,
): ResolvedTile | null {
  if (rawGid === 0) return null;
  const baseGid = maskTiledGid(rawGid);
  const transform: TileTransform = {
    flipX: (rawGid >>> 0 & TILED_FLIPPED_HORIZONTALLY_FLAG) !== 0,
    flipY: (rawGid >>> 0 & TILED_FLIPPED_VERTICALLY_FLAG) !== 0,
    diagonal: (rawGid >>> 0 & TILED_FLIPPED_DIAGONALLY_FLAG) !== 0,
  };
  // Find owning tileset: rightmost with firstGid <= baseGid (tilesets sorted asc).
  let tsIdx = -1;
  for (let t = tiledTilesets.length - 1; t >= 0; t--) {
    if (baseGid >= tiledTilesets[t].firstGid) { tsIdx = t; break; }
  }
  if (tsIdx === -1) return null;
  const runtimeTs = indexToRuntime[tsIdx];
  if (!runtimeTs) return null; // tileset was skipped (no atlas image)
  return {
    tileset: runtimeTs,
    localTileId: baseGid - tiledTilesets[tsIdx].firstGid,
    transform,
  };
}

/** Fill a `TileLayer` from a flat GID array decoded from a Tiled tile layer. */
function populateTileLayer(
  layer: TileLayer,
  gids: readonly number[],
  tiledTilesets: readonly TiledTileset[],
  indexToRuntime: ReadonlyArray<TileSet | null>,
): void {
  for (let i = 0; i < gids.length; i++) {
    const tile = resolveGid(gids[i], tiledTilesets, indexToRuntime);
    if (!tile) continue;
    layer.setTileAt(i % layer.width, Math.floor(i / layer.width), tile);
  }
}

/** Convert a parsed `TiledObjectLayer` into a runtime data-only `ObjectLayer`. */
function convertObjectLayer(
  layer: TiledObjectLayer,
  tiledTilesets: readonly TiledTileset[],
  indexToRuntime: ReadonlyArray<TileSet | null>,
): ObjectLayer {
  const objects: TileMapObject[] = [];
  for (const object of layer.objects) {
    const converted = convertObject(object, tiledTilesets, indexToRuntime);
    if (converted) objects.push(converted);
  }
  return new ObjectLayer({
    id: layer.id,
    name: layer.name,
    class: layer.class,
    visible: layer.visible,
    opacity: layer.opacity,
    offsetX: layer.offsetX,
    offsetY: layer.offsetY,
    objects,
    properties: convertProperties(layer.properties),
  });
}

/**
 * Convert one `TiledObject` to a `TileMapObject`. Text objects (and tile
 * objects whose tileset was skipped) are dropped — returns `null`.
 */
function convertObject(
  object: TiledObject,
  tiledTilesets: readonly TiledTileset[],
  indexToRuntime: ReadonlyArray<TileSet | null>,
): TileMapObject | null {
  if (object.text) {
    return null; // text objects are not represented in the data-only model
  }

  const base = {
    id: object.id,
    name: object.name,
    type: object.type,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation,
    visible: object.visible,
    properties: convertProperties(object.properties),
  };

  if (object.gid !== undefined) {
    const tile = resolveGid(object.gid, tiledTilesets, indexToRuntime);
    if (!tile) return null;
    return { ...base, kind: 'tile', tile };
  }
  if (object.point) {
    return { ...base, kind: 'point' };
  }
  if (object.ellipse) {
    return { ...base, kind: 'ellipse' };
  }
  if (object.polygon) {
    return { ...base, kind: 'polygon', points: toPoints(object.polygon) };
  }
  if (object.polyline) {
    return { ...base, kind: 'polyline', points: toPoints(object.polyline) };
  }
  return { ...base, kind: 'rectangle' };
}

const toPoints = (points: ReadonlyArray<{ x: number; y: number }>): ObjectPoint[] => points.map(p => ({ x: p.x, y: p.y }));

/**
 * Project Tiled custom properties to the generic flat property bag. Class /
 * object-valued properties are not representable and are skipped.
 */
function convertProperties(properties: readonly TiledPropertyData[]): TileProperties {
  if (properties.length === 0) return Object.freeze({});
  const out: Record<string, TilePropertyValue> = {};
  for (const property of properties) {
    const value = property.value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[property.name] = value;
    }
  }
  return Object.freeze(out);
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
