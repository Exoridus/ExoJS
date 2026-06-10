import { describe, expect, it } from 'vitest';

import {
  maskTiledGid,
  TILED_FLIPPED_DIAGONALLY_FLAG,
  TILED_FLIPPED_HORIZONTALLY_FLAG,
  TILED_FLIPPED_VERTICALLY_FLAG,
  TILED_ROTATED_HEXAGONAL_120_FLAG,
} from '../src/gid';

describe('maskTiledGid', () => {
  it('returns 0 for the empty-cell sentinel', () => {
    expect(maskTiledGid(0)).toBe(0);
  });

  it('returns plain gids unchanged', () => {
    expect(maskTiledGid(5)).toBe(5);
    expect(maskTiledGid(0x0fffffff)).toBe(0x0fffffff);
  });

  it('strips the horizontal-flip flag', () => {
    expect(maskTiledGid(TILED_FLIPPED_HORIZONTALLY_FLAG | 5)).toBe(5);
  });

  it('strips the vertical-flip flag', () => {
    expect(maskTiledGid(TILED_FLIPPED_VERTICALLY_FLAG | 5)).toBe(5);
  });

  it('strips the diagonal-flip flag', () => {
    expect(maskTiledGid(TILED_FLIPPED_DIAGONALLY_FLAG | 5)).toBe(5);
  });

  it('strips the hexagonal-rotation flag', () => {
    expect(maskTiledGid(TILED_ROTATED_HEXAGONAL_120_FLAG | 5)).toBe(5);
  });

  it('strips all four flag bits at once', () => {
    const flagged = (TILED_FLIPPED_HORIZONTALLY_FLAG | TILED_FLIPPED_VERTICALLY_FLAG | TILED_FLIPPED_DIAGONALLY_FLAG | TILED_ROTATED_HEXAGONAL_120_FLAG | 5) >>> 0;
    expect(maskTiledGid(flagged)).toBe(5);
  });

  it('handles gids that exceed 2^31 (unsigned 32-bit wraparound)', () => {
    // Horizontal-flip flag alone is 2^31, which is negative as a signed int32.
    expect(maskTiledGid(TILED_FLIPPED_HORIZONTALLY_FLAG)).toBe(0);
    expect(maskTiledGid(0xffffffff)).toBe(0x0fffffff);
  });
});
