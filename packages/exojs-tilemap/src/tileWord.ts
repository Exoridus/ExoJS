/**
 * Tile word packing, shared by both backends and by the shader sources they
 * fill: transform-buffer row in the low 29 bits, diagonal flip in bit 29.
 * flipX/flipY are baked into the UV bounds at write time, so the shader only
 * needs the diagonal axis swap.
 *
 * @internal
 */
export const TILE_ROW_MASK = 0x1fffffff;

/** @internal */
export const TILE_DIAGONAL_BIT = 0x20000000;
