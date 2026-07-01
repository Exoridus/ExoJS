/**
 * TypeScript types for the LDtk JSON format (version 1.5.x).
 *
 * These interfaces model the root LDtk JSON document as produced by the LDtk
 * level editor. Only the fields consumed by the ExoJS runtime adapter are
 * declared here; unknown fields are not stripped at parse time.
 *
 * @see https://ldtk.io/json/
 */

/* eslint-disable @typescript-eslint/naming-convention -- LDtk uses __ prefix for runtime fields */

import type { TilePropertyPoint, TilePropertyTileRef } from '@codexo/exojs-tilemap';

// ── Tile data ─────────────────────────────────────────────────────────────────

/** Flip-bit constants for {@link LdtkTileData.f}. */
export const ldtkFlipNone = 0;
export const ldtkFlipX = 1;
export const ldtkFlipY = 2;
export const ldtkFlipXy = 3;

/** A single tile placed in a Tiles or AutoLayer layer instance. */
export interface LdtkTileData {
  /** Pixel position `[x, y]` of this tile within the layer. */
  readonly px: readonly [number, number];
  /** Source position `[x, y]` in the tileset image (top-left of the tile). */
  readonly src: readonly [number, number];
  /**
   * Flip bits: `0` = none, `1` = flipX, `2` = flipY, `3` = flipX + flipY.
   * Use {@link LDTK_FLIP_X} / {@link LDTK_FLIP_Y} constants for clarity.
   */
  readonly f: number;
  /** Local tile index in the owning tileset. */
  readonly t: number;
  /** Per-tile opacity in `[0, 1]`. Defaults to `1` when absent. */
  readonly a?: number;
}

// ── Entity data ───────────────────────────────────────────────────────────────

/**
 * LDtk field types whose `__value` is a bare scalar (or `null`, when the
 * field has no value set).
 */
export type LdtkFieldScalarType =
  | 'Int'
  | 'Float'
  | 'Bool'
  | 'String'
  | 'Multilines'
  | 'Color'
  | 'FilePath'
  | 'Enum';

/**
 * Raw `__value` shape for a `Point`-typed field. Structurally identical to
 * {@link TilePropertyPoint} minus its `kind` tag, so the canonical shape is
 * reused directly rather than duplicated.
 */
export type LdtkFieldPointValue = Omit<TilePropertyPoint, 'kind'>;

/**
 * Raw `__value` shape for an `EntityRef`-typed field: the referenced
 * entity's own iid plus LDtk's navigation context (owning layer/level/world).
 * Maps to {@link import('@codexo/exojs-tilemap').TilePropertyObjectRef} —
 * `entityIid` becomes `id`.
 */
export interface LdtkFieldEntityRefValue {
  readonly entityIid: string;
  readonly layerIid: string;
  readonly levelIid: string;
  readonly worldIid: string;
}

/**
 * Raw `__value` shape for a `Tile`-typed field. Structurally identical to
 * {@link TilePropertyTileRef} minus its `kind` tag, so the canonical shape is
 * reused directly rather than duplicated.
 */
export type LdtkFieldTileValue = Omit<TilePropertyTileRef, 'kind'>;

/**
 * A field value on an entity or level instance, discriminated by `__type`.
 * `Array<T>` fields (e.g. `Array<Int>`, `Array<Point>`) carry a raw element
 * array whose per-element shape matches the corresponding non-array
 * `__value` shape above; see {@link import('./ldtkToTileMap').ldtkToTileMap}'s
 * field conversion for the exhaustive mapping into the canonical
 * {@link import('@codexo/exojs-tilemap').TilePropertyValue}.
 */
export type LdtkFieldInstance =
  | {
      readonly __identifier: string;
      readonly __type: LdtkFieldScalarType;
      readonly __value: string | number | boolean | null;
    }
  | {
      readonly __identifier: string;
      readonly __type: 'Point';
      readonly __value: LdtkFieldPointValue | null;
    }
  | {
      readonly __identifier: string;
      readonly __type: 'EntityRef';
      readonly __value: LdtkFieldEntityRefValue | null;
    }
  | {
      readonly __identifier: string;
      readonly __type: 'Tile';
      readonly __value: LdtkFieldTileValue | null;
    }
  | {
      readonly __identifier: string;
      readonly __type: `Array<${string}>`;
      readonly __value: readonly unknown[] | null;
    };

