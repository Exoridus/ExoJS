// Tiled GID flip-flag bits (TMJ tile-layer `data` / object `gid` values).
// The high four bits of a 32-bit GID encode flip/rotation state; the
// remaining 28 bits are the actual tileset-relative global tile id.
//
// These constants exist only to mask flip bits off before resolving a GID
// against a tileset's [firstgid, firstgid + tilecount) range during source
// validation. Converting flip bits into a runtime `TileTransform` is a C2
// (runtime conversion) concern and is intentionally not implemented here.
// @internal

export const TILED_FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
export const TILED_FLIPPED_VERTICALLY_FLAG = 0x40000000;
export const TILED_FLIPPED_DIAGONALLY_FLAG = 0x20000000;
export const TILED_ROTATED_HEXAGONAL_120_FLAG = 0x10000000;

/** Mask isolating the 28-bit tile id, clearing all four flip/rotation flag bits. */
const TILED_GID_MASK = 0x0fffffff;

/**
 * Strips the flip/rotation flag bits from a raw Tiled GID, returning the
 * plain tileset-relative global tile id (0 = empty cell).
 *
 * GIDs may exceed `2^31` (the horizontal-flip flag alone is `2^31`), so the
 * value is first coerced to an unsigned 32-bit integer via `>>> 0`.
 * @internal
 */
export function maskTiledGid(raw: number): number {
  return (raw >>> 0) & TILED_GID_MASK;
}
