/**
 * The text effect capability contract: which nodes can draw outlines and
 * shadows, how far, and that every operation which could create an
 * undrawable combination rejects it synchronously and changes nothing.
 *
 * Pixel widths are measured in the browser suites; this file pins the
 * contract the renderers rely on - nothing reaching a flush can exceed the
 * field or the glyph quad.
 */

import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { BitmapText } from '#rendering/text/BitmapText';
import type { BmFontData } from '#rendering/text/BmFont';
import { BmFont } from '#rendering/text/BmFont';
import { SDF_RADIUS } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { TextEffectError } from '#rendering/text/TextEffectError';
import {
  bmFontEffectCapability,
  checkTextEffectValues,
  sdfEffectCapability,
  textEffectAntialiasReserve,
} from '#rendering/text/textEffects';
import { TextStyle } from '#rendering/text/TextStyle';
import type { Texture } from '#rendering/texture/Texture';

const fontData = (overrides: Partial<BmFontData> = {}): BmFontData => ({
  pages: ['page.png'],
  chars: new Map([[72, { x: 0, y: 0, width: 8, height: 12, xOffset: 0, yOffset: 2, xAdvance: 10, page: 0 }]]),
  kernings: new Map(),
  lineHeight: 16,
  base: 12,
  ...overrides,
});

const msdfFont = (
  distanceRange: number | null,
  padding: number | null = distanceRange === null ? 2 : distanceRange / 2,
  zero: number | null = 0.5,
): BmFont =>
  new BmFont(
    fontData({
      distanceField: { fieldType: 'msdf', distanceRange, zeroDistanceValue: zero },
      ...(padding === null ? {} : { padding: { top: padding, right: padding, bottom: padding, left: padding } }),
    }),
    [{ width: 64, height: 64 } as unknown as Texture],
  );

const plainFont = (): BmFont => new BmFont(fontData(), [{ width: 64, height: 64 } as unknown as Texture]);

const catchEffectError = (run: () => unknown): TextEffectError => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(TextEffectError);

    return error as TextEffectError;
  }

  throw new Error('expected a TextEffectError');
};

