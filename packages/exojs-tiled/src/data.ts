// Raw Tiled JSON (TMJ/TSJ) interfaces — type-only mirrors of the on-disk
// format. These types describe exactly what `JSON.parse` can produce for a
// Tiled map/tileset file; they carry no behaviour and are never Loader
// tokens. Parsed, validated runtime classes (TiledMap, TiledTileset,
// TiledLayer, TiledObject, ...) live alongside this module and are built
// from these shapes by `validate.ts` / `loadTiledMap.ts`.
//
// Field coverage targets the orthogonal-map feature set described in the
// v0.13 Tiled phase-2 spec (tile/object/image/group layers, embedded and
// external tilesets, custom properties, tile animations). Hex/isometric-only
// fields (grid, hexsidelength, staggeraxis/-index, transformations, parallax
// origin) are intentionally not modelled. Wangsets (terrain/auto-tile
// definitions) are modelled via {@link TiledWangSetData}.

/** A 2D point as written by Tiled (used for tile offsets and object shapes). */
export interface TiledPointData {
  readonly x: number;
  readonly y: number;
}

// ── Custom properties ──────────────────────────────────────────────────────

/** The `type` discriminant of a Tiled custom property. */
export type TiledPropertyType = 'string' | 'int' | 'float' | 'bool' | 'color' | 'file' | 'object' | 'class';

/**
 * The value of a `class`-typed custom property: a nested map of member name
 * to value, recursively allowing further `class` members.
 */
export interface TiledClassPropertyValueData { readonly [name: string]: string | number | boolean | TiledClassPropertyValueData }

/**
 * One custom property entry as written by Tiled (`properties` arrays on
 * maps, tilesets, tiles, layers and objects).
 *
 * - `string` / `color` / `file` → `value` is a `string`
 * - `int` / `float` / `object` → `value` is a `number` (an `object` value is
 *   the referenced object's id)
 * - `bool` → `value` is a `boolean`
 * - `class` → `value` is a {@link TiledClassPropertyValueData}; `propertytype`
 *   names the class
 */
export interface TiledPropertyData {
  readonly name: string;
  readonly type: TiledPropertyType;
  readonly propertytype?: string | undefined;
  readonly value: string | number | boolean | TiledClassPropertyValueData;
}

// ── Tile animation ──────────────────────────────────────────────────────────

/** One frame of a tile's animation sequence. */
export interface TiledAnimationFrameData {
  /** Local tile id (within the owning tileset) shown during this frame. */
  readonly tileid: number;
  /** Frame duration in milliseconds. */
  readonly duration: number;
}

// ── Per-tile tileset definitions ────────────────────────────────────────────

/**
 * A per-tile definition within a tileset's `tiles` array. Sparse — only
 * tiles carrying metadata (properties, animation, a collision objectgroup,
 * or a collection-of-images source) appear here.
 */
export interface TiledTileData {
  /** Local tile id within the owning tileset. */
  readonly id: number;
  /** Tile class (`class`/`type` field depending on Tiled version). */
  readonly type?: string | undefined;
  readonly properties?: readonly TiledPropertyData[] | undefined;
  readonly animation?: readonly TiledAnimationFrameData[] | undefined;
  /** Per-tile collision shapes, structurally identical to an object layer. */
  readonly objectgroup?: TiledObjectLayerData | undefined;
  /** Collection-of-images tile source, relative to the tileset's location. */
  readonly image?: string | undefined;
  readonly imagewidth?: number | undefined;
  readonly imageheight?: number | undefined;
}

// ── Wangsets (terrains / auto-tile definitions) ───────────────────────────────

/**
 * One color (terrain) entry within a wangset's `colors` array.
 *
 * `tile` is the representative tile local id for this color (–1 if unset).
 * `probability` is the relative spawn weight used by Tiled's random fill.
 */
export interface TiledWangColorData {
  readonly name: string;
  readonly color: string;
  readonly tile: number;
  readonly probability: number;
}

