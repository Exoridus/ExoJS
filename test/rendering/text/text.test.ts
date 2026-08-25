import type { MockInstance } from 'vitest';

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
import { Color } from '#core/Color';
import { Drawable } from '#rendering/Drawable';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { TextStyle } from '#rendering/text/TextStyle';
import type { GlyphInfo } from '#rendering/text/types';

// ---------------------------------------------------------------------------
// Layout-pass counter
//
// The dirty model's whole promise is "at most one pass per change", which is
// only observable by counting the passes - a geometry comparison cannot tell
// one rebuild from three.
// ---------------------------------------------------------------------------

const layoutCounter = vi.hoisted(() => ({ passes: 0 }));

vi.mock('#rendering/text/TextLayout', async importOriginal => {
  const actual = await importOriginal<typeof import('#rendering/text/TextLayout')>();

  return {
    ...actual,
    layoutText: (...args: Parameters<typeof actual.layoutText>) => {
      layoutCounter.passes++;

      return actual.layoutText(...args);
    },
  };
});

const layoutPasses = (): number => layoutCounter.passes;

// ---------------------------------------------------------------------------
// Mock pool
//
// The glyph metrics imitate the SDF path: the atlas tile is bigger than the
// advance and the bearings are negative, so the ink extent is wider than the
// advance extent and starts left of / above the layout origin.
// ---------------------------------------------------------------------------

/** SDF padding baked into the mock glyph, mirroring `GlyphSdf`'s buffer. */
const PADDING_BEARING = -4;

const fixedGlyphInfo: GlyphInfo = {
  x: 0,
  y: 0,
  width: 16,
  height: 32,
  advance: 10,
  ascent: 13,
  page: 0,
  uvLeft: 0.0,
  uvTop: 0.0,
  uvRight: 0.01,
  uvBottom: 0.02,
  xBearing: PADDING_BEARING,
  yBearing: PADDING_BEARING,
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
  getGlyph: vi.fn(() => fixedGlyphInfo),
  pages: [mockPage] as unknown as GlyphAtlas['pages'],
  mode: 'sdf',
  clear: vi.fn(),
};

/**
 * The measurement path deliberately does NOT go through an atlas - it asks the
 * pool for the variant's logical metrics instead. The mock hands back the same
 * advance the mock atlas does, which is the whole point: a node and a static
 * measurement have to agree, and they only can if both numbers come from the
 * same typographic source.
 */
const mockMetrics = {
  getGlyph: vi.fn(() => ({ ...fixedGlyphInfo, width: 0, height: 0, xBearing: 0, yBearing: 0 })),
  advance: vi.fn(() => fixedGlyphInfo.advance),
  clear: vi.fn(),
};

const mockPool = {
  getAtlas: vi.fn(() => mockAtlas),
  getMetrics: vi.fn(() => mockMetrics),
};

