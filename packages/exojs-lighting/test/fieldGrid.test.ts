import { describe, expect, test } from 'vitest';

import { fieldGrid, MAX_FIELD_TEXELS } from '../src/backends/fieldGrid';

/** The field a view of this size asks for, before the grid bound is applied. */
const requested = (width: number, height: number, margin = 0.25, resolution = 1): { width: number; height: number } => ({
  width: Math.round(width * resolution * (1 + 2 * margin)),
  height: Math.round(height * resolution * (1 + 2 * margin)),
});

describe('the grid the view-sized fields are built on', () => {
  test('a view that fits is left alone', () => {
    const { width, height } = requested(1280, 720);

    expect(fieldGrid(width, height)).toEqual({ width: 1920, height: 1080 });
  });

  test.each([
    { name: '1080p', canvas: [1920, 1080] as const },
    { name: '4K', canvas: [3840, 2160] as const },
  ])('a $name view is scaled down to the bound at its own aspect', ({ canvas }) => {
    const want = requested(canvas[0], canvas[1]);
    const grid = fieldGrid(want.width, want.height);

    expect(Math.max(grid.width, grid.height)).toBe(MAX_FIELD_TEXELS);
    // The texel stays square: a field stretched on one axis would put the mask
    // and the block level reduced from it on different grids.
    expect(grid.width / grid.height).toBeCloseTo(want.width / want.height, 2);
  });

  test('the bound is what keeps the fields flat as the surface grows', () => {
    const want = requested(3840, 2160);
    const capped = fieldGrid(want.width, want.height);

    expect(capped.width * capped.height).toBeLessThanOrEqual(MAX_FIELD_TEXELS * MAX_FIELD_TEXELS);
    expect((want.width * want.height) / (capped.width * capped.height)).toBeGreaterThan(7);
  });

  test('a degenerate size still names one texel', () => {
    expect(fieldGrid(0, 0)).toEqual({ width: 1, height: 1 });
  });
});
