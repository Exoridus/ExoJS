import { TextureFormat } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import { seedFormat } from '../src/backends/distanceField';

/**
 * The platform's own half-float rounding, used as the reference the seed
 * encoding is checked against rather than a model of it written here.
 */
const half = (value: number): number => Math.f16round(value);

/** The field the default surface builds: a 1280x720 view with a quarter of it as margin per side. */
const defaultField = { width: Math.round(1280 * (1 + 2 * 0.25)), height: Math.round(720 * (1 + 2 * 0.25)) };

describe('seed coordinates survive the format they are stored in', () => {
  test('the default field is larger than the range half-float resolves to half a texel', () => {
    expect(defaultField).toEqual({ width: 1920, height: 1080 });
    // What the field used to store: the texel CENTRE. Above 1024 the spacing
    // of half-float is a whole unit, so a centre lands on a neighbouring
    // texel - and the same value indexes the mask again when the edge inside
    // the seed texel is read back.
    expect(half(1919.5)).not.toBe(1919.5);
    expect(half(1919.5)).toBe(1920);
  });

  test('every texel index of a half-float field is exact', () => {
    const format = seedFormat(2048, 2048);
    const inexact: number[] = [];

    for (let index = 0; index <= 2048; index++) {
      if (half(index) !== index) {
        inexact.push(index);
      }
    }

    expect(format).toBe(TextureFormat.Rgba16F);
    expect(inexact).toEqual([]);
  });

  test('a field wider than that takes the format that still names its texels', () => {
    expect(half(2049)).not.toBe(2049);
    expect(seedFormat(2049, 1080)).toBe(TextureFormat.Rgba32F);
    expect(seedFormat(1080, 2049)).toBe(TextureFormat.Rgba32F);
    // 4K with the default margin, which is the first size a real surface
    // reaches it at.
    expect(seedFormat(Math.round(3840 * 1.5), Math.round(2160 * 1.5))).toBe(TextureFormat.Rgba32F);
  });

  test('the sentinel that names no texel stays outside the index range', () => {
    expect(half(-1)).toBe(-1);
    expect(seedFormat(defaultField.width, defaultField.height)).toBe(TextureFormat.Rgba16F);
  });
});
