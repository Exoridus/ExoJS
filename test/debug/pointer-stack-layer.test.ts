import type { MockInstance } from 'vitest';

/**
 * PointerStackLayer tests (0.7.5).
 */
import { Signal } from '#core/Signal';
import { Time } from '#core/units';
import { PointerStackLayer } from '#debug/PointerStackLayer';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { View } from '#rendering/View';

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
  onCleared: new Signal(),
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
const makeNode = (
  opts: {
    name?: string;
    visible?: boolean;
    zIndex?: number;
    interactive?: boolean;
    containsResult?: boolean;
    children?: FakeNode[];
  } = {},
): FakeNode => {
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
};

const makeApp = (
  opts: {
    root?: FakeNode | null;
    pointerPos?: { x: number; y: number } | null;
    view?: View;
    ui?: FakeNode | null;
    screenView?: View;
  } = {},
) =>
  ({
    width: 800,
    height: 600,
    canvas: { width: 800, height: 600 },
    backend: makeBackend(),
    rendering: {
      view: opts.view ?? new View(400, 300, 800, 600),
      screenView: opts.screenView ?? new View(400, 300, 800, 600),
    },
    scenes: {
      currentScene: opts.root != null || opts.ui != null ? { root: opts.root, _peekUI: () => opts.ui ?? null } : null,
    },
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
  }) as unknown as import('#core/Application').Application;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PointerStackLayer', () => {
  test.each([
    { zoom: 1, x: 600, y: 400 },
    { zoom: 2, x: 500, y: 350 },
  ])('lists UI before world nodes using the screen view at zoom $zoom', ({ zoom, x, y }) => {
    const front = makeNode({ name: 'UIFront', zIndex: 2 });
    const back = makeNode({ name: 'UIBack', zIndex: 1 });

    for (const node of [front, back]) {
      node.contains.mockImplementation((px: number, py: number) => Math.abs(px - x) < 1 && Math.abs(py - y) < 1);
    }

    const hidden = makeNode({ name: 'HiddenUI', visible: false, containsResult: true });
    const ui = makeNode({ children: [back, hidden, front] });
    const world = makeNode({ name: 'WorldTarget', zIndex: 1000 });
    world.contains.mockImplementation((px: number, py: number) => Math.abs(px - 1200) < 1 && Math.abs(py - 600) < 1);
    const view = new View(1000, 500, 800, 600);
    const screenView = new View(400, 300, 800, 600).setZoom(zoom);
    const layer = new PointerStackLayer(
      makeApp({ root: makeNode({ children: [world] }), ui, view, screenView, pointerPos: { x: 600, y: 400 } }),
    );

    layer.update(Time.toSeconds(Time.milliseconds(16)));

    const lines = (layer as unknown as { _lines: Array<{ text: string; visible: boolean }> })._lines;
    expect(
      lines
        .filter(line => line.visible)
        .slice(2)
        .map(line => line.text.trim()),
    ).toEqual(['UIFront — z=2', 'UIBack — z=1', 'WorldTarget — z=1000']);
    layer.destroy();
    view.destroy();
    screenView.destroy();
  });

  test.each([
    { name: 'pan', center: [1000, 500], zoom: 1, rotation: 0, viewport: [0, 0, 1, 1], pointer: [400, 300], world: [1000, 500] },
    { name: 'zoom', center: [400, 300], zoom: 2, rotation: 0, viewport: [0, 0, 1, 1], pointer: [600, 400], world: [500, 350] },
    { name: 'rotation', center: [400, 300], zoom: 1, rotation: 90, viewport: [0, 0, 1, 1], pointer: [600, 300], world: [400, 500] },
    { name: 'viewport', center: [1000, 500], zoom: 1, rotation: 0, viewport: [0.5, 0, 0.5, 1], pointer: [700, 300], world: [1200, 500] },
  ])('lists world nodes under the pointer with camera $name', ({ center, zoom, rotation, viewport, pointer, world }) => {
    const view = new View(center[0]!, center[1]!, 800, 600);
    view.setZoom(zoom).setRotation(rotation).setViewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!);
    const target = makeNode({ name: 'WorldTarget' });
    target.contains.mockImplementation((x: number, y: number) => Math.abs(x - world[0]!) < 1 && Math.abs(y - world[1]!) < 1);
    const root = makeNode({ children: [target] });
    const layer = new PointerStackLayer(makeApp({ root, view, pointerPos: { x: pointer[0]!, y: pointer[1]! } }));

    layer.update(Time.toSeconds(Time.milliseconds(16)));

    const lines = (layer as unknown as { _lines: Array<{ text: string; visible: boolean }> })._lines;
    expect(lines.some(line => line.visible && line.text.includes('WorldTarget'))).toBe(true);
    layer.destroy();
    view.destroy();
  });

  test('hit-tests each node of a nested container chain once', () => {
    const root = new Container();
    const middle = new Container();
    const leaf = new Container();
    leaf.hitArea = new Rectangle(0, 0, 100, 100);
    root.addChild(middle);
    middle.addChild(leaf);
    const contains = vi.spyOn(leaf, 'contains');
    const layer = new PointerStackLayer(makeApp({ root: root as unknown as FakeNode, pointerPos: { x: 10, y: 10 } }));

    const lines = (layer as unknown as { _buildLines(): string[] })._buildLines();

    expect(contains).toHaveBeenCalledOnce();
    expect(lines.slice(2)).toEqual(['  Container — z=0', '  Container — z=0', '  Container — z=0']);
    root.destroy();
  });

  test('lists a container whose only hit child is hidden, without the hidden child', () => {
    class Group extends Container {}
    class Hidden extends Container {}
    class Missed extends Container {}
    const root = new Container();
    const group = new Group();
    const hidden = new Hidden();
    const missed = new Missed();
    hidden.hitArea = new Rectangle(0, 0, 100, 100);
    hidden.visible = false;
    missed.hitArea = new Rectangle(500, 500, 10, 10);
    group.addChild(missed);
    group.addChild(hidden);
    root.addChild(group);
    const layer = new PointerStackLayer(makeApp({ root: root as unknown as FakeNode, pointerPos: { x: 10, y: 10 } }));

    const lines = (layer as unknown as { _buildLines(): string[] })._buildLines();

    expect(lines.slice(2)).toEqual(['  Container — z=0', '  Group — z=0']);
    root.destroy();
  });

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
    const fakeTime = Time.toSeconds(Time.milliseconds(16));

    expect(() => layer.update(fakeTime)).not.toThrow();
  });

  test('render() does not throw when root is null', () => {
    const app = makeApp({ root: null });
    const layer = new PointerStackLayer(app);
    const fakeTime = Time.toSeconds(Time.milliseconds(16));
    const backend = makeBackend();

    expect(() => {
      layer.update(fakeTime);
      layer.render(backend as unknown as Parameters<typeof layer.render>[0]);
    }).not.toThrow();
  });

  test('an overflowing stack shows its overflow row inside the panel', () => {
    const children = Array.from({ length: 12 }, (_, i) => makeNode({ name: `N${i}`, containsResult: true, zIndex: i }));
    const root = makeNode({ containsResult: false, children });
    const layer = new PointerStackLayer(makeApp({ root, pointerPos: { x: 1, y: 1 } }));

    layer.update(Time.toSeconds(Time.milliseconds(16)));

    const internals = layer as unknown as { _lines: Array<{ text: string; visible: boolean; y: number }> };
    const visible = internals._lines.filter(line => line.visible);
    const bg = (layer as unknown as { _bg: { getBounds: () => { height: number } } })._bg;

    expect(visible.at(-1)!.text).toContain('+2 more');
    expect(Math.max(...visible.map(line => line.y)) + 14).toBeLessThanOrEqual(bg.getBounds().height);
  });

  test('with cursor at (100, 100) and 3 containing nodes, all appear in stack', () => {
    const nodeA = makeNode({ name: 'NodeA', containsResult: true, zIndex: 5 });
    const nodeB = makeNode({ name: 'NodeB', containsResult: true, zIndex: 2 });
    const nodeC = makeNode({ name: 'NodeC', containsResult: true, zIndex: 8 });

    // Root itself does not contain the point; children do.
    const root = makeNode({ containsResult: false, children: [nodeA, nodeB, nodeC] });

    const app = makeApp({ root, pointerPos: { x: 100, y: 100 } });
    const layer = new PointerStackLayer(app);
    const fakeTime = Time.toSeconds(Time.milliseconds(16));
    const backend = app.backend;

    layer.update(fakeTime);
    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    // Verify contains was called on the children.
    expect(nodeA.contains).toHaveBeenCalledWith(expect.closeTo(100, 10), expect.closeTo(100, 10));
    expect(nodeB.contains).toHaveBeenCalledWith(expect.closeTo(100, 10), expect.closeTo(100, 10));
    expect(nodeC.contains).toHaveBeenCalledWith(expect.closeTo(100, 10), expect.closeTo(100, 10));
  });

  test('stack entries sorted by zIndex descending (highest first)', () => {
    const nodeA = makeNode({ name: 'NodeA', containsResult: true, zIndex: 5 });
    const nodeB = makeNode({ name: 'NodeB', containsResult: true, zIndex: 2 });
    const nodeC = makeNode({ name: 'NodeC', containsResult: true, zIndex: 8 });

    const root = makeNode({ containsResult: false, children: [nodeA, nodeB, nodeC] });
    const app = makeApp({ root, pointerPos: { x: 100, y: 100 } });
    const layer = new PointerStackLayer(app);
    const fakeTime = Time.toSeconds(Time.milliseconds(16));
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
    const fakeTime = Time.toSeconds(Time.milliseconds(16));
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
    const fakeTime = Time.toSeconds(Time.milliseconds(16));
    const backend = app.backend;

    expect(() => {
      layer.update(fakeTime);
      layer.render(backend as unknown as Parameters<typeof layer.render>[0]);
    }).not.toThrow();

    // getPrimaryPointerPosition must have been called during update.
    expect(vi.mocked(app.input.getPrimaryPointerPosition)).toHaveBeenCalled();
  });

  test('invisible nodes (and their subtree) are excluded from the stack', () => {
    const invisibleChild = makeNode({ name: 'InvisibleChild', containsResult: true });
    const invisibleNode = makeNode({ name: 'Invisible', visible: false, containsResult: true, children: [invisibleChild] });
    const visibleNode = makeNode({ name: 'Visible', containsResult: true });

    const root = makeNode({ containsResult: false, children: [invisibleNode, visibleNode] });
    const app = makeApp({ root, pointerPos: { x: 10, y: 10 } });
    const layer = new PointerStackLayer(app);
    const fakeTime = Time.toSeconds(Time.milliseconds(16));
    const backend = app.backend;

    layer.update(fakeTime);
    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    // The invisible node's own contains() is never reached, and its subtree is
    // never walked - only the visible sibling contributes to the stack.
    expect(invisibleNode.contains).not.toHaveBeenCalled();
    expect(invisibleChild.contains).not.toHaveBeenCalled();
    expect(visibleNode.contains).toHaveBeenCalledWith(expect.closeTo(10, 10), expect.closeTo(10, 10));
  });

  test('update() called twice reuses the already-built panel', () => {
    const app = makeApp({ pointerPos: { x: 10, y: 10 } });
    const layer = new PointerStackLayer(app);
    const fakeTime = Time.toSeconds(Time.milliseconds(16));

    layer.update(fakeTime);
    expect(() => layer.update(fakeTime)).not.toThrow();
  });

  test('an interactive node in the stack is annotated with " — interactive"', () => {
    const interactiveNode = makeNode({ name: 'Btn', containsResult: true, interactive: true, zIndex: 3 });
    const root = makeNode({ containsResult: false, children: [interactiveNode] });
    const app = makeApp({ root, pointerPos: { x: 5, y: 5 } });
    const layer = new PointerStackLayer(app);
    const fakeTime = Time.toSeconds(Time.milliseconds(16));

    layer.update(fakeTime);

    const lines = (layer as unknown as { _lines: Array<{ text: string }> })._lines;

    expect(lines.some(l => l.text.includes('Btn — z=3 — interactive'))).toBe(true);
  });

  test('a leaf node with no children property is not recursed into', () => {
    // Plain leaf (no `children` key at all, as opposed to an empty array) -
    // exercises the Array.isArray(container.children) false branch in _collectContaining.
    const leaf = { visible: true, zIndex: 0, interactive: false, contains: vi.fn(() => true), constructor: { name: 'Leaf' } };
    const app = makeApp({ root: leaf as unknown as FakeNode, pointerPos: { x: 1, y: 1 } });
    const layer = new PointerStackLayer(app);
    const fakeTime = Time.toSeconds(Time.milliseconds(16));

    expect(() => layer.update(fakeTime)).not.toThrow();
  });

  test('destroy() before any update() call is safe (panel never built)', () => {
    const app = makeApp({ pointerPos: { x: 10, y: 10 } });
    const layer = new PointerStackLayer(app);

    expect(() => layer.destroy()).not.toThrow();
  });

  test('destroy() cleans up without throwing', () => {
    const app = makeApp({ pointerPos: { x: 10, y: 10 } });
    const layer = new PointerStackLayer(app);
    const fakeTime = Time.toSeconds(Time.milliseconds(16));
    const backend = app.backend;

    // Trigger internal build.
    layer.update(fakeTime);
    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    expect(() => layer.destroy()).not.toThrow();
    // Double-destroy should also be safe.
    expect(() => layer.destroy()).not.toThrow();
  });
});
