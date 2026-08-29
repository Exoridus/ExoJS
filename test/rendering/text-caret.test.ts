import { caretRectAt, indexAtPoint } from '#rendering/text/textCaret';
import { layoutText } from '#rendering/text/TextLayout';
import type { GlyphInfo, GlyphProvider, TextLayoutResult } from '#rendering/text/types';

/**
 * Deterministic mixed-width provider: advances vary per character and are
 * always wider than the ink, bearings are zero, so caret boundaries sit
 * exactly on placement edges and the round-trip has no slack to hide in.
 */
const makeProvider = (): GlyphProvider => {
  const cache = new Map<string, GlyphInfo>();

  return {
    getGlyph(char: string): GlyphInfo {
      let info = cache.get(char);

      if (info === undefined) {
        const code = char.codePointAt(0) ?? 0;
        const advance = 6 + (code % 9);
        const width = Math.max(1, advance - 2);

        info = { x: 0, y: 0, width, height: 12, advance, ascent: 10, page: 0, uvLeft: 0, uvTop: 0, uvRight: 0.01, uvBottom: 0.02 };
        cache.set(char, info);
      }

      return info;
    },
  };
};

const style = { fontSize: 20, lineHeight: 1.2, leading: 0, align: 'left' as const };

const layoutOf = (text: string): TextLayoutResult => layoutText(text, style, {}, makeProvider());

const codePoints = (text: string): string[] => [...text];

describe('text caret geometry', () => {
  test('caret boundaries walk the line from left to right', () => {
    const layout = layoutOf('mixed');

    expect(caretRectAt(layout, 0, 24).x).toBe(0);

    const last = caretRectAt(layout, codePoints('mixed').length, 24);

    expect(last.x).toBe(layout.advance.width);
    expect(last.height).toBe(24);
  });

  test('caret boundaries at an index past the end and below zero clamp', () => {
    const layout = layoutOf('abc');

    expect(caretRectAt(layout, 99, 24).x).toBe(layout.advance.width);
    expect(caretRectAt(layout, -3, 24).x).toBe(0);
  });

  test('an empty layout answers a zero-width caret at the origin', () => {
    const layout = layoutOf('');

    expect(caretRectAt(layout, 0, 24)).toMatchObject({ x: 0, y: 0 });
    expect(indexAtPoint(layout, 50, 10)).toBe(0);
  });

  test('indexAtPoint snaps to the nearer edge of the glyph under the point', () => {
    const layout = layoutOf('mixed');
    const placements = layout.placements;

    // Left half of a glyph selects before it, right half after it.
    for (let i = 0; i < placements.length; i++) {
      const placement = placements[i]!;
      const mid = placement.penX + placement.penAdvance / 2;

      expect(indexAtPoint(layout, mid - 0.25, 10)).toBe(i);
      expect(indexAtPoint(layout, mid + 0.25, 10)).toBe(i + 1);
    }
  });

  test('caretRectAt and indexAtPoint round-trip for every index of a mixed-width string', () => {
    const text = 'a mixed width str\u00E9 with \u{1F44D} and wide glyphs';
    const layout = layoutOf(text);
    const count = codePoints(text).length;

    for (let i = 0; i <= count; i++) {
      const caret = caretRectAt(layout, i, 24);

      expect(indexAtPoint(layout, caret.x - 0.25, 10)).toBe(i);
      expect(indexAtPoint(layout, caret.x + 0.25, 10)).toBe(i);
    }
  });

  test('caret boundaries follow the pen, not the ink edge a bearing pulls sideways', () => {
    // An SDF atlas hands out negative bearings: the padded tile starts left of
    // the pen. A caret placed on the quad's x would sit that padding left of
    // the character it belongs in front of.
    const padded: GlyphProvider = {
      getGlyph: (): GlyphInfo => ({
        x: 0,
        y: 0,
        width: 16,
        height: 16,
        advance: 10,
        ascent: 10,
        xBearing: -3,
        yBearing: -3,
        page: 0,
        uvLeft: 0,
        uvTop: 0,
        uvRight: 0.01,
        uvBottom: 0.02,
      }),
    };

    const layout = layoutText('aaa', style, {}, padded);

    expect(layout.placements[1]!.x).toBe(7);
    expect(caretRectAt(layout, 1, 24).x).toBe(10);
    expect(indexAtPoint(layout, 11, 10)).toBe(1);
    expect(indexAtPoint(layout, 16, 10)).toBe(2);
  });

  test('an index inside an astral surrogate pair resolves to the glyph containing it', () => {
    const text = 'a\u{1F44D}b';
    const layout = layoutOf(text);

    // The emoji is astral (two UTF-16 units) but occupies exactly one
    // placement - one glyph in the caret index space.
    expect(layout.placements.length).toBe(3);

    const emojiCaret = caretRectAt(layout, 1, 24);

    expect(caretRectAt(layout, 2, 24).x).toBeGreaterThan(emojiCaret.x);
    expect(indexAtPoint(layout, emojiCaret.x + 0.25, 10)).toBe(1);
  });
});
