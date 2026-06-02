/**
 * Tests for the layoutText() function.
 *
 * We use a minimal mock GlyphAtlas that returns predictable GlyphInfo values
 * so we can assert exact placement coordinates without depending on a real
 * canvas 2D context.
 */

import type { GlyphAtlas } from '@/rendering/text/GlyphAtlas';
import { layoutText } from '@/rendering/text/TextLayout';
import { TextStyle } from '@/rendering/text/TextStyle';
import type { GlyphInfo } from '@/rendering/text/types';

// ---------------------------------------------------------------------------
// Mock atlas
// ---------------------------------------------------------------------------

function makeAtlas(advance = 10, width = 8, height = 16): GlyphAtlas {
  const infoBase: GlyphInfo = {
    x: 0,
    y: 0,
    width,
    height,
    advance,
    ascent: 13,
    page: 0,
    uvLeft: 0,
    uvTop: 0,
    uvRight: 0.1,
    uvBottom: 0.02,
  };

  return {
    getGlyph: vi.fn(() => infoBase),
    pages: [{ texture: { width: 1024, height: 1024 } }],
  } as unknown as GlyphAtlas;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('layoutText', () => {
  test('empty text returns an empty array', () => {
    const atlas = makeAtlas();
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    expect(layoutText('', style, {}, atlas)).toEqual([]);
  });

  test('single line "Hello" — 5 placements with increasing x', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    const placements = layoutText('Hello', style, {}, atlas);

    expect(placements).toHaveLength(5);

    for (let i = 0; i < placements.length; i++) {
      expect(placements[i].x).toBe(i * advance);
      expect(placements[i].y).toBe(0);
    }
  });

  test('multi-line "Hi\\nThere" — 7 placements, "There" starts at y = lineHeight', () => {
    const fontSize = 16;
    const lineHeight = 1.2;
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize, lineHeight, align: 'left' });

    const placements = layoutText('Hi\nThere', style, {}, atlas);

    expect(placements).toHaveLength(7);

    expect(placements[0].y).toBe(0);
    expect(placements[1].y).toBe(0);

    const expectedY = fontSize * lineHeight;
    for (let i = 2; i < 7; i++) {
      expect(placements[i].y).toBeCloseTo(expectedY);
    }
  });

  test('align "left" — x starts at 0 for all lines', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    const placements = layoutText('AB\nC', style, {}, atlas);

    expect(placements[0].x).toBe(0);
    expect(placements[1].x).toBe(10);
    expect(placements[2].x).toBe(0);
  });

  test('align "right" — shorter lines are shifted right', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'right' });

    const placements = layoutText('AB\nC', style, {}, atlas);

    expect(placements).toHaveLength(3);
    expect(placements[0].x).toBe(0);
    expect(placements[1].x).toBe(10);
    expect(placements[2].x).toBe(10);
  });

  test('align "center" — shorter lines are centered', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'center' });

    const placements = layoutText('AB\nC', style, {}, atlas);

    expect(placements).toHaveLength(3);
    expect(placements[2].x).toBeCloseTo(5);
  });

  test('single space character returns a placement (advance > 0)', () => {
    const atlas = makeAtlas(5);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    const placements = layoutText(' ', style, {}, atlas);

    expect(placements).toHaveLength(1);
    expect(placements[0].x).toBe(0);
  });

  test('placements carry correct UV coordinates from atlas', () => {
    const glyphInfo: GlyphInfo = {
      x: 4,
      y: 8,
      width: 12,
      height: 20,
      advance: 12,
      ascent: 16,
      page: 0,
      uvLeft: 0.05,
      uvTop: 0.1,
      uvRight: 0.15,
      uvBottom: 0.2,
    };

    const atlas = {
      getGlyph: () => glyphInfo,
      pages: [{ texture: { width: 1024, height: 1024 } }],
    } as unknown as GlyphAtlas;

    const style = new TextStyle({ fontSize: 16, align: 'left' });
    const placements = layoutText('X', style, {}, atlas);

    expect(placements[0].uvLeft).toBe(glyphInfo.uvLeft);
    expect(placements[0].uvTop).toBe(glyphInfo.uvTop);
    expect(placements[0].uvRight).toBe(glyphInfo.uvRight);
    expect(placements[0].uvBottom).toBe(glyphInfo.uvBottom);
    expect(placements[0].width).toBe(glyphInfo.width);
    expect(placements[0].height).toBe(glyphInfo.height);
    expect(placements[0].page).toBe(0);
  });

  test('letterSpacing adds extra gap between glyphs', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16 });

    const placements = layoutText('ABC', style, { letterSpacing: 5 }, atlas);

    expect(placements).toHaveLength(3);
    expect(placements[0].x).toBe(0);
    expect(placements[1].x).toBe(15); // advance(10) + spacing(5)
    expect(placements[2].x).toBe(30);
  });

  test('maxWidth wraps long words at word boundaries', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    // "Hello World" with advance=10 per char, space width=10
    // "Hello" = 50px, "World" = 50px, with space = 110px total
    // maxWidth = 60 → wrap before "World"
    const placements = layoutText('Hello World', style, { maxWidth: 60 }, atlas);

    // "Hello" on line 0 at y=0, "World" on line 1 at y=lineHeight
    expect(placements.length).toBe(10); // 5 + 5 chars
    expect(placements[0].y).toBe(0);
    expect(placements[5].y).toBeGreaterThan(0); // second line
    expect(placements[5].x).toBe(0); // starts at left
  });

  test('no maxWidth keeps a long spaced string on a single line', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    const placements = layoutText('the quick brown fox', style, {}, atlas);

    // Without a wrap width every glyph stays on line 0 and x increases
    // monotonically — the canonical "no wrap" behaviour.
    let prevX = -1;
    for (const placement of placements) {
      expect(placement.y).toBe(0);
      expect(placement.x).toBeGreaterThan(prevX);
      prevX = placement.x;
    }
  });

  test('breakWords splits an unbreakable token across multiple lines', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    // 12-char token at advance 10 → 120px; maxWidth 50 → ~5 chars per line.
    const placements = layoutText('ABCDEFGHIJKL', style, { maxWidth: 50, breakWords: true }, atlas);

    const lineYs = [...new Set(placements.map(placement => placement.y))];
    expect(lineYs.length).toBeGreaterThanOrEqual(2); // wrapped onto multiple lines
    expect(Math.min(...placements.map(placement => placement.x))).toBe(0); // each line restarts at x = 0
  });

  test('without breakWords an overlong unbroken token stays on one line', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    // No spaces to break on and breakWords off → a single overflowing line.
    const placements = layoutText('ABCDEFGHIJKL', style, { maxWidth: 50 }, atlas);

    const lineYs = [...new Set(placements.map(placement => placement.y))];
    expect(lineYs).toEqual([0]);
  });
});