describe('runtime SDF capacity', () => {
  test('the field and the tile padding both end sdfRadius logical pixels outside the glyph', () => {
    expect(sdfEffectCapability(8)).toEqual({ reason: null, outward: 8, inward: 8, fieldScale: 1 / 16, zero: 0.5 });
  });

  // Outline 1, 2 and 4 px against radii 4, 8 and 16: an outline fits while its
  // width plus the one-pixel antialiasing reserve stays inside the radius.
  test.each([
    [4, 1, true],
    [4, 2, true],
    [4, 4, false],
    [8, 1, true],
    [8, 2, true],
    [8, 4, true],
    [16, 1, true],
    [16, 2, true],
    [16, 4, true],
  ])('sdfRadius %i with a %i px outline: supported = %s', (sdfRadius, outlineWidth, supported) => {
    const build = (): Text => new Text('H', { sdfRadius, outlineWidth });

    if (supported) {
      expect(build().style.outlineWidth).toBe(outlineWidth);

      return;
    }

    const error = catchEffectError(build);

    expect(error.reason).toBe('insufficient-effect-capacity');
    expect(error.effect).toBe('outline');
    expect(error.required).toBe(outlineWidth + textEffectAntialiasReserve);
    expect(error.available).toBe(sdfRadius);
    expect(error.message).toMatch(/^Text: cannot draw the text outline/);
  });

  test('the capacity is independent of the raster pixel ratio and the font size', () => {
    for (const pixelRatio of [1, 2, 3]) {
      for (const fontSize of [9, 24, 96]) {
        const text = new Text('H', { pixelRatio, fontSize, sdfRadius: 6, outlineWidth: 5 });

        expect(text.maxEffectExtent).toBe(5);
        text.destroy();
      }
    }
  });

  describe('automatic reach', () => {
    // Layout reads glyph metrics from the pool, never a canvas.
    const atlasRequests: number[] = [];
    const glyph = {
      x: 0,
      y: 0,
      width: 8,
      height: 16,
      advance: 10,
      ascent: 13,
      page: 0,
      uvLeft: 0,
      uvTop: 0,
      uvRight: 0.01,
      uvBottom: 0.02,
    };
    const mockAtlas = {
      getGlyph: () => glyph,
      pages: [],
      mode: 'sdf',
      clear: () => undefined,
      onCleared: new Signal(),
    };

    beforeEach(() => {
      atlasRequests.length = 0;
      resetDefaultGlyphAtlasPool({
        getAtlas: (_font: unknown, _mode: unknown, radius: number) => {
          atlasRequests.push(radius);

          return mockAtlas;
        },
        getMetrics: () => ({ getGlyph: () => glyph, advance: () => 10, clear: () => undefined }),
      } as unknown as GlyphAtlasPool);
    });
    afterEach(() => resetDefaultGlyphAtlasPool());

    test('plain text keeps the finest tier, which is the default reach', () => {
      expect(new Text('H').sdfRadius).toBe(SDF_RADIUS);
      expect(new Text('H', { outlineWidth: 3 }).sdfRadius).toBe(4);
    });

    test('an outline of 4 px works without configuration and picks the next tier', () => {
      const text = new Text('H', { outlineWidth: 4 });

      expect(text.style.outlineWidth).toBe(4);
      expect(text.sdfRadius).toBe(8);
    });

    test.each([
      [{ outlineWidth: 7 }, 8],
      [{ outlineWidth: 8 }, 16],
      [{ shadowAlpha: 1, shadowOffsetX: 9, shadowBlur: 2 }, 16],
      [{ outlineWidth: 31 }, 32],
    ])('%j needs a reach of %i', (options, reach) => {
      expect(new Text('H', options).sdfRadius).toBe(reach);
    });

    test('grows when the style later asks for more, and never shrinks', () => {
      const text = new Text('H');

      text.syncDirty();
      text.style.outlineWidth = 6;
      text.syncDirty();
      expect(text.sdfRadius).toBe(8);

      text.style.outlineWidth = 12;
      text.syncDirty();
      expect(text.sdfRadius).toBe(16);

      text.style.outlineWidth = 1;
      text.syncDirty();
      expect(text.sdfRadius).toBe(16);

      // Each tier is one atlas request; an animation inside a tier asks for none.
      for (let i = 0; i < 20; i++) {
        text.style.outlineWidth = 2 + (i % 5);
        text.syncDirty();
      }

      expect(atlasRequests).toEqual([4, 8, 16]);
    });

    test('a style replacement grows it too', () => {
      const text = new Text('H');

      text.style = { shadowAlpha: 1, shadowOffsetX: 5 };
      text.syncDirty();
      expect(text.sdfRadius).toBe(8);
    });

    test('rejects what even the largest tier cannot reach', () => {
      expect(catchEffectError(() => new Text('H', { outlineWidth: 32 })).available).toBe(32);
      expect(new Text('H').maxEffectExtent).toBe(31);
    });

    test('an explicit radius is a hard limit that never grows', () => {
      expect(catchEffectError(() => new Text('H', { sdfRadius: 4, outlineWidth: 4 })).reason).toBe('insufficient-effect-capacity');
      expect(new Text('H', { sdfRadius: 4 }).maxEffectExtent).toBe(3);
    });
  });

  test('a shadow needs its larger offset axis plus its blur inside the reach', () => {
    const capability = sdfEffectCapability(8);

    expect(checkTextEffectValues(capability, 0, 1, 4, -3, 3)).toBeNull();
    expect(checkTextEffectValues(capability, 0, 1, -3, 4, 3)).toBeNull();
    expect(checkTextEffectValues(capability, 0, 1, 5, 0, 3)).toEqual({
      reason: 'insufficient-effect-capacity',
      effect: 'shadow',
      required: 9,
      available: 8,
    });
  });

  test('offsets and blur of an invisible shadow are not effects', () => {
    expect(checkTextEffectValues(sdfEffectCapability(4), 0, 0, 100, 100, 50)).toBeNull();
    expect(() => new Text('H', { sdfRadius: 4, shadowOffsetX: 100, shadowBlur: 50 })).not.toThrow();
  });

  test('a visible shadow with no blur is still a request', () => {
    expect(checkTextEffectValues(sdfEffectCapability(4), 0, 0.5, 4, 0, 0)?.reason).toBe('insufficient-effect-capacity');
  });

  test('NaN lengths are rejected instead of slipping past the comparison', () => {
    expect(checkTextEffectValues(sdfEffectCapability(8), 0, 1, Number.NaN, 0, 0)?.reason).toBe('insufficient-effect-capacity');
  });

  test('sdfRadius must be a positive finite number', () => {
    for (const sdfRadius of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new Text('H', { sdfRadius })).toThrow(RangeError);
    }
  });

  test('shadowBlur must be finite and not negative', () => {
    expect(() => new TextStyle({ shadowBlur: -1 })).toThrow(RangeError);
    expect(() => {
      new TextStyle().shadowBlur = Number.NaN;
    }).toThrow(RangeError);
  });
});