/** An entity instance placed in an Entities layer. */
export interface LdtkEntityInstance {
  /** Entity definition identifier (class name). */
  readonly __identifier: string;
  /** Alias of `__identifier`, mirrors the entity definition type. */
  readonly __type: string;
  /**
   * Pixel position `[x, y]` of the entity's pivot-adjusted anchor — NOT the
   * top-left corner. Combine with {@link __pivot} to recover the bounding
   * box's top-left corner: `topLeftX = px[0] - width * __pivot[0]`.
   */
  readonly px: readonly [number, number];
  readonly width: number;
  readonly height: number;
  /**
   * Normalised `[x, y]` anchor point within the entity's bounding box, each
   * in `[0, 1]`. `[0, 0]` = top-left, `[0.5, 0.5]` = center, `[1, 1]` =
   * bottom-right. Determines how {@link px} relates to the bounding box.
   */
  readonly __pivot: readonly [number, number];
  readonly fieldInstances: readonly LdtkFieldInstance[];
  /** Globally unique instance id (UUID string). */
  readonly iid: string;
  /** UID of the entity definition this instance was created from. */
  readonly defUid: number;
}

// ── Layer instances ───────────────────────────────────────────────────────────

/** Discriminant string for a layer instance type. */
export type LdtkLayerType = 'Tiles' | 'IntGrid' | 'Entities' | 'AutoLayer';

/** A layer instance within a level. */
export interface LdtkLayerInstance {
  /** Layer definition identifier. */
  readonly __identifier: string;
  /** Layer type discriminant. */
  readonly __type: LdtkLayerType;
  /** Layer width in grid cells. */
  readonly __cWid: number;
  /** Layer height in grid cells. */
  readonly __cHei: number;
  /** Grid / tile size in pixels. */
  readonly __gridSize: number;
  /** UID of the layer definition. */
  readonly layerDefUid: number;
  /** UID of the parent level. */
  readonly levelId: number;
  readonly visible: boolean;
  /** Globally unique instance id (UUID string). */
  readonly iid: string;
  /**
   * UID of the tileset used by this layer.
   * Present for `Tiles`, `AutoLayer`, and `IntGrid` layers that use a tileset.
   */
  readonly __tilesetDefUid?: number;
  /** Placed tiles for `Tiles` layer type. */
  readonly gridTiles?: readonly LdtkTileData[];
  /** Auto-computed tiles for `AutoLayer` (and `IntGrid` + auto-rules) layer types. */
  readonly autoLayerTiles?: readonly LdtkTileData[];
  /** Entity instances for `Entities` layer type. */
  readonly entityInstances?: readonly LdtkEntityInstance[];
  /**
   * Flat CSV array of IntGrid values for `IntGrid` layer type.
   * Index = `y * __cWid + x`. `0` = empty cell.
   */
  readonly intGridCsv?: readonly number[];
  /** Horizontal pixel offset applied to the layer. */
  readonly pxOffsetX?: number;
  /** Vertical pixel offset applied to the layer. */
  readonly pxOffsetY?: number;
  /** Layer opacity in `[0, 1]`. */
  readonly opacity?: number;
}

// ── Levels ────────────────────────────────────────────────────────────────────

/** A level in the LDtk world. */
export interface LdtkLevel {
  /** Human-readable level identifier (unique within the world). */
  readonly identifier: string;
  readonly uid: number;
  /** Globally unique instance id (UUID string). */
  readonly iid: string;
  /** World-space X position of the level's top-left corner in pixels. */
  readonly worldX: number;
  /** World-space Y position of the level's top-left corner in pixels. */
  readonly worldY: number;
  /** Level width in pixels. */
  readonly pxWid: number;
  /** Level height in pixels. */
  readonly pxHei: number;
  readonly bgColor?: string;
  /**
   * Layer instances in this level (top-to-bottom render order).
   * `null` when the level is stored in a separate `.ldtkl` file and has not
   * been loaded yet.
   */
  readonly layerInstances: readonly LdtkLayerInstance[] | null;
  readonly fieldInstances?: readonly LdtkFieldInstance[];
  /** Relative path to an external `.ldtkl` file for multi-world setups. */
  readonly externalRelPath?: string;
}

// ── Worlds ────────────────────────────────────────────────────────────────────

