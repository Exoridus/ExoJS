import { describe, expect, it } from 'vitest';

import type { TiledObjectAlignment, TiledOrientation } from '../src/data';
import { getTiledObjectAnchorOffset, resolveTiledObjectAlignment } from '../src/objectAlignment';

// Reference values taken from Tiled's own implementation:
// `MapObject::alignment()` and `alignmentOffset()` in libtiled.

describe('resolveTiledObjectAlignment — default per map orientation', () => {
  it('defaults to bottomleft on an orthogonal map', () => {
    expect(resolveTiledObjectAlignment(undefined, 'orthogonal')).toBe('bottomleft');
    expect(resolveTiledObjectAlignment('unspecified', 'orthogonal')).toBe('bottomleft');
  });

  it('defaults to bottom on an isometric map', () => {
    expect(resolveTiledObjectAlignment(undefined, 'isometric')).toBe('bottom');
    expect(resolveTiledObjectAlignment('unspecified', 'isometric')).toBe('bottom');
  });

  it('defaults to bottomleft on staggered and hexagonal maps (only isometric differs)', () => {
    expect(resolveTiledObjectAlignment(undefined, 'staggered')).toBe('bottomleft');
    expect(resolveTiledObjectAlignment(undefined, 'hexagonal')).toBe('bottomleft');
  });

  it('passes an explicit alignment through unchanged, whatever the orientation', () => {
    const explicit: readonly TiledObjectAlignment[] = ['topleft', 'top', 'topright', 'left', 'center', 'right', 'bottomleft', 'bottom', 'bottomright'];
    const orientations: readonly TiledOrientation[] = ['orthogonal', 'isometric', 'staggered', 'hexagonal'];

    for (const alignment of explicit) {
      for (const orientation of orientations) {
        expect(resolveTiledObjectAlignment(alignment, orientation)).toBe(alignment);
      }
    }
  });
});

describe('getTiledObjectAnchorOffset — anchor position inside the bounding box', () => {
  const W = 24;
  const H = 16;

  it.each([
    ['topleft', 0, 0],
    ['top', W / 2, 0],
    ['topright', W, 0],
    ['left', 0, H / 2],
    ['center', W / 2, H / 2],
    ['right', W, H / 2],
    ['bottomleft', 0, H],
    ['bottom', W / 2, H],
    ['bottomright', W, H],
  ] as const)('%s → (%d, %d)', (alignment, x, y) => {
    expect(getTiledObjectAnchorOffset(alignment, W, H)).toEqual({ x, y });
  });

  it('is all-zero for a zero-sized object', () => {
    expect(getTiledObjectAnchorOffset('bottomright', 0, 0)).toEqual({ x: 0, y: 0 });
  });
});
