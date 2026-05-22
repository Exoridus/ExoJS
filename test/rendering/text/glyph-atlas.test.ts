/**
 * Tests for GlyphAtlas.
 *
 * jsdom does not implement canvas 2D, so we install a richer mock on
 * HTMLCanvasElement.prototype.getContext before each test.
 */

import { GlyphAtlas } from '@/rendering/text/GlyphAtlas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockCtx(overrides: Partial<CanvasRenderingContext2D> = {}): CanvasRenderingContext2D {
  return {
    font: '',
    textBaseline: 'alphabetic',
    fillStyle: '#ffffff',
    measureText: (_text: string) =>
      ({
        width: 10,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 9,
        actualBoundingBoxAscent: 13,
        actualBoundingBoxDescent: 3,
        fontBoundingBoxAscent: 14,
        fontBoundingBoxDescent: 4,
      }) as TextMetrics,
    fillText: jest.fn(),
    clearRect: jest.fn(),
    ...overrides,
  } as unknown as CanvasRenderingContext2D;
}

function installMockCtx(ctx: CanvasRenderingContext2D): void {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ctx,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// These tests use 'color' mode so the atlas uses the canvas-2D rasterization
// path, which is mockable in jsdom. SDF mode uses tiny-sdf which requires a
// real canvas getImageData implementation not available in jsdom.
describe('GlyphAtlas', () => {
  let mockCtx: CanvasRenderingContext2D;

  beforeEach(() => {
    mockCtx = makeMockCtx();
    installMockCtx(mockCtx);
  });

  afterEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined }),
    });
  });

  test('constructs with one initial AtlasPage of the given size', () => {
    const atlas = new GlyphAtlas('Arial', 'normal', 'bold', 1024, 'color');

    expect(atlas.pages).toHaveLength(1);
    expect(atlas.pages[0].texture.width).toBe(1024);
    expect(atlas.pages[0].texture.height).toBe(1024);
  });

  test('getGlyph returns GlyphInfo with sane bounds and advance > 0', () => {
    const atlas = new GlyphAtlas('sans-serif', 'normal', 'normal', 1024, 'color');
    const info = atlas.getGlyph('A', 16);

    expect(info.advance).toBeGreaterThan(0);
    expect(info.width).toBeGreaterThan(0);
    expect(info.height).toBeGreaterThan(0);
    expect(info.page).toBe(0);
    expect(info.uvLeft).toBeGreaterThanOrEqual(0);
    expect(info.uvRight).toBeLessThanOrEqual(1);
    expect(info.uvTop).toBeGreaterThanOrEqual(0);
    expect(info.uvBottom).toBeLessThanOrEqual(1);
    expect(info.uvRight).toBeGreaterThan(info.uvLeft);
    expect(info.uvBottom).toBeGreaterThan(info.uvTop);
  });

  test('same call twice returns the same cached instance', () => {
    const atlas = new GlyphAtlas('sans-serif', 'normal', 'normal', 1024, 'color');
    const a = atlas.getGlyph('A', 16);
    const b = atlas.getGlyph('A', 16);

    expect(a).toBe(b);
  });

  test('different char or size keys produce different entries', () => {
    const atlas = new GlyphAtlas('sans-serif', 'normal', 'normal', 1024, 'color');
    const infoA = atlas.getGlyph('A', 16);
    const infoB = atlas.getGlyph('B', 16);
    const infoC = atlas.getGlyph('A', 32);

    expect(infoA).not.toBe(infoB);
    expect(infoA).not.toBe(infoC);
  });

  test('page grows instead of throwing when full', () => {
    const wideCtx = makeMockCtx({
      measureText: () =>
        ({
          width: 60,
          actualBoundingBoxLeft: 0,
          actualBoundingBoxRight: 59,
          actualBoundingBoxAscent: 28,
          actualBoundingBoxDescent: 8,
          fontBoundingBoxAscent: 30,
          fontBoundingBoxDescent: 10,
        }) as TextMetrics,
    });
    installMockCtx(wideCtx);

    const atlas = new GlyphAtlas('serif', 'normal', 'normal', 64, 'color');

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    expect(() => {
      for (const ch of chars) {
        atlas.getGlyph(ch, 28);
      }
    }).not.toThrow();

    expect(atlas.pages.length).toBeGreaterThan(1);
  });

  test('clear() empties the cache and resets pages to one', () => {
    const atlas = new GlyphAtlas('sans-serif', 'normal', 'normal', 1024, 'color');
    const info1 = atlas.getGlyph('A', 16);

    atlas.clear();

    expect(atlas.pages).toHaveLength(1);

    const info2 = atlas.getGlyph('A', 16);

    expect(info2.x).toBe(0);
    expect(info2.y).toBe(0);
    expect(info2).not.toBe(info1);
  });

  test('texture version increments on each new glyph insertion', () => {
    const atlas = new GlyphAtlas('sans-serif', 'normal', 'normal', 1024, 'color');
    const v0 = atlas.pages[0].texture.version;

    atlas.getGlyph('A', 16);
    const v1 = atlas.pages[0].texture.version;

    atlas.getGlyph('A', 16); // cached — no bump
    const v2 = atlas.pages[0].texture.version;

    atlas.getGlyph('B', 16);
    const v3 = atlas.pages[0].texture.version;

    expect(v1).toBeGreaterThan(v0);
    expect(v2).toBe(v1);
    expect(v3).toBeGreaterThan(v2);
  });

  test('mode property reflects the atlas rendering mode', () => {
    const sdfAtlas = new GlyphAtlas('Arial', 'normal', 'bold', 1024, 'sdf');
    const colorAtlas = new GlyphAtlas('Arial', 'normal', 'bold', 1024, 'color');

    expect(sdfAtlas.mode).toBe('sdf');
    expect(colorAtlas.mode).toBe('color');
  });

  test('getKerning returns pair width minus individual widths', () => {
    // Mock measureText to return predictable widths per input string.
    const widths: Record<string, number> = { 'A': 10, 'V': 10, 'AV': 18 };
    const kerningCtx = makeMockCtx({
      measureText: (text: string) =>
        ({ width: widths[text] ?? 10 }) as TextMetrics,
    });
    installMockCtx(kerningCtx);

    const atlas = new GlyphAtlas('sans-serif', 'normal', 'normal', 1024, 'color');

    // AV pair: 18 - 10 - 10 = -2 (negative = tighter)
    expect(atlas.getKerning('A', 'V', 16)).toBeCloseTo(-2);
  });

  test('getKerning caches repeated calls', () => {
    let callCount = 0;
    const cachingCtx = makeMockCtx({
      measureText: (_text: string) => {
        callCount++;
        return { width: 10 } as TextMetrics;
      },
    });
    installMockCtx(cachingCtx);

    const atlas = new GlyphAtlas('sans-serif', 'normal', 'normal', 1024, 'color');

    atlas.getKerning('A', 'B', 16);
    const after1 = callCount;
    atlas.getKerning('A', 'B', 16); // cached — no extra calls

    expect(callCount).toBe(after1);
  });

  test('clear() also resets the kerning cache', () => {
    let callCount = 0;
    const cachingCtx = makeMockCtx({
      measureText: (_text: string) => {
        callCount++;
        return { width: 10 } as TextMetrics;
      },
    });
    installMockCtx(cachingCtx);

    const atlas = new GlyphAtlas('sans-serif', 'normal', 'normal', 1024, 'color');

    atlas.getKerning('A', 'B', 16);
    const after1 = callCount;

    atlas.clear();
    atlas.getKerning('A', 'B', 16); // cache was cleared — must remeasure

    expect(callCount).toBeGreaterThan(after1);
  });
});
