/**
 * TypeScript types for the LDtk JSON format (version 1.5.x).
 *
 * These interfaces model the root LDtk JSON document as produced by the LDtk
 * level editor. Only the fields consumed by the ExoJS runtime adapter are
 * declared here; unknown fields are not stripped at parse time.
 *
 * @see https://ldtk.io/json/
 */

// ── Tile data ─────────────────────────────────────────────────────────────────

/** Flip-bit constants for {@link LdtkTileData.f}. */
export const LDTK_FLIP_NONE = 0;
export const LDTK_FLIP_X = 1;
export const LDTK_FLIP_Y = 2;
export const LDTK_FLIP_XY = 3;

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

/** A field value on an entity or level instance. */
export interface LdtkFieldInstance {
  readonly __identifier: string;
  readonly __type: string;
  readonly __value: unknown;
}

/** An entity instance placed in an Entities layer. */
export interface LdtkEntityInstance {
  /** Entity definition identifier (class name). */
  readonly __identifier: string;
  /** Alias of `__identifier`, mirrors the entity definition type. */
  readonly __type: string;
  /** Pixel position `[x, y]` of the entity origin. */
  readonly px: readonly [number, number];
  readonly width: number;
  readonly height: number;
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
  readonly levels: readonly LdtkLevel[];
}
