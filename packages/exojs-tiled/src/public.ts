// Side-effect-free public API for @codexo/exojs-tiled.
// No registration is performed on import.

export type { AssetBinding, AssetHandler, AssetLoadRequest, Extension } from '@codexo/exojs/extensions';

export { tiledExtension } from './tiledExtension';
export { tiledMapBinding } from './tiledMapBinding';

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
