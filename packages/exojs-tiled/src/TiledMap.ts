import { type Texture, TextureRegion } from '@codexo/exojs';
import type { ChunkPayload, ChunkSource, ObjectPoint, ResolvedTile, TextStyle, TileAnimationFrame, TileDefinition, TileMapObject, TileProperties, TilePropertyValue, TileTransform } from '@codexo/exojs-tilemap';
import { ImageLayer, ObjectLayer, packTile, TileLayer, TileMap, TilePropertyKind, TileSet } from '@codexo/exojs-tilemap';

import type { TiledChunkData, TiledClassPropertyValueData, TiledMapData, TiledObjectData, TiledOrientation, TiledPropertyData, TiledRenderOrder, TiledTileData } from './data';
import {
  maskTiledGid,
  TILED_FLIPPED_DIAGONALLY_FLAG,
  TILED_FLIPPED_HORIZONTALLY_FLAG,
  TILED_FLIPPED_VERTICALLY_FLAG,
} from './gid';
import { createTiledLayer, TiledGroupLayer, TiledImageLayer, type TiledLayer,TiledObjectLayer, TiledTileLayer } from './TiledLayer';
import type { TiledObject } from './TiledObject';
import type { TiledTileset } from './TiledTileset';
import { resolveTiledUrl } from './url';
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
  public readonly renderOrder?: TiledRenderOrder | undefined;
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
  public readonly backgroundColor?: string | undefined;
  public readonly layers: readonly TiledLayer[];
  /** Tilesets used by this map, sorted by {@link TiledTileset.firstGid} ascending. */
  public readonly tilesets: readonly TiledTileset[];
  public readonly properties: readonly TiledPropertyData[];

  private readonly _imageTextures: ReadonlyMap<number, Texture>;
  private readonly _chunkSources = new Map<number, ChunkSource>();

  public constructor(
    source: string,
    data: TiledMapData,
    tilesets: readonly TiledTileset[],
    imageTextures: ReadonlyMap<number, Texture> = new Map(),
  ) {
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
    this._imageTextures = imageTextures;
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
   * Only orthogonal maps with atlas tilesets are supported. A non-orthogonal
   * map, or a collection-of-images tileset, throws {@link TiledFormatError}
   * rather than silently producing wrong (misplaced) or empty geometry. Tile
   * layers become renderable `TileLayer`s, object groups become data-only
   * `ObjectLayer`s, and image layers become data-only `ImageLayer`s; group
   * layer children are flattened in document order.
   *
   * An `infinite: true` (chunked) tile layer converts to an **unbounded**
   * runtime `TileLayer` with no tiles populated eagerly — its data streams in
   * on demand via the {@link ChunkSource} built for it, retrievable with
   * {@link getChunkSource} after this call returns.
   *
   * The returned `TileMap` does **not** own the tileset textures — they remain
   * in the Loader cache. Destroying the returned map does not unload textures.
   */
  public toTileMap(): TileMap {
    this._chunkSources.clear();

    // Orthogonal-only in this release. Reject maps we cannot convert
    // faithfully rather than silently producing misplaced (isometric/
    // staggered/hexagonal) geometry.
    if (this.orientation !== 'orthogonal') {
      throw new TiledFormatError(
        this.source,
        'orientation',
        `toTileMap() supports only orthogonal maps in this release, got "${this.orientation}"`,
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
      if (!tiledTs) {
        indexToRuntime.push(null);
        continue;
      }
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
        class: tiledTs.class,
        offsetX: tiledTs.tileOffset.x,
        offsetY: tiledTs.tileOffset.y,
      });
      // Carry per-tile metadata (properties + animation frames) into the runtime
      // tileset. Without this, Tiled tile animations and per-tile properties are
      // lost at conversion. Out-of-range entries are skipped defensively.
      const defs = buildTileDefinitions(tiledTs.tiles, tiledTs.tileCount);
      if (defs.length > 0) {
        rts._setDefinitions(defs);
      }
      runtimeTilesets.push(rts);
      indexToRuntime.push(rts);
    }

    // Collect and convert tile + object + image layers, flattening group layers.
    const runtimeLayers: TileLayer[] = [];
    const runtimeObjectLayers: ObjectLayer[] = [];
    const runtimeImageLayers: ImageLayer[] = [];
    const convertLayers = (layers: readonly TiledLayer[]): void => {
      for (const layer of layers) {
        if (layer instanceof TiledGroupLayer) {
          convertLayers(layer.layers);
        } else if (layer instanceof TiledTileLayer) {
          const chunked = layer.chunks !== undefined;
          const rLayer = new TileLayer({
            id: layer.id,
            name: layer.name,
            ...(chunked ? {} : { width: layer.width, height: layer.height }),
            tilesets: runtimeTilesets,
            tileWidth: this.tileWidth,
            tileHeight: this.tileHeight,
            visible: layer.visible,
            opacity: layer.opacity,
            offsetX: layer.offsetX,
            offsetY: layer.offsetY,
            parallaxX: layer.parallaxX,
            parallaxY: layer.parallaxY,
            class: layer.class,
            tintColor: parseTiledColor(layer.tintColor),
          });
          if (layer.data) {
            populateTileLayer(rLayer, layer.data, this.tilesets, indexToRuntime, layer.width);
          } else if (chunked) {
            this._chunkSources.set(layer.id, buildTiledChunkSource(layer, rLayer, this.tilesets, indexToRuntime, this.source));
          }
          runtimeLayers.push(rLayer);
        } else if (layer instanceof TiledObjectLayer) {
          runtimeObjectLayers.push(convertObjectLayer(layer, this.tilesets, indexToRuntime));
        } else if (layer instanceof TiledImageLayer) {
          runtimeImageLayers.push(new ImageLayer({
            id: layer.id,
            name: layer.name,
            class: layer.class,
            image: resolveTiledUrl(layer.image, this.source),
            texture: this._imageTextures.get(layer.id) ?? null,
            visible: layer.visible,
            opacity: layer.opacity,
            offsetX: layer.offsetX,
            offsetY: layer.offsetY,
            parallaxX: layer.parallaxX,
            parallaxY: layer.parallaxY,
            tintColor: parseTiledColor(layer.tintColor),
            repeatX: layer.repeatX,
            repeatY: layer.repeatY,
            properties: convertProperties(layer.properties),
          }));
        }
      }
    };
    convertLayers(this.layers);

    return new TileMap({
      name: this.source,
      // Tiled always reports width/height as 0 at the map level for an
      // infinite map (its extent is unbounded/streamed); omit both rather
      // than passing 0, which TileMap's constructor rejects.
      ...(this.infinite ? {} : { width: this.width, height: this.height }),
      tileWidth: this.tileWidth,
      tileHeight: this.tileHeight,
      tilesets: runtimeTilesets,
      layers: runtimeLayers,
      objectLayers: runtimeObjectLayers,
      imageLayers: runtimeImageLayers,
      class: this.class,
      backgroundColor: parseTiledColor(this.backgroundColor),
      renderOrder: this.renderOrder ?? 'right-down',
      properties: convertProperties(this.properties),
    });
  }

  /**
   * The {@link ChunkSource} built for the chunked tile layer with the given
   * Tiled layer `id`, as a side effect of the most recent {@link toTileMap}
   * call. Returns `undefined` if `toTileMap()` hasn't been called yet, if
   * `layerId` doesn't name a tile layer, or if that layer is finite
   * (`data`-based) rather than chunked (`infinite`-map `chunks`-based).
   *
   * Call {@link toTileMap} before calling this — it is what builds the
   * providers this method reads from.
   * @advanced
   */
  public getChunkSource(layerId: number): ChunkSource | undefined {
    return this._chunkSources.get(layerId);
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
    const candidate = tiledTilesets[t];
    if (candidate && baseGid >= candidate.firstGid) { tsIdx = t; break; }
  }
  if (tsIdx === -1) return null;
  const owningTs = tiledTilesets[tsIdx];
  const runtimeTs = indexToRuntime[tsIdx];
  if (!owningTs || !runtimeTs) return null; // tileset was skipped (no atlas image)
  return {
    tileset: runtimeTs,
    localTileId: baseGid - owningTs.firstGid,
    transform,
  };
}

