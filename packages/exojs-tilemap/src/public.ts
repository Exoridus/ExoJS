// Side-effect-free public API for @codexo/exojs-tilemap.
// No registration is performed on import.

export type { Extension } from '@codexo/exojs/extensions';
export { tilemapExtension } from './tilemapExtension';
// The mutable TileChunk implementation is package-internal —
// only the ReadonlyTileChunk interface is exported publicly.
export type { ReadonlyTileChunk } from './TileChunk';
export { TileLayer } from './TileLayer';
export type { TileLayerOptions } from './TileLayer';
export { TileMap } from './TileMap';
export type { TileMapOptions } from './TileMap';
export { TileSet } from './TileSet';
export type { TileSetOptions } from './TileSet';
// Scene/rendering nodes (advanced). The per-chunk drawable and the
// per-backend renderers stay package-internal.
export { TileMapNode } from './TileMapNode';
export type { TileMapNodeOptions } from './TileMapNode';
export { TileLayerNode } from './TileLayerNode';
export type { TileLayerNodeOptions } from './TileLayerNode';
// Layer composition: independently placeable bands/layer nodes for actor
// interleaving. `TileMapView` is a helper (not a scene node); `TileMapBand`
// is a Container of tile-layer nodes.
export { TileMapView } from './TileMapView';
export type {
  TileLayerSelector,
  TileMapBandDefinition,
  TileMapViewOptions,
} from './TileMapView';
export { TileMapBand } from './TileMapBand';
export type {
  ChunkCoord,
  PackedTile,
  ResolvedTile,
  TileDefinition,
  TileProperties,
  TilePropertyValue,
  TileTransform,
} from './types';
export {
  TILE_TRANSFORM_IDENTITY,
  tileToChunkCoord,
  tileToLocalInChunk,
} from './types';
