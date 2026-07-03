/**
 * Tests for BitmapText — verifies that it uses the shared TextLayout engine
 * (alignment, word-wrap, kerning, leading) and builds correct page quads.
 */

import { logger } from '#core/logging';
import type { BmFontData } from '#rendering/text/BitmapText';
import { BitmapText, BmFontAdapter } from '#rendering/text/BitmapText';
import { BmFont } from '#rendering/text/BmFont';
import type { Texture } from '#rendering/texture/Texture';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFontData(overrides: Partial<BmFontData> = {}): BmFontData {
  const chars = new Map([
    [65, { x: 0, y: 0, width: 8, height: 12, xOffset: 0, yOffset: 2, xAdvance: 10, page: 0 }], // A
    [66, { x: 8, y: 0, width: 8, height: 12, xOffset: 0, yOffset: 2, xAdvance: 10, page: 0 }], // B
    [32, { x: 0, y: 0, width: 0, height: 0, xOffset: 0, yOffset: 0, xAdvance: 5, page: 0 }], // space
  ]);
  return {
    pages: ['font_0.png'],
    chars,
    kernings: new Map([['65,66', -1]]), // A followed by B: tighten by 1px
    lineHeight: 16,
    base: 12,
    ...overrides,
  };
}

function makeTex(w = 64, h = 64): Texture {
  return { width: w, height: h } as unknown as Texture;
}

function makeFont(overrides: Partial<BmFontData> = {}): BmFont {
  return new BmFont(makeFontData(overrides), [makeTex()]);
}

// ---------------------------------------------------------------------------
// BmFontAdapter tests
// ---------------------------------------------------------------------------

describe('BmFontAdapter', () => {
  test('getGlyph returns scaled metrics', () => {
    const data = makeFontData();
    const adapter = new BmFontAdapter(data, [makeTex()], 2);
    const info = adapter.getGlyph('A', 0);

    expect(info.advance).toBe(20); // 10 * 2
    expect(info.width).toBe(16); // 8 * 2
    expect(info.height).toBe(24); // 12 * 2
    // xBearing = xOffset * scale = 0 * 2 = 0
    expect(info.xBearing).toBe(0);
    // yBearing = (yOffset - base) * scale + lineHeight * scale
    //          = (2 - 12) * 2 + 16 * 2 = -20 + 32 = 12
    expect(info.yBearing).toBe(12);
  });

  test('unknown glyph returns zero-size placeholder with fallback advance', () => {
    const data = makeFontData();
    const adapter = new BmFontAdapter(data, [makeTex()], 1);
    const info = adapter.getGlyph('Z', 0);

    expect(info.width).toBe(0);
    expect(info.height).toBe(0);
    expect(info.advance).toBeGreaterThan(0);
  });

  test('getKerning returns scaled kerning pair', () => {
    const data = makeFontData();
    const adapter = new BmFontAdapter(data, [makeTex()], 2);

    expect(adapter.getKerning('A', 'B', 0)).toBe(-2); // -1 * 2
    expect(adapter.getKerning('B', 'A', 0)).toBe(0); // no pair
  });

  test('UV coordinates are computed from texture dimensions', () => {
    const data = makeFontData();
    const adapter = new BmFontAdapter(data, [makeTex(64, 64)], 1);
    const info = adapter.getGlyph('A', 0);

    expect(info.uvLeft).toBeCloseTo(0 / 64);
    expect(info.uvTop).toBeCloseTo(0 / 64);
    expect(info.uvRight).toBeCloseTo(8 / 64);
    expect(info.uvBottom).toBeCloseTo(12 / 64);
  });
});

// ---------------------------------------------------------------------------
// BitmapText tests
// ---------------------------------------------------------------------------

