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
 * by texture, followed by consecutive runs of the tiles whose overlaps need
 * cell order; isometric chunks, and chunks holding image-collection tiles, keep
 * consecutive runs to preserve draw order.
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
 * How far tile artwork can reach past its cell on each side, in pixels.
 * @internal
 */
export interface ArtworkReach {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The reach of a tileset's largest tile, with its tile offset, past a bottom-left anchored cell. */
const tilesetReach = (tileset: TileSet, cellWidth: number, cellHeight: number): ArtworkReach => {
  let width = tileset.tileWidth;
  let height = tileset.tileHeight;

  for (const image of tileset.tileImages ?? []) {
    if (image !== null) {
      width = Math.max(width, image.width);
      height = Math.max(height, image.height);
    }
  }

  return {
    left: Math.max(0, -tileset.offsetX),
    top: Math.max(0, height - cellHeight - tileset.offsetY),
    right: Math.max(0, tileset.offsetX + width - cellWidth),
    bottom: Math.max(0, tileset.offsetY),
  };
};

/**
 * The furthest any tile of `tilesets` can reach past an orthogonal cell.
 * @internal
 */
export const artworkReach = (tilesets: readonly TileSet[], cellWidth: number, cellHeight: number): ArtworkReach => {
  let left = 0;
  let top = 0;
  let right = 0;
  let bottom = 0;

  for (const tileset of tilesets) {
    const reach = tilesetReach(tileset, cellWidth, cellHeight);

    left = Math.max(left, reach.left);
    top = Math.max(top, reach.top);
    right = Math.max(right, reach.right);
    bottom = Math.max(bottom, reach.bottom);
  }

  return { left, top, right, bottom };
};

/**
 * Whether drawing whole orthogonal chunks in row-major chunk order can stack two
 * tiles differently from Tiled's row-by-row order.
 *
 * Chunk rows never share a grid row, so only two chunks of the same chunk row can
 * disagree with Tiled: a tile `a` in the left chunk drawn in a later row than a
 * tile `b` in the right chunk. They overlap only when `a` reaches right or `b`
 * reaches left, and `a` reaches up or `b` reaches down - so artwork that reaches
 * only sideways, or only up and down, keeps the whole-chunk order exact however
 * far it reaches.
 * @internal
 */
export const needsRowOrder = (tilesets: readonly TileSet[], cellWidth: number, cellHeight: number): boolean => {
  let right = false;
  let left = false;
  let up = false;
  let down = false;

  for (const tileset of tilesets) {
    const reach = tilesetReach(tileset, cellWidth, cellHeight);

    if ((reach.right > 0 && reach.top > 0) || (reach.left > 0 && reach.bottom > 0)) {
      return true;
    }

    right ||= reach.right > 0;
    left ||= reach.left > 0;
    up ||= reach.top > 0;
    down ||= reach.bottom > 0;
  }

  return (right && down) || (left && up);
};

/**
 * Collection images differ in size and usually overhang their cells, so they
 * must be drawn in cell order like Tiled does; bucketing them by texture would
 * restack every overlap.
 */
const hasImageCollection = (tilesets: readonly TileSet[]): boolean => tilesets.some(tileset => tileset.tileImages !== null);

/**
 * Decides, cell by cell in draw order, which atlas tiles of an orthogonal chunk
 * must keep their cell order: a tile overhanging its cell, and a tile under an
 * overhang drawn before it. Every other tile overlaps nothing drawn before it in
 * the chunk, so it can batch by texture ahead of them. Pixel rects are relative
 * to the chunk's first cell.
 */
const cellOrderTracker = (
  width: number,
  height: number,
  cellWidth: number,
  cellHeight: number,
): ((lx: number, ly: number, x0: number, y0: number, x1: number, y1: number) => boolean) => {
  let covered: Uint8Array | null = null;

  return (lx, ly, x0, y0, x1, y1) => {
    const left = lx * cellWidth;
    const top = ly * cellHeight;

    if (x0 >= left && y0 >= top && x1 <= left + cellWidth && y1 <= top + cellHeight) {
      return covered !== null && covered[ly * width + lx] === 1;
    }

    covered ??= new Uint8Array(width * height);

    const lastX = Math.min(width - 1, Math.ceil(x1 / cellWidth) - 1);
    const lastY = Math.min(height - 1, Math.ceil(y1 / cellHeight) - 1);

    for (let y = Math.max(0, Math.floor(y0 / cellHeight)); y <= lastY; y++) {
      for (let x = Math.max(0, Math.floor(x0 / cellWidth)); x <= lastX; x++) {
        covered[y * width + x] = 1;
      }
    }

    return true;
  };
};

/**
 * Local cells of a chunk in draw order, as flat `lx, ly` pairs: row-major for
 * orthogonal grids, by diagonal for isometric ones, and by band for staggered
 * and hexagonal ones (see {@link TileProjection._band}). With `band` set, only
 * that diagonal, band, or row is listed.
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
 * @param band       Isometric diagonal, staggered/hexagonal band, or orthogonal row to build alone.
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
  const keepsCellOrder = ordered ? null : cellOrderTracker(chunk.width, chunk.height, tileWidth, tileHeight);
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

    const inOrder =
      keepsCellOrder === null ? ordered : keepsCellOrder(lx, ly, x0 - geometryX, y0 - geometryY, x1 - geometryX, y1 - geometryY);

    const bucket = pageQuads(tileset, texture, inOrder, buckets, runs);
    bucket.push({ x0, y0, x1, y1, u0, v0, u1, v1, orient: orientCode(decoded.transform) });
  }

  return ordered ? runs : [...atlasPages(tilesets, buckets), ...runs];
};
