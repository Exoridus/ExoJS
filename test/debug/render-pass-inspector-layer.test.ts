import { Signal } from '#core/Signal';
import { RenderPassInspectorLayer } from '#debug/RenderPassInspectorLayer';
import type { RenderingContext } from '#rendering/RenderingContext';
import { RenderPass } from '#rendering/RenderPass';
import { RenderPipeline } from '#rendering/RenderPipeline';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import type { Text } from '#rendering/text/Text';

class TestPass extends RenderPass {
  public override execute(_context: RenderingContext): void {
    // no-op — the inspector never runs the pass, only lists it.
  }
}

// Stub the glyph atlas pool so Text construction doesn't touch a real 2D canvas context.
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
// Fakes
// ---------------------------------------------------------------------------

interface FakeFilter {
  readonly constructor: { name: string };
}

const makeFilter = (name: string): FakeFilter => {
  class NamedFilter {
    public static get name(): string {
      return name;
    }
  }
  return { constructor: NamedFilter as any };
};

interface FakeNode {
  visible: boolean;
  filters: FakeFilter[];
  mask: object | null;
  cacheAsBitmap: boolean;
  getBounds: MockInstance;
  children: FakeNode[];
  constructor: { name: string };
}

function makeNode(
  opts: {
    visible?: boolean;
    filters?: FakeFilter[];
    mask?: object | null;
    cacheAsBitmap?: boolean;
    width?: number;
    height?: number;
    children?: FakeNode[];
    className?: string;
  } = {},
): FakeNode {
  const { visible = true, filters = [], mask = null, cacheAsBitmap = false, width = 100, height = 50, children = [], className = 'Sprite' } = opts;
  class NamedClass {
    public static get name(): string {
      return className;
    }
  }
  return {
    visible,
    filters,
    mask,
    cacheAsBitmap,
    getBounds: vi.fn(() => ({ width, height, left: 0, top: 0, right: width, bottom: height })),
    children,
    constructor: NamedClass as any,
  };
}

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

const makeApp = (root: FakeNode | null = null) =>
  ({
    canvas: { width: 800, height: 600 },
    scenes: { currentScene: root ? { root } : null },
    onFrame: new Signal(),
    onResize: new Signal(),
  }) as unknown as import('#core/Application').Application;

const makeTime = () => ({ milliseconds: 16, seconds: 0.016 }) as unknown as import('#core/Time').Time;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RenderPassInspectorLayer', () => {
  test('visible defaults to false', () => {
    const layer = new RenderPassInspectorLayer(makeApp());
    expect(layer.visible).toBe(false);
  });

  test('viewMode is "screen"', () => {
    const layer = new RenderPassInspectorLayer(makeApp());
    expect(layer.viewMode).toBe('screen');
  });

  test('update with no active scene yields empty entries', () => {
    const layer = new RenderPassInspectorLayer(makeApp(null));
    layer.update(makeTime());
    expect(layer.entries).toEqual([]);
    expect(layer.totalPasses).toBe(0);
  });

  test('update with no filters yields empty entries', () => {
    const root = makeNode({ filters: [], children: [makeNode({ filters: [] }), makeNode({ filters: [] })] });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());
    expect(layer.entries).toEqual([]);
  });

  test('update collects entries for nodes with active filter chains', () => {
    const blur = makeFilter('BlurFilter');
    const color = makeFilter('ColorFilter');
    const root = makeNode({
      className: 'Sprite',
      filters: [blur, color],
      width: 800,
      height: 600,
    });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());

    expect(layer.entries.length).toBe(1);
    const entry = layer.entries[0];
    expect(entry.drawableLabel).toBe('Sprite');
    expect(entry.filters.length).toBe(2);
    expect(entry.width).toBe(800);
    expect(entry.height).toBe(600);
    expect(entry.hasMask).toBe(false);
    expect(entry.cachedAsBitmap).toBe(false);
  });

  test('totalPasses counts filters across all entries plus masks', () => {
    const filterA = makeFilter('A');
    const filterB = makeFilter('B');
    const filterC = makeFilter('C');
    const root = makeNode({
      filters: [],
      children: [
        makeNode({ filters: [filterA, filterB] }),
        makeNode({ filters: [filterC], mask: { foo: 1 } }), // 1 filter + 1 mask = 2 passes
      ],
    });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());

    expect(layer.entries.length).toBe(2);
    expect(layer.totalPasses).toBe(4); // 2 + 1 + 1 (mask)
  });

  test('skips invisible nodes', () => {
    const invisible = makeNode({ visible: false, filters: [makeFilter('BlurFilter')] });
    const layer = new RenderPassInspectorLayer(makeApp(invisible));
    layer.update(makeTime());
    expect(layer.entries).toEqual([]);
  });

  test('mask flag is reflected in entry', () => {
    const root = makeNode({ filters: [makeFilter('BlurFilter')], mask: { something: true } });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());
    expect(layer.entries[0].hasMask).toBe(true);
  });

  test('cacheAsBitmap flag is reflected in entry', () => {
    const root = makeNode({ filters: [makeFilter('BlurFilter')], cacheAsBitmap: true });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());
    expect(layer.entries[0].cachedAsBitmap).toBe(true);
  });

  test('recurses into Container children', () => {
    const child1 = makeNode({ filters: [makeFilter('A')] });
    const child2 = makeNode({ filters: [makeFilter('B')] });
    const root = makeNode({ children: [child1, child2] });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());
    expect(layer.entries.length).toBe(2);
  });

  test('a leaf node with no children property is not recursed into', () => {
    // Plain leaf (no `children` key at all, as opposed to an empty array) —
    // exercises the Array.isArray(container.children) false branch in _collect.
    const leaf = { visible: true, filters: [], mask: null, cacheAsBitmap: false, getBounds: vi.fn(), constructor: { name: 'Leaf' } };
    const layer = new RenderPassInspectorLayer(makeApp(leaf as unknown as FakeNode));

    expect(() => layer.update(makeTime())).not.toThrow();
  });

  test('a filter-chain hole (undefined entry) is skipped defensively', () => {
    const holeyFilters = [undefined as unknown as FakeFilter, makeFilter('Blur')];
    const root = makeNode({ filters: holeyFilters });
    const layer = new RenderPassInspectorLayer(makeApp(root));

    expect(() => layer.update(makeTime())).not.toThrow();
    expect(layer.entries[0].filters.length).toBe(2);
  });

  test('destroy releases panel state and clears entries', () => {
    const root = makeNode({ filters: [makeFilter('A')] });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());
    expect(layer.entries.length).toBe(1);

    layer.destroy();
    expect(layer.entries).toEqual([]);
  });

  test('destroy() before any update() call is safe (panel never built)', () => {
    const layer = new RenderPassInspectorLayer(makeApp());

    expect(() => layer.destroy()).not.toThrow();
  });

  test('subsequent update replaces previous entries (no accumulation)', () => {
    const root = makeNode({ filters: [makeFilter('A')] });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());
    layer.update(makeTime());
    layer.update(makeTime());
    expect(layer.entries.length).toBe(1);
  });

  test('render() submits the panel subtree to the backend without throwing', () => {
    const root = makeNode({ filters: [makeFilter('A')] });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    const backend = makeBackend();

    layer.update(makeTime());
    expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();
  });

  test('render() before any update() call is a no-op', () => {
    const layer = new RenderPassInspectorLayer(makeApp());
    const backend = makeBackend();

    expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();
  });
});

