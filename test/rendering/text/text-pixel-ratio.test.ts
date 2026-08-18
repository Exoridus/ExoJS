/**
 * Tests for the `Text.pixelRatio` contract - the raster density a runtime text
 * node rasterizes its glyphs at.
 *
 * The public promise has three halves and each is pinned here:
 *
 * 1. Omitting the option means INHERIT the surface's ratio, and inheriting is
 *    the only thing that ever happens implicitly. Nothing in the text stack
 *    reads `window.devicePixelRatio`.
 * 2. An explicit value is an override that wins over the surface and keeps
 *    winning when the surface changes.
 * 3. The effective ratio is part of the atlas identity, so a node cannot end up
 *    drawing from pages rasterized for a different density.
 *
 * The pool is mocked: this file is about which atlas a node ASKS for, not about
 * what rasterization does with it (that needs a real canvas - see
 * `webgl2-text-pixel-ratio.test.ts`).
 */

import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import type { GlyphInfo } from '#rendering/text/types';

// ---------------------------------------------------------------------------
// Mock pool
// ---------------------------------------------------------------------------

const glyphInfo: GlyphInfo = {
  x: 0,
  y: 0,
  width: 16,
  height: 32,
  advance: 10,
  ascent: 13,
  page: 0,
  uvLeft: 0,
  uvTop: 0,
  uvRight: 0.01,
  uvBottom: 0.02,
  xBearing: -4,
  yBearing: -4,
};

const mockPage = {
  texture: { width: 1024, height: 1024 },
  index: 0,
  mode: 'sdf' as const,
};

const mockAtlas: Partial<GlyphAtlas> = {
  getGlyph: () => glyphInfo,
  pages: [mockPage] as unknown as GlyphAtlas['pages'],
  mode: 'sdf',
  clear: vi.fn(),
};

const getAtlas = vi.fn(() => mockAtlas);
const getMetrics = vi.fn(() => ({ getGlyph: () => glyphInfo, advance: () => glyphInfo.advance }));

/** Every `pixelRatio` the node handed to the pool, in call order. */
const requestedRatios = (): number[] => getAtlas.mock.calls.map(call => (call as unknown as unknown[])[5] as number);

beforeEach(() => {
  getAtlas.mockClear();
  getMetrics.mockClear();
  resetDefaultGlyphAtlasPool({ getAtlas, getMetrics } as unknown as GlyphAtlasPool);
});

afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

// ---------------------------------------------------------------------------
// Public property
// ---------------------------------------------------------------------------

describe('Text.pixelRatio', () => {
  test('is undefined when no override was given', () => {
    expect(new Text('Hi', { fontSize: 16 }).pixelRatio).toBeUndefined();
  });

  test('reports the explicit override', () => {
    expect(new Text('Hi', { fontSize: 16, pixelRatio: 3 }).pixelRatio).toBe(3);
  });

  // The internal "no override" sentinel is 0. It must never surface: a caller
  // reading 0 would take it for a raster density of zero.
  test('never reports the internal sentinel', () => {
    const text = new Text('Hi', { fontSize: 16, pixelRatio: 2 });

    text.pixelRatio = undefined;

    expect(text.pixelRatio).toBeUndefined();
    expect(text.pixelRatio).not.toBe(0);
  });

  test.each([0, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p in the constructor', value => {
    expect(() => new Text('Hi', { fontSize: 16, pixelRatio: value })).toThrow(/positive finite/);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p in the setter', value => {
    const text = new Text('Hi', { fontSize: 16 });

    expect(() => (text.pixelRatio = value)).toThrow(/positive finite/);
    // Rejected, not clamped - the node is unchanged.
    expect(text.pixelRatio).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Inheritance
// ---------------------------------------------------------------------------

describe('Text raster density inheritance', () => {
  test('starts at 1 before the node has ever been collected', () => {
    expect(new Text('Hi', { fontSize: 16 }).rasterPixelRatio).toBe(1);
  });

  test('takes the surface ratio when there is no override', () => {
    const text = new Text('Hi', { fontSize: 16 });

    text._setSurfacePixelRatio(2);

    expect(text.rasterPixelRatio).toBe(2);
    expect(text.pixelRatio).toBeUndefined();
  });

  test('keeps the override when the surface disagrees', () => {
    const text = new Text('Hi', { fontSize: 16, pixelRatio: 3 });

    text._setSurfacePixelRatio(2);

    expect(text.rasterPixelRatio).toBe(3);
  });

  // The determinism clause: an application at ratio 2 gets text at ratio 2 even
  // on a device that reports 3. Higher-than-configured raster density is only
  // ever reachable by asking for it.
  test('ignores window.devicePixelRatio entirely', () => {
    const original = window.devicePixelRatio;

    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });

    try {
      const text = new Text('Hi', { fontSize: 16 });

      text._setSurfacePixelRatio(2);
      text.syncDirty();

      expect(text.rasterPixelRatio).toBe(2);
      expect(requestedRatios()).toEqual([2]);
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: original });
    }
  });
});