describe('colour glyphs', () => {
  test('draw fill and tint, and reject an outline or a visible shadow as no-distance-field', () => {
    const outline = catchEffectError(() => new Text('🙂', { colorGlyphs: true, outlineWidth: 1 }));
    const shadow = catchEffectError(() => new Text('🙂', { colorGlyphs: true, shadowAlpha: 0.5 }));

    expect([outline.reason, outline.effect]).toEqual(['no-distance-field', 'outline']);
    expect([shadow.reason, shadow.effect]).toEqual(['no-distance-field', 'shadow']);
    expect(new Text('🙂', { colorGlyphs: true, fillColor: Color.red, shadowBlur: 3 }).maxEffectExtent).toBe(0);
  });

  test('a plain bitmap font is a colour atlas', () => {
    expect(catchEffectError(() => new BitmapText('H', plainFont(), { outlineWidth: 1 })).reason).toBe('no-distance-field');
    expect(catchEffectError(() => new BitmapText('H', msdfFont(4), { outlineWidth: 1 })).reason).toBe('no-distance-field');
  });
});

describe('external MSDF capacity', () => {
  test.each([4, 16])('range %i with symmetric padding reaches half the range per scale unit', range => {
    for (const fontScale of [0.5, 1, 2]) {
      const capability = bmFontEffectCapability(msdfFont(range).fontData, fontScale, true);

      expect(capability.reason).toBeNull();
      expect(capability.outward).toBeCloseTo((range / 2) * fontScale, 12);
      expect(capability.fieldScale).toBeCloseTo(1 / (range * fontScale), 12);
      expect(capability.zero).toBe(0.5);
    }
  });

  test('the authored padding bounds the reach when it is narrower than the field', () => {
    expect(bmFontEffectCapability(msdfFont(16, 3).fontData, 1, true).outward).toBe(3);
  });

  test('an asymmetric encoding reaches zero × range outside and the rest inside', () => {
    const capability = bmFontEffectCapability(msdfFont(8, 6, 0.75).fontData, 1, true);

    expect(capability.outward).toBe(6);
    expect(capability.inward).toBe(2);
    expect(capability.zero).toBe(0.75);
  });

  test('missing range, zero or padding is unknown-range; the font still draws fill', () => {
    for (const font of [plainFont(), msdfFont(null), msdfFont(8, null), msdfFont(8, 4, null)]) {
      const error = catchEffectError(() => new BitmapText('H', font, { msdf: true, outlineWidth: 1 }));

      expect(error.reason).toBe('unknown-range');
      expect(new BitmapText('H', font, { msdf: true }).maxEffectExtent).toBe(0);
    }
  });

  test('a range, zero or padding that encodes no outward distance is invalid-range', () => {
    for (const font of [msdfFont(-4, 2), msdfFont(8, 4, 0), msdfFont(8, 4, 1), msdfFont(8, -1)]) {
      expect(catchEffectError(() => new BitmapText('H', font, { msdf: true, shadowAlpha: 1 })).reason).toBe('invalid-range');
    }
  });

  test('effect lengths stay local pixels, so the capacity follows fontScale', () => {
    // Range 4 at scale 2: 4 local pixels of reach, 3 usable.
    const text = new BitmapText('H', msdfFont(4), { msdf: true, scale: 2, outlineWidth: 3 });

    expect(text.maxEffectExtent).toBe(3);
    expect(catchEffectError(() => new BitmapText('H', msdfFont(4), { msdf: true, scale: 1, outlineWidth: 3 })).available).toBe(2);
  });
});