beforeEach(() => {
  resetDefaultGlyphAtlasPool(mockPool as unknown as GlyphAtlasPool);
});
afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  test('setting text to empty string resets the local bounds extent', () => {
    const text = new Text('Hello');
    expect(text.getLocalBounds().width).toBeGreaterThan(0);
    expect(text.getLocalBounds().height).toBeGreaterThan(0);

    // Empty transition must reset the extent, not leave the stale non-empty
    // bounds behind (which would corrupt culling / hit-testing / the retained
    // group aggregate and keep any cached prior geometry live).
    text.text = '';

    expect(text.getLocalBounds().width).toBe(0);
    expect(text.getLocalBounds().height).toBe(0);
  });

  // An anchor is a fraction of the bounds. A label that keeps its anchor but
  // changes width has to re-derive its origin, or a centred caption drifts off
  // centre as soon as its text changes.
  test('changing the text re-derives the origin from the anchor', () => {
    const text = new Text('Hi');
    text.setAnchor(0.5, 0.5);

    const shortWidth = text.textBounds.width;

    expect(text.origin.x).toBeCloseTo(shortWidth / 2);

    text.text = 'Much longer caption';

    const longWidth = text.textBounds.width;

    expect(longWidth).toBeGreaterThan(shortWidth);
    expect(text.origin.x).toBeCloseTo(longWidth / 2);
  });

  test('an unanchored text keeps its origin at zero when the text changes', () => {
    const text = new Text('Hi');

    text.text = 'Much longer caption';

    expect(text.origin.x).toBe(0);
    expect(text.origin.y).toBe(0);
  });

  test('style getter returns the current TextStyle', () => {
    const style = new TextStyle({ fontSize: 20 });
    const text = new Text('Hi');
    text.style = style;

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
    const text = new Text('Hi', { fontSize: 16 });
    const style = text.style;
    const quadsBefore = text.pageQuads[0];

    // Consume initial dirty from constructor
    // Mutate only fillColor → 'tint' hint (self-assign triggers the setter)
    const currentFillColor = style.fillColor;
    style.fillColor = currentFillColor;

    text.update(16);

    // Geometry reference must be the same (no rebuild)
    expect(text.pageQuads[0]).toBe(quadsBefore);
  });

  test('update() triggers rebuild for layout hint', () => {
    const text = new Text('Hi', { fontSize: 16 });
    const style = text.style;
    const quadsBefore = text.pageQuads[0];

    style.fontSize = 32; // layout hint

    text.update(16);

    expect(text.pageQuads[0]).not.toBe(quadsBefore);
  });

  test('style property mutations are deferred until something reads the node', () => {
    const text = new Text('Hi', { fontSize: 16 });
    const style = text.style;
    const quadsBefore = text.pageQuads[0];
    const passesBefore = layoutPasses();

    style.fontFamily = 'Georgia'; // font hint — must NOT lay out immediately

    expect(layoutPasses()).toBe(passesBefore);

    text.update(16);

    expect(layoutPasses()).toBe(passesBefore + 1);
    expect(text.pageQuads[0]).not.toBe(quadsBefore);
  });

  // The class doc promises "rebuilt at most once, on demand". Every
  // setter used to lay the text out on the spot, so a label updated three
  // times in a frame paid for three full passes and threw two of them away.
  test('a run of mutations costs exactly one layout pass', () => {
    const text = new Text('Hello', { fontSize: 16 });

    // Settle the node so the constructor's own pass is not counted.
    text.syncDirty();

    const passesBefore = layoutPasses();

    text.text = 'a';
    text.text = 'b';
    text.text = 'c';
    text.style.align = 'center';
    text.layout = { letterSpacing: 2 };

    expect(layoutPasses()).toBe(passesBefore);

    expect(text.pageQuads.length).toBeGreaterThan(0);

    expect(layoutPasses()).toBe(passesBefore + 1);

    // And a second read with nothing pending costs nothing at all.
    expect(text.pageQuads.length).toBeGreaterThan(0);
    expect(layoutPasses()).toBe(passesBefore + 1);
  });

  // The cull pass reads getLocalBounds() BEFORE the renderer's collect phase
  // calls syncDirty(). A node that deferred its layout past that read would be
  // culled against the previous string's extent.
  test('getLocalBounds() resolves a pending layout without an explicit sync', () => {
    const text = new Text('Hi');
    const shortWidth = text.getLocalBounds().width;

    text.text = 'Much longer caption';

    expect(text.getLocalBounds().width).toBeGreaterThan(shortWidth);
  });

  test('a text going from empty to non-empty has a non-zero extent on the first read', () => {
    const text = new Text('');

    expect(text.getLocalBounds().width).toBe(0);

    text.text = 'Now visible';

    // Without the resolving getLocalBounds() this stays 0, the node is culled
    // as empty, and the label never appears at all.
    expect(text.getLocalBounds().width).toBeGreaterThan(0);
  });

  // Two measures, two meanings: the advance is where the cursor lands, the ink
  // is the rectangle the padded SDF quads cover.
  test('textBounds is the advance while getLocalBounds() is the wider ink', () => {
    const text = new Text('Hi');
    const advance = text.textBounds;
    const ink = text.getLocalBounds();

    expect(advance.width).toBe(2 * fixedGlyphInfo.advance);
    expect(ink.x).toBe(PADDING_BEARING);
    expect(ink.y).toBe(PADDING_BEARING);
    expect(ink.width).toBeGreaterThan(advance.width);
    expect(ink.height).toBeGreaterThan(advance.height);
  });

  // The anchor is measured against the typographic box, NOT against the ink:
  // the SDF padding reaches past the glyphs by a different amount on each
  // side, so anchoring to the ink would centre the padded tile instead of the
  // caption - and would push an unanchored label off its own position.
  test('the anchor is taken against the advance, not the padded ink', () => {
    const text = new Text('Hi');
    const advance = text.textBounds;
    const ink = text.getLocalBounds();

    text.setAnchor(0.5, 0.5);

    expect(text.origin.x).toBeCloseTo(advance.width / 2);
    expect(text.origin.y).toBeCloseTo(advance.height / 2);
    expect(text.origin.x).not.toBeCloseTo(ink.x + ink.width / 2);
  });

  test('a laid-out text at the default anchor keeps its origin at zero', () => {
    // Regression: deriving the origin from the ink gave an unanchored label an
    // origin of (-padding, -padding), moving every SDF text on screen.
    const text = new Text('Hi');

    expect(text.pageQuads.length).toBeGreaterThan(0);
    expect(text.origin.x).toBe(0);
    expect(text.origin.y).toBe(0);
  });

  test('mutating the options object after construction does not re-flow the node', () => {
    const options = { fontSize: 16, letterSpacing: 0 };
    const text = new Text('Hi', options);
    const widthBefore = text.textBounds.width;

    options.letterSpacing = 40;

    expect(text.textBounds.width).toBe(widthBefore);
  });

  test('layout is handed out as a copy of the assigned object', () => {
    const text = new Text('Hi');
    const assigned = { letterSpacing: 4 };

    text.layout = assigned;
    const widthBefore = text.textBounds.width;

    assigned.letterSpacing = 40;

    expect(text.textBounds.width).toBe(widthBefore);
  });

  test('layout reports only layout keys, not the style half of the flat options bag', () => {
    const text = new Text('Hi', { fontSize: 16, fillColor: Color.red, maxWidth: 80, breakWords: true });

    expect(text.layout).toEqual({ maxWidth: 80, breakWords: true });
  });

  test('the layout setter filters style keys out too', () => {
    const text = new Text('Hi');

    // A caller re-using the constructor's flat options bag is the realistic
    // way a style key reaches this setter.
    text.layout = { letterSpacing: 4, fontSize: 99, fillColor: Color.red } as typeof text.layout;

    expect(text.layout).toEqual({ letterSpacing: 4 });
    expect(text.style.fontSize).not.toBe(99);
  });

  test('colorGlyphs flag is accessible', () => {
    const normal = new Text('Hi');
    const emoji = new Text('👋', { colorGlyphs: true });

    expect(normal.colorGlyphs).toBe(false);
    expect(emoji.colorGlyphs).toBe(true);
    expect(normal.atlasMode).toBe('sdf');
    expect(emoji.atlasMode).toBe('color');
  });
});

