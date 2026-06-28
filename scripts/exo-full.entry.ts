// Full-bundle entry — bundles core + all extension packages into a single IIFE.
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

// ── Tilemap (base) — tiled + ldtk re-export the same runtime symbols;
//    only import once here to avoid duplicate named exports. ──────────────────
export * from '@codexo/exojs-tilemap';

// ── Physics ────────────────────────────────────────────────────────────────────
export * from '@codexo/exojs-physics';

// ── Aseprite ──────────────────────────────────────────────────────────────────
export * from '@codexo/exojs-aseprite';

// ── Tiled ─────────────────────────────────────────────────────────────────────
// Unique value exports only — tilemap runtime classes (TileMap, TileSet, …)
// are already exported from exojs-tilemap above. Note: TiledMap / TiledLayer /
// TiledObjectLayer are the *parsed source model* classes (distinct from the
// runtime TileMap / TileLayer / ObjectLayer from tilemap).
export {
  createTiledLayer,
  tiledBuildInfo,
  tiledExtension,
  tiledMapBinding,
  tiledRuntimeMapBinding,
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
// Unique value exports only — tilemap runtime classes already exported above.
export { ldtkExtension, ldtkFlipNone, ldtkFlipX, ldtkFlipXy, ldtkFlipY, ldtkMapBinding, LdtkMap, ldtkToTileMap } from '@codexo/exojs-ldtk';
