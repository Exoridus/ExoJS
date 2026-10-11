import type { Texture, TextureRegion } from '@codexo/exojs';

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
 * Geometry sharing one texture. Orthogonal chunks of atlas tiles group tiles
 * by texture; isometric chunks, and chunks holding image-collection tiles,
 * keep consecutive runs to preserve draw order.
 * @internal
 */
export interface ChunkPage {
  /** The tileset the first quad of this page draws from. */
  readonly tileset: TileSet;
  /** The underlying GPU texture (an atlas or one collection image), bound once per page. */
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

interface DrawableCell {
  readonly decoded: NonNullable<ReturnType<typeof unpackTile>>;
  readonly tileset: TileSet;
  readonly region: TextureRegion;
}

/** The tile a packed cell draws, or `null` when the cell must stay empty. */
const drawableCell = (packed: number, tilesets: readonly TileSet[]): DrawableCell | null => {
  const decoded = packed === 0 ? null : unpackTile(packed);

  if (decoded === null) {
    return null;
  }

  const tileset = tilesets[decoded.tilesetIndex];
  // getTileRect throws for an invalid id; malformed cells must remain empty.
  const region = tileset?.getTileTexture(decoded.localTileId) ?? null;

  if (tileset === undefined || region === null || region.texture.width <= 0 || region.texture.height <= 0) {
    return null;
  }

  return { decoded, tileset, region };
};

const pageQuads = (
  tileset: TileSet,
  texture: Texture,
  ordered: boolean,
  buckets: Map<Texture, ChunkPage>,
  runs: ChunkPage[],
): TileQuad[] => {
  if (ordered) {
    const previous = runs[runs.length - 1];

    if (previous?.texture === texture) {
      return previous.quads as TileQuad[];
    }

    const page: ChunkPage = { tileset, texture, quads: [] };

    runs.push(page);

    return page.quads as TileQuad[];
  }

  let page = buckets.get(texture);

  if (page === undefined) {
    page = { tileset, texture, quads: [] };
    buckets.set(texture, page);
  }

  return page.quads as TileQuad[];
};

/** Atlas pages in the layer's tileset order, so overlapping tiles keep a stable stacking. */
const atlasPages = (tilesets: readonly TileSet[], buckets: ReadonlyMap<Texture, ChunkPage>): ChunkPage[] => {
  const pages: ChunkPage[] = [];

  for (const tileset of tilesets) {
    const page = tileset.texture === null ? undefined : buckets.get(tileset.texture.texture);

    if (page !== undefined && page.quads.length > 0 && !pages.includes(page)) {
      pages.push(page);
    }
  }

  return pages;
};

/**
 * Collection images differ in size and usually overhang their cells, so they
 * must be drawn in cell order like Tiled does; bucketing them by texture would
 * restack every overlap.
 */
const hasImageCollection = (tilesets: readonly TileSet[]): boolean => tilesets.some(tileset => tileset.tileImages !== null);

/**
 * Local cells of a chunk in draw order, as flat `lx, ly` pairs: row-major for
 * orthogonal grids, by diagonal for isometric ones, and by band for staggered
 * and hexagonal ones (see {@link TileProjection._band}). With `band` set, only
 * that diagonal or band is listed.
 */
const cellOrder = (
  width: number,
  height: number,
  projection: TileProjection | undefined,
  band: number | undefined,
  firstTileX: number,
  firstTileY: number,
): number[] => {
  const cells: number[] = [];

  if (projection?.staggered === true) {
    const passes = projection.staggerAxis === 'x' ? 2 : 1;

    for (let ly = 0; ly < height; ly++) {
      for (let pass = 0; pass < passes; pass++) {
        if (band !== undefined && band !== ly * passes + pass) {
          continue;
        }

        for (let lx = 0; lx < width; lx++) {
          if (projection._band(firstTileX + lx, firstTileY + ly) - (firstTileY + ly) * passes === pass) {
            cells.push(lx, ly);
          }
        }
      }
    }

    return cells;
  }

  const isometric = projection?.orientation === 'isometric';

  for (let row = 0; row < (isometric ? width + height - 1 : height); row++) {
    if (band !== undefined && row !== band) {
      continue;
    }

    for (let lx = 0; lx < width; lx++) {
      const ly = isometric ? row - lx : row;

      if (ly >= 0 && ly < height) {
        cells.push(lx, ly);
      }
    }
  }

  return cells;
};

/**
 * Build per-tileset page geometry for a single chunk.
 *
 * Iterates packed cells in draw order (see {@link cellOrder}), skipping
 * empties, out-of-range tilesets, and out-of-range local tile ids (all treated
 * as empty - this is the renderer's half of the G-GID contract). Each surviving
 * cell is resolved to its source UV rect (from `tileset.getTileRect` + the
 * tileset `TextureRegion`) and a chunk-local destination rect (bottom-left
 * aligned per Tiled semantics, so tilesets whose tiles are taller than the map
 * grid extend upward).
 *
 * Allocation happens here only - the result is cached on the owning
 * {@link import('./TileChunkNode').TileChunkNode} keyed by `chunk.revision`, so
 * unchanged chunks never rebuild and the per-frame path stays allocation-free.
 *
 * @param chunk      The readonly chunk view to build from.
 * @param tilesets   The layer's tileset array (packed `tilesetIndex` selects one).
 * @param tileWidth  Map/layer tile cell width in pixels.
 * @param tileHeight Map/layer tile cell height in pixels.
 * @param band       Isometric diagonal, or staggered/hexagonal band, to build alone.
 * @param firstTileX Grid column of the chunk's first cell; staggered and hexagonal
 *                   cells are placed absolutely, relative to the projection origin.
 * @param firstTileY Grid row of the chunk's first cell.
 * @internal
 */
export const buildChunkPages = (
  chunk: ReadonlyTileChunk,
  tilesets: readonly TileSet[],
  tileWidth: number,
  tileHeight: number,
  projection?: TileProjection,
  band?: number,
  geometryX = 0,
  geometryY = 0,
  firstTileX = 0,
  firstTileY = 0,
): ChunkPage[] => {
  tileGeometryRebuildCount++;

  if (chunk.empty) {
    return [];
  }

  const buckets = new Map<Texture, ChunkPage>();
  const runs: ChunkPage[] = [];
  const isometric = projection?.orientation === 'isometric';
  const staggered = projection?.staggered === true;
  const ordered = isometric || staggered || hasImageCollection(tilesets);
  const cells = cellOrder(chunk.width, chunk.height, projection, band, firstTileX, firstTileY);
  // Artwork bottom-aligns on the cell box, which staggered and hexagonal grids round to even pixels.
  const cellHeight = projection?._cellHeight ?? tileHeight;

  for (let i = 0; i < cells.length; i += 2) {
    const lx = cells[i]!;
    const ly = cells[i + 1]!;
    const cell = drawableCell(chunk.getRawAt(lx, ly), tilesets);

    if (cell === null) {
      continue;
    }

    const { decoded, tileset, region } = cell;
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

    // Cell top-left before bottom alignment: isometric cells start at their
    // top vertex, staggered and hexagonal cells at their bounding box corner.
    let cellX: number;
    let cellY: number;

    if (staggered) {
      const origin = projection.tileToPixel(firstTileX + lx, firstTileY + ly);

      cellX = origin.x - projection.originX;
      cellY = origin.y - projection.originY;
    } else {
      cellX = geometryX + (isometric ? ((lx - ly) * tileWidth) / 2 - tileWidth / 2 : lx * tileWidth);
      cellY = geometryY + (isometric ? ((lx + ly) * tileHeight) / 2 : ly * tileHeight);
    }

    const x0 = cellX + tileset.offsetX;
    const y0 = cellY + cellHeight - rect.height + tileset.offsetY;
    const x1 = x0 + rect.width;
    const y1 = y0 + rect.height;

    const bucket = pageQuads(tileset, texture, ordered, buckets, runs);
    bucket.push({ x0, y0, x1, y1, u0, v0, u1, v1, orient: orientCode(decoded.transform) });
  }

  return ordered ? runs : atlasPages(tilesets, buckets);
};
