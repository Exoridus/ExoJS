import { describe, expect, test } from 'vitest';

import { fieldGrid, MAX_FIELD_TEXELS } from '../src/backends/distanceField';

/**
 * The platform's own half-float rounding, used as the reference the seed
 * encoding is checked against rather than a model of it written here.
 */
const half = (value: number): number => Math.f16round(value);

/** The field a view of this size asks for, before the grid bound is applied. */
const requested = (width: number, height: number, margin = 0.25, resolution = 1): { width: number; height: number } => ({
  width: Math.round(width * resolution * (1 + 2 * margin)),
  height: Math.round(height * resolution * (1 + 2 * margin)),
});

describe('seed coordinates survive the format they are stored in', () => {
  test('a texel CENTRE stops being exact where the default field already reaches', () => {
    // What the field used to store. Above 1024 the spacing of half-float is a
    // whole unit, so a centre lands on a neighbouring texel - and the same
    // value indexes the mask again when the edge inside the seed texel is read
    // back, which at the last column is a fetch outside the field.
    expect(requested(1280, 720)).toEqual({ width: 1920, height: 1080 });
    expect(half(1919.5)).not.toBe(1919.5);
    expect(half(1919.5)).toBe(1920);
  });

  test('every texel index the grid bound allows is exact', () => {
    const inexact: number[] = [];

    for (let index = 0; index <= MAX_FIELD_TEXELS; index++) {
      if (half(index) !== index) {
        inexact.push(index);
      }
    }

    expect(inexact).toEqual([]);
    // And the very next one is not, which is why the bound sits here.
    expect(half(MAX_FIELD_TEXELS + 1)).not.toBe(MAX_FIELD_TEXELS + 1);
  });
});

describe('the grid the field is built on', () => {
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
    // The texel stays square: a field stretched on one axis would put the
    // distance field and the mask on different grids.
    expect(grid.width / grid.height).toBeCloseTo(want.width / want.height, 2);
  });

  test('the bound is what keeps the two seed buffers flat', () => {
    // Eight bytes per texel per buffer. The alternative - a 32-bit seed at the
    // smallest field that would have needed one - is twice the width over an
    // uncapped grid.
    const capped = fieldGrid(2880, 1620);
    const bytes = capped.width * capped.height * 8 * 2;

    expect(bytes).toBeLessThan(2880 * 1620 * 16 * 2);
    expect(bytes / (1024 * 1024)).toBeLessThan(40);
  });

  test('a degenerate size still names one texel', () => {
    expect(fieldGrid(0, 0)).toEqual({ width: 1, height: 1 });
  });
});