// ---------------------------------------------------------------------------
// Atlas identity
// ---------------------------------------------------------------------------

describe('Text atlas acquisition', () => {
  test('asks the pool for the inherited ratio', () => {
    const text = new Text('Hi', { fontSize: 16 });

    text._setSurfacePixelRatio(2);
    text.syncDirty();

    expect(requestedRatios()).toEqual([2]);
  });

  test('asks the pool for the override, whatever the surface says', () => {
    const text = new Text('Hi', { fontSize: 16, pixelRatio: 3 });

    text._setSurfacePixelRatio(2);
    text.syncDirty();

    expect(requestedRatios()).toEqual([3]);
  });

  // A node drawn by one application and then by another must re-resolve; a
  // stale atlas would rasterize at the previous surface's density forever.
  test('re-acquires when the surface ratio changes under it', () => {
    const text = new Text('Hi', { fontSize: 16 });

    text._setSurfacePixelRatio(1);
    text.syncDirty();
    text._setSurfacePixelRatio(2);
    text.syncDirty();
    text._setSurfacePixelRatio(3);
    text.syncDirty();

    expect(requestedRatios()).toEqual([1, 2, 3]);
  });

  test('does not re-acquire when the surface ratio repeats', () => {
    const text = new Text('Hi', { fontSize: 16 });

    text._setSurfacePixelRatio(2);
    text.syncDirty();
    text._setSurfacePixelRatio(2);
    text.syncDirty();

    expect(requestedRatios()).toEqual([2]);
  });

  // An overridden node is pinned: a surface change is recorded but must not
  // move the node off the atlas it asked for.
  test('does not re-acquire for an overridden node when the surface changes', () => {
    const text = new Text('Hi', { fontSize: 16, pixelRatio: 2 });

    text._setSurfacePixelRatio(1);
    text.syncDirty();
    text._setSurfacePixelRatio(3);
    text.syncDirty();

    expect(requestedRatios()).toEqual([2]);
  });

  test('re-acquires when the override is assigned or dropped', () => {
    const text = new Text('Hi', { fontSize: 16 });

    text._setSurfacePixelRatio(2);
    text.syncDirty();

    text.pixelRatio = 3;
    text.syncDirty();

    text.pixelRatio = undefined;
    text.syncDirty();

    expect(requestedRatios()).toEqual([2, 3, 2]);
  });

  // `pixelRatio` names the raster density of the node's glyphs, not of the SDF
  // technique. A colour-glyph node rasterizes through Canvas 2D instead, and
  // gets the same contract.
  test('applies to colour glyphs too', () => {
    const text = new Text('🙂', { fontSize: 16, colorGlyphs: true });

    text._setSurfacePixelRatio(3);
    text.syncDirty();

    expect(getAtlas).toHaveBeenCalledWith('Arial', 'normal', 'normal', 'color', 8, 3);
  });

  // A ratio nobody can rasterize into (an unsized canvas, a stand-in backend)
  // collapses to the logical-pixel default rather than poisoning the pool key.
  test.each([0, -2, Number.NaN, Number.POSITIVE_INFINITY])('treats a surface ratio of %p as 1', value => {
    const text = new Text('Hi', { fontSize: 16 });

    text._setSurfacePixelRatio(value);
    text.syncDirty();

    expect(text.rasterPixelRatio).toBe(1);
    expect(requestedRatios()).toEqual([1]);
  });
});
