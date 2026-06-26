import type { TileLayer } from './TileLayer';
import { TILE_TRANSFORM_IDENTITY, unpackTile } from './types';
import type { WangSet } from './WangSet';

/**
 * Options for {@link autoTile}.
 */
export interface AutoTileOptions {
  /**
   * When provided, only cells for which `matchFn` returns `true` are treated
   * as part of the Wang group. The function receives the cell's `localTileId`,
   * `tilesetIndex`, and tile coordinates `(x, y)`.
   *
   * If omitted, every non-empty cell is eligible for autotiling, and a
   * neighbor is considered "in group" when its `tilesetIndex` and
   * `localTileId` match those of the cell being evaluated.
   */
  matchFn?: (localTileId: number, tilesetIndex: number, x: number, y: number) => boolean;
  /**
   * When `true` (default), out-of-bounds neighbors are treated as though
   * they belong to the Wang group, so border tiles fill correctly to the
   * layer edge. Set to `false` to leave border tiles visually open.
   */
  wrapBorder?: boolean;
}

// ── Module-level mask helpers ─────────────────────────────────────────────

/**
 * Compute a 4-bit edge bitmask for the cell at `(tx, ty)`.
 * Top=1, Right=2, Bottom=4, Left=8.
 */
function computeEdgeMask(
  tx: number,
  ty: number,
  inGroup: (nx: number, ny: number) => boolean,
): number {
  let mask = 0;
  if (inGroup(tx, ty - 1)) mask |= 1;
  if (inGroup(tx + 1, ty)) mask |= 2;
  if (inGroup(tx, ty + 1)) mask |= 4;
  if (inGroup(tx - 1, ty)) mask |= 8;
  return mask;
}

/**
 * Compute an 8-bit blob bitmask for the cell at `(tx, ty)` using the
 * corner-dependency rule: diagonal bits are only set when both adjacent
 * cardinal directions are also set.
 *
 * Bit layout:
 * ```
 * 1  | 2  | 4
 * 8  | -- | 16
 * 32 | 64 | 128
 * ```
 */
function computeBlobMask(
  tx: number,
  ty: number,
  inGroup: (nx: number, ny: number) => boolean,
): number {
  const top = inGroup(tx, ty - 1);
  const right = inGroup(tx + 1, ty);
  const bottom = inGroup(tx, ty + 1);
  const left = inGroup(tx - 1, ty);
  let mask = 0;
  if (top) mask |= 2;
  if (right) mask |= 16;
  if (bottom) mask |= 64;
  if (left) mask |= 8;
  // Corner bits: only when BOTH adjacent cardinals are set.
  if (top && left && inGroup(tx - 1, ty - 1)) mask |= 1;
  if (top && right && inGroup(tx + 1, ty - 1)) mask |= 4;
  if (bottom && left && inGroup(tx - 1, ty + 1)) mask |= 32;
  if (bottom && right && inGroup(tx + 1, ty + 1)) mask |= 128;
  return mask;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Apply Wang autotiling to `layer` using `wangSet`.
 *
 * Iterates every cell in the layer. For each cell that belongs to the Wang
 * group, computes a neighbor bitmask and looks up the correct local tile ID
 * from {@link WangSet.blobMap}. The layer is mutated in place; cells whose
 * computed bitmask has no mapping in the blobMap are left unchanged.
 *
 * The function performs two passes (snapshot then write) so neighbor tests
 * always reflect the pre-call state regardless of processing order.
 *
 * **Blob mode bitmask (bit positions):**
 * ```
 * 1  | 2  | 4
 * 8  | -- | 16
 * 32 | 64 | 128
 * ```
 * Diagonal bits (1, 4, 32, 128) are only set when both adjacent cardinals
 * are also set (the "corner dependency" rule that reduces 256 raw
 * combinations to 47 valid blob states).
 *
 * **Edge mode bitmask (bit positions):** Top=1, Right=2, Bottom=4, Left=8.
 */
export function autoTile(layer: TileLayer, wangSet: WangSet, options?: AutoTileOptions): void {
  const matchFn = options?.matchFn;
  const wrapBorder = options?.wrapBorder ?? true;
  const w = layer.width;
  const h = layer.height;

  // ── Pass 1: snapshot ─────────────────────────────────────────────────
  // Capture each cell's (tilesetIndex, localTileId) before any writes so
  // that neighbor membership tests always see pre-mutation state.

  interface CellInfo {
    tilesetIndex: number;
    localTileId: number;
  }
  const snapshot = new Map<number, CellInfo>();

  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const packed = layer.getRawTileAt(tx, ty);
      if (packed === 0) continue;
      const decoded = unpackTile(packed);
      if (!decoded) continue;
      snapshot.set(ty * w + tx, decoded);
    }
  }

  // ── Neighbor membership test ──────────────────────────────────────────

  function isInGroup(nx: number, ny: number, ctsi: number, ctid: number): boolean {
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) return wrapBorder;
    const cell = snapshot.get(ny * w + nx);
    if (!cell) return false;
    if (matchFn) return matchFn(cell.localTileId, cell.tilesetIndex, nx, ny);
    return cell.tilesetIndex === ctsi && cell.localTileId === ctid;
  }

  // ── Pass 2: compute masks and write ──────────────────────────────────

  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const cellInfo = snapshot.get(ty * w + tx);
      if (!cellInfo) continue;

      const { tilesetIndex: ctsi, localTileId: ctid } = cellInfo;

      // Skip cells excluded by matchFn (when provided).
      if (matchFn && !matchFn(ctid, ctsi, tx, ty)) continue;

      const inGroup = (nx: number, ny: number): boolean => isInGroup(nx, ny, ctsi, ctid);
      const mask = wangSet.type === 'edge'
        ? computeEdgeMask(tx, ty, inGroup)
        : computeBlobMask(tx, ty, inGroup);

      const newLocalTileId = wangSet.getTileId(mask);
      if (newLocalTileId === undefined) continue;

      const tileset = layer.tilesets[wangSet.tilesetIndex];
      if (!tileset) continue;

      layer.setTileAt(tx, ty, {
        localTileId: newLocalTileId,
        tileset,
        transform: TILE_TRANSFORM_IDENTITY,
      });
    }
  }
}
