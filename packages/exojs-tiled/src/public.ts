// Side-effect-free public API for @codexo/exojs-tiled.
// No registration is performed on import.

export type { AssetBinding, AssetHandler, AssetLoadRequest, Extension } from '@codexo/exojs/extensions';
export { type TiledLoadOptions } from './tiledOptions';

// ── Runtime facade (re-exports from @codexo/exojs-tilemap) ─────────────────
// These are re-exports of the *same* module bindings — `instanceof TileMap`
// holds whether the class was imported from @codexo/exojs-tilemap or here.
export {
  TileLayer,
  TileLayerNode,
  TileMap,
  TileMapBand,
  TileMapNode,
  TileMapView,
  TileSet,
  tilemapExtension,
  TILE_TRANSFORM_IDENTITY,
} from '@codexo/exojs-tilemap';
export type {
  ChunkCoord,
  PackedTile,
  ReadonlyTileChunk,
  ResolvedTile,
  TileDefinition,
  TileLayerNodeOptions,
  TileLayerOptions,
  TileLayerSelector,
  TileMapBandDefinition,
  TileMapNodeOptions,
  TileMapOptions,
  TileMapViewOptions,
  TileProperties,
  TilePropertyValue,
  TileSetOptions,
  TileTransform,
} from '@codexo/exojs-tilemap';

export { tiledExtension } from './tiledExtension';
export { tiledMapBinding } from './tiledMapBinding';
export { tiledRuntimeMapBinding } from './tiledRuntimeMapBinding';

export type { TiledBuildInfo } from './tiledBuildInfo';
export { tiledBuildInfo } from './tiledBuildInfo';

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
} from './data';

// ── Parsed source model ─────────────────────────────────────────────────────
export { TiledMap } from './TiledMap';
export { TiledObject } from './TiledObject';
export {
  createTiledLayer,
  TiledGroupLayer,
  TiledImageLayer,
  TiledLayer,
  TiledObjectLayer,
  TiledTileLayer,
} from './TiledLayer';
export type { TiledLayerType } from './TiledLayer';
export { TiledTileset } from './TiledTileset';
export type { TiledTilesetResources } from './TiledTileset';

// ── Validation ───────────────────────────────────────────────────────────────
export { TiledFormatError } from './validate';

// ── Module augmentation — typed load calls ───────────────────────────────────
import type { TileMap } from '@codexo/exojs-tilemap';
import type { TiledMap } from './TiledMap';

declare module '@codexo/exojs' {
  interface ExtensionTypeMap {
    /** `.tmj` path-only loads resolve to the generic runtime {@link TileMap}. */
    tmj: TileMap;
  }
  interface ExtensionTokenTypeMap {
    /** The advanced parsed-source token is also accepted for `.tmj`: `load(TiledMap, 'world.tmj')`. */
    tmj: TiledMap;
  }
  interface AssetDefinitions {
    tileMap: {
      resource: TileMap;
      config: { source: string; format?: 'tiled'; strict?: boolean };
    };
    tiledMap: {
      resource: TiledMap;
      config: { source: string; format?: 'tiled'; strict?: boolean };
    };
  }
}
