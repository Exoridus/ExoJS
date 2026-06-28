import type { Texture } from '@codexo/exojs';

import type { ReadonlyTileChunk } from './TileChunk';
import type { TileSet } from './TileSet';
import type { TileTransform } from './types';
import { unpackTile } from './types';

/**
 * One textured tile quad in chunk-local pixel space.
 *
 * `u0/v0/u1/v1` are the raw (min/max) source UV bounds of the tile within its
 * tileset texture — flip/orientation is **not** baked here; it travels in
 * {@link TileQuad.orient} and is applied by the per-backend renderer (flipX/Y
 * via UV-corner swap, diagonal via an axis swap in the shader). Keeping the
 * geometry orientation-neutral lets both backends share one CPU builder.
 * @internal
 */
export interface TileQuad {
  /** Local destination rect, left/top (chunk-local pixels). */
  readonly x0: number;
  readonly y0: number;
  /** Local destination rect, right/bottom (chunk-local pixels). */
  readonly x1: number;
  readonly y1: number;
  /** Normalised source UV bounds (always min ≤ max). */
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
  /** Orientation code: bit0 = flipX, bit1 = flipY, bit2 = diagonal. */
  readonly orient: number;
}

/**
 * Geometry for one tileset "page" within a chunk: every tile in the chunk that
 * draws from a single tileset texture, grouped so the renderer can batch by
 * `(shader, texture)`.
 * @internal
 */
export interface ChunkPage {
  /** The tileset all quads in this page draw from. */
  readonly tileset: TileSet;
  /** The underlying GPU texture (the tileset's atlas), bound once per page. */
  readonly texture: Texture;
  /** The tile quads for this page, in deterministic row-major order. */
  readonly quads: readonly TileQuad[];
}

/** Pack a {@link TileTransform} into a 3-bit orientation code. @internal */
export function orientCode(transform: TileTransform): number {
  return (transform.flipX ? 1 : 0) | (transform.flipY ? 2 : 0) | (transform.diagonal ? 4 : 0);
}

// Test/perf-only instrumentation: counts CPU chunk-geometry rebuilds. A rebuild
// happens once per {@link buildChunkPages} call — i.e. when a chunk node sees a
// changed `chunk.revision`. Lets benchmarks/regression tests assert that a camera
// pan rebuilds nothing and a single tile mutation rebuilds exactly one chunk.
// Near-zero cost (one integer increment on the already-expensive rebuild path).
let tileGeometryRebuildCount = 0;

/** Read the cumulative chunk-geometry rebuild count. @internal */
export function getTileGeometryRebuildCount(): number {
  return tileGeometryRebuildCount;
}

/** Reset the chunk-geometry rebuild counter (call before a measured frame). @internal */
export function resetTileGeometryRebuildCount(): void {
  tileGeometryRebuildCount = 0;
}

/**
 * Build per-tileset page geometry for a single chunk.
 *
 * Iterates the chunk's packed cells in deterministic row-major order, skipping
 * empties, out-of-range tilesets, and out-of-range local tile ids (all treated
 * as empty — this is the renderer's half of the G-GID contract). Each surviving
 * cell is resolved to its source UV rect (from `tileset.getTileRect` + the
 * tileset `TextureRegion`) and a chunk-local destination rect (bottom-left
 * aligned per Tiled orthogonal semantics, so tilesets whose tiles are taller
 * than the map grid extend upward).
 *
 * Allocation happens here only — the result is cached on the owning
 * {@link import('./TileChunkNode').TileChunkNode} keyed by `chunk.revision`, so
 * unchanged chunks never rebuild and the per-frame path stays allocation-free.
 *
 * @param chunk      The readonly chunk view to build from.
 * @param tilesets   The layer's tileset array (packed `tilesetIndex` selects one).
 * @param tileWidth  Map/layer tile cell width in pixels.
 * @param tileHeight Map/layer tile cell height in pixels.
 * @internal
 */
export function buildChunkPages(
  chunk: ReadonlyTileChunk,
  tilesets: readonly TileSet[],
  tileWidth: number,
  tileHeight: number,
): ChunkPage[] {
  tileGeometryRebuildCount++;

  if (chunk.empty) {
    return [];
  }

  const buckets = new Map<TileSet, TileQuad[]>();
  const width = chunk.width;
  const height = chunk.height;

  for (let ly = 0; ly < height; ly++) {
    for (let lx = 0; lx < width; lx++) {
      const packed = chunk.getRawAt(lx, ly);

      if (packed === 0) {
        continue;
      }

      const decoded = unpackTile(packed);

      if (decoded === null) {
        continue;
      }

      const tileset = tilesets[decoded.tilesetIndex];

      // Out-of-range tileset or local id → treat as empty (G-GID). getTileRect
      // throws on an out-of-range id, so the bounds check must precede it.
      if (tileset === undefined || decoded.localTileId >= tileset.tileCount) {
        continue;
      }

      const region = tileset.texture;
      const texture = region.texture;
      const textureWidth = texture.width;
      const textureHeight = texture.height;

      if (textureWidth <= 0 || textureHeight <= 0) {
        continue;
      }

      const rect = tileset.getTileRect(decoded.localTileId);

      // Absolute source pixel rect = tileset-region offset + in-atlas tile rect.
      const sx = region.x + rect.x;
      const sy = region.y + rect.y;
      // Exact tile UVs, no half-texel inset. This assumes NEAREST filtering on
      // the tileset atlas (the typical pixel-art case). Under LINEAR/mipmap
      // filtering an atlas WITHOUT extrusion padding can bleed neighbouring
      // tiles at the edges; author tilesets with extruded margins for linear
      // sampling. (Extrusion-aware tilemap UV insetting — already done on the
      // NineSlice/RepeatingSprite geometry paths — is a v0.14 follow-up.)
      const u0 = sx / textureWidth;
      const v0 = sy / textureHeight;
      const u1 = (sx + rect.width) / textureWidth;
      const v1 = (sy + rect.height) / textureHeight;

      // Bottom-left aligned destination (Tiled orthogonal). Uniform tiles
      // (rect.height === tileHeight) collapse to a plain cell rect. The
      // tileset's visual draw offset (Tiled `tileoffset`) shifts every tile.
      const x0 = lx * tileWidth + tileset.offsetX;
      const y0 = ly * tileHeight + tileHeight - rect.height + tileset.offsetY;
      const x1 = x0 + rect.width;
      const y1 = y0 + rect.height;

      let bucket = buckets.get(tileset);

      if (bucket === undefined) {
        bucket = [];
        buckets.set(tileset, bucket);
      }

      bucket.push({ x0, y0, x1, y1, u0, v0, u1, v1, orient: orientCode(decoded.transform) });
    }
  }

  // Emit pages in tileset-array order for deterministic, reproducible builds.
  const pages: ChunkPage[] = [];

  for (const tileset of tilesets) {
    const quads = buckets.get(tileset);

    if (quads !== undefined && quads.length > 0) {
      pages.push({ tileset, texture: tileset.texture.texture, quads });
    }
  }

  return pages;
}
