// Side-effect-free public API for @codexo/exojs-tilemap.
// No registration is performed on import.

export type { Extension } from '@codexo/exojs/extensions';
export { tilemapExtension } from './tilemapExtension';
export { TileChunk } from './TileChunk';
export { TileLayer } from './TileLayer';
export type { TileLayerOptions } from './TileLayer';
export { TileMap } from './TileMap';
export type { TileMapOptions } from './TileMap';
export { TileSet } from './TileSet';
export type { TileSetOptions } from './TileSet';
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
  packTile,
  tileToChunkCoord,
  tileToLocalInChunk,
  tileTransformLabel,
  unpackTile,
} from './types';
