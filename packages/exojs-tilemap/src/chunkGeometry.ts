import type { Texture } from '@codexo/exojs';

import type { ReadonlyTileChunk } from './TileChunk';
import type { TileProjection } from './TileProjection';
import type { TileSet } from './TileSet';
import type { TileTransform } from './types';
import { unpackTile } from './types';

/**
 * One textured tile quad in chunk-local pixel space.
 *
 * `u0/v0/u1/v1` are the raw (min/max) source UV bounds of the tile within its
 * tileset texture - flip/orientation is **not** baked here; it travels in
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
 * Geometry sharing one tileset texture. Orthogonal chunks group tiles by
 * tileset; isometric chunks keep consecutive runs to preserve painter order.
 * @internal
 */
export interface ChunkPage {
  /** The tileset all quads in this page draw from. */
  readonly tileset: TileSet;
  /** The underlying GPU texture (the tileset's atlas), bound once per page. */
  readonly texture: Texture;
  /** The tile quads in deterministic projection-specific draw order. */
  readonly quads: readonly TileQuad[];
}

/** Pack a {@link TileTransform} into a 3-bit orientation code. @internal */
export const orientCode = (transform: TileTransform): number =>
  (transform.flipX ? 1 : 0) | (transform.flipY ? 2 : 0) | (transform.diagonal ? 4 : 0);

// Test/perf-only instrumentation: counts CPU chunk-geometry rebuilds. A rebuild
// happens once per {@link buildChunkPages} call - i.e. when a chunk node sees a
// changed `chunk.revision`. Lets benchmarks/regression tests assert that a camera
// pan rebuilds nothing and a single tile mutation rebuilds exactly one chunk.
// Near-zero cost (one integer increment on the already-expensive rebuild path).
let tileGeometryRebuildCount = 0;

/** Read the cumulative chunk-geometry rebuild count. @internal */
export const getTileGeometryRebuildCount = (): number => tileGeometryRebuildCount;

/** Reset the chunk-geometry rebuild counter (call before a measured frame). @internal */
export const resetTileGeometryRebuildCount = (): void => {
  tileGeometryRebuildCount = 0;
};

const drawableTileset = (tilesets: readonly TileSet[], tilesetIndex: number, localTileId: number): TileSet | undefined => {
  const tileset = tilesets[tilesetIndex];

  // getTileRect throws for an invalid id; malformed cells must remain empty.
  if (tileset === undefined || localTileId >= tileset.tileCount) {
    return undefined;
  }

  const texture = tileset.texture.texture;

  if (texture.width <= 0 || texture.height <= 0) {
    return undefined;
  }

  return tileset;
};

const pageQuads = (tileset: TileSet, isometric: boolean, buckets: Map<TileSet, TileQuad[]>, ordered: ChunkPage[]): TileQuad[] => {
  let bucket: TileQuad[] | undefined;

  if (isometric) {
    const previous = ordered[ordered.length - 1];

    if (previous?.tileset === tileset) {
      bucket = previous.quads as TileQuad[];
    }
  } else {
    bucket = buckets.get(tileset);
  }

  if (bucket === undefined) {
    bucket = [];
    buckets.set(tileset, bucket);

    if (isometric) {
      ordered.push({ tileset, texture: tileset.texture.texture, quads: bucket });
    }
  }

  return bucket;
};

const tilesetPages = (tilesets: readonly TileSet[], buckets: ReadonlyMap<TileSet, TileQuad[]>): ChunkPage[] => {
  const pages: ChunkPage[] = [];

  for (const tileset of tilesets) {
    const quads = buckets.get(tileset);

    if (quads !== undefined && quads.length > 0) {
      pages.push({ tileset, texture: tileset.texture.texture, quads });
    }
  }

  return pages;
};

