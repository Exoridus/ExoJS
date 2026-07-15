// Side-effect-free public API for @codexo/exojs-tilemap.
// No registration is performed on import.

export { tilemapExtension } from './tilemapExtension';
export type { Extension } from '@codexo/exojs/extensions';
// Image layers: data-only background/foreground images from Tiled image layers.
export type { ImageLayerOptions } from './ImageLayer';
export { ImageLayer } from './ImageLayer';
// Object layers: data-only spawn points / triggers / collision regions.
export type {
  EllipseObject,
  ObjectLayerOptions,
  ObjectPoint,
  ObjectQuery,
  ObjectSchema,
  PointObject,
  PolygonObject,
  PolylineObject,
  RectangleObject,
  TextObject,
  TextStyle,
  TileMapObject,
  TileMapObjectKind,
  TileObject,
  TypedObject,
} from './ObjectLayer';
export { ObjectKind, ObjectLayer } from './ObjectLayer';
// The mutable TileChunk implementation is package-internal —
// only the ReadonlyTileChunk interface is exported publicly.
export type { ReadonlyTileChunk } from './TileChunk';
export type { ChunkRange, TileLayerOptions } from './TileLayer';
export { TileLayer } from './TileLayer';
export type { TileMapOptions } from './TileMap';
export { TileMap } from './TileMap';
export type { TileSetOptions } from './TileSet';
export { TileSet } from './TileSet';
// Scene/rendering nodes (advanced). The per-chunk drawable and the
// per-backend renderers stay package-internal.
export type { TileLayerNodeOptions } from './TileLayerNode';
export { TileLayerNode } from './TileLayerNode';
export type { TileMapNodeOptions } from './TileMapNode';
export { TileMapNode } from './TileMapNode';
// Layer composition: independently placeable bands/layer nodes for actor
// interleaving. `TileMapView` is a helper (not a scene node); `TileMapBand`
// is a Container of tile-layer nodes.
export { TileMapBand } from './TileMapBand';
export type {
  TileLayerSelector,
  TileMapBandDefinition,
  TileMapViewOptions,
} from './TileMapView';
export { TileMapView } from './TileMapView';
export type {
  ChunkCoord,
  PackedTile,
  ResolvedTile,
  TileAnimationFrame,
  TileDefinition,
  TileProperties,
  TilePropertyObjectRef,
  TilePropertyPoint,
  TilePropertyTileRef,
  TilePropertyValue,
  TileTransform,
} from './types';
export {
  TILE_TRANSFORM_IDENTITY,
  TilePropertyKind,
  tileToChunkCoord,
  tileToLocalInChunk,
} from './types';
// Per-tile animation driver (RPG-Maker-style): advances only animated cells.
export { TileAnimator } from './TileAnimator';
// Wang autotiling: automatic tile selection based on neighbor bitmasks.
export type { AutoTileOptions } from './autoTile';
export { autoTile, refreshCell } from './autoTile';
export type { WangSetOptions } from './WangSet';
export { WangSet } from './WangSet';
