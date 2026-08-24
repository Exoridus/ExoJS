// Side-effect-free public API for @codexo/exojs-ldtk.
// No registration is performed on import.

// ── Extension wiring ──────────────────────────────────────────────────────────
export { ldtkMapBinding, ldtkProjectBinding } from './ldtkBinding';
export { ldtkExtension } from './ldtkExtension';

// ── Parsed source model ───────────────────────────────────────────────────────
export { LdtkMap } from './LdtkMap';
export type { LdtkRuntimeOptions } from './LdtkProject';
export { LdtkProject } from './LdtkProject';
export { ldtkToMapWorld } from './ldtkToMapWorld';
export type { LdtkToTileMapOptions } from './ldtkToTileMap';
export {
  createLdtkIntGridCellSource,
  getLdtkIntGridValueAt,
  ldtkIntGridCsvProperty,
  ldtkIntGridValuesProperty,
  ldtkToTileMap,
} from './ldtkToTileMap';

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
  LdtkLevelNeighbour,
  LdtkTileData,
  LdtkTilesetDef,
  LdtkWorldData,
  LdtkWorldLayout,
} from './LdtkData';
export { LDTK_FLIP_NONE, LDTK_FLIP_X, LDTK_FLIP_XY, LDTK_FLIP_Y } from './LdtkData';

// ── Validation ────────────────────────────────────────────────────────────────
export { LdtkFormatError } from './validate';

// ── Runtime facade (re-exports from @codexo/exojs-tilemap) ───────────────────
// These re-export the *same* module bindings - `instanceof TileMap` holds
// whether the class was imported from @codexo/exojs-tilemap or here.
export type {
  ChunkCoord,
  EllipseObject,
  MapBounds,
  MapLevel,
  MapLevelLoadContext,
  MapLevelLoadOptions,
  MapLevelNeighbour,
  MapLevelProvider,
  MapObjectDescriptor,
  MapObjectFactories,
  MapObjectFactory,
  MapObjectSpawnerOptions,
  MapSpawnErrorReason,
  MapSpawnOptions,
  MapWorldOptions,
  MapWorldRuntimeOptions,
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
  TilePropertyObjectRef,
  TilePropertyPoint,
  TilePropertyTileRef,
  TilePropertyValue,
  TileSetOptions,
  TileTransform,
  UnknownMapObjectPolicy,
} from '@codexo/exojs-tilemap';
export {
  MapLevelRuntime,
  MapLevelSide,
  mapObjectDescriptor,
  mapObjectDescriptors,
  MapObjectSpawner,
  MapSpawnError,
  MapSpawnSession,
  MapWorld,
  MapWorldRuntime,
  ObjectKind,
  ObjectLayer,
  TILE_TRANSFORM_IDENTITY,
  TileLayer,
  TileMap,
  tilemapExtension,
  TileMapView,
  TilePropertyKind,
  TileSet,
} from '@codexo/exojs-tilemap';

// ── Module augmentation - typed load calls ────────────────────────────────────
import type { LdtkMap } from './LdtkMap';
import type { LdtkProject } from './LdtkProject';

declare module '@codexo/exojs' {
  interface ExtensionKindMap {
    /** `.ldtk` bare-path loads resolve to the `ldtkMap` type ({@link LdtkMap}). */
    ldtk: 'ldtkMap';
  }
  interface AssetDefinitions {
    ldtkProject: {
      resource: LdtkProject;
      config: { source: string };
      /** See `ldtkMap` - `ldtkProjectBinding` ships no seamless adapter either. */
      isValue: true;
    };
    ldtkMap: {
      resource: LdtkMap;
      config: { source: string };
      // No `seamless` adapter on `ldtkMapBinding`, so `defineAsset` defaults
      // this to a value type: its leaf is an `AssetRef<LdtkMap>`.
      isValue: true;
    };
  }
}
