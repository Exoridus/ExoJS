/**
 * Documents older than format 4 stored text outline and shadow lengths as
 * distance-field thresholds. The readers convert them to logical pixels by
 * reproducing where the old shader drew each edge, or reject what has no
 * pixel meaning - they never reinterpret an old number as pixels.
 */

import { deserializeTree } from '#core/serialization/serialize';
import { migrateLegacyTextEffects, textEffectPixelVersion } from '#core/serialization/textEffectMigration';
import type { BmFontData } from '#rendering/text/BmFont';
import type { Text } from '#rendering/text/Text';
import { TextEffectError } from '#rendering/text/TextEffectError';
import type { TextStyleOptions } from '#rendering/text/TextStyle';

const fontData = (field?: BmFontData['distanceField']): BmFontData => ({
  pages: ['page.png'],
  chars: new Map(),
  kernings: new Map(),
  lineHeight: 16,
  base: 12,
  ...(field === undefined ? {} : { distanceField: field }),
});

const freeze = (options: TextStyleOptions): TextStyleOptions => Object.freeze({ ...options });

describe('legacy runtime SDF styles', () => {
  test('an outline threshold u becomes u × sdfRadius, saturating at half the radius as the old field did', () => {
    for (const sdfRadius of [4, 8, 16]) {
      const migrate = (outlineWidth: number): number | undefined =>
        migrateLegacyTextEffects({ outlineWidth }, { kind: 'sdf', sdfRadius, colorGlyphs: false }, 3).outlineWidth;

      expect(migrate(0.125)).toBeCloseTo(0.125 * sdfRadius, 12);
      expect(migrate(0.5)).toBe(sdfRadius / 2);
      expect(migrate(4)).toBe(sdfRadius / 2);
    }
  });

  test('a blur of b field-tenths becomes b × 0.1 × sdfRadius; offsets were already logical pixels', () => {
    const source = freeze({ shadowBlur: 2, shadowOffsetX: 3, shadowOffsetY: -2, shadowAlpha: 0.5 });
    const migrated = migrateLegacyTextEffects(source, { kind: 'sdf', sdfRadius: 8, colorGlyphs: false }, 2);

    expect(migrated.shadowBlur).toBeCloseTo(1.6, 12);
    expect(migrated.shadowOffsetX).toBe(3);
    expect(migrated.shadowOffsetY).toBe(-2);
    expect(migrated.shadowAlpha).toBe(0.5);
    expect(source.shadowBlur).toBe(2);
  });

  test('effects colour glyphs never drew are switched off instead of becoming visible', () => {
    const migrated = migrateLegacyTextEffects(
      { outlineWidth: 0.2, shadowAlpha: 0.7, shadowOffsetX: 2 },
      { kind: 'sdf', sdfRadius: 8, colorGlyphs: true },
      3,
    );

    expect(migrated.outlineWidth).toBe(0);
    expect(migrated.shadowAlpha).toBe(0);
    expect(migrated.shadowOffsetX).toBe(2);
  });

  test('absent keys stay absent so defaults still apply', () => {
    expect(migrateLegacyTextEffects({ fontSize: 12 }, { kind: 'sdf', sdfRadius: 8, colorGlyphs: false }, 3)).toEqual({ fontSize: 12 });
  });
});

describe('legacy BitmapText styles', () => {
  test.each([4, 16])('an MSDF font with declared range %i converts thresholds and texel offsets to local pixels', range => {
    for (const fontScale of [0.5, 1, 2]) {
      const migrated = migrateLegacyTextEffects(
        freeze({ outlineWidth: 0.25, shadowBlur: 1, shadowAlpha: 1, shadowOffsetX: 2, shadowOffsetY: -1 }),
        {
          kind: 'bmFont',
          fontData: fontData({ fieldType: 'msdf', distanceRange: range, zeroDistanceValue: 0.5 }),
          fontScale,
          msdf: true,
        },
        3,
      );

      expect(migrated.outlineWidth).toBeCloseTo(0.25 * range * fontScale, 12);
      expect(migrated.shadowBlur).toBeCloseTo(0.1 * range * fontScale, 12);
      expect(migrated.shadowOffsetX).toBeCloseTo(2 * fontScale, 12);
      expect(migrated.shadowOffsetY).toBeCloseTo(-fontScale, 12);
    }
  });

  test('an asymmetric field keeps the old outline edge, which the old shader placed relative to 0.5', () => {
    const migrated = migrateLegacyTextEffects(
      { outlineWidth: 0.25 },
      { kind: 'bmFont', fontData: fontData({ fieldType: 'msdf', distanceRange: 8, zeroDistanceValue: 0.75 }), fontScale: 1, msdf: true },
      3,
    );

    // Old edge at sample 0.25; new edge at zero - w / range.
    expect(migrated.outlineWidth).toBeCloseTo((0.75 - 0.25) * 8, 12);
  });

  test('an active effect on an MSDF font without a declared range has no pixel meaning and throws', () => {
    const run = (): TextStyleOptions =>
      migrateLegacyTextEffects({ outlineWidth: 0.1 }, { kind: 'bmFont', fontData: fontData(), fontScale: 1, msdf: true }, 3);

    expect(run).toThrow(TextEffectError);
    expect(run).toThrow(/version 3 document.*outline.*distance range/);
  });

  test('a zero value that encodes no outward distance is invalid-range, as for a live node', () => {
    expect(() =>
      migrateLegacyTextEffects(
        { outlineWidth: 0.1 },
        { kind: 'bmFont', fontData: fontData({ fieldType: 'msdf', distanceRange: 8, zeroDistanceValue: 0 }), fontScale: 1, msdf: true },
        3,
      ),
    ).toThrow(/unusable distance range/);
  });

  test('inactive lengths without a pixel meaning reset to zero rather than being reread as pixels', () => {
    const migrated = migrateLegacyTextEffects(
      { shadowBlur: 3, shadowOffsetX: 4 },
      { kind: 'bmFont', fontData: fontData(), fontScale: 2, msdf: true },
      3,
    );

    expect(migrated.shadowBlur).toBe(0);
    expect(migrated.shadowOffsetX).toBe(8);
  });

  test('a colour bitmap font switches inert effects off', () => {
    const migrated = migrateLegacyTextEffects(
      { outlineWidth: 0.3, shadowAlpha: 0.4, shadowBlur: 1 },
      { kind: 'bmFont', fontData: fontData(), fontScale: 1, msdf: false },
      3,
    );

    expect(migrated).toEqual({ outlineWidth: 0, shadowAlpha: 0, shadowBlur: 0 });
  });
});

describe('reading documents', () => {
  test('format 4 lengths are read as logical pixels', () => {
    expect(textEffectPixelVersion).toBe(4);

    const text = deserializeTree({ type: 'Text', style: { outlineWidth: 3 } }, null, undefined, 4) as Text;

    expect(text.style.outlineWidth).toBe(3);
  });

  test('a format 4 effect the node cannot draw is rejected at load, not at the first frame', () => {
    expect(() => deserializeTree({ type: 'Text', sdfRadius: 4, style: { outlineWidth: 6 } }, null, undefined, 4)).toThrow(TextEffectError);
  });

  test('a converted legacy value that exceeds the new capacity is rejected, not clamped', () => {
    // Blur 40 tenths at radius 8 is 32 logical pixels: far beyond the field.
    expect(() => deserializeTree({ type: 'Text', style: { shadowAlpha: 1, shadowBlur: 40 } }, null, undefined, 3)).toThrow(TextEffectError);
  });
});