describe('RenderPassInspectorLayer — pipeline inspection', () => {
  test('pipeline defaults to null and setPipeline() is chainable', () => {
    const layer = new RenderPassInspectorLayer(makeApp());
    const pipeline = new RenderPipeline();

    expect(layer.pipeline).toBeNull();
    expect(layer.pipelineRows()).toEqual([]);

    const result = layer.setPipeline(pipeline);

    expect(result).toBe(layer);
    expect(layer.pipeline).toBe(pipeline);
  });

  test('pipelineRows() reflects the pipeline set via setPipeline()', () => {
    const layer = new RenderPassInspectorLayer(makeApp());
    const pipeline = new RenderPipeline().addPass(new TestPass({ label: 'world' }));

    layer.setPipeline(pipeline);

    expect(layer.pipelineRows()).toEqual([{ depth: 0, label: 'world', enabled: true, isPipeline: false }]);

    layer.setPipeline(null);
    expect(layer.pipelineRows()).toEqual([]);
  });

  test('the panel HUD lists pipeline rows alongside filter-chain entries, dimming disabled passes', () => {
    const root = makeNode({ filters: [makeFilter('Blur')] });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    const pipeline = new RenderPipeline().addPass(new TestPass({ label: 'world' })).addPass(new TestPass({ label: 'units', enabled: false }));

    layer.setPipeline(pipeline);
    layer.update(makeTime());

    expect(layer.entries.length).toBe(1);
    expect(layer.pipelineRows()).toEqual([
      { depth: 0, label: 'world', enabled: true, isPipeline: false },
      { depth: 0, label: 'units', enabled: false, isPipeline: false },
    ]);

    const lines = (layer as unknown as { _lines: Text[] })._lines;

    expect(lines.some(l => l.text === '  world')).toBe(true);
    expect(lines.some(l => l.text === '  units [off]')).toBe(true);
  });
});

describe('RenderPassInspectorLayer — HUD overflow', () => {
  test('entries beyond the panel line budget collapse into a "+N more" summary line', () => {
    // One entry (1 header line) plus 30 filters (30 lines) = 31 lines, well
    // past the panel's fixed line budget — this must trigger the overflow path.
    const manyFilters = Array.from({ length: 30 }, (_, i) => makeFilter(`Filter${i}`));
    const root = makeNode({ filters: manyFilters });
    const layer = new RenderPassInspectorLayer(makeApp(root));

    layer.update(makeTime());

    const lines = (layer as unknown as { _lines: Text[] })._lines;
    const last = lines[lines.length - 1];

    expect(last?.text).toMatch(/^\.\.\. \(\+\d+ more\)$/);
    expect(last?.visible).toBe(true);
  });
});
