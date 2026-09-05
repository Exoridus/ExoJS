/**
 * Tests for the TextLayout module: layoutText() and buildTextPageQuads().
 *
 * We use a minimal mock GlyphAtlas and a bare-bones fake GlyphProvider with a
 * fixed advance per char so we can assert exact placement/measurement math
 * without depending on a real canvas 2D context.
 */

import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import { buildTextPageQuads, layoutText } from '#rendering/text/textLayout';
import { TextStyle } from '#rendering/text/TextStyle';
import type { GlyphInfo, GlyphPlacement, GlyphProvider } from '#rendering/text/types';

// ---------------------------------------------------------------------------
// Mock atlas
// ---------------------------------------------------------------------------

const makeAtlas = (advance = 10, width = 8, height = 16): GlyphAtlas => {
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
};

// ---------------------------------------------------------------------------
// Fake GlyphProvider - fixed advance per char, no atlas/canvas involved.
// ---------------------------------------------------------------------------

const makeProvider = (advance = 10): GlyphProvider => {
  return {
    getGlyph: (_char: string, fontSize: number): GlyphInfo => ({
      x: 0,
      y: 0,
      width: advance,
      height: fontSize,
      advance,
      ascent: fontSize,
      page: 0,
      uvLeft: 0,
      uvTop: 0,
      uvRight: 1,
      uvBottom: 1,
    }),
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('layoutText', () => {
  test('empty text returns no placements', () => {
    const atlas = makeAtlas();
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    expect(layoutText('', style, {}, atlas).placements).toEqual([]);
  });

  test('single line "Hello" — 5 placements with increasing x', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    const placements = layoutText('Hello', style, {}, atlas).placements;

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

    const placements = layoutText('Hi\nThere', style, {}, atlas).placements;

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

    const placements = layoutText('AB\nC', style, {}, atlas).placements;

    expect(placements[0].x).toBe(0);
    expect(placements[1].x).toBe(10);
    expect(placements[2].x).toBe(0);
  });

  test('align "right" — shorter lines are shifted right', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'right' });

    const placements = layoutText('AB\nC', style, {}, atlas).placements;

    expect(placements).toHaveLength(3);
    expect(placements[0].x).toBe(0);
    expect(placements[1].x).toBe(10);
    expect(placements[2].x).toBe(10);
  });

  test('align "center" — shorter lines are centered', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'center' });

    const placements = layoutText('AB\nC', style, {}, atlas).placements;

    expect(placements).toHaveLength(3);
    expect(placements[2].x).toBeCloseTo(5);
  });

  test('single space character returns a placement (advance > 0)', () => {
    const atlas = makeAtlas(5);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    const placements = layoutText(' ', style, {}, atlas).placements;

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
    const placements = layoutText('X', style, {}, atlas).placements;

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

    const placements = layoutText('ABC', style, { letterSpacing: 5 }, atlas).placements;

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
    const placements = layoutText('Hello World', style, { maxWidth: 60 }, atlas).placements;

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

    const placements = layoutText('the quick brown fox', style, {}, atlas).placements;

    // Without a wrap width every glyph stays on line 0 and x increases
    // monotonically - the canonical "no wrap" behaviour.
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
    const placements = layoutText('ABCDEFGHIJKL', style, { maxWidth: 50, breakWords: true }, atlas).placements;

    const lineYs = [...new Set(placements.map(placement => placement.y))];
    expect(lineYs.length).toBeGreaterThanOrEqual(2); // wrapped onto multiple lines
    expect(Math.min(...placements.map(placement => placement.x))).toBe(0); // each line restarts at x = 0
  });

  test('without breakWords an overlong unbroken token stays on one line', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    // No spaces to break on and breakWords off → a single overflowing line.
    const placements = layoutText('ABCDEFGHIJKL', style, { maxWidth: 50 }, atlas).placements;

    const lineYs = [...new Set(placements.map(placement => placement.y))];
    expect(lineYs).toEqual([0]);
  });

  test('maxWidth keeps multiple short words on the same line when they fit', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    // "A B" = 10 + 10(space) + 10 = 30px. maxWidth = 100 → both words fit on line 0.
    const placements = layoutText('A B', style, { maxWidth: 100 }, atlas).placements;

    const lineYs = [...new Set(placements.map(placement => placement.y))];
    expect(lineYs).toEqual([0]);
    expect(placements).toHaveLength(3); // 'A', ' ', 'B'
  });

  test('breakWords char-splits an overlong word that follows already-buffered content', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    // "Hi" (20px) fits on line 0 first; the following 12-char token (120px)
    // cannot join it and must be flushed + char-split across further lines.
    const placements = layoutText('Hi ABCDEFGHIJKL', style, { maxWidth: 50, breakWords: true }, atlas).placements;

    const lineYs = [...new Set(placements.map(placement => placement.y))];
    expect(lineYs.length).toBeGreaterThanOrEqual(3); // "Hi" line + at least 2 char-split lines
  });

  test('align "justify" distributes extra space across inter-word gaps on non-last lines', () => {
    const letterAdvance = 10;
    const spaceAdvance = 5;
    const atlas = {
      getGlyph: vi.fn((char: string) => ({
        x: 0,
        y: 0,
        width: 8,
        height: 16,
        advance: char === ' ' ? spaceAdvance : letterAdvance,
        ascent: 13,
        page: 0,
        uvLeft: 0,
        uvTop: 0,
        uvRight: 0.1,
        uvBottom: 0.02,
      })),
      pages: [{ texture: { width: 1024, height: 1024 } }],
    } as unknown as GlyphAtlas;
    const style = new TextStyle({ fontSize: 16, align: 'justify' });

    // _wrapLine (maxWidth 30): "A B" (25px) fits on line 0; "CCCCC" (50px,
    // over budget but unbreakable without breakWords) becomes line 1 - the
    // widest realized line, so line 0 has slack to distribute.
    const placements = layoutText('A B CCCCC', style, { maxWidth: 30 }, atlas).placements;

    const lineYs = [...new Set(placements.map(p => p.y))];
    expect(lineYs).toHaveLength(2);

    // First line contains 'A', ' ', 'B' - the justified gap should stretch
    // "B" beyond its natural (unjustified) position of 15px.
    const firstLine = placements.filter(p => p.y === lineYs[0]);
    expect(firstLine).toHaveLength(3);
    const bPlacement = firstLine.at(-1)!;
    expect(bPlacement.x).toBe(40); // 15 natural + 25 stretch (extraPerGap = (50 - 25) / 1)
  });

  test('align "justify" reports the post-justify line width, not the natural pre-justify width', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'justify' });

    // Same wrap as the test above: "A B" (natural 30px) is stretched to fill
    // the widest realized line, "CCCCC" (50px). A selection rectangle or
    // caret reading `lines[0].width` needs the STRETCHED extent (50), not
    // the 30px the line measured before justify distributed the slack.
    const { lines } = layoutText('A B CCCCC', style, { maxWidth: 30 }, atlas);

    expect(lines).toHaveLength(2);
    expect(lines[0]!.width).toBe(50);
    expect(lines[1]!.width).toBe(50);
  });

  test('align "justify" works with a uniform-advance (monospace) atlas', () => {
    // Word boundaries must be detected from the characters themselves, not by
    // comparing advances against the space glyph - with a monospace atlas every
    // glyph shares the space's advance, which used to defeat gap detection.
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'justify' });

    // _wrapLine (maxWidth 30): "A B" (30px) fits on line 0; "CCCCC" (50px,
    // over budget but unbreakable without breakWords) becomes line 1 - the
    // widest realized line, so line 0 has slack to distribute.
    const placements = layoutText('A B CCCCC', style, { maxWidth: 30 }, atlas).placements;

    const lineYs = [...new Set(placements.map(p => p.y))];
    expect(lineYs).toHaveLength(2);

    // First line contains 'A', ' ', 'B' - the justified gap must stretch "B"
    // beyond its natural position of 20px: extraPerGap = (50 - 30) / 1 = 20.
    const firstLine = placements.filter(p => p.y === lineYs[0]);
    expect(firstLine).toHaveLength(3);
    expect(firstLine[0]!.x).toBe(0); // first word stays anchored at the left edge
    expect(firstLine.at(-1)!.x).toBe(40);
  });

  test('align "justify" does not stretch the last line', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'justify' });

    // Single line (no wrap) - justify must behave like left-align since this
    // is simultaneously the first and last line.
    const placements = layoutText('A B', style, {}, atlas).placements;

    expect(placements[0]?.x).toBe(0);
    expect(placements[2]?.x).toBe(2 * advance);
  });

  test('whiteSpace "normal" collapses newlines to spaces and runs of spaces to one', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    const normalized = layoutText('A\nB   C', style, { whiteSpace: 'normal' }, atlas).placements;
    const preLine = layoutText('A\nB   C', style, { whiteSpace: 'pre-line' }, atlas).placements;

    // 'normal' turns the whole string into one line: "A B C" (5 chars incl. spaces).
    const normalLineYs = [...new Set(normalized.map(p => p.y))];
    expect(normalLineYs).toEqual([0]);
    expect(normalized).toHaveLength(5);

    // 'pre-line' preserves the \n as a hard break, so it still spans 2 lines.
    const preLineYs = [...new Set(preLine.map(p => p.y))];
    expect(preLineYs.length).toBe(2);
  });

  test('whiteSpace "pre" preserves runs of spaces verbatim', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    const placements = layoutText('A   B', style, { whiteSpace: 'pre' }, atlas).placements;

    expect(placements).toHaveLength(5); // 'A', ' ', ' ', ' ', 'B' — no collapsing
  });
});

