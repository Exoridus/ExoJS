/**
 * Tile word packing shared by WebGL2/WebGPU: 29-bit transform row, diagonal
 * flag in bit 29, and a two-bit texture slot in bits 30..31. Keeping the slot
 * in the existing word preserves the 32-byte instance layout and retained
 * batch storage. The row rebase must preserve ALL high flag bits.
 * @internal
 */
export const TILE_ROW_MASK = 0x1fffffff;

/** @internal */
export const TILE_DIAGONAL_BIT = 0x20000000;

/** @internal */
export const TILE_TEXTURE_SLOT_SHIFT = 30;

/** Minimum cross-backend slot budget; fits the two high tile-word bits. @internal */
export const TILE_TEXTURE_SLOTS = 4;