/**
 * Fill a `TileLayer` from a flat GID array decoded from a Tiled tile layer.
 *
 * @param width The source Tiled layer's width in tiles — `toTileMap()` always
 *              constructs `layer` as bounded with this same width, but that
 *              fact isn't visible to the type checker from `layer` alone
 *              (runtime `TileLayer.width` is `number | undefined` since it
 *              also supports unbounded layers), so the caller's already-known
 *              Tiled-source width is threaded through explicitly instead.
 */
function populateTileLayer(
  layer: TileLayer,
  gids: readonly number[],
  tiledTilesets: readonly TiledTileset[],
  indexToRuntime: ReadonlyArray<TileSet | null>,
  width: number,
): void {
  for (let i = 0; i < gids.length; i++) {
    const gid = gids[i];
    if (gid === undefined) continue;
    const tile = resolveGid(gid, tiledTilesets, indexToRuntime);
    if (!tile) continue;
    layer.setTileAt(i % width, Math.floor(i / width), tile);
  }
}

/**
 * Build a {@link ChunkSource} that lazily re-slices a chunked
 * {@link TiledTileLayer}'s fixed-size on-disk chunks into `runtimeLayer`'s
 * own chunk grid. Indexes `layer.chunks` once by on-disk coordinate;
 * `getChunk` composes each request from the on-disk chunks it overlaps.
 *
 * @throws {TiledFormatError} if the layer's on-disk chunks don't all share
 *         the same width/height (Tiled always emits a uniform size in
 *         practice; this is a defensive guard against malformed input).
 */
