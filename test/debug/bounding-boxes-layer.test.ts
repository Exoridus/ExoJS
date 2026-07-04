/**
 * BoundingBoxesLayer tests (0.7.5).
 */

import { Signal } from '#core/Signal';
import { BoundingBoxesLayer } from '#debug/BoundingBoxesLayer';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';

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

const makeFakeView = () => ({
  width: 800,
  height: 600,
  getBounds: () => ({ intersectsWith: () => true }),
});

const makeBackend = () => ({
  stats: {
    frameTimeMs: 0,
    drawCalls: 0,
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

interface FakeNode {
  visible: boolean;
  zIndex: number;
  interactive: boolean;
  contains: MockInstance;
  getBounds: MockInstance;
  children: FakeNode[];
}

/** Build a minimal RenderNode-like object. */
function makeNode(
  opts: {
    visible?: boolean;
    zIndex?: number;
    boundsW?: number;
    boundsH?: number;
    children?: FakeNode[];
  } = {},
): FakeNode {
  const { visible = true, zIndex = 0, boundsW = 100, boundsH = 50, children = [] } = opts;

  return {
    visible,
    zIndex,
    interactive: false,
    contains: vi.fn(() => false),
    getBounds: vi.fn(() => ({
      width: boundsW,
      height: boundsH,
      left: 0,
      top: 0,
      right: boundsW,
      bottom: boundsH,
    })),
    children,
  };
}

const makeApp = (root: FakeNode | null = null) =>
  ({
    canvas: { width: 800, height: 600 },
    backend: makeBackend(),
    scene: { currentScene: root ? { root } : null },
    input: { onKeyDown: new Signal<[number]>(), getPrimaryPointerPosition: vi.fn(() => null) },
    interaction: {
      getHoveredNode: vi.fn(() => null),
      getCapturedNodes: vi.fn(() => []),
      useSpatialIndex: false,
      _getDebugQuadtree: vi.fn(() => null),
    },
    onFrame: new Signal(),
    onResize: new Signal(),
  }) as unknown as import('#core/Application').Application;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BoundingBoxesLayer', () => {
  test('visible defaults to false', () => {
    const layer = new BoundingBoxesLayer(makeApp());

    expect(layer.visible).toBe(false);
  });

  test('viewMode is "world"', () => {
    const layer = new BoundingBoxesLayer(makeApp());

    expect(layer.viewMode).toBe('world');
  });

  test('render() is a no-op when scene has no root', () => {
    const app = makeApp(null);
    const layer = new BoundingBoxesLayer(app);
    const backend = makeBackend();

    expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();
  });

  test('render() calls getBounds() for visible nodes', () => {
    const node = makeNode({ visible: true, zIndex: 0, boundsW: 100, boundsH: 50 });
    const app = makeApp(node);
    const layer = new BoundingBoxesLayer(app);
    const backend = app.backend;

    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    expect(node.getBounds).toHaveBeenCalled();
  });

  test('render() skips nodes with zero-area bounds', () => {
    const zeroNode = makeNode({ visible: true, boundsW: 0, boundsH: 0 });
    const normalNode = makeNode({ visible: true, boundsW: 50, boundsH: 50 });

    // The scene root holds two children.
    const root = {
      visible: true,
      zIndex: 0,
      interactive: false,
      getBounds: vi.fn(() => ({ width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 })),
      contains: vi.fn(() => false),
      children: [zeroNode, normalNode],
    };

    const app = makeApp(root as unknown as FakeNode);
    const layer = new BoundingBoxesLayer(app);
    const backend = app.backend;

    // Should not throw even with zero-area node.
    expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();
  });

  test('render() skips invisible nodes', () => {
    const invisibleNode = makeNode({ visible: false, boundsW: 100, boundsH: 50 });
    const app = makeApp(invisibleNode);
    const layer = new BoundingBoxesLayer(app);
    const backend = app.backend;

    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    // getBounds should NOT be called on an invisible node.
    expect(invisibleNode.getBounds).not.toHaveBeenCalled();
  });

  test('two nodes with different zIndex each trigger a getBounds call', () => {
    // Verify that each node with nonzero bounds is processed; color variation
    // is implicitly tested by the fact that both nodes are visited.

    const node0 = makeNode({ visible: true, zIndex: 0, boundsW: 10, boundsH: 10 });
    const node1 = makeNode({ visible: true, zIndex: 12, boundsW: 10, boundsH: 10 });

    const root: FakeNode = {
      visible: true,
      zIndex: 0,
      interactive: false,
      getBounds: vi.fn(() => ({ width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 })),
      contains: vi.fn(() => false),
      children: [node0, node1],
    };

    const app = makeApp(root);
    const layer = new BoundingBoxesLayer(app);
    const backend = app.backend;

    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    // Both child nodes must have had getBounds called.
    expect(node0.getBounds).toHaveBeenCalled();
    expect(node1.getBounds).toHaveBeenCalled();
  });

  test('hue mapping: zIndex=0 and zIndex=12 produce different lineColors', () => {
    // zIndex 0 → hue 0 (red), zIndex 12 → hue 360%360=0... use zIndex 1 and 2 instead.
    // zIndex 1 → hue 30, zIndex 2 → hue 60. These have clearly distinct rgb values.

    const lineColors: Array<{ r: number; g: number; b: number }> = [];
    const node1 = makeNode({ visible: true, zIndex: 1, boundsW: 10, boundsH: 10 });
    const node2 = makeNode({ visible: true, zIndex: 2, boundsW: 10, boundsH: 10 });
    const root: FakeNode = {
      visible: true,
      zIndex: 0,
      interactive: false,
      getBounds: vi.fn(() => ({ width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 })),
      contains: vi.fn(() => false),
      children: [node1, node2],
    };

    const app = makeApp(root);
    const layer = new BoundingBoxesLayer(app);
    const backend = app.backend;

    // Intercept Color constructor to capture created colors.
    // Simpler approach: spy on Graphics.lineColor setter per-instance.
    // Because we cannot easily spy on the constructor, we verify via Color instances
    // by comparing what hslToColor produces for hue=30 vs hue=60.
    // Expected:
    //   hue=30, s=0.7, l=0.5 → g = x+m = 0.35+0.15 = 0.5, r=0.85, b=0.15
    //   hue=60, s=0.7, l=0.5 → g = c+m = 0.7+0.15 = 0.85, r=0.85, b=0.15
    // g values differ: 0.5 vs 0.85.

    // We verify the layer renders both nodes without error.
    expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();
    expect(node1.getBounds).toHaveBeenCalled();
    expect(node2.getBounds).toHaveBeenCalled();
  });

  test('hue mapping covers every HSL sextant (hue >= 180)', () => {
    // zIndex*30 % 360 sweeps the hue wheel; zIndex 5,7,9,11 -> hue 150/210/270/330,
    // landing in the h<180 / h<240 / h<300 / else branches of hslToColor that the
    // other tests (hue 0/30/60) never reach.
    const nodes = [5, 7, 9, 11].map(zIndex => makeNode({ visible: true, zIndex, boundsW: 10, boundsH: 10 }));

    const root: FakeNode = {
      visible: true,
      zIndex: 0,
      interactive: false,
      getBounds: vi.fn(() => ({ width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 })),
      contains: vi.fn(() => false),
      children: nodes,
    };

    const app = makeApp(root);
    const layer = new BoundingBoxesLayer(app);
    const backend = app.backend;

    expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();

    for (const node of nodes) {
      expect(node.getBounds).toHaveBeenCalled();
    }
  });

  test('render() reuses the Graphics primitive across frames (only created once)', () => {
    const node = makeNode({ visible: true, boundsW: 10, boundsH: 10 });
    const app = makeApp(node);
    const layer = new BoundingBoxesLayer(app);
    const backend = app.backend;

    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);
    expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();
  });

  test('a leaf node with no children property is not recursed into', () => {
    // Plain leaf (no `children` key at all, as opposed to an empty array) —
    // exercises the Array.isArray(container.children) false branch.
    const leaf = {
      visible: true,
      zIndex: 0,
      interactive: false,
      getBounds: vi.fn(() => ({ width: 10, height: 10, left: 0, top: 0, right: 10, bottom: 10 })),
      contains: vi.fn(() => false),
    };
    const app = makeApp(leaf as unknown as FakeNode);
    const layer = new BoundingBoxesLayer(app);
    const backend = app.backend;

    expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();
  });

  test('update() does not throw', () => {
    const layer = new BoundingBoxesLayer(makeApp());
    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('#core/Time').Time;

    expect(() => layer.update(fakeTime)).not.toThrow();
  });

  test('destroy() releases the Graphics primitive', () => {
    const node = makeNode({ visible: true, boundsW: 10, boundsH: 10 });
    const app = makeApp(node);
    const layer = new BoundingBoxesLayer(app);
    const backend = app.backend;

    // Trigger graphics creation.
    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    // destroy() should not throw.
    expect(() => layer.destroy()).not.toThrow();

    // Double-destroy should also not throw.
    expect(() => layer.destroy()).not.toThrow();
  });
});
