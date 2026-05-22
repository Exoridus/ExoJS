/**
 * Tests for Text.
 *
 * Text uses GlyphAtlasPool internally. A mock pool is injected via
 * resetDefaultGlyphAtlasPool so the atlas provides deterministic GlyphInfo
 * without a real canvas.
 *
 * Text now extends Drawable (via AbstractText) rather than Container.
 * It stores geometry internally as TextPageQuads instead of Mesh children.
 */

import { Drawable } from '@/rendering/Drawable';
import { Text } from '@/rendering/text/Text';
import type { GlyphAtlas } from '@/rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '@/rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '@/rendering/text/GlyphAtlasPool';
import { TextStyle } from '@/rendering/text/TextStyle';
import type { GlyphInfo } from '@/rendering/text/types';

// ---------------------------------------------------------------------------
// Mock pool
// ---------------------------------------------------------------------------

const fixedGlyphInfo: GlyphInfo = {
  x: 0,
  y: 0,
  width: 8,
  height: 16,
  advance: 10,
  ascent: 13,
  page: 0,
  uvLeft: 0.0,
  uvTop: 0.0,
  uvRight: 0.01,
  uvBottom: 0.02,
};

const mockPage = {
  texture: {
    width: 1024,
    height: 1024,
    version: 1,
    source: null,
    scaleMode: 0,
    wrapMode: 0,
    premultiplyAlpha: false,
    generateMipMap: false,
    flipY: false,
    addDestroyListener: () => mockPage.texture,
    removeDestroyListener: () => mockPage.texture,
    destroy: () => undefined,
  },
  index: 0,
  mode: 'sdf' as const,
};

const mockAtlas: Partial<GlyphAtlas> = {
  getGlyph: jest.fn(() => fixedGlyphInfo),
  pages: [mockPage] as unknown as GlyphAtlas['pages'],
  mode: 'sdf',
  clear: jest.fn(),
};

const mockPool = {
  getAtlas: jest.fn(() => mockAtlas),
};

beforeEach(() => { resetDefaultGlyphAtlasPool(mockPool as unknown as GlyphAtlasPool); });
afterEach(() => { resetDefaultGlyphAtlasPool(); });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Text', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('extends Drawable', () => {
    const text = new Text('Hello');
    expect(text).toBeInstanceOf(Drawable);
  });

  test('constructor sets text property correctly', () => {
    const text = new Text('Hello');
    expect(text.text).toBe('Hello');
  });

  test('empty string creates no page quads', () => {
    const text = new Text('');
    expect(text.pageQuads).toHaveLength(0);
  });

  test('non-empty text creates at least one page quad batch', () => {
    const text = new Text('Hi');
    expect(text.pageQuads.length).toBeGreaterThanOrEqual(1);
    expect(text.pageQuads[0].quadCount).toBeGreaterThanOrEqual(1);
  });

  test('text setter with different value triggers geometry rebuild', () => {
    const text = new Text('Hello');
    const firstQuads = text.pageQuads[0];

    text.text = 'World';

    expect(text.pageQuads.length).toBeGreaterThanOrEqual(1);
    expect(text.pageQuads[0]).not.toBe(firstQuads);
  });

  test('text setter with same value does not trigger rebuild', () => {
    const text = new Text('Hello');
    const firstQuads = text.pageQuads[0];

    text.text = 'Hello';

    expect(text.pageQuads[0]).toBe(firstQuads);
  });

  test('style setter rebuilds geometry', () => {
    const text = new Text('Hi');
    const firstQuads = text.pageQuads[0];

    text.style = new TextStyle({ fontSize: 32 });

    expect(text.pageQuads.length).toBeGreaterThanOrEqual(1);
    expect(text.pageQuads[0]).not.toBe(firstQuads);
  });

  test('style setter with plain options object creates a TextStyle', () => {
    const text = new Text('Hi');

    text.style = { fontSize: 48, align: 'center' };

    expect(text.style).toBeInstanceOf(TextStyle);
    expect(text.style.fontSize).toBe(48);
    expect(text.style.align).toBe('center');
  });

  test('setting text to empty string removes all page quads', () => {
    const text = new Text('Hello');
    expect(text.pageQuads.length).toBeGreaterThanOrEqual(1);

    text.text = '';
    expect(text.pageQuads).toHaveLength(0);
  });

  test('style getter returns the current TextStyle', () => {
    const style = new TextStyle({ fontSize: 20 });
    const text = new Text('Hi', style);

    expect(text.style).toBe(style);
  });

  test('constructor with TextStyleOptions creates a TextStyle', () => {
    const text = new Text('Hi', { fontSize: 24, align: 'right' });

    expect(text.style).toBeInstanceOf(TextStyle);
    expect(text.style.fontSize).toBe(24);
    expect(text.style.align).toBe('right');
  });

  test('destroy() clears page quads', () => {
    const text = new Text('Hi');
    expect(text.pageQuads.length).toBeGreaterThan(0);

    text.destroy();

    expect(text.pageQuads).toHaveLength(0);
  });

  test('destroy() on empty text does not throw', () => {
    const text = new Text('');
    expect(() => text.destroy()).not.toThrow();
  });

  test('update() with tint-only hint does not rebuild geometry', () => {
    const style = new TextStyle({ fontSize: 16 });
    const text = new Text('Hi', style);
    const quadsBefore = text.pageQuads[0];

    // Consume initial dirty from constructor
    // Mutate only fillColor → 'tint' hint
    style.fillColor = style.fillColor;

    text.update(16);

    // Geometry reference must be the same (no rebuild)
    expect(text.pageQuads[0]).toBe(quadsBefore);
  });

  test('update() triggers rebuild for layout hint', () => {
    const style = new TextStyle({ fontSize: 16 });
    const text = new Text('Hi', style);
    const quadsBefore = text.pageQuads[0];

    style.fontSize = 32; // layout hint

    text.update(16);

    expect(text.pageQuads[0]).not.toBe(quadsBefore);
  });

  test('style property mutations are deferred to update()', () => {
    const style = new TextStyle({ fontSize: 16 });
    const text = new Text('Hi', style);
    const quadsBefore = text.pageQuads[0];

    style.fontFamily = 'Georgia'; // font hint — must NOT rebuild immediately

    expect(text.pageQuads[0]).toBe(quadsBefore);

    text.update(16);
    expect(text.pageQuads[0]).not.toBe(quadsBefore);
  });

  test('colorGlyphs flag is accessible', () => {
    const normal = new Text('Hi');
    const emoji = new Text('👋', undefined, undefined, { colorGlyphs: true });

    expect(normal.colorGlyphs).toBe(false);
    expect(emoji.colorGlyphs).toBe(true);
    expect(normal.atlasMode).toBe('sdf');
    expect(emoji.atlasMode).toBe('color');
  });
});