function buildTiledChunkSource(
  layer: TiledTileLayer,
  runtimeLayer: TileLayer,
  tiledTilesets: readonly TiledTileset[],
  indexToRuntime: ReadonlyArray<TileSet | null>,
  source: string,
): ChunkSource {
  const index = new Map<string, TiledChunkData>();
  let onDiskWidth = 0;
  let onDiskHeight = 0;
  for (const chunk of layer.chunks ?? []) {
    if (onDiskWidth === 0) {
      onDiskWidth = chunk.width;
      onDiskHeight = chunk.height;
    } else if (chunk.width !== onDiskWidth || chunk.height !== onDiskHeight) {
      throw new TiledFormatError(
        source,
        `layers/${layer.name}/chunks`,
        `non-uniform infinite-map chunk size is not supported (expected ${onDiskWidth}x${onDiskHeight}, got ${chunk.width}x${chunk.height})`,
      );
    }
    index.set(`${chunk.x},${chunk.y}`, chunk);
  }

  return {
    getChunk(cx: number, cy: number): ChunkPayload | null {
      if (onDiskWidth === 0) return null; // layer had no chunks at all

      const chunkWidth = runtimeLayer.chunkWidth;
      const chunkHeight = runtimeLayer.chunkHeight;
      const qx0 = cx * chunkWidth;
      const qy0 = cy * chunkHeight;
      const qx1 = qx0 + chunkWidth - 1;
      const qy1 = qy0 + chunkHeight - 1;

      // Tiled always aligns chunk coordinates to the on-disk chunk size, so
      // floor-dividing the query rect's corners by that size and stepping by
      // it visits exactly the on-disk grid cells the query can overlap.
      const gx0 = Math.floor(qx0 / onDiskWidth) * onDiskWidth;
      const gx1 = Math.floor(qx1 / onDiskWidth) * onDiskWidth;
      const gy0 = Math.floor(qy0 / onDiskHeight) * onDiskHeight;
      const gy1 = Math.floor(qy1 / onDiskHeight) * onDiskHeight;

      let out: Uint32Array | null = null;
      for (let gy = gy0; gy <= gy1; gy += onDiskHeight) {
        for (let gx = gx0; gx <= gx1; gx += onDiskWidth) {
          const chunk = index.get(`${gx},${gy}`);
          if (!chunk) continue;

          const ix0 = Math.max(qx0, gx);
          const ix1 = Math.min(qx1, gx + onDiskWidth - 1);
          const iy0 = Math.max(qy0, gy);
          const iy1 = Math.min(qy1, gy + onDiskHeight - 1);

          for (let ty = iy0; ty <= iy1; ty++) {
            for (let tx = ix0; tx <= ix1; tx++) {
              const rawGid = chunk.data[(ty - gy) * onDiskWidth + (tx - gx)];
              if (rawGid === undefined || rawGid === 0) continue; // sparse hole, or empty cell

              const resolved = resolveGid(rawGid, tiledTilesets, indexToRuntime);
              if (!resolved) continue; // empty cell, or tileset was skipped (no atlas image)

              out ??= new Uint32Array(chunkWidth * chunkHeight);
              const tilesetIndex = runtimeLayer.tilesets.indexOf(resolved.tileset);
              out[(ty - qy0) * chunkWidth + (tx - qx0)] = packTile(tilesetIndex, resolved.localTileId, resolved.transform);
            }
          }
        }
      }

      return out === null ? null : { width: chunkWidth, height: chunkHeight, tiles: out };
    },
  };
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
    drawOrder: layer.drawOrder,
    objects,
    properties: convertProperties(layer.properties),
  });
}

/**
 * Convert one `TiledObject` to a `TileMapObject`. Tile objects whose tileset
 * was skipped are dropped — returns `null`.
 */