/**
 * One wang-tile entry within a wangset's `wangtiles` array.
 *
 * `tileid` is the local tile id within the owning tileset.
 *
 * `wangid` is an 8-element array of color indices (1-based; 0 = unset) whose
 * positions correspond to (in order): top, top-right, right, bottom-right,
 * bottom, bottom-left, left, top-left.
 */
export interface TiledWangTileData {
  readonly tileid: number;
  readonly wangid: readonly number[];
}

/**
 * A wangset entry within a tileset's `wangsets` array.
 *
 * `type` is `'corner'`, `'edge'`, or `'mixed'` (Tiled 1.5+). Older files may
 * omit it or use other strings — treat unknown values as-is.
 *
 * `tile` is the representative tile local id for this wangset (–1 if unset).
 */
export interface TiledWangSetData {
  readonly name: string;
  readonly type: string;
  readonly tile: number;
  readonly colors: readonly TiledWangColorData[];
  readonly wangtiles: readonly TiledWangTileData[];
  readonly properties?: readonly TiledPropertyData[] | undefined;
}

// ── Tileset ──────────────────────────────────────────────────────────────────

/**
 * A Tiled tileset, as the root of a standalone `.tsj` file or (minus
 * `firstgid`) embedded inline in a map's `tilesets` array.
 */
export interface TiledTilesetData {
  readonly name: string;
  readonly class?: string | undefined;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly tilecount: number;
  readonly columns: number;
  readonly spacing?: number | undefined;
  readonly margin?: number | undefined;
  /** Single-image ("atlas") tileset source, relative to the tileset's location. Absent for collection-of-images tilesets. */
  readonly image?: string | undefined;
  readonly imagewidth?: number | undefined;
  readonly imageheight?: number | undefined;
  readonly tileoffset?: TiledPointData | undefined;
  readonly objectalignment?: string | undefined;
  readonly tiles?: readonly TiledTileData[] | undefined;
  readonly wangsets?: readonly TiledWangSetData[] | undefined;
  readonly properties?: readonly TiledPropertyData[] | undefined;
  readonly tiledversion?: string | undefined;
  readonly version?: string | number | undefined;
}

/** A map's `tilesets[]` entry referencing an external `.tsj` file by relative path. */
export interface TiledExternalTilesetRefData {
  readonly firstgid: number;
  readonly source: string;
}

/** A map's `tilesets[]` entry with the tileset embedded inline. */
export type TiledEmbeddedTilesetRefData = TiledTilesetData & { readonly firstgid: number };

/** One entry of {@link TiledMapData.tilesets} — either external (`source`) or embedded. */
export type TiledTilesetRefData = TiledExternalTilesetRefData | TiledEmbeddedTilesetRefData;

// ── Objects ──────────────────────────────────────────────────────────────────

/** Text rendering options for a `text` object (object layers). */
export interface TiledTextData {
  readonly text: string;
  readonly bold?: boolean | undefined;
  readonly color?: string | undefined;
  readonly fontfamily?: string | undefined;
  readonly halign?: 'center' | 'right' | 'justify' | 'left' | undefined;
  readonly italic?: boolean | undefined;
  readonly kerning?: boolean | undefined;
  readonly pixelsize?: number | undefined;
  readonly strikeout?: boolean | undefined;
  readonly underline?: boolean | undefined;
  readonly valign?: 'center' | 'bottom' | 'top' | undefined;
  readonly wrap?: boolean | undefined;
}

/**
 * An object placed in an object layer (or a tile's collision `objectgroup`).
 * The shape is determined by which of `point` / `ellipse` / `polygon` /
 * `polyline` / `text` / `gid` is present; absent of all of these, the object
 * is a plain rectangle.
 */
