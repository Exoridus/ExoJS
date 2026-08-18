/**
 * Tests for the raster-density half of the glyph atlas.
 *
 * Two separate claims live here:
 *
 * 1. The pool treats the pixel ratio as part of an atlas's IDENTITY, while the
 *    logical metrics of a font variant stay shared across all of them. The pool
 *    is process-wide, so getting this wrong would let one application's density
 *    leak into another's text.
 * 2. An atlas rasterizes at `logical × pixelRatio` and hands every raster-derived
 *    number back divided by the ratio, so its caller keeps working in logical
 *    pixels.
 *
 * Claim 2 is exercised in `'color'` mode because that path goes through Canvas
 * 2D, which jsdom can mock. The SDF path needs `getImageData` and is pinned in
 * the browser lane (`webgl2-text-pixel-ratio.test.ts`).
 */

import { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';

// ---------------------------------------------------------------------------
// Mock canvas 2D
//
// The metrics are deliberately CONSTANT across font sizes. A real font scales
// with the size, which would make "did the ratio reach the rasterizer" and "did
// the result get normalized back" indistinguishable; with constant metrics the
// two are separate observations - the font string carries the first, the
// returned GlyphInfo the second.
// ---------------------------------------------------------------------------

const measured = {
  width: 10,
  actualBoundingBoxLeft: 0,
  actualBoundingBoxRight: 9,
  fontBoundingBoxAscent: 14,
  fontBoundingBoxDescent: 4,
};

let fontHistory: string[] = [];

function installMockCtx(): void {
  const ctx = {
    _font: '',
    get font(): string {
      return this._font;
    },
    set font(value: string) {
      this._font = value;
      fontHistory.push(value);
    },
    textBaseline: 'alphabetic',
    fillStyle: '#ffffff',
    measureText: () => measured as unknown as TextMetrics,
    fillText: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
  };

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ctx,
  });
}

beforeEach(() => {
  fontHistory = [];
  installMockCtx();
});

afterEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined }),
  });
});

// ---------------------------------------------------------------------------
// Pool identity
// ---------------------------------------------------------------------------

describe('GlyphAtlasPool identity', () => {
  test('keys the atlas on the pixel ratio', () => {
    const pool = new GlyphAtlasPool();

    const one = pool.getAtlas('Roboto', 'normal', '400', 'sdf', 8, 1);
    const two = pool.getAtlas('Roboto', 'normal', '400', 'sdf', 8, 2);
    const three = pool.getAtlas('Roboto', 'normal', '400', 'sdf', 8, 3);

    expect(new Set([one, two, three]).size).toBe(3);
    expect([one.pixelRatio, two.pixelRatio, three.pixelRatio]).toEqual([1, 2, 3]);
  });

  test('returns the same atlas for a repeated request', () => {
    const pool = new GlyphAtlasPool();

    expect(pool.getAtlas('Roboto', 'normal', '400', 'sdf', 8, 2)).toBe(pool.getAtlas('Roboto', 'normal', '400', 'sdf', 8, 2));
  });

  test('defaults to ratio 1', () => {
    const pool = new GlyphAtlasPool();

    expect(pool.getAtlas('Roboto', 'normal', '400').pixelRatio).toBe(1);
    expect(pool.getAtlas('Roboto', 'normal', '400')).toBe(pool.getAtlas('Roboto', 'normal', '400', 'sdf', 8, 1));
  });

  // The whole reason layout survives a ratio change: the numbers a line break
  // is decided from live in ONE cache per typeface, not one per raster grid.
  test('shares one metrics instance across every ratio, mode and radius of a variant', () => {
    const pool = new GlyphAtlasPool();

    const metrics = pool.getMetrics('Roboto', 'normal', '400');

    expect(pool.getAtlas('Roboto', 'normal', '400', 'sdf', 8, 1).metrics).toBe(metrics);
    expect(pool.getAtlas('Roboto', 'normal', '400', 'sdf', 8, 3).metrics).toBe(metrics);
    expect(pool.getAtlas('Roboto', 'normal', '400', 'color', 8, 2).metrics).toBe(metrics);
    expect(pool.getAtlas('Roboto', 'normal', '400', 'sdf', 16, 2).metrics).toBe(metrics);
  });

  test('separates metrics per font variant', () => {
    const pool = new GlyphAtlasPool();

    expect(pool.getMetrics('Roboto', 'normal', '400')).not.toBe(pool.getMetrics('Roboto', 'italic', '400'));
    expect(pool.getMetrics('Roboto', 'normal', '400')).not.toBe(pool.getMetrics('Roboto', 'normal', '700'));
    expect(pool.getMetrics('Roboto', 'normal', '400')).not.toBe(pool.getMetrics('Inter', 'normal', '400'));
  });
});

// ---------------------------------------------------------------------------
// Raster font size and metric normalization
// ---------------------------------------------------------------------------

describe('GlyphAtlas rasterization at a pixel ratio', () => {
  const atlasAt = (pixelRatio: number): GlyphAtlas => new GlyphAtlas('Roboto', 'normal', '400', 1024, 'color', 8, pixelRatio);

  test.each([
    [1, 16, '400 16px Roboto'],
    [2, 16, '400 32px Roboto'],
    [3, 9, '400 27px Roboto'],
    [3, 11, '400 33px Roboto'],
    [2, 24, '400 48px Roboto'],
  ])('ratio %p, logical size %p rasterizes from %p', (pixelRatio, fontSize, expectedFont) => {
    atlasAt(pixelRatio).getGlyph('A', fontSize);

    expect(fontHistory).toContain(expectedFont);
  });

  // The logical font size never reaches the canvas as a raster size, but it
  // MUST reach it as a measurement size - that is where the advance comes from.
  test('measures the advance at the logical size', () => {
    atlasAt(3).getGlyph('A', 9);

    expect(fontHistory).toContain('400 9px Roboto');
  });

  test('hands back logical geometry, not raster texels', () => {
    // Raster tile from the constant mock metrics: 9 wide, 14 + 4 = 18 tall.
    const one = atlasAt(1).getGlyph('A', 16);
    const three = atlasAt(3).getGlyph('A', 16);

    expect(one.width).toBe(9);
    expect(one.height).toBe(18);
    expect(one.ascent).toBe(14);

    expect(three.width).toBe(9 / 3);
    expect(three.height).toBe(18 / 3);
    expect(three.ascent).toBe(14 / 3);
  });

  // The advance is the number layout is built out of. It comes from the shared
  // logical metrics, so it is bit-identical at every ratio - a re-rasterization
  // at a different density cannot move a line break by a fraction of a pixel.
  test('keeps the advance identical across ratios', () => {
    const advances = [1, 1.5, 2, 3].map(ratio => atlasAt(ratio).getGlyph('A', 9).advance);

    expect(advances).toEqual([measured.width, measured.width, measured.width, measured.width]);
  });

  test('keeps the slot origin and UVs in atlas texels', () => {
    // Padded slot at ratio 3: 9 + 4 wide, 18 + 4 tall - unscaled, because a UV
    // addresses the raster grid rather than the logical one.
    const info = atlasAt(3).getGlyph('A', 16);

    expect(info.x).toBe(0);
    expect(info.y).toBe(0);
    expect(info.uvRight).toBe((9 + 4) / 1024);
    expect(info.uvBottom).toBe((18 + 4) / 1024);
  });
});