// ---------------------------------------------------------------------------
// FontFace-first tests
// ---------------------------------------------------------------------------

describe('Text — FontFace-first', () => {
  // Minimal FontFace stand-in so instanceof checks work in jsdom.
  class MockFontFace {
    family: string;
    load = jest.fn().mockResolvedValue(undefined);
    constructor(family: string) { this.family = family; }
  }

  /** Drain the microtask queue so async _loadFace() completes. */
  const flushMicrotasks = (): Promise<void> => new Promise(r => setTimeout(r, 0));

  let mockFontsAdd: jest.Mock;
  let mockFontsHas: jest.Mock;
  let origFontFace: unknown;

  beforeEach(() => {
    origFontFace = (globalThis as Record<string, unknown>).FontFace;
    (globalThis as Record<string, unknown>).FontFace = MockFontFace;

    mockFontsAdd = jest.fn();
    mockFontsHas = jest.fn().mockReturnValue(false);

    Object.defineProperty(document, 'fonts', {
      value: { has: mockFontsHas, add: mockFontsAdd, check: jest.fn().mockReturnValue(false) },
      configurable: true,
    });
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).FontFace = origFontFace;
  });

  function makeFace(family = 'TestFont'): FontFace {
    return new MockFontFace(family) as unknown as FontFace;
  }

  test('font option registers face with document.fonts', async () => {
    const face = makeFace();
    new Text('Hello', { font: face });
    await flushMicrotasks();
    expect(mockFontsAdd).toHaveBeenCalledWith(face);
  });

  test('font option calls face.load()', async () => {
    const face = makeFace();
    new Text('Hello', { font: face });
    await flushMicrotasks();
    expect((face as unknown as MockFontFace).load).toHaveBeenCalled();
  });

  test('skips document.fonts.add when face is already registered', async () => {
    mockFontsHas.mockReturnValue(true);
    const face = makeFace();
    new Text('Hello', { font: face });
    await flushMicrotasks();
    expect(mockFontsAdd).not.toHaveBeenCalled();
  });

  test('atlas is cleared and geometry rebuilt after face loads', async () => {
    let resolve!: () => void;
    const face = makeFace();
    (face as unknown as MockFontFace).load = jest.fn(
      () => new Promise<void>(r => { resolve = r; }),
    );

    const text = new Text('Hello', { font: face });
    const quadsBefore = text.pageQuads[0];

    resolve();
    await flushMicrotasks();

    expect(mockAtlas.clear).toHaveBeenCalled();
    expect(text.pageQuads[0]).not.toBe(quadsBefore);
  });

  test('destroy() prevents post-load rebuild', async () => {
    let resolve!: () => void;
    const face = makeFace();
    (face as unknown as MockFontFace).load = jest.fn(
      () => new Promise<void>(r => { resolve = r; }),
    );

    const text = new Text('Hello', { font: face });
    const quadsBefore = text.pageQuads.length;
    text.destroy();
    resolve();
    // Drain microtask queue
    await new Promise(r => setTimeout(r, 0));
    // After destroy(), pageQuads is empty and no further rebuild ran
    expect(text.pageQuads).toHaveLength(0);
    // The before-destroy quad count was >0; if rebuild had run it would be >0 again
    expect(quadsBefore).toBeGreaterThan(0);
  });

  test('style setter with font option also triggers face load', async () => {
    const text = new Text('Hello');
    const face = makeFace('NewFont');
    text.style = { font: face, fontSize: 16 };
    await flushMicrotasks();
    expect(mockFontsAdd).toHaveBeenCalledWith(face);
  });
});