// ---------------------------------------------------------------------------
// Text.measure()
// ---------------------------------------------------------------------------

describe('Text.measure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // This is the claim the whole construction rests on: the static measurement
  // and a node's own advance come out of the same layout pass against the same
  // shared atlas, so they cannot drift apart.
  test.each([
    ['single line', 'Hello', {}],
    ['multi line', 'Hello\nthere\nyou', {}],
    ['wrapped', 'Hello there you', { maxWidth: 25 }],
    ['letterSpacing', 'Hello', { letterSpacing: 3 }],
    ['aligned and led', 'Hi\nthere', { align: 'center' as const, leading: 4, lineHeight: 1.5 }],
  ])('agrees with a node built the same way — %s', (_label, value, options) => {
    const node = new Text(value, { fontSize: 16, ...options });

    expect(Text.measure(value, { fontSize: 16, ...options })).toEqual(node.textBounds);
  });

  test('letterSpacing and maxWidth actually reach the measurement', () => {
    // The deleted `measureText` ignored both, which is why it disagreed with
    // what a node of the same configuration reported.
    const plain = Text.measure('Hello', { fontSize: 16 });
    const spaced = Text.measure('Hello', { fontSize: 16, letterSpacing: 4 });

    expect(spaced.width).toBe(plain.width + 4 * 4);

    const wrapped = Text.measure('Hello there', { fontSize: 16, maxWidth: 25 });

    expect(wrapped.height).toBeGreaterThan(plain.height);
    expect(wrapped.width).toBeLessThan(Text.measure('Hello there', { fontSize: 16 }).width);
  });

  test('an empty string measures to nothing and touches no atlas', () => {
    expect(Text.measure('', { fontSize: 16 })).toEqual({ width: 0, height: 0 });
    expect(mockPool.getAtlas).not.toHaveBeenCalled();
    expect(mockPool.getMetrics).not.toHaveBeenCalled();
  });

  // A measurement is a typographic question, not a rendering one. Routing it
  // through an atlas would make it rasterize glyphs, claim atlas space, and -
  // once an atlas is keyed on a pixel ratio - force it to guess which ratio it
  // should be measuring at.
  test('measures without ever acquiring an atlas', () => {
    Text.measure('Hello', { fontSize: 16 });

    expect(mockPool.getMetrics).toHaveBeenCalled();
    expect(mockPool.getAtlas).not.toHaveBeenCalled();
  });

  test('measuring does not construct a node', () => {
    const passesBefore = layoutPasses();

    Text.measure('Hello', { fontSize: 16 });

    // Exactly one pass: the measurement itself, with no node behind it.
    expect(layoutPasses()).toBe(passesBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// FontFace-first tests
// ---------------------------------------------------------------------------

describe('Text — FontFace-first', () => {
  // Minimal FontFace stand-in so instanceof checks work in jsdom.
  class MockFontFace {
    family: string;
    load = vi.fn().mockResolvedValue(undefined);
    constructor(family: string) {
      this.family = family;
    }
  }

  /** Drain the microtask queue so async _loadFace() completes. */
  const flushMicrotasks = (): Promise<void> => new Promise(r => setTimeout(r, 0));

  let mockFontsAdd: MockInstance;
  let mockFontsHas: MockInstance;
  let origFontFace: unknown;

  beforeEach(() => {
    origFontFace = (globalThis as Record<string, unknown>).FontFace;
    (globalThis as Record<string, unknown>).FontFace = MockFontFace;

    mockFontsAdd = vi.fn();
    mockFontsHas = vi.fn().mockReturnValue(false);

    Object.defineProperty(document, 'fonts', {
      value: { has: mockFontsHas, add: mockFontsAdd, check: vi.fn().mockReturnValue(false) },
      configurable: true,
    });
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).FontFace = origFontFace;
  });

  const makeFace = (family = 'TestFont'): FontFace => {
    return new MockFontFace(family) as unknown as FontFace;
  };

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
    (face as unknown as MockFontFace).load = vi.fn(
      () =>
        new Promise<void>(r => {
          resolve = r;
        }),
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
    (face as unknown as MockFontFace).load = vi.fn(
      () =>
        new Promise<void>(r => {
          resolve = r;
        }),
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
