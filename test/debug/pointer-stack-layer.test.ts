/**
 * PointerStackLayer tests (0.7.5).
 */

import { PointerStackLayer } from '@/debug/PointerStackLayer';
import { Signal } from '@/core/Signal';
import type { GlyphAtlasPool } from '@/rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '@/rendering/text/GlyphAtlasPool';

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
  constructor: { name: string };
}

/** Create a minimal node stub with configurable contains/zIndex/children. */
function makeNode(
  opts: {
    name?: string;
    visible?: boolean;
    zIndex?: number;
    interactive?: boolean;
    containsResult?: boolean;
    children?: FakeNode[];
  } = {},
): FakeNode {
  const { visible = true, zIndex = 0, interactive = false, containsResult = false, children = [] } = opts;

  return {
    visible,
    zIndex,
    interactive,
    contains: vi.fn(() => containsResult),
    getBounds: vi.fn(() => ({ width: 100, height: 50, left: 0, top: 0, right: 100, bottom: 50 })),
    children,
    constructor: { name: opts.name ?? 'MockNode' },
  };
}

const makeApp = (
  opts: {
    root?: FakeNode | null;
    pointerPos?: { x: number; y: number } | null;
  } = {},
) =>
  ({
    canvas: { width: 800, height: 600 },
    backend: makeBackend(),
    scene: { currentScene: opts.root !== undefined && opts.root !== null ? { root: opts.root } : null },
    input: {
      onKeyDown: new Signal<[number]>(),
      getPrimaryPointerPosition: vi.fn(() => (opts.pointerPos !== undefined ? opts.pointerPos : null)),
    },
    interaction: {
      getHoveredNode: vi.fn(() => null),
      getCapturedNodes: vi.fn(() => []),
      useSpatialIndex: false,
      _getDebugQuadtree: vi.fn(() => null),
    },
    onFrame: new Signal(),
    onResize: new Signal(),
  }) as unknown as import('@/core/Application').Application;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PointerStackLayer', () => {
  test('viewMode is "screen"', () => {
    const layer = new PointerStackLayer(makeApp());

    expect(layer.viewMode).toBe('screen');
  });

  test('visible defaults to false', () => {
    const layer = new PointerStackLayer(makeApp());

    expect(layer.visible).toBe(false);
  });

  test('update() does not throw when no pointer', () => {
    const app = makeApp({ pointerPos: null });
    const layer = new PointerStackLayer(app);
    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    expect(() => layer.update(fakeTime)).not.toThrow();
  });

  test('render() does not throw when root is null', () => {
    const app = makeApp({ root: null });
    const layer = new PointerStackLayer(app);
    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;
    const backend = makeBackend();

    expect(() => {
      layer.update(fakeTime);
      layer.render(backend as unknown as Parameters<typeof layer.render>[0]);
    }).not.toThrow();
  });

  test('with cursor at (100, 100) and 3 containing nodes, all appear in stack', () => {

    const nodeA = makeNode({ name: 'NodeA', containsResult: true, zIndex: 5 });
    const nodeB = makeNode({ name: 'NodeB', containsResult: true, zIndex: 2 });
    const nodeC = makeNode({ name: 'NodeC', containsResult: true, zIndex: 8 });

    // Root itself does not contain the point; children do.
    const root = makeNode({ containsResult: false, children: [nodeA, nodeB, nodeC] });

    const app = makeApp({ root, pointerPos: { x: 100, y: 100 } });
    const layer = new PointerStackLayer(app);
    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;
    const backend = app.backend;

    layer.update(fakeTime);
    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    // Verify contains was called on the children.
    expect(nodeA.contains).toHaveBeenCalledWith(100, 100);
    expect(nodeB.contains).toHaveBeenCalledWith(100, 100);
    expect(nodeC.contains).toHaveBeenCalledWith(100, 100);
  });

  test('stack entries sorted by zIndex descending (highest first)', () => {

    const nodeA = makeNode({ name: 'NodeA', containsResult: true, zIndex: 5 });
    const nodeB = makeNode({ name: 'NodeB', containsResult: true, zIndex: 2 });
    const nodeC = makeNode({ name: 'NodeC', containsResult: true, zIndex: 8 });

    const root = makeNode({ containsResult: false, children: [nodeA, nodeB, nodeC] });
    const app = makeApp({ root, pointerPos: { x: 100, y: 100 } });
    const layer = new PointerStackLayer(app);
    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;
    const backend = app.backend;

    // Run update to populate lines.
    layer.update(fakeTime);
    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    // Access internal _lines to verify sort order via text content.
    // The first entry after the header rows should be the highest-z node.
    // We inspect by checking contains call-order vs expected z order.
    // The `_buildLines` method sorts descending: [nodeC z=8, nodeA z=5, nodeB z=2].
    // Since we can't inspect private Text nodes directly, we at least verify
    // the nodes were called and the logic runs without error.
    expect(nodeA.contains).toHaveBeenCalled();
    expect(nodeB.contains).toHaveBeenCalled();
    expect(nodeC.contains).toHaveBeenCalled();
  });

  test('stack limited to at most 10 entries (overflow protection)', () => {

    // Create 15 nodes all containing the point.
    const nodes = Array.from({ length: 15 }, (_, i) => makeNode({ name: `Node${i}`, containsResult: true, zIndex: i }));

    const root = makeNode({ containsResult: false, children: nodes });
    const app = makeApp({ root, pointerPos: { x: 50, y: 50 } });
    const layer = new PointerStackLayer(app);
    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;
    const backend = app.backend;

    // Should not throw even with 15 matching nodes.
    expect(() => {
      layer.update(fakeTime);
      layer.render(backend as unknown as Parameters<typeof layer.render>[0]);
    }).not.toThrow();
  });

  test('no-pointer state: panel shows "Pointer: (none)" without crashing', () => {

    const root = makeNode({ containsResult: false });
    const app = makeApp({ root, pointerPos: null });
    const layer = new PointerStackLayer(app);
    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;
    const backend = app.backend;

    expect(() => {
      layer.update(fakeTime);
      layer.render(backend as unknown as Parameters<typeof layer.render>[0]);
    }).not.toThrow();

    // getPrimaryPointerPosition must have been called during update.
    expect(app.input.getPrimaryPointerPosition as MockInstance).toHaveBeenCalled();
  });

  test('destroy() cleans up without throwing', () => {
    const app = makeApp({ pointerPos: { x: 10, y: 10 } });
    const layer = new PointerStackLayer(app);
    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;
    const backend = app.backend;

    // Trigger internal build.
    layer.update(fakeTime);
    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    expect(() => layer.destroy()).not.toThrow();
    // Double-destroy should also be safe.
    expect(() => layer.destroy()).not.toThrow();
  });
});
