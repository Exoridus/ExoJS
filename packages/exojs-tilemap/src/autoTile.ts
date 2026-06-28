import type { TileLayer } from './TileLayer';
import { TILE_TRANSFORM_IDENTITY, unpackTile } from './types';
import type { WangSet } from './WangSet';

/**
 * Options for {@link autoTile} and {@link refreshCell}.
 */
export interface AutoTileOptions {
  /**
   * When provided, only cells for which `matchFn` returns `true` are treated
   * as part of the Wang group. The function receives the cell's `localTileId`,
   * `tilesetIndex`, and tile coordinates `(x, y)`.
   *
   * If omitted, group membership defaults to {@link WangSet.isMember} on the
   * cell's `localTileId` (and a matching `tilesetIndex`). That default is
   * *variant-stable* — every autotiled variant counts as a member — which is
   * what makes {@link refreshCell} correct. If you supply a `matchFn` for use
   * with `refreshCell`, it MUST likewise be variant-stable (independent of the
   * currently-rendered variant), e.g. keyed on a separate logical-terrain grid
   * or a tile property.
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

/** Compute the mask for a cell given the Wang mode and a membership predicate. */
function computeMask(
  wangSet: WangSet,
  tx: number,
  ty: number,
  inGroup: (nx: number, ny: number) => boolean,
): number {
  return wangSet.type === 'edge'
    ? computeEdgeMask(tx, ty, inGroup)
    : computeBlobMask(tx, ty, inGroup);
}

/**
 * Apply the variant computed for cell `(tx, ty)` to `layer`, preserving the
 * cell's current orientation transform. No-op if the mask has no mapping or
 * the target tileset is missing.
 */
function applyVariant(
  layer: TileLayer,
  wangSet: WangSet,
  tx: number,
  ty: number,
  inGroup: (nx: number, ny: number) => boolean,
): void {
  const newLocalTileId = wangSet.getTileId(computeMask(wangSet, tx, ty, inGroup));
  if (newLocalTileId === undefined) return;

  const tileset = layer.tilesets[wangSet.tilesetIndex];
  if (!tileset) return;

  // Preserve the existing orientation transform if the cell already holds one.
  const existing = layer.getTileAt(tx, ty);
  layer.setTileAt(tx, ty, {
    localTileId: newLocalTileId,
    tileset,
    transform: existing ? existing.transform : TILE_TRANSFORM_IDENTITY,
  });
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
 * **Group membership.** With no `matchFn`, a cell belongs to the group when its
 * `tilesetIndex` matches {@link WangSet.tilesetIndex} and its `localTileId` is a
 * {@link WangSet.isMember member} of the set. Membership covers every variant
 * the set can produce, so re-running `autoTile` (or {@link refreshCell}) on
 * already-autotiled data is stable. Paint with a tile ID that is a member (a
 * blobMap value, or one listed in {@link WangSetOptions.members}).
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

  // ── Membership test (reads the snapshot) ─────────────────────────────

  const isInGroup = (nx: number, ny: number): boolean => {
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) return wrapBorder;
    const cell = snapshot.get(ny * w + nx);
    if (!cell) return false;
    if (matchFn) return matchFn(cell.localTileId, cell.tilesetIndex, nx, ny);
    return cell.tilesetIndex === wangSet.tilesetIndex && wangSet.isMember(cell.localTileId);
  };

  // ── Pass 2: compute masks and write ──────────────────────────────────

  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const cellInfo = snapshot.get(ty * w + tx);
      if (!cellInfo) continue;

      // Skip cells that are not part of the group.
      const isMember = matchFn
        ? matchFn(cellInfo.localTileId, cellInfo.tilesetIndex, tx, ty)
        : cellInfo.tilesetIndex === wangSet.tilesetIndex && wangSet.isMember(cellInfo.localTileId);
      if (!isMember) continue;

      applyVariant(layer, wangSet, tx, ty, isInGroup);
    }
  }
}

/**
 * Incrementally re-autotile a single cell and its eight neighbours after an
 * edit, instead of re-running {@link autoTile} over the whole layer.
 *
 * A cell's blob/edge mask depends only on its immediate neighbours, so painting
 * or erasing cell `(x, y)` can change the variant of that cell and of the (up
 * to) eight cells that have it as a neighbour — but nothing further out. This
 * recomputes exactly that 3×3 neighbourhood, touching only the 1–4 chunks it
 * spans (and rebuilding geometry only for chunks whose tiles actually change).
 * For a paint operation this is O(1) work versus `autoTile`'s O(width·height).
 *
 * Membership is read live from the layer, so the membership test MUST be
 * variant-stable: the default ({@link WangSet.isMember}) is, and any custom
 * `matchFn` you pass must be too (see {@link AutoTileOptions.matchFn}).
 *
 * Typical editor use: write the painted tile with `layer.setTileAt(...)` using
 * a member tile ID, then call `refreshCell(layer, x, y, wangSet)`.
 *
 * @param layer   The layer to update in place.
 * @param x       Tile X of the edited cell.
 * @param y       Tile Y of the edited cell.
 * @param wangSet The Wang set to resolve variants from.
 * @param options Membership / border options (shared with {@link autoTile}).
 */
export function refreshCell(
  layer: TileLayer,
  x: number,
  y: number,
  wangSet: WangSet,
  options?: AutoTileOptions,
): void {
  const matchFn = options?.matchFn;
  const wrapBorder = options?.wrapBorder ?? true;
  const w = layer.width;
  const h = layer.height;

  // Live membership test (reads the current layer; variant-stable by default).
  const isInGroup = (nx: number, ny: number): boolean => {
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) return wrapBorder;
    const tile = layer.getTileAt(nx, ny);
    if (!tile) return false;
    const tsi = layer.tilesets.indexOf(tile.tileset);
    if (matchFn) return matchFn(tile.localTileId, tsi, nx, ny);
    return tsi === wangSet.tilesetIndex && wangSet.isMember(tile.localTileId);
  };

  // Recompute the edited cell and its eight neighbours.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!layer.inBounds(tx, ty)) continue;
      if (!isInGroup(tx, ty)) continue;
      applyVariant(layer, wangSet, tx, ty, isInGroup);
    }
  }
}
