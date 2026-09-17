import type { ReadonlyRectangle } from '@codexo/exojs';

import { type OccluderPlacement, type PlacementMap, placementMap, readPlacement } from './OccluderPlacement';
import type { OccluderSink, OccluderSource } from './OccluderSource';
import { tileBoundarySegments } from './tileBoundary';

/**
 * Tile and block coordinates are packed into one number by this stride, which
 * caps a usable coordinate at about a million cells from the origin - three
 * orders of magnitude beyond any tile map, and cheaper than a string key in a
 * per-frame lookup.
 */
const coordinateStride = 0x100000;

/** One occupied cell of a tile layer, as {@link Occluders.fromTilemap} walks them. */
export interface OccluderTileCell<Tile> {
  readonly tx: number;
  readonly ty: number;
  readonly tile: Tile;
}

/**
 * What {@link Occluders.fromTilemap} needs of a tile layer: its cell metrics,
 * a way to walk the cells of a region, and a revision that changes when the
 * cells do.
 *
 * Structural on purpose, and generic over whatever a layer calls a tile, so
 * `@codexo/exojs-tilemap`'s `TileLayer` satisfies it as it stands while this
 * package depends on neither it nor physics. Anything else that can answer
 * "which cells are occupied around here" works as well.
 */
export interface OccluderTileLayer<Tile> {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** Changes whenever a cell does. Outlines are rebuilt only when it moves, so a streamed chunk arriving is enough. */
  readonly revision: number;
  tilesInRect(x: number, y: number, width: number, height: number): Iterable<OccluderTileCell<Tile>>;
}

/** Tuning for {@link Occluders.fromTilemap}. */
export interface TilemapOccluderOptions<Tile> {
  /**
   * Whether an occupied cell blocks light. Defaults to "every tile in this
   * layer does", which is what a layer dedicated to walls wants; pass a
   * predicate to read a tile property instead.
   */
  readonly solid?: (tile: Tile, tx: number, ty: number) => boolean;
  /** Node whose world transform places the layer. Without one, layer pixel space is world space. */
  readonly node?: OccluderPlacement;
  /**
   * Side, in tiles, of the square block an outline is cached in. Larger blocks
   * rebuild less often as the view moves and cost more per rebuild. Defaults
   * to `16`.
   */
  readonly blockSize?: number;
}

/** One cached block of outline, in layer pixel space. */
interface Block {
  revision: number;
  lastUse: number;
  segments: Float32Array;
}

const emptySegments = new Float32Array(0);

/**
 * Cached blocks kept before the ones this frame did not touch are dropped. An
 * unbounded streamed map would otherwise keep every block it has ever walked
 * past, and 256 covers a screen's worth several times over.
 */
const maxBlocks = 256;

/** @internal - see {@link Occluders.fromTilemap}. */
export const fromTilemap = <Tile>(layer: OccluderTileLayer<Tile>, options: TilemapOccluderOptions<Tile> = {}): OccluderSource => {
  const isSolid = options.solid;
  const node = options.node ?? null;
  const blockSize = Math.max(1, Math.round(options.blockSize ?? 16));
  const blocks = new Map<number, Block>();
  const occupied = new Set<number>();
  const placement = placementMap();

  /**
   * Cell occupancy for one block plus a one-cell skirt: without the skirt a
   * cell on the block's edge cannot tell an empty neighbour from an unwalked
   * one, and every block boundary would grow a wall.
   */
  const build = (blockX: number, blockY: number): Float32Array => {
    const minTx = blockX * blockSize;
    const minTy = blockY * blockSize;

    occupied.clear();

    for (const cell of layer.tilesInRect(minTx - 1, minTy - 1, blockSize + 2, blockSize + 2)) {
      if (isSolid === undefined || isSolid(cell.tile, cell.tx, cell.ty)) {
        occupied.add(cell.ty * coordinateStride + cell.tx);
      }
    }

    if (occupied.size === 0) {
      return emptySegments;
    }

    return tileBoundarySegments(
      (tx, ty) => occupied.has(ty * coordinateStride + tx),
      minTx,
      minTy,
      minTx + blockSize - 1,
      minTy + blockSize - 1,
      layer.tileWidth,
      layer.tileHeight,
      layer.offsetX,
      layer.offsetY,
    );
  };

  let frame = 0;

  const blockAt = (blockX: number, blockY: number): Float32Array => {
    const key = blockY * coordinateStride + blockX;
    const cached = blocks.get(key);

    if (cached === undefined) {
      const created: Block = { revision: layer.revision, lastUse: frame, segments: build(blockX, blockY) };

      blocks.set(key, created);

      return created.segments;
    }

    cached.lastUse = frame;

    if (cached.revision !== layer.revision) {
      cached.revision = layer.revision;
      cached.segments = build(blockX, blockY);
    }

    return cached.segments;
  };

  const evict = (): void => {
    if (blocks.size <= maxBlocks) {
      return;
    }

    for (const [key, block] of blocks) {
      if (block.lastUse !== frame) {
        blocks.delete(key);
      }
    }
  };

  return {
    collect(bounds: ReadonlyRectangle, out: OccluderSink): void {
      frame++;

      const map = readPlacement(node, placement);
      const local = toLayerSpace(bounds, map);

      if (local === null) {
        return;
      }

      const spanX = blockSize * layer.tileWidth;
      const spanY = blockSize * layer.tileHeight;
      const firstX = Math.floor((local.minX - layer.offsetX) / spanX);
      const lastX = Math.floor((local.maxX - layer.offsetX) / spanX);
      const firstY = Math.floor((local.minY - layer.offsetY) / spanY);
      const lastY = Math.floor((local.maxY - layer.offsetY) / spanY);

      for (let blockY = firstY; blockY <= lastY; blockY++) {
        for (let blockX = firstX; blockX <= lastX; blockX++) {
          const segments = blockAt(blockX, blockY);

          for (let index = 0; index < segments.length; index += 4) {
            const x1 = segments[index]!;
            const y1 = segments[index + 1]!;
            const x2 = segments[index + 2]!;
            const y2 = segments[index + 3]!;

            out.addSegment(map.a * x1 + map.b * y1 + map.x, map.c * x1 + map.d * y1 + map.y, map.a * x2 + map.b * y2 + map.x, map.c * x2 + map.d * y2 + map.y);
          }
        }
      }

      evict();
    },
  };
};

const scratchBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/**
 * The requested world region as a layer-space box, or `null` when the
 * placement collapses the layer to a line and nothing it holds is visible.
 *
 * The box is the bounding box of the inverse-mapped rectangle, so a rotated
 * layer reports more blocks than it strictly needs rather than fewer.
 */
const toLayerSpace = (bounds: ReadonlyRectangle, map: PlacementMap): typeof scratchBounds | null => {
  const { a, b, c, d, x, y } = map;
  const determinant = a * d - b * c;

  if (determinant === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let corner = 0; corner < 4; corner++) {
    const worldX = (corner & 1) === 0 ? bounds.left : bounds.right;
    const worldY = (corner & 2) === 0 ? bounds.top : bounds.bottom;
    const localX = (d * (worldX - x) - b * (worldY - y)) / determinant;
    const localY = (a * (worldY - y) - c * (worldX - x)) / determinant;

    minX = Math.min(minX, localX);
    minY = Math.min(minY, localY);
    maxX = Math.max(maxX, localX);
    maxY = Math.max(maxY, localY);
  }

  scratchBounds.minX = minX;
  scratchBounds.minY = minY;
  scratchBounds.maxX = maxX;
  scratchBounds.maxY = maxY;

  return scratchBounds;
};