/**
 * Build per-tileset page geometry for a single chunk.
 *
 * Iterates packed cells in row-major or isometric diagonal order, skipping
 * empties, out-of-range tilesets, and out-of-range local tile ids (all treated
 * as empty - this is the renderer's half of the G-GID contract). Each surviving
 * cell is resolved to its source UV rect (from `tileset.getTileRect` + the
 * tileset `TextureRegion`) and a chunk-local destination rect (bottom-left
 * aligned per Tiled orthogonal semantics, so tilesets whose tiles are taller
 * than the map grid extend upward).
 *
 * Allocation happens here only - the result is cached on the owning
 * {@link import('./TileChunkNode').TileChunkNode} keyed by `chunk.revision`, so
 * unchanged chunks never rebuild and the per-frame path stays allocation-free.
 *
 * @param chunk      The readonly chunk view to build from.
 * @param tilesets   The layer's tileset array (packed `tilesetIndex` selects one).
 * @param tileWidth  Map/layer tile cell width in pixels.
 * @param tileHeight Map/layer tile cell height in pixels.
 * @internal
 */
export const buildChunkPages = (
  chunk: ReadonlyTileChunk,
  tilesets: readonly TileSet[],
  tileWidth: number,
  tileHeight: number,
  projection?: TileProjection,
  diagonal?: number,
  geometryX = 0,
  geometryY = 0,
): ChunkPage[] => {
  tileGeometryRebuildCount++;

  if (chunk.empty) {
    return [];
  }

  const buckets = new Map<TileSet, TileQuad[]>();
  const ordered: ChunkPage[] = [];
  const isometric = projection?.orientation === 'isometric';
  const width = chunk.width;
  const height = chunk.height;

  for (let row = 0; row < (isometric ? width + height - 1 : height); row++) {
    if (diagonal !== undefined && row !== diagonal) {
      continue;
    }

    for (let lx = 0; lx < width; lx++) {
      const ly = isometric ? row - lx : row;

      if (ly < 0 || ly >= height) {
        continue;
      }

      const packed = chunk.getRawAt(lx, ly);

      if (packed === 0) {
        continue;
      }

      const decoded = unpackTile(packed);

      if (decoded === null) {
        continue;
      }

      const tileset = drawableTileset(tilesets, decoded.tilesetIndex, decoded.localTileId);

      if (tileset === undefined) {
        continue;
      }

      const region = tileset.texture;
      const texture = region.texture;
      const textureWidth = texture.width;
      const textureHeight = texture.height;

      const rect = tileset.getTileRect(decoded.localTileId);

      // Absolute source pixel rect = tileset-region offset + in-atlas tile rect.
      const sx = region.x + rect.x;
      const sy = region.y + rect.y;
      // Exact tile UVs, no half-texel inset. This assumes NEAREST filtering on
      // the tileset atlas (the typical pixel-art case). Under LINEAR/mipmap
      // filtering an atlas WITHOUT extrusion padding can bleed neighbouring
      // tiles at the edges; author tilesets with extruded margins for linear
      // sampling. (Extrusion-aware tilemap UV insetting - already done on the
      // NineSlice/RepeatingSprite geometry paths - is a v0.14 follow-up.)
      const u0 = sx / textureWidth;
      const v0 = sy / textureHeight;
      const u1 = (sx + rect.width) / textureWidth;
      const v1 = (sy + rect.height) / textureHeight;

      // Isometric cells start at their top vertex; artwork is bottom-aligned
      // with the cell base before applying the tileset's display offset.
      const x0 = geometryX + (isometric ? ((lx - ly) * tileWidth) / 2 - tileWidth / 2 : lx * tileWidth) + tileset.offsetX;
      const y0 = geometryY + (isometric ? ((lx + ly) * tileHeight) / 2 : ly * tileHeight) + tileHeight - rect.height + tileset.offsetY;
      const x1 = x0 + rect.width;
      const y1 = y0 + rect.height;

      const bucket = pageQuads(tileset, isometric, buckets, ordered);
      bucket.push({ x0, y0, x1, y1, u0, v0, u1, v1, orient: orientCode(decoded.transform) });
    }
  }

  return isometric ? ordered : tilesetPages(tilesets, buckets);
};
