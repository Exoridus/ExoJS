// Side-effect-free public API for @codexo/exojs-ldtk.
// No registration is performed on import.

// ── Extension wiring ──────────────────────────────────────────────────────────
export { ldtkMapBinding } from './ldtkBinding';
export { ldtkExtension } from './ldtkExtension';

// ── Parsed source model ───────────────────────────────────────────────────────
export { LdtkMap } from './LdtkMap';
export type { LdtkToTileMapOptions } from './ldtkToTileMap';
export { ldtkToTileMap } from './ldtkToTileMap';

// ── Raw LDtk JSON types ───────────────────────────────────────────────────────
export type {
  LdtkData,
  LdtkDefs,
  LdtkEntityInstance,
  LdtkFieldInstance,
  LdtkIntGridValueDef,
  LdtkLayerDef,
  LdtkLayerInstance,
  LdtkLayerType,
  LdtkLevel,
  LdtkTileData,
  LdtkTilesetDef,
} from './LdtkData';
export {
  LDTK_FLIP_NONE,
  LDTK_FLIP_X,
  LDTK_FLIP_XY,
  LDTK_FLIP_Y,
} from './LdtkData';

// ── Runtime facade (re-exports from @codexo/exojs-tilemap) ───────────────────
// These re-export the *same* module bindings — `instanceof TileMap` holds
// whether the class was imported from @codexo/exojs-tilemap or here.
export type {
  ChunkCoord,
  EllipseObject,
  ObjectLayerOptions,
  ObjectPoint,
  ObjectQuery,
  ObjectSchema,
  PackedTile,
  PointObject,
  PolygonObject,
  PolylineObject,
  ReadonlyTileChunk,
  RectangleObject,
  ResolvedTile,
  TileDefinition,
  TileLayerOptions,
  TileMapObject,
  TileMapObjectKind,
  TileMapOptions,
  TileMapViewOptions,
  TileObject,
  TileProperties,
  TilePropertyValue,
  TileSetOptions,
  TileTransform,
} from '@codexo/exojs-tilemap';
export {
  ObjectKind,
  ObjectLayer,
  TILE_TRANSFORM_IDENTITY,
  TileLayer,
  TileMap,
  tilemapExtension,
  TileMapView,
  TileSet,
} from '@codexo/exojs-tilemap';

// ── Module augmentation — typed load calls ────────────────────────────────────
import type { LdtkMap } from './LdtkMap';

declare module '@codexo/exojs' {
  interface ExtensionTypeMap {
    /** `.ldtk` path-only loads resolve to {@link LdtkMap}. */
    ldtk: LdtkMap;
  }
  interface AssetDefinitions {
    ldtkMap: {
      resource: LdtkMap;
      config: { source: string };
    };
  }
}
