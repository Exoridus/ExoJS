/**
 * PerformanceLayer tests.
 *
 * Prior coverage came only indirectly through debug-overlay.test.ts (which
 * never gives the layer a real scene), so `countNodes()` and the text/HUD
 * update path were never actually exercised. This file drives the layer
 * directly with a populated scene graph.
 */

import type { Time } from '#core/Time';
import { PerformanceLayer } from '#debug/PerformanceLayer';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import type { Text } from '#rendering/text/Text';

// Stub the glyph atlas pool so Text construction never touches a real 2D canvas context.
const fakeGlyph = {
  x: 0,
  y: 0,
  width: 6,
  height: 10,
  advance: 6,
  ascent: 8,
  page: 0,
  uvLeft: 0,
  uvRight: 0.01,
  uvTop: 0,
  uvBottom: 0.02,
};
const fakePage = { texture: { updateSource: vi.fn() }, index: 0 };
const fakeAtlas = {
  getGlyph: vi.fn(() => fakeGlyph),
  pages: [fakePage],
  clear: vi.fn(),
};
const fakePool = { getAtlas: vi.fn(() => fakeAtlas) };

beforeEach(() => {
  resetDefaultGlyphAtlasPool(fakePool as unknown as GlyphAtlasPool);
});
afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FakeNode {
  children: FakeNode[];
}

const makeFakeView = () => ({
  width: 800,
  height: 600,
  getBounds: () => ({ intersectsWith: () => true }),
});

const makeBackend = () => ({
  stats: {
    frameTimeMs: 0,
    drawCalls: 7,
    culledNodes: 0,
    submittedNodes: 0,
    batches: 0,
    renderPasses: 0,
    renderTargetChanges: 0,
    frame: 0,
  },
  view: makeFakeView(),
  setView: vi.fn().mockReturnThis(),
  draw: vi.fn().mockReturnThis(),
  flush: vi.fn().mockReturnThis(),
});

// root -> branch -> [leaf (no `children` key), leaf] => 4 nodes total. One leaf
// omits `children` entirely (rather than an empty array) to exercise the
// Array.isArray(container.children) false branch in countNodes().
const makeSceneRoot = (): FakeNode => {
  const leafWithoutChildrenKey = {} as FakeNode;
  const leaf: FakeNode = { children: [] };
  const branch: FakeNode = { children: [leafWithoutChildrenKey, leaf] };

  return { children: [branch] };
};

const makeApp = (opts: { root?: FakeNode | null } = {}) =>
  ({
    backend: makeBackend(),
    scenes: { currentScene: opts.root !== undefined && opts.root !== null ? { root: opts.root } : null },
  }) as unknown as import('#core/Application').Application;

const time = (ms: number): Time => ({ milliseconds: ms, seconds: ms / 1000 }) as unknown as Time;

/** Peek at the layer's private text/graphics nodes for HUD-content assertions. */
const internals = (
  layer: PerformanceLayer,
): {
  _textFps: Text | null;
  _textFrame: Text | null;
  _textDraws: Text | null;
  _textNodes: Text | null;
  _sparkline: { moveTo: unknown } | null;
  _root: unknown;
} => layer as unknown as ReturnType<typeof internals>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PerformanceLayer', () => {
  test('viewMode is "screen"', () => {
    const layer = new PerformanceLayer(makeApp());

    expect(layer.viewMode).toBe('screen');
  });

  test('visible defaults to false', () => {
    const layer = new PerformanceLayer(makeApp());

    expect(layer.visible).toBe(false);
  });

  test('render() before any update() call is a no-op', () => {
    const layer = new PerformanceLayer(makeApp());
    const backend = makeBackend();

    expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();
  });

  test('update() lazily builds the panel scene graph on first call', () => {
    const layer = new PerformanceLayer(makeApp());

    expect(internals(layer)._root).toBeNull();

    layer.update(time(16));

    expect(internals(layer)._root).not.toBeNull();
  });

  test('update() computes a rolling FPS average and formats the HUD text', () => {
    const layer = new PerformanceLayer(makeApp());

    layer.update(time(16.6666667)); // ~60 FPS on a single sample

    const int = internals(layer);

    expect(int._textFps?.text).toBe('FPS: 60.0');
    expect(int._textFrame?.text).toBe('Frame: 16.7ms');
    expect(int._textDraws?.text).toBe('Draws: 7');
  });

  test('update() counts every node in the current scene (root + all descendants)', () => {
    const app = makeApp({ root: makeSceneRoot() });
    const layer = new PerformanceLayer(app);

    layer.update(time(16));

    expect(internals(layer)._textNodes?.text).toBe('Nodes: 4');
  });

  test('a zero-length frame produces no valid FPS sample yet (avgMs/fps both default to 0)', () => {
    const layer = new PerformanceLayer(makeApp());

    layer.update(time(0));

    expect(internals(layer)._textFps?.text).toBe('FPS: 0.0');
  });

  test('update() reports "Nodes: 0" when there is no current scene', () => {
    const app = makeApp({ root: null });
    const layer = new PerformanceLayer(app);

    layer.update(time(16));

    expect(internals(layer)._textNodes?.text).toBe('Nodes: 0');
  });

  test('update() rebuilds the sparkline geometry without throwing across a full sample wrap', () => {
    const layer = new PerformanceLayer(makeApp());

    // 121 calls: one more than the 120-sample sparkline buffer, forcing wraparound.
    for (let i = 0; i < 121; i++) {
      expect(() => layer.update(time(10 + (i % 30)))).not.toThrow();
    }

    expect(internals(layer)._sparkline).not.toBeNull();
  });

  test('update() tolerates a panel torn down without going through destroy() (defensive null guards)', () => {
    // destroy() nulls _root too, which forces update() to rebuild everything on
    // the next call — so the only way to exercise the individual per-field null
    // guards (text nodes / sparkline still null while _root is not) is to null
    // them directly, simulating a partially torn-down panel.
    const layer = new PerformanceLayer(makeApp());

    layer.update(time(16));

    const int = internals(layer) as unknown as Record<string, unknown>;

    int['_textFps'] = null;
    int['_textFrame'] = null;
    int['_textDraws'] = null;
    int['_textNodes'] = null;
    int['_sparkline'] = null;

    expect(() => layer.update(time(16))).not.toThrow();
  });

  test('render() submits the panel subtree to the backend', () => {
    const app = makeApp();
    const layer = new PerformanceLayer(app);
    const backend = app.backend;

    layer.update(time(16));

    expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();
  });

  test('destroy() releases the panel and all child references', () => {
    const layer = new PerformanceLayer(makeApp());

    layer.update(time(16));
    expect(() => layer.destroy()).not.toThrow();

    const int = internals(layer);

    expect(int._root).toBeNull();
    expect(int._textFps).toBeNull();
    expect(int._textFrame).toBeNull();
    expect(int._textDraws).toBeNull();
    expect(int._textNodes).toBeNull();
    expect(int._sparkline).toBeNull();

    // Double-destroy (and destroy before any update()) must also be safe.
    expect(() => layer.destroy()).not.toThrow();
    expect(() => new PerformanceLayer(makeApp()).destroy()).not.toThrow();
  });
});