export interface TiledObjectData {
  readonly id: number;
  readonly name: string;
  /** Object class (empty string if unset). */
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly visible: boolean;
  /** Tile object reference; may carry flip/rotation flag bits in the high bits. */
  readonly gid?: number | undefined;
  readonly point?: boolean | undefined;
  readonly ellipse?: boolean | undefined;
  readonly polygon?: readonly TiledPointData[] | undefined;
  readonly polyline?: readonly TiledPointData[] | undefined;
  readonly text?: TiledTextData | undefined;
  /** Path to a `.tx` object template this object was instantiated from. */
  readonly template?: string | undefined;
  readonly properties?: readonly TiledPropertyData[] | undefined;
}

// ── Layers ───────────────────────────────────────────────────────────────────

/** Fields shared by every layer type. */
export interface TiledLayerDataBase {
  readonly id: number;
  readonly name: string;
  readonly class?: string | undefined;
  readonly visible: boolean;
  readonly opacity: number;
  readonly x: number;
  readonly y: number;
  readonly offsetx?: number | undefined;
  readonly offsety?: number | undefined;
  readonly parallaxx?: number | undefined;
  readonly parallaxy?: number | undefined;
  readonly tintcolor?: string | undefined;
  readonly properties?: readonly TiledPropertyData[] | undefined;
}

/** A chunk of tile data within an infinite tile layer. */
export interface TiledChunkData {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly data: readonly number[];
}

/**
 * A finite-map tile layer has `data` (a flat, row-major array of GIDs of
 * length `width * height`). An infinite-map tile layer has `chunks` instead.
 */
export interface TiledTileLayerData extends TiledLayerDataBase {
  readonly type: 'tilelayer';
  readonly width: number;
  readonly height: number;
  readonly data?: readonly number[] | undefined;
  readonly chunks?: readonly TiledChunkData[] | undefined;
}

export interface TiledObjectLayerData extends TiledLayerDataBase {
  readonly type: 'objectgroup';
  readonly draworder?: 'topdown' | 'index' | undefined;
  readonly objects: readonly TiledObjectData[];
}

export interface TiledImageLayerData extends TiledLayerDataBase {
  readonly type: 'imagelayer';
  /** Image source, relative to the map's location. Empty string if unset. */
  readonly image: string;
  readonly repeatx?: boolean | undefined;
  readonly repeaty?: boolean | undefined;
}

export interface TiledGroupLayerData extends TiledLayerDataBase {
  readonly type: 'group';
  readonly layers: readonly TiledLayerData[];
}

/** Discriminated union of all four Tiled layer types, keyed by `type`. */
export type TiledLayerData = TiledTileLayerData | TiledObjectLayerData | TiledImageLayerData | TiledGroupLayerData;

// ── Map ──────────────────────────────────────────────────────────────────────

/** The orientation values Tiled may write for a map. */
export type TiledOrientation = 'orthogonal' | 'isometric' | 'staggered' | 'hexagonal';

/** The render-order values Tiled may write for an orthogonal map. */
export type TiledRenderOrder = 'right-down' | 'right-up' | 'left-down' | 'left-up';

/** The root of a `.tmj` map file. */
export interface TiledMapData {
  readonly type: 'map';
  readonly version: string | number;
  readonly tiledversion?: string | undefined;
  readonly class?: string | undefined;
  readonly orientation: TiledOrientation;
  readonly renderorder?: TiledRenderOrder | undefined;
  /** Map width in tiles. */
  readonly width: number;
  /** Map height in tiles. */
  readonly height: number;
  /** Tile grid cell width in pixels. */
  readonly tilewidth: number;
  /** Tile grid cell height in pixels. */
  readonly tileheight: number;
  readonly infinite: boolean;
  readonly compressionlevel?: number | undefined;
  readonly nextlayerid?: number | undefined;
  readonly nextobjectid?: number | undefined;
  readonly backgroundcolor?: string | undefined;
  readonly layers: readonly TiledLayerData[];
  readonly tilesets: readonly TiledTilesetRefData[];
  readonly properties?: readonly TiledPropertyData[] | undefined;
}
