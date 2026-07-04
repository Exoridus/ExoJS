/**
 * Tests for the TextLayout module: layoutText(), measureText(), and
 * buildTextPageQuads().
 *
 * We use a minimal mock GlyphAtlas (for layoutText) and a bare-bones fake
 * GlyphProvider with a fixed advance per char (for measureText) so we can
 * assert exact placement/measurement math without depending on a real
 * canvas 2D context.
 */

import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import { buildTextPageQuads, layoutText, measureText } from '#rendering/text/TextLayout';
import { TextStyle } from '#rendering/text/TextStyle';
import type { GlyphInfo, GlyphPlacement, GlyphProvider } from '#rendering/text/types';

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
// Fake GlyphProvider — fixed advance per char, no atlas/canvas involved.
// ---------------------------------------------------------------------------

function makeProvider(advance = 10): GlyphProvider {
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

  test('maxWidth keeps multiple short words on the same line when they fit', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    // "A B" = 10 + 10(space) + 10 = 30px. maxWidth = 100 → both words fit on line 0.
    const placements = layoutText('A B', style, { maxWidth: 100 }, atlas);

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
    const placements = layoutText('Hi ABCDEFGHIJKL', style, { maxWidth: 50, breakWords: true }, atlas);

    const lineYs = [...new Set(placements.map(placement => placement.y))];
    expect(lineYs.length).toBeGreaterThanOrEqual(3); // "Hi" line + at least 2 char-split lines
  });

  test('align "justify" distributes extra space across inter-word gaps on non-last lines', () => {
    // The source detects "start of a new word" by comparing a glyph's advance
    // to the space glyph's advance — so the mock atlas must give the space a
    // *different* advance than letters, or every character looks like a word
    // start (uniform-advance atlases can't exercise this branch).
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
    // over budget but unbreakable without breakWords) becomes line 1 — the
    // widest realized line, so line 0 has slack to distribute.
    const placements = layoutText('A B CCCCC', style, { maxWidth: 30 }, atlas);

    const lineYs = [...new Set(placements.map(p => p.y))];
    expect(lineYs).toHaveLength(2);

    // First line contains 'A', ' ', 'B' — the justified gap should stretch
    // "B" beyond its natural (unjustified) position of 15px.
    const firstLine = placements.filter(p => p.y === lineYs[0]);
    expect(firstLine).toHaveLength(3);
    const bPlacement = firstLine.at(-1)!;
    expect(bPlacement.x).toBe(40); // 15 natural + 25 stretch (extraPerGap = (50 - 25) / 1)
  });

  test('align "justify" does not stretch the last line', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'justify' });

    // Single line (no wrap) — justify must behave like left-align since this
    // is simultaneously the first and last line.
    const placements = layoutText('A B', style, {}, atlas);

    expect(placements[0]?.x).toBe(0);
    expect(placements[2]?.x).toBe(2 * advance);
  });

  test('whiteSpace "normal" collapses newlines to spaces and runs of spaces to one', () => {
    const advance = 10;
    const atlas = makeAtlas(advance);
    const style = new TextStyle({ fontSize: 16, align: 'left' });

    const normalized = layoutText('A\nB   C', style, { whiteSpace: 'normal' }, atlas);
    const preLine = layoutText('A\nB   C', style, { whiteSpace: 'pre-line' }, atlas);

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

    const placements = layoutText('A   B', style, { whiteSpace: 'pre' }, atlas);

    expect(placements).toHaveLength(5); // 'A', ' ', ' ', ' ', 'B' — no collapsing
  });
});

// ---------------------------------------------------------------------------
// measureText()
// ---------------------------------------------------------------------------

describe('measureText', () => {
  test('empty text returns zero width and height', () => {
    const provider = makeProvider();
    const style = new TextStyle({ fontSize: 16 });

    expect(measureText('', style, provider)).toEqual({ width: 0, height: 0 });
  });

  test('single-line width is the sum of glyph advances', () => {
    const advance = 10;
    const provider = makeProvider(advance);
    const style = new TextStyle({ fontSize: 16, lineHeight: 1, leading: 0 });

    const size = measureText('Hello', style, provider);

    expect(size.width).toBe(5 * advance);
  });

  test('lineHeight is a multiplier on fontSize, not an absolute pixel value', () => {
    const provider = makeProvider(10);
    const fontSize = 20;
    const lineHeight = 2; // multiplier
    const style = new TextStyle({ fontSize, lineHeight, leading: 0 });

    const size = measureText('X', style, provider);

    // computedLineHeight = fontSize * lineHeight + leading = 20 * 2 + 0 = 40
    expect(size.height).toBe(40);
  });

  test('leading adds a flat pixel amount on top of the lineHeight multiplier', () => {
    const provider = makeProvider(10);
    const style = new TextStyle({ fontSize: 10, lineHeight: 1, leading: 4 });

    const size = measureText('X', style, provider);

    // computedLineHeight = 10 * 1 + 4 = 14
    expect(size.height).toBe(14);
  });

  test('multi-line text height scales with the number of \\n-separated lines', () => {
    const provider = makeProvider(10);
    const fontSize = 20;
    const lineHeight = 1.2;
    const leading = 3;
    const style = new TextStyle({ fontSize, lineHeight, leading });

    const size = measureText('one\ntwo\nthree', style, provider);

    const computedLineHeight = fontSize * lineHeight + leading;
    expect(size.height).toBe(3 * computedLineHeight);
  });

  test('multi-line width is the widest line, not the total or first line', () => {
    const provider = makeProvider(10);
    const style = new TextStyle({ fontSize: 16 });

    // Line widths: 'Hi' = 20, 'Hello' = 50, 'Yo' = 20 → widest is 50.
    const size = measureText('Hi\nHello\nYo', style, provider);

    expect(size.width).toBe(50);
  });

  test('a single empty line (trailing newline) still counts toward height', () => {
    const provider = makeProvider(10);
    const style = new TextStyle({ fontSize: 20, lineHeight: 1, leading: 0 });

    const size = measureText('A\n', style, provider);

    expect(size.width).toBe(10); // widest line is 'A'
    expect(size.height).toBe(2 * 20); // 2 lines: 'A' and ''
  });
});

// ---------------------------------------------------------------------------
// buildTextPageQuads()
// ---------------------------------------------------------------------------

describe('buildTextPageQuads', () => {
  function makePlacement(overrides: Partial<GlyphPlacement> = {}): GlyphPlacement {
    return {
      x: 0,
      y: 0,
      width: 8,
      height: 12,
      page: 0,
      uvLeft: 0,
      uvTop: 0,
      uvRight: 1,
      uvBottom: 1,
      ...overrides,
    };
  }

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
});