describe('atomic rejection', () => {
  test('an in-place mutation that no attached node can draw throws and leaves the style unchanged', () => {
    const text = new Text('H', { sdfRadius: 4 });
    const style = text.style;

    style.consumeDirty();
    expect(() => {
      style.outlineWidth = 4;
    }).toThrow(TextEffectError);
    expect(style.outlineWidth).toBe(0);
    expect(style.consumeDirty()).toBeNull();

    style.shadowAlpha = 1;
    expect(() => {
      style.shadowOffsetX = 4;
    }).toThrow(TextEffectError);
    expect(style.shadowOffsetX).toBe(0);
    expect(() => {
      style.shadowBlur = 4;
    }).toThrow(TextEffectError);
    expect(style.shadowBlur).toBe(0);
  });

  test('a shared style is constrained by every node it is attached to', () => {
    const wide = new Text('H', { sdfRadius: 16 });
    const narrow = new Text('H', { sdfRadius: 4 });
    const emoji = new Text('🙂', { colorGlyphs: true });

    narrow.style = wide.style;
    wide.style.outlineWidth = 2;

    expect(() => {
      wide.style.outlineWidth = 6;
    }).toThrow(TextEffectError);
    expect(wide.style.outlineWidth).toBe(2);

    // Attaching a style the node cannot draw is itself rejected, and the
    // node keeps the style it had.
    const previous = emoji.style;
    const error = catchEffectError(() => {
      emoji.style = wide.style;
    });

    expect(error.reason).toBe('no-distance-field');
    expect(emoji.style).toBe(previous);

    // A destroyed node stops constraining the style.
    narrow.destroy();
    wide.style.outlineWidth = 6;
    expect(wide.style.outlineWidth).toBe(6);
  });

  test('replacing a style with one it cannot draw keeps the old style attached and constraining', () => {
    const text = new Text('H', { sdfRadius: 4, outlineWidth: 1 });
    const previous = text.style;

    expect(() => {
      text.style = { outlineWidth: 5 };
    }).toThrow(TextEffectError);
    expect(text.style).toBe(previous);
    expect(() => {
      previous.outlineWidth = 5;
    }).toThrow(TextEffectError);
  });

  test('copy validates the incoming effects before copying any field', () => {
    const text = new Text('H', { sdfRadius: 4, fontSize: 12 });
    const source = new TextStyle({ fontSize: 40, outlineWidth: 6 });

    expect(() => text.style.copy(source)).toThrow(TextEffectError);
    expect(text.style.fontSize).toBe(12);
    expect(text.style.outlineWidth).toBe(0);
  });

  test('a fontScale the style does not fit is rejected and the old scale kept', () => {
    const text = new BitmapText('H', msdfFont(4), { msdf: true, scale: 2, outlineWidth: 3 });

    expect(() => {
      text.fontScale = 1;
    }).toThrow(TextEffectError);
    expect(text.fontScale).toBe(2);
    expect(text.maxEffectExtent).toBe(3);

    text.fontScale = 4;
    expect(text.maxEffectExtent).toBe(7);
  });

  test('a font swap the style does not fit is rejected and the old font kept', () => {
    const font = msdfFont(16);
    const text = new BitmapText('H', font, { msdf: true, outlineWidth: 4 });

    expect(catchEffectError(() => text.setFont(msdfFont(null))).reason).toBe('unknown-range');
    expect(text.font).toBe(font);
    expect(catchEffectError(() => text.setFont(msdfFont(4))).reason).toBe('insufficient-effect-capacity');
    expect(text.font).toBe(font);
  });

  test('checkEffects answers the same question without throwing', () => {
    const text = new Text('H', { sdfRadius: 4 });

    expect(text.checkEffects()).toBeNull();
    expect(text.checkEffects({ outlineWidth: 4 })).toEqual({
      reason: 'insufficient-effect-capacity',
      effect: 'outline',
      required: 5,
      available: 4,
    });
    expect(text.checkEffects(new TextStyle({ shadowAlpha: 1, shadowOffsetY: 2 }))).toBeNull();
  });
});