// ---------------------------------------------------------------------------
// Vertical overflow - maxHeight + overflow
// ---------------------------------------------------------------------------

describe('layoutText vertical overflow', () => {
  // fontSize 16 * lineHeight 1.2 = 19.2px per line, so maxHeight 40 fits two.
  const twoLineMaxHeight = 40;

  const overflowStyle = (): TextStyle => {
    return new TextStyle({ fontSize: 16, lineHeight: 1.2, align: 'left' });
  };

  test('maxHeight without overflow keeps every line visible', () => {
    const placements = layoutText('A\nB\nC', overflowStyle(), { maxHeight: twoLineMaxHeight }, makeAtlas()).placements;

    expect(placements).toHaveLength(3);
    expect(placements[2].y).toBeCloseTo(38.4);
  });

  test('overflow "clip" drops lines that do not fit maxHeight', () => {
    const placements = layoutText('A\nB\nC', overflowStyle(), { maxHeight: twoLineMaxHeight, overflow: 'clip' }, makeAtlas()).placements;

    expect(placements).toHaveLength(2);
    expect(placements[0].y).toBe(0);
    expect(placements[1].y).toBeCloseTo(19.2);
  });

  test('overflow "ellipsis" clips and appends an ellipsis to the last visible line', () => {
    const placements = layoutText('A\nB\nC', overflowStyle(), { maxHeight: twoLineMaxHeight, overflow: 'ellipsis' }, makeAtlas()).placements;

    // 'A' on line 0, then 'B' + the ellipsis glyph on line 1.
    expect(placements).toHaveLength(3);
    expect(placements[0].y).toBe(0);
    expect(placements[1].y).toBeCloseTo(19.2);
    expect(placements[2].y).toBeCloseTo(19.2);
  });

  test('overflow without maxHeight leaves the text untouched', () => {
    const placements = layoutText('A\nB\nC', overflowStyle(), { overflow: 'clip' }, makeAtlas()).placements;

    expect(placements).toHaveLength(3);
  });

  test('maxHeight smaller than a single line clips everything away', () => {
    const placements = layoutText('A\nB', overflowStyle(), { maxHeight: 5, overflow: 'clip' }, makeAtlas()).placements;

    expect(placements).toHaveLength(0);
  });

  test('overflow "ellipsis" drops trailing characters so the line still fits maxWidth', () => {
    // advance 10, maxWidth 30 → three glyph slots. 'ABC' already fills them,
    // so the ellipsis has to displace a character rather than overflow.
    const placements = layoutText('ABC\nD', overflowStyle(), { maxWidth: 30, maxHeight: 19.2, overflow: 'ellipsis' }, makeAtlas()).placements;

    expect(placements).toHaveLength(3);
    for (const p of placements) expect(p.y).toBe(0);
    expect(placements[2].x).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Line cap - maxLines + ellipsis marker
// ---------------------------------------------------------------------------

describe('layoutText maxLines', () => {
  const capStyle = (): TextStyle => new TextStyle({ fontSize: 16, lineHeight: 1.2, align: 'left' });

  test('clips the line count on its own, with no overflow policy', () => {
    const { placements, lines } = layoutText('A\nB\nC', capStyle(), { maxLines: 2 }, makeAtlas());

    expect(lines).toHaveLength(2);
    expect(placements).toHaveLength(2);
  });

  test('reports the advance height of the kept lines only', () => {
    const { advance } = layoutText('A\nB\nC\nD', capStyle(), { maxLines: 2 }, makeAtlas());

    expect(advance.height).toBeCloseTo(38.4);
  });

  test('counts wrapped lines, not hard breaks', () => {
    // advance 10, maxWidth 30 → 'AAA' per line, so 'AAA AAA AAA' wraps to three.
    const { lines } = layoutText('AAA AAA AAA', capStyle(), { maxWidth: 30, maxLines: 2 }, makeAtlas());

    expect(lines).toHaveLength(2);
  });

  test('marks the last kept line when overflow is "ellipsis"', () => {
    const { placements } = layoutText('A\nB\nC', capStyle(), { maxLines: 2, overflow: 'ellipsis' }, makeAtlas());

    // 'A', then 'B' plus the marker on the second line.
    expect(placements).toHaveLength(3);
    expect(placements[2].y).toBeCloseTo(19.2);
  });

  test('takes the tighter of maxLines and maxHeight', () => {
    const threeLines = { maxHeight: 60, overflow: 'clip' } as const;

    expect(layoutText('A\nB\nC\nD', capStyle(), threeLines, makeAtlas()).lines).toHaveLength(3);
    expect(layoutText('A\nB\nC\nD', capStyle(), { ...threeLines, maxLines: 2 }, makeAtlas()).lines).toHaveLength(2);
    expect(layoutText('A\nB\nC\nD', capStyle(), { ...threeLines, maxLines: 9 }, makeAtlas()).lines).toHaveLength(3);
  });

  test('rejects a maxLines below one', () => {
    expect(() => layoutText('A', capStyle(), { maxLines: 0 }, makeAtlas())).toThrow(/maxLines/);
  });
});

describe('layoutText ellipsis marker', () => {
  const markerStyle = (): TextStyle => new TextStyle({ fontSize: 16, lineHeight: 1.2, align: 'left' });

  test('a multi-cluster marker is measured cluster by cluster', () => {
    // advance 10, maxWidth 50 → five slots. '...' claims three of them, so only
    // two source characters survive.
    const { lines } = layoutText('ABCDEFG', markerStyle(), { maxWidth: 50, maxLines: 1, overflow: 'ellipsis', ellipsis: '...' }, makeAtlas());

    expect(lines[0].count).toBe(5);
    expect(lines[0].sourceEnd).toBe(2);
  });

  test('an empty marker truncates without appending anything', () => {
    const { placements } = layoutText('A\nB\nC', markerStyle(), { maxLines: 1, overflow: 'ellipsis', ellipsis: '' }, makeAtlas());

    expect(placements).toHaveLength(1);
  });

  test('marks a capped line that overflows maxWidth even when no line was dropped', () => {
    // One unbreakable word: nothing to wrap and nothing to drop, so only the
    // width check can reach it.
    const { placements } = layoutText('ABCDEFG', markerStyle(), { maxWidth: 50, maxLines: 1, overflow: 'ellipsis', ellipsis: '*' }, makeAtlas());

    expect(placements).toHaveLength(5);
    expect(placements.at(-1)!.sourceStart).toBe(4);
  });

  test('the marker stands for nothing in the source', () => {
    const { placements } = layoutText('ABCD\nE', markerStyle(), { maxWidth: 30, maxLines: 1, overflow: 'ellipsis', ellipsis: '*' }, makeAtlas());
    const marker = placements.at(-1)!;

    expect(marker.sourceStart).toBe(marker.sourceEnd);
  });
});

// ---------------------------------------------------------------------------
// Text direction
// ---------------------------------------------------------------------------

describe('layoutText direction', () => {
  /** Provider whose per-character advance doubles as an identity marker. */
  const makeCharProvider = (advances: Record<string, number>): GlyphProvider => {
    return {
      getGlyph: (char: string, fontSize: number): GlyphInfo => {
        const advance = advances[char] ?? 10;
        return {
          x: 0,
          y: 0,
          width: advance,
          height: fontSize,
          advance,
          ascent: fontSize,
          page: 0,
          uvLeft: 0,
          uvTop: 0,
          uvRight: 1,
          uvBottom: 1,
        };
      },
    };
  };

  test('direction "ltr" places glyphs in logical order', () => {
    const provider = makeCharProvider({ A: 10, B: 20 });
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    const placements = layoutText('AB', style, { direction: 'ltr' }, provider).placements;

    expect(placements[0].width).toBe(10); // 'A' first
    expect(placements[0].x).toBe(0);
    expect(placements[1].width).toBe(20); // 'B' second
    expect(placements[1].x).toBe(10);
  });

  test('direction "rtl" reverses the visual glyph order within a line', () => {
    const provider = makeCharProvider({ A: 10, B: 20 });
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    const placements = layoutText('AB', style, { direction: 'rtl' }, provider).placements;

    expect(placements[0].width).toBe(20); // 'B' now leads visually
    expect(placements[0].x).toBe(0);
    expect(placements[1].width).toBe(10); // 'A' trails
    expect(placements[1].x).toBe(20);
  });

  test('direction "rtl" reverses each line independently', () => {
    const provider = makeCharProvider({ A: 10, B: 20, C: 30, D: 40 });
    const style = new TextStyle({ fontSize: 16, lineHeight: 1.2, align: 'left' });

    const placements = layoutText('AB\nCD', style, { direction: 'rtl' }, provider).placements;

    expect(placements[0].width).toBe(20); // line 0 → 'B', 'A'
    expect(placements[1].width).toBe(10);
    expect(placements[2].width).toBe(40); // line 1 → 'D', 'C'
    expect(placements[3].width).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// layoutText() - the advance extent
// ---------------------------------------------------------------------------

describe('layoutText advance', () => {
  test('empty text has neither advance nor ink', () => {
    const provider = makeProvider();
    const style = new TextStyle({ fontSize: 16 });

    expect(layoutText('', style, {}, provider)).toEqual({
      placements: [],
      lines: [],
      advance: { width: 0, height: 0 },
      ink: { x: 0, y: 0, width: 0, height: 0 },
    });
  });

  test('single-line width is the sum of glyph advances', () => {
    const advance = 10;
    const provider = makeProvider(advance);
    const style = new TextStyle({ fontSize: 16, lineHeight: 1, leading: 0 });

    const size = layoutText('Hello', style, {}, provider).advance;

    expect(size.width).toBe(5 * advance);
  });

  test('lineHeight is a multiplier on fontSize, not an absolute pixel value', () => {
    const provider = makeProvider(10);
    const fontSize = 20;
    const lineHeight = 2; // multiplier
    const style = new TextStyle({ fontSize, lineHeight, leading: 0 });

    const size = layoutText('X', style, {}, provider).advance;

    // computedLineHeight = fontSize * lineHeight + leading = 20 * 2 + 0 = 40
    expect(size.height).toBe(40);
  });

  test('leading adds a flat pixel amount on top of the lineHeight multiplier', () => {
    const provider = makeProvider(10);
    const style = new TextStyle({ fontSize: 10, lineHeight: 1, leading: 4 });

    const size = layoutText('X', style, {}, provider).advance;

    // computedLineHeight = 10 * 1 + 4 = 14
    expect(size.height).toBe(14);
  });

  test('multi-line text height scales with the number of \\n-separated lines', () => {
    const provider = makeProvider(10);
    const fontSize = 20;
    const lineHeight = 1.2;
    const leading = 3;
    const style = new TextStyle({ fontSize, lineHeight, leading });

    const size = layoutText('one\ntwo\nthree', style, {}, provider).advance;

    const computedLineHeight = fontSize * lineHeight + leading;
    expect(size.height).toBe(3 * computedLineHeight);
  });

  test('multi-line width is the widest line, not the total or first line', () => {
    const provider = makeProvider(10);
    const style = new TextStyle({ fontSize: 16 });

    // Line widths: 'Hi' = 20, 'Hello' = 50, 'Yo' = 20 → widest is 50.
    const size = layoutText('Hi\nHello\nYo', style, {}, provider).advance;

    expect(size.width).toBe(50);
  });

  test('a single empty line (trailing newline) still counts toward height', () => {
    const provider = makeProvider(10);
    const style = new TextStyle({ fontSize: 20, lineHeight: 1, leading: 0 });

    const size = layoutText('A\n', style, {}, provider).advance;

    expect(size.width).toBe(10); // widest line is 'A'
    expect(size.height).toBe(2 * 20); // 2 lines: 'A' and ''
  });

  test('letterSpacing widens the advance but not by a trailing gap', () => {
    const provider = makeProvider(10);
    const style = new TextStyle({ fontSize: 16, lineHeight: 1, leading: 0 });

    const size = layoutText('ABC', style, { letterSpacing: 5 }, provider).advance;

    // 3 advances of 10 plus the 2 INTERIOR gaps - the gap after the last
    // glyph is not part of the extent.
    expect(size.width).toBe(3 * 10 + 2 * 5);
  });
});

// ---------------------------------------------------------------------------
// layoutText() - the ink extent
// ---------------------------------------------------------------------------

describe('layoutText ink', () => {
  /**
   * Provider standing in for the SDF path, where the atlas pads every glyph
   * and hands back negative bearings to pull the padded tile back around the
   * cursor. The ink therefore starts left of and above the layout origin.
   */
  const makePaddedProvider = (buffer: number, advance = 10, glyph = 8): GlyphProvider => {
    return {
      getGlyph: (): GlyphInfo => ({
        x: 0,
        y: 0,
        width: glyph + 2 * buffer,
        height: glyph + 2 * buffer,
        advance,
        ascent: glyph,
        page: 0,
        uvLeft: 0,
        uvTop: 0,
        uvRight: 1,
        uvBottom: 1,
        xBearing: -buffer,
        yBearing: -buffer,
      }),
    };
  };

  test('ink starts in the negative when the provider pads its glyphs', () => {
    const buffer = 3;
    const provider = makePaddedProvider(buffer);
    const style = new TextStyle({ fontSize: 16, lineHeight: 1, leading: 0, align: 'left' });

    const { advance, ink } = layoutText('AB', style, {}, provider);

    // Clamping the ink minimum to zero would report x = 0 here and cut the
    // outline reach off the left edge of every SDF label.
    expect(ink.x).toBe(-buffer);
    expect(ink.y).toBe(-buffer);

    // Two glyphs: quads span from -3 to (advance of 'A' = 10) + 8 + 3 = 21.
    expect(ink.width).toBe(21 - -buffer);
    expect(ink.height).toBe(8 + buffer - -buffer);

    // The advance is untouched by the padding.
    expect(advance.width).toBe(20);
    expect(advance.height).toBe(16);
  });

  test('ink is wider and taller than the advance in the padded case', () => {
    const provider = makePaddedProvider(3);
    const style = new TextStyle({ fontSize: 16, lineHeight: 1, leading: 0 });

    const { advance, ink } = layoutText('A', style, {}, provider);

    expect(ink.width).toBeGreaterThan(advance.width);
    expect(ink.x).toBeLessThan(0);
  });

  test('unpadded glyphs put the ink at the layout origin', () => {
    const provider = makeProvider(10);
    const style = new TextStyle({ fontSize: 16, lineHeight: 1, leading: 0 });

    const { ink } = layoutText('AB', style, {}, provider);

    expect(ink.x).toBe(0);
    expect(ink.y).toBe(0);
    expect(ink.width).toBe(20);
    expect(ink.height).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// buildTextPageQuads()
// ---------------------------------------------------------------------------

describe('buildTextPageQuads', () => {
  const makePlacement = (overrides: Partial<GlyphPlacement> = {}): GlyphPlacement => {
    return {
      x: 0,
      y: 0,
      width: 8,
      height: 12,
      penX: 0,
      penAdvance: 8,
      sourceStart: 0,
      sourceEnd: 1,
      page: 0,
      uvLeft: 0,
      uvTop: 0,
      uvRight: 1,
      uvBottom: 1,
      ...overrides,
    };
  };

  test('empty placement array yields no page-quad batches', () => {
    expect(buildTextPageQuads([])).toEqual([]);
  });

  test('builds one quad batch for a single page with correct vertex/uv/index layout', () => {
    const placement = makePlacement({ x: 2, y: 3, width: 8, height: 12, uvLeft: 0.1, uvTop: 0.2, uvRight: 0.3, uvBottom: 0.4 });
    const [batch] = buildTextPageQuads([placement]);

    expect(batch?.pageIndex).toBe(0);
    expect(batch?.quadCount).toBe(1);

    // Vertex quad: top-left, top-right, bottom-right, bottom-left.
    expect(Array.from(batch!.vertices)).toEqual([2, 3, 10, 3, 10, 15, 2, 15]);
    // uvs are stored in a Float32Array, so compare against the same rounded
    // precision rather than the original float64 literals.
    expect(Array.from(batch!.uvs)).toEqual(Array.from(new Float32Array([0.1, 0.2, 0.3, 0.2, 0.3, 0.4, 0.1, 0.4])));
    expect(Array.from(batch!.indices)).toEqual([0, 1, 2, 0, 2, 3]);
  });

  test('groups placements by page into separate batches', () => {
    const placements = [makePlacement({ page: 0 }), makePlacement({ page: 1 }), makePlacement({ page: 0 })];

    const batches = buildTextPageQuads(placements);
    const byPage = new Map(batches.map(b => [b.pageIndex, b]));

    expect(batches).toHaveLength(2);
    expect(byPage.get(0)?.quadCount).toBe(2);
    expect(byPage.get(1)?.quadCount).toBe(1);
  });

  test('skips zero-width or zero-height placements (e.g. whitespace glyphs)', () => {
    const placements = [makePlacement({ width: 0 }), makePlacement({ height: 0 }), makePlacement({ width: 8, height: 12 })];

    const [batch] = buildTextPageQuads(placements);

    expect(batch?.quadCount).toBe(1);
  });

  test('second quad in a batch offsets vertex/index buffers correctly', () => {
    const placements = [makePlacement({ x: 0 }), makePlacement({ x: 100 })];
    const [batch] = buildTextPageQuads(placements);

    expect(batch?.quadCount).toBe(2);
    // Second quad's top-left vertex is at buffer offset 8 (4 verts × 2 comps).
    expect(batch!.vertices[8]).toBe(100);
    // Second quad's indices are offset by 4 (base vertex index).
    expect(Array.from(batch!.indices.slice(6, 12))).toEqual([4, 5, 6, 4, 6, 7]);
  });

  test('does not wrap glyph indices for a single node past the old 16384-quad Uint16 ceiling', () => {
    // Quad 16384's base vertex index is 16384 * 4 = 65536, one past the last
    // value a Uint16 can hold (65535): a Uint16Array index buffer stores it
    // as 65536 & 0xFFFF === 0, silently aliasing quad 0's vertex slot.
    const quadCount = 16400;
    const placements = Array.from({ length: quadCount }, (_, i) => makePlacement({ x: i }));

    const [batch] = buildTextPageQuads(placements);

    expect(batch?.quadCount).toBe(quadCount);
    expect(batch!.indices).toBeInstanceOf(Uint32Array);

    const wrappingQuad = 16384;
    const wrappingBase = wrappingQuad * 6;
    const wrappingBaseV = wrappingQuad * 4;

    expect(Array.from(batch!.indices.slice(wrappingBase, wrappingBase + 6))).toEqual([
      wrappingBaseV,
      wrappingBaseV + 1,
      wrappingBaseV + 2,
      wrappingBaseV,
      wrappingBaseV + 2,
      wrappingBaseV + 3,
    ]);

    const lastQuad = quadCount - 1;
    const lastBase = lastQuad * 6;
    const lastBaseV = lastQuad * 4;

    expect(Array.from(batch!.indices.slice(lastBase, lastBase + 6))).toEqual([
      lastBaseV,
      lastBaseV + 1,
      lastBaseV + 2,
      lastBaseV,
      lastBaseV + 2,
      lastBaseV + 3,
    ]);
  });
});

// ---------------------------------------------------------------------------
// Source indexes - what maps a caret or a selection onto a laid-out glyph
// ---------------------------------------------------------------------------

describe('layoutText source indexes', () => {
  const provider = makeProvider(10);
  const style = (): TextStyle => new TextStyle({ fontSize: 16, lineHeight: 1, leading: 0, align: 'left' });

  test('a single line maps one glyph to one source character', () => {
    const { placements, lines } = layoutText('Hello', style(), {}, provider);

    expect(placements.map(placement => placement.sourceStart)).toEqual([0, 1, 2, 3, 4]);
    expect(lines[0]).toMatchObject({ sourceStart: 0, sourceEnd: 5 });
  });

  test('a hard line break advances the next line past the break character', () => {
    const { lines } = layoutText('ab\ncd', style(), {}, provider);

    expect(lines[0]).toMatchObject({ sourceStart: 0, sourceEnd: 2 });
    expect(lines[1]).toMatchObject({ sourceStart: 3, sourceEnd: 5 });
  });

  test('a soft wrap splits one string into lines that still point back into it', () => {
    // 'alpha beta' at advance 10 wraps after 'alpha'; nothing in the string
    // marks the break, so only the source range can locate the second line.
    const { lines } = layoutText('alpha beta', style(), { maxWidth: 60 }, provider);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ sourceStart: 0, sourceEnd: 5 });
    expect(lines[1]).toMatchObject({ sourceStart: 6, sourceEnd: 10 });
  });

  test('collapsed blanks do not shift the offsets the glyphs report', () => {
    // Preprocessing turns 'a   b' into 'a b'; 'b' is still source offset 4.
    const { placements } = layoutText('a   b', style(), { whiteSpace: 'pre-line' }, provider);

    expect(placements).toHaveLength(3);
    expect(placements.at(-1)).toMatchObject({ sourceStart: 4, sourceEnd: 5 });
  });

  test('the ellipsis stands for nothing and reports an empty range at the cut', () => {
    const { placements } = layoutText('ABCD\nE', style(), { maxWidth: 30, maxHeight: 16, overflow: 'ellipsis' }, provider);

    const ellipsis = placements.at(-1)!;

    expect(ellipsis.sourceStart).toBe(ellipsis.sourceEnd);
    expect(ellipsis.sourceStart).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Grapheme safety - the unit of layout is a cluster, never a code point
// ---------------------------------------------------------------------------

describe('layoutText grapheme safety', () => {
  const ZWJ_FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
  const FLAG = '\u{1F1E9}\u{1F1EA}';
  const COMBINING = 'é';

  /** Records every text unit the provider was asked to measure or rasterize. */
  const makeRecordingProvider = (advance = 10): { provider: GlyphProvider; units: string[] } => {
    const units: string[] = [];

    return {
      units,
      provider: {
        getGlyph: (char: string, fontSize: number): GlyphInfo => {
          units.push(char);

          return {
            x: 0,
            y: 0,
            width: advance,
            height: fontSize,
            advance,
            ascent: fontSize,
            page: 0,
            uvLeft: 0,
            uvTop: 0,
            uvRight: 1,
            uvBottom: 1,
          };
        },
      },
    };
  };

  test.each([
    ['a ZWJ sequence', ZWJ_FAMILY],
    ['a regional-indicator flag', FLAG],
    ['a combining sequence', COMBINING],
  ])('%s is placed as a single glyph', (_label, text) => {
    const { provider, units } = makeRecordingProvider();
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    expect(layoutText(text, style, {}, provider).placements).toHaveLength(1);
    expect(units).toEqual([text]);
  });

  test('breakWords splits between clusters, never inside one', () => {
    const { provider } = makeRecordingProvider(10);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    // Three cluster-wide glyphs at 10px each against a 25px budget: two
    // clusters fit the first line, the third moves down. A code-point split
    // would place six half-flag glyphs instead.
    const placements = layoutText(`${FLAG}${FLAG}${FLAG}`, style, { maxWidth: 25, breakWords: true }, provider).placements;

    expect(placements).toHaveLength(3);
    expect([...new Set(placements.map(placement => placement.y))]).toHaveLength(2);
  });

  test('ellipsis drops whole clusters, so no dangling combining mark is left', () => {
    const { provider } = makeRecordingProvider(10);
    const style = new TextStyle({ fontSize: 16, lineHeight: 1, leading: 0, align: 'left' });

    // 'A', the combining sequence and 'B' plus the ellipsis is 40px against a
    // 30px budget, so one cluster has to go - the combining sequence, whole.
    const layout = layoutText(`A${COMBINING}B\nX`, style, { maxWidth: 30, maxHeight: 16, overflow: 'ellipsis' }, provider);

    expect(layout.placements).toHaveLength(3);
    expect(layout.lines).toHaveLength(1);
  });

  test('direction "rtl" reverses clusters, keeping a combining mark on its base', () => {
    const { provider, units } = makeRecordingProvider();
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    layoutText(`A${COMBINING}`, style, { direction: 'rtl' }, provider);

    expect(units).toEqual([COMBINING, 'A']);
  });

  test('a cluster reports the source range it came from, astral offsets included', () => {
    const { provider } = makeRecordingProvider(10);
    const style = new TextStyle({ fontSize: 16, align: 'left' });
    const text = `A${FLAG}B`;

    const placements = layoutText(text, style, {}, provider).placements;

    expect(placements.map(placement => [placement.sourceStart, placement.sourceEnd])).toEqual([
      [0, 1],
      [1, 5],
      [5, 6],
    ]);
  });

  test('a line wraps at the word boundaries of an unspaced script', () => {
    const { provider } = makeRecordingProvider(10);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    // No space to break on: without locale-aware word segmentation the whole
    // string would overflow one line.
    const placements = layoutText('日本語のテキスト', style, { maxWidth: 45 }, provider).placements;

    expect([...new Set(placements.map(placement => placement.y))].length).toBeGreaterThan(1);
  });
});