function convertObject(
  object: TiledObject,
  tiledTilesets: readonly TiledTileset[],
  indexToRuntime: ReadonlyArray<TileSet | null>,
): TileMapObject | null {
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

  if (object.text) {
    const t = object.text;
    const color = t.color !== undefined ? parseTiledColor(t.color) : undefined;
    const textStyle: TextStyle = {
      text: t.text,
      ...(color !== undefined && { color }),
      ...(t.fontfamily !== undefined && { fontFamily: t.fontfamily }),
      ...(t.pixelsize !== undefined && { pixelSize: t.pixelsize }),
      ...(t.bold !== undefined && { bold: t.bold }),
      ...(t.italic !== undefined && { italic: t.italic }),
      ...(t.underline !== undefined && { underline: t.underline }),
      ...(t.strikeout !== undefined && { strikeout: t.strikeout }),
      ...(t.wrap !== undefined && { wrap: t.wrap }),
      ...(t.halign !== undefined && { halign: t.halign }),
      ...(t.valign !== undefined && { valign: t.valign }),
    };
    return { ...base, kind: 'text', text: textStyle };
  }

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
 * Parse a Tiled colour string (`#RRGGBB` or `#AARRGGBB`) into a `0xRRGGBB`
 * integer, dropping any alpha. Returns `null` for an absent or malformed value.
 */
function parseTiledColor(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const hex = value.startsWith('#') ? value.slice(1) : value;
  let rrggbb: string;
  if (hex.length === 8) {
    rrggbb = hex.slice(2); // drop leading alpha
  } else if (hex.length === 6) {
    rrggbb = hex;
  } else {
    return null;
  }
  const parsed = Number.parseInt(rrggbb, 16);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Build runtime {@link TileDefinition}s from a Tiled tileset's per-tile data,
 * carrying over per-tile properties, animation frames, and collision shapes
 * (the tile's `objectgroup`). Tiles whose `id` is out of range, and animation
 * frames referencing out-of-range local ids, are skipped so the runtime tileset
 * never receives malformed definitions.
 */
function buildTileDefinitions(tiles: readonly TiledTileData[], tileCount: number): TileDefinition[] {
  const defs: TileDefinition[] = [];
  for (const tile of tiles) {
    if (tile.id < 0 || tile.id >= tileCount) continue;

    const properties = tile.properties ? convertProperties(tile.properties) : undefined;
    const hasProps = properties !== undefined && Object.keys(properties).length > 0;

    let animation: readonly TileAnimationFrame[] | undefined;
    if (tile.animation && tile.animation.length > 0) {
      const frames = tile.animation
        .filter(frame => frame.tileid >= 0 && frame.tileid < tileCount)
        .map(frame => ({ localTileId: frame.tileid, duration: frame.duration }));
      if (frames.length > 0) animation = frames;
    }

    let collision: readonly TileMapObject[] | undefined;
    if (tile.objectgroup && tile.objectgroup.objects.length > 0) {
      const shapes = tile.objectgroup.objects
        .map(obj => convertCollisionObject(obj))
        .filter((obj): obj is TileMapObject => obj !== null);
      if (shapes.length > 0) collision = shapes;
    }

    if (!hasProps && animation === undefined && collision === undefined) continue;

    defs.push({
      localTileId: tile.id,
      ...(hasProps && { properties }),
      ...(animation !== undefined && { animation }),
      ...(collision !== undefined && { collision }),
    });
  }
  return defs;
}

/**
 * Convert a raw `TiledObjectData` to a runtime `TileMapObject` for use as a
 * per-tile collision shape. Text objects and tile-object (gid) references are
 * dropped — returns `null`. Does not perform GID resolution; collision shapes
 * in tile objectgroups are almost exclusively plain geometry.
 */
function convertCollisionObject(obj: TiledObjectData): TileMapObject | null {
  if (obj.text) return null; // text not representable as a collision shape
  if (obj.gid !== undefined) return null; // tile objects require GID resolution not available here

  const base = {
    id: obj.id,
    name: obj.name,
    type: obj.type,
    x: obj.x,
    y: obj.y,
    width: obj.width,
    height: obj.height,
    rotation: obj.rotation,
    visible: obj.visible,
    properties: convertProperties(obj.properties ?? []),
  };

  if (obj.point === true) return { ...base, kind: 'point' };
  if (obj.ellipse === true) return { ...base, kind: 'ellipse' };
  if (obj.polygon) return { ...base, kind: 'polygon', points: toPoints(obj.polygon) };
  if (obj.polyline) return { ...base, kind: 'polyline', points: toPoints(obj.polyline) };
  return { ...base, kind: 'rectangle' };
}

/**
 * Project Tiled custom properties to the generic flat property bag.
 * `object`-typed properties become a {@link TilePropertyKind.ObjectRef}
 * (the wire value is already the referenced object's numeric id — Tiled has
 * no LDtk-style navigation fields, so those stay `undefined`). `class`-typed
 * properties recursively convert their nested member bag into a
 * {@link TileProperties}.
 */
function convertProperties(properties: readonly TiledPropertyData[]): TileProperties {
  if (properties.length === 0) return Object.freeze({});
  const out: Record<string, TilePropertyValue> = {};
  for (const property of properties) {
    const value = convertPropertyValue(property);
    if (value !== undefined) {
      out[property.name] = value;
    }
  }
  return Object.freeze(out);
}

/** Convert one {@link TiledPropertyData} to its canonical {@link TilePropertyValue}. */
function convertPropertyValue(property: TiledPropertyData): TilePropertyValue | undefined {
  switch (property.type) {
    case 'string':
    case 'int':
    case 'float':
    case 'bool':
    case 'color':
    case 'file':
      return property.value;

    case 'object':
      return { kind: TilePropertyKind.ObjectRef, id: property.value as number };

    case 'class':
      return convertClassPropertyValue(property.value as TiledClassPropertyValueData, property.propertytype);

    default: {
      // Exhaustiveness check: if a new TiledPropertyType is ever added,
      // `property.type` will fail to narrow to `never` here and tsc will error.
      const _exhaustive: never = property.type;
      void _exhaustive;
      throw new Error(`convertProperties: unrecognised Tiled property type "${property.type as string}".`);
    }
  }
}

/**
 * Reserved key under which a `class`-typed property's Tiled custom-class name
 * ({@link TiledPropertyData.propertytype}, e.g. `"Stats"`) is stored inside the
 * converted nested {@link TileProperties} bag, mirroring the `ldtkUid`/
 * `ldtkWorldIid`-style reserved-metadata-key convention used by the LDtk
 * adapter (`packages/exojs-ldtk/src/ldtkToTileMap.ts`). Only set on the
 * top-level converted bag for a class-typed property that has a
 * `propertytype` — nested-class members carry no `propertytype` of their own
 * in Tiled's data model, so recursive calls never set it.
 */
const tiledClassNameProperty = 'tiledClassName';

/**
 * Recursively convert a `class`-typed property's nested member bag into a
 * {@link TileProperties}. Scalar members pass through; nested-class members
 * recurse (Tiled classes may nest arbitrarily deep). When `propertytype` is
 * given (the Tiled custom-class name), it is tagged onto the bag under the
 * reserved {@link tiledClassNameProperty} key, applied last so it can never
 * be clobbered by a same-named member.
 */
function convertClassPropertyValue(value: TiledClassPropertyValueData, propertytype?: string): TileProperties {
  const out: Record<string, TilePropertyValue> = {};
  for (const [name, member] of Object.entries(value)) {
    out[name] =
      typeof member === 'string' || typeof member === 'number' || typeof member === 'boolean'
        ? member
        : convertClassPropertyValue(member);
  }
  if (propertytype !== undefined) {
    out[tiledClassNameProperty] = propertytype;
  }
  return Object.freeze(out);
}

function sortAndValidateTilesetRanges(tilesets: readonly TiledTileset[], source: string): readonly TiledTileset[] {
  const sorted = [...tilesets].sort((a, b) => a.firstGid - b.firstGid);

  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (previous === undefined || current === undefined) continue;

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
    if (layer === undefined) continue;
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
    if (gid === undefined) continue;

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
          const chunk = layer.chunks[c];
          if (chunk === undefined) continue;
          checkGidArray(chunk.data, map, source, `${layerPath}.chunks[${c}].data`);
        }
      }
    } else if (layer instanceof TiledObjectLayer) {
      for (let o = 0; o < layer.objects.length; o++) {
        const object = layer.objects[o];
        if (object === undefined) continue;
        const gid = object.gid;

        // gid 0 (after masking the flip bits) is the empty-cell sentinel, the
        // same as in tile-layer data — accept it as "no tile" instead of
        // rejecting it as uncovered.
        if (gid !== undefined && maskTiledGid(gid) !== 0 && map.findTilesetForGid(gid) === undefined) {
          throw new TiledFormatError(source, `${layerPath}.objects[${o}].gid`, `gid ${gid} (masked: ${maskTiledGid(gid)}) is not covered by any tileset`);
        }
      }
    }
  });
}