/**
 * How a {@link LdtkWorldData}'s levels are spatially organised. `null` is a
 * valid LDtk value (unset), same as the other nullable enum-ish fields in
 * this file.
 */
export type LdtkWorldLayout = 'Free' | 'GridVania' | 'LinearHorizontal' | 'LinearVertical' | null;

/**
 * A single world in a multi-world LDtk project (`root.worlds[]`, populated
 * when the project has "Multi-Worlds" enabled in its advanced settings).
 * Each world owns its own {@link levels}; `defs` (tilesets/layers/entity
 * definitions) is declared once at the document root and shared by every
 * world rather than duplicated per-world — see {@link LdtkData.defs}.
 */
export interface LdtkWorldData {
  /** Human-readable world identifier (unique within the project). */
  readonly identifier: string;
  /** Globally unique instance id (UUID string). */
  readonly iid: string;
  /** Width of the world grid in pixels. */
  readonly worldGridWidth: number;
  /** Height of the world grid in pixels. */
  readonly worldGridHeight: number;
  /** How this world's levels are spatially organised. */
  readonly worldLayout: LdtkWorldLayout;
  /** Levels belonging to this world, in document order. */
  readonly levels: readonly LdtkLevel[];
}

// ── Definitions ───────────────────────────────────────────────────────────────

/** Tileset definition from `defs.tilesets`. */
export interface LdtkTilesetDef {
  readonly uid: number;
  /** Human-readable tileset identifier. */
  readonly identifier: string;
  /**
   * Relative path to the tileset atlas image.
   * `null` for internal / embedded tilesets with no image.
   */
  readonly relPath: string | null;
  /** Tile grid size (both width and height) in pixels. */
  readonly tileGridSize: number;
  /** Tileset image width in pixels. */
  readonly pxWid: number;
  /** Tileset image height in pixels. */
  readonly pxHei: number;
  /** Pixel spacing between tiles in the atlas. */
  readonly spacing?: number;
  /** Pixel padding (margin) around the atlas edges. */
  readonly padding?: number;
}

/** An IntGrid value definition (maps a raw int to a named, coloured entry). */
export interface LdtkIntGridValueDef {
  readonly value: number;
  readonly identifier: string | null;
  readonly color: string;
}

/** Layer definition from `defs.layers`. */
export interface LdtkLayerDef {
  readonly uid: number;
  readonly identifier: string;
  readonly type: LdtkLayerType;
  /** UID of the default tileset for this layer. `null` or absent = none. */
  readonly tilesetDefUid?: number | null;
  readonly gridSize: number;
  readonly intGridValues?: readonly LdtkIntGridValueDef[];
}

/** Top-level definitions block (`defs`). */
export interface LdtkDefs {
  readonly tilesets: readonly LdtkTilesetDef[];
  readonly layers: readonly LdtkLayerDef[];
}

// ── Root document ─────────────────────────────────────────────────────────────

/** Root LDtk JSON document (`*.ldtk`). */
export interface LdtkData {
  /** LDtk JSON format version string (e.g. `"1.5.3"`). */
  readonly jsonVersion: string;
  readonly worldGridWidth?: number;
  readonly worldGridHeight?: number;
  readonly defaultGridSize?: number;
  readonly bgColor?: string;
  readonly defs: LdtkDefs;
  /**
   * Levels not organised into worlds. Always populated for pre-multi-world
   * documents; kept EMPTY (per the LDtk spec's backward-compatibility rule)
   * when {@link worlds} is used instead — read levels via `worlds[].levels`
   * in that case, or use {@link import('./ldtkLevelEntries').getLdtkLevelEntries}
   * (or simply {@link import('./LdtkMap').LdtkMap.levels} /
   * {@link import('./LdtkMap').LdtkMap.getLevelByName}) to get "all levels,
   * in order" regardless of which shape the document uses.
   */
  readonly levels: readonly LdtkLevel[];
  /**
   * Worlds, present and non-empty only when the project has "Multi-Worlds"
   * enabled in its advanced settings. Absent or empty for the (overwhelmingly
   * common) single-world case, in which levels live directly in the root
   * {@link levels} array instead. `defs` is NOT duplicated per-world — it
   * stays declared once at the document root regardless of this field.
   */
  readonly worlds?: readonly LdtkWorldData[];
}
