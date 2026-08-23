// Full-bundle entry - bundles core + all extension packages into a single IIFE.
// Global name: Exo (i.e. window.Exo after a <script> tag).
//
// Extension packages that re-export tilemap runtime classes (tiled, ldtk) are
// listed with explicit named exports only, so that the tilemap runtime symbols
// appear exactly once in the bundle (from exojs-tilemap below).

// ── Core ──────────────────────────────────────────────────────────────────────
export * from '@codexo/exojs';

// ── Particles ──────────────────────────────────────────────────────────────────
export * from '@codexo/exojs-particles';

// ── Audio FX ──────────────────────────────────────────────────────────────────
export * from '@codexo/exojs-audio-fx';

// ── Tilemap (base) - value exports only. The package's object-layer
// `TextStyle` interface collides with core's runtime `TextStyle` class, while
// type-only exports do not exist on the IIFE global. Tiled + LDtk also
// re-export these runtime symbols, so import them exactly once here. ──────────
export {
  autoTile,
  buildTileCollisionGeometry,
  ChunkStreamer,
  createSampledChunkSource,
  createWorkerSampledChunkSource,
  ImageLayer,
  ImageLayerNode,
  ObjectKind,
  ObjectLayer,
  packTile,
  refreshCell,
  TILE_TRANSFORM_IDENTITY,
  TileAnimator,
  TileLayer,
  TileLayerNode,
  TileMap,
  TileMapBand,
  TileMapNode,
  TileMapView,
  TilePropertyKind,
  TileSet,
  tilemapExtension,
  tileToChunkCoord,
  tileToLocalInChunk,
  unpackTile,
  WangSet,
} from '@codexo/exojs-tilemap';

// ── Physics ────────────────────────────────────────────────────────────────────
export * from '@codexo/exojs-physics';

// ── Aseprite ──────────────────────────────────────────────────────────────────
export * from '@codexo/exojs-aseprite';

// ── Tiled ─────────────────────────────────────────────────────────────────────
// Unique value exports only - tilemap runtime classes (TileMap, TileSet, ...)
// are already exported from exojs-tilemap above. Note: TiledMap / TiledLayer /
// TiledObjectLayer are the *parsed source model* classes (distinct from the
// runtime TileMap / TileLayer / ObjectLayer from tilemap).
export {
  createTiledLayer,
  tiledBuildInfo,
  tiledExtension,
  tiledRuntimeMapBinding,
  tiledSourceBinding,
  TiledFormatError,
  TiledGroupLayer,
  TiledImageLayer,
  TiledLayer,
  TiledMap,
  TiledObject,
  TiledObjectLayer,
  TiledTileLayer,
  TiledTileset,
} from '@codexo/exojs-tiled';

// ── LDtk ──────────────────────────────────────────────────────────────────────
// Unique value exports only - tilemap runtime classes already exported above.
export {
  LDTK_FLIP_NONE,
  LDTK_FLIP_X,
  LDTK_FLIP_XY,
  LDTK_FLIP_Y,
  ldtkExtension,
  LdtkFormatError,
  ldtkMapBinding,
  LdtkMap,
  ldtkToTileMap,
} from '@codexo/exojs-ldtk';

// ── Tilemap physics bridge ────────────────────────────────────────────────────
export { buildObjectLayerColliders, TileColliderStreamer } from '@codexo/exojs-tilemap-physics';
