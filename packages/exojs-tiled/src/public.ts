// Side-effect-free public API for @codexo/exojs-tiled.
// No registration is performed on import.

export { type TiledLoadOptions } from './tiledOptions';
export type { AssetEntry, Extension } from '@codexo/exojs/extensions';

// ── Runtime facade (re-exports from @codexo/exojs-tilemap) ─────────────────
// These are re-exports of the *same* module bindings - `instanceof TileMap`
// holds whether the class was imported from @codexo/exojs-tilemap or here.
export type { TiledBuildInfo } from './tiledBuildInfo';
export { tiledBuildInfo } from './tiledBuildInfo';
export { tiledExtension } from './tiledExtension';
export { TiledSourceAssetType, tiledSourceType } from './tiledSourceType';
export { TileMapAssetType, tileMapType } from './tileMapType';
export type {
  ChunkCoord,
  EllipseObject,
  MapBounds,
  MapLevel,
  MapLevelCancelOptions,
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
  PackedTile,
  PointObject,
  PolygonObject,
  PolylineObject,
  ReadonlyTileChunk,
  RectangleObject,
  ResolvedTile,
  TileDefinition,
  TileLayerNodeOptions,
  TileLayerOptions,
  TileLayerSelector,
  TileMapBandDefinition,
  TileMapNodeOptions,
  TileMapObject,
  TileMapObjectKind,
  TileMapOptions,
  TileMapViewOptions,
  TileObject,
  TileProperties,
  TilePropertyValue,
  TileSetOptions,
  TileTransform,
  UnknownMapObjectPolicy,
  WangSetOptions,
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
  ObjectLayer,
  TILE_TRANSFORM_IDENTITY,
  TileLayer,
  TileLayerNode,
  TileMap,
  TileMapBand,
  tilemapExtension,
  TileMapNode,
  TileMapView,
  TileSet,
  WangSet,
} from '@codexo/exojs-tilemap';

// ── Raw Tiled JSON (TMJ/TSJ) types ──────────────────────────────────────────
export type {
  TiledAnimationFrameData,
  TiledChunkData,
  TiledClassPropertyValueData,
  TiledEmbeddedTilesetRefData,
  TiledExternalTilesetRefData,
  TiledGroupLayerData,
  TiledImageLayerData,
  TiledLayerData,
  TiledLayerDataBase,
  TiledMapData,
  TiledObjectAlignment,
  TiledObjectData,
  TiledObjectLayerData,
  TiledOrientation,
  TiledPointData,
  TiledPropertyData,
  TiledPropertyType,
  TiledRenderOrder,
  TiledTextData,
  TiledTileData,
  TiledTileLayerData,
  TiledTilesetData,
  TiledTilesetRefData,
  TiledWangColorData,
  TiledWangSetData,
  TiledWangTileData,
} from './data';

// ── Parsed source model ─────────────────────────────────────────────────────
export type { TiledLayerType } from './TiledLayer';
export {
  createTiledLayer,
  TiledGroupLayer,
  TiledImageLayer,
  TiledLayer,
  TiledObjectLayer,
  TiledTileLayer,
} from './TiledLayer';
export { TiledMap } from './TiledMap';
export { TiledObject } from './TiledObject';
export type { TiledTilesetResources } from './TiledTileset';
export { TiledTileset } from './TiledTileset';

// ── Tile-object anchoring ─────────────────────────────────────────────────────
export type { TiledResolvedObjectAlignment } from './objectAlignment';
export { resolveTiledObjectAlignment, TILED_OBJECT_ALIGNMENTS, tiledObjectAnchorOffset } from './objectAlignment';

// ── Wangset conversion ────────────────────────────────────────────────────────
export { tiledWangSetToWangSet } from './wangSets';

// ── Validation ───────────────────────────────────────────────────────────────
export { TiledFormatError } from './validate';

// ── Module augmentation - typed load calls ───────────────────────────────────
import type { TileMap } from '@codexo/exojs-tilemap';

import type { TiledMap } from './TiledMap';

declare module '@codexo/exojs' {
  interface ExtensionKindMap {
    /** `.tmj` bare-path loads resolve to the generic runtime `tileMap` type ({@link TileMap}). */
    tmj: 'tileMap';
  }
  interface AssetDefinitions {
    tileMap: {
      resource: TileMap;
      config: { source: string; format?: 'tiled' };
      // `tileMapType` keeps the default leaf, so its catalog handle is an
      // `AssetRef<TileMap>` rather than the map itself.
      isValue: true;
    };
    tiledSource: {
      resource: TiledMap;
      config: { source: string; format?: 'tiled' };
      /** See `tileMap` - `tiledSourceType` keeps the default leaf too. */
      isValue: true;
    };
  }
}