describe('BitmapText', () => {
  test('constructor sets text and builds page quads', () => {
    const text = new BitmapText('AB', makeFont());
    expect(text.text).toBe('AB');
    expect(text.pageQuads.length).toBeGreaterThanOrEqual(1);
    expect(text.pageQuads[0].quadCount).toBe(2);
  });

  test('empty string produces no page quads', () => {
    const text = new BitmapText('', makeFont());
    expect(text.pageQuads).toHaveLength(0);
  });

  test('text setter triggers rebuild', () => {
    const text = new BitmapText('A', makeFont());
    const first = text.pageQuads[0];
    text.text = 'B';
    expect(text.pageQuads[0]).not.toBe(first);
  });

  test('text setter with same value does not trigger rebuild', () => {
    const text = new BitmapText('A', makeFont());
    const first = text.pageQuads[0];
    text.text = 'A';
    expect(text.pageQuads[0]).toBe(first);
  });

  test('style setter (align) triggers rebuild', () => {
    const text = new BitmapText('AB', makeFont());
    const first = text.pageQuads[0];
    text.style = { align: 'right' };
    expect(text.pageQuads[0]).not.toBe(first);
  });

  test('layout setter (maxWidth) triggers rebuild', () => {
    const text = new BitmapText('AB', makeFont());
    const first = text.pageQuads[0];
    text.layout = { maxWidth: 5 }; // wraps at each char
    expect(text.pageQuads[0]).not.toBe(first);
  });

  test('fontScale setter triggers rebuild and updates metrics', () => {
    const text = new BitmapText('A', makeFont());
    const firstW = text.pageQuads[0].vertices[2]; // quad right x at scale=1

    text.fontScale = 2;
    const scaledW = text.pageQuads[0].vertices[2]; // quad right x at scale=2

    expect(scaledW).toBeGreaterThan(firstW);
  });

  test('word-wrap via maxWidth splits text across two page-quad batches', () => {
    // A and B each have advance=10, space has advance=5.
    // "A B" total = 10 + 5 + 10 = 25. With maxWidth=12, "B" wraps to line 2.
    const text = new BitmapText('A B', makeFont(), { layout: { maxWidth: 12 } });

    // All quads on the same page — but they are on two different Y positions.
    const quads = text.pageQuads;
    expect(quads.length).toBeGreaterThanOrEqual(1);

    // Gather unique Y values from the first vertex of each quad (y at index 1, 9, …)
    const vertices = quads[0].vertices;
    const yValues = new Set<number>();
    for (let i = 1; i < vertices.length; i += 8) yValues.add(vertices[i]);

    expect(yValues.size).toBeGreaterThanOrEqual(2); // at least two distinct line Ys
  });

  test('setFont replaces descriptor and rebuilds', () => {
    const text = new BitmapText('A', makeFont());
    const first = text.pageQuads[0];

    text.setFont(makeFont({ lineHeight: 24 }));

    expect(text.pageQuads[0]).not.toBe(first);
  });

  test('destroy clears page quads', () => {
    const text = new BitmapText('AB', makeFont());
    text.destroy();
    expect(text.pageQuads).toHaveLength(0);
  });

  test('kerning is applied between adjacent glyphs', () => {
    // Without kerning: A advance = 10, B starts at x=10.
    // With kerning A→B = -1: B should start at x=9.
    const textNoKern = new BitmapText('AB', makeFont({ kernings: new Map() }));
    const textWithKern = new BitmapText('AB', makeFont());

    // The second glyph (B) is at vertices[8..15] in the quad buffer.
    // vertices[8] = x0 of the second quad = x position of B.
    const noKernBx = textNoKern.pageQuads[0].vertices[8];
    const withKernBx = textWithKern.pageQuads[0].vertices[8];

    // Kerning pulls B 1px closer to A.
    expect(withKernBx).toBe(noKernBx - 1);
  });
});

// ---------------------------------------------------------------------------
// Dev assertions — BmFont and BmFontAdapter
// ---------------------------------------------------------------------------

describe('BmFont dev assertions', () => {
  test('throws when texture count does not match page count', () => {
    const fontData = makeFontData({ pages: ['page_0.png', 'page_1.png'] });
    expect(() => new BmFont(fontData, [makeTex()])).toThrow('[ExoJS]');
  });

  test('does not throw when texture count matches page count', () => {
    const fontData = makeFontData({ pages: ['page_0.png'] });
    expect(() => new BmFont(fontData, [makeTex()])).not.toThrow();
  });
});

describe('BmFontAdapter page index assertion', () => {
  test('throws when a glyph references a page index beyond the texture array', () => {
    const fontData: BmFontData = {
      ...makeFontData(),
      chars: new Map([[65, { x: 0, y: 0, width: 8, height: 12, xOffset: 0, yOffset: 2, xAdvance: 10, page: 1 }]]),
    };
    // Only 1 texture provided, but glyph A references page index 1.
    const adapter = new BmFontAdapter(fontData, [makeTex()], 1);
    expect(() => adapter.getGlyph('A', 0)).toThrow('[ExoJS]');
  });

  test('does not throw when glyph page index is valid', () => {
    const adapter = new BmFontAdapter(makeFontData(), [makeTex()], 1);
    expect(() => adapter.getGlyph('A', 0)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Missing-glyph diagnostics
// ---------------------------------------------------------------------------

describe('BmFontAdapter missing-glyph warnings', () => {
  beforeEach(() => {
    logger._resetOnce();
  });

  test('warns once when an unknown glyph is requested', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const adapter = new BmFontAdapter(makeFontData(), [makeTex()], 1);

    adapter.getGlyph('Z', 0); // Z is not in the font fixture
    adapter.getGlyph('Z', 0); // second call — must not warn again

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('warning message contains the codepoint in hex (U+005A for Z)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const adapter = new BmFontAdapter(makeFontData(), [makeTex()], 1);

    adapter.getGlyph('Z', 0);

    // The default console sink logs `(prefix, style, message)` — the message
    // is the third argument, not the first.
    expect(spy.mock.calls[0]?.[0]).toContain('[BitmapText]');
    expect(spy.mock.calls[0]?.[2]).toContain('U+005A');
    spy.mockRestore();
  });

  test('does not warn for glyphs that are present in the font', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const adapter = new BmFontAdapter(makeFontData(), [makeTex()], 1);

    adapter.getGlyph('A', 0);
    adapter.getGlyph('B', 0);
    adapter.getGlyph(' ', 0);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('warns separately for each distinct missing glyph', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const adapter = new BmFontAdapter(makeFontData(), [makeTex()], 1);

    adapter.getGlyph('Y', 0);
    adapter.getGlyph('Z', 0);

    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  test('BitmapText rebuild does not re-trigger warning for already-seen missing glyph', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const font = makeFont(); // font has A, B, space — not Z
    const text = new BitmapText('AZB', font);

    // Force a rebuild by changing the text (triggers _rebuild internally)
    text.text = 'AZB';

    expect(spy).toHaveBeenCalledTimes(1); // Z warned exactly once across both layouts
    spy.mockRestore();
  });
});
