import { Signal } from '@/core/Signal';

// Stub the glyph atlas so Text construction doesn't touch a real 2D canvas context.
jest.mock('@/rendering/text/atlas-singleton', () => {
  const fakeGlyph = {
    x: 0,
    y: 0,
    width: 6,
    height: 10,
    uvLeft: 0,
    uvRight: 0.01,
    uvTop: 0,
    uvBottom: 0.02,
  };
  const fakeAtlas = {
    texture: { updateSource: jest.fn() },
    getGlyph: jest.fn(() => fakeGlyph),
  };
  return { getDefaultGlyphAtlas: () => fakeAtlas };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { constructor: NamedFilter as any };
};

interface FakeNode {
  visible: boolean;
  filters: FakeFilter[];
  mask: object | null;
  cacheAsBitmap: boolean;
  getBounds: jest.Mock;
  children: FakeNode[];
  constructor: { name: string };
}

function makeNode(opts: {
  visible?: boolean;
  filters?: FakeFilter[];
  mask?: object | null;
  cacheAsBitmap?: boolean;
  width?: number;
  height?: number;
  children?: FakeNode[];
  className?: string;
} = {}): FakeNode {
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
    getBounds: jest.fn(() => ({ width, height, left: 0, top: 0, right: width, bottom: height })),
    children,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor: NamedClass as any,
  };
}

const makeApp = (root: FakeNode | null = null) =>
  ({
    canvas: { width: 800, height: 600 },
    sceneManager: { scene: root ? { root } : null },
    onFrame: new Signal(),
    onResize: new Signal(),
  }) as unknown as import('@/core/Application').Application;

const makeTime = () => ({ milliseconds: 16, seconds: 0.016 }) as unknown as import('@/core/Time').Time;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RenderPassInspectorLayer', () => {
  test('visible defaults to false', () => {
    const { RenderPassInspectorLayer } = require('../../src/debug/RenderPassInspectorLayer') as typeof import('../../src/debug/RenderPassInspectorLayer');
    const layer = new RenderPassInspectorLayer(makeApp());
    expect(layer.visible).toBe(false);
  });

  test('viewMode is "screen"', () => {
    const { RenderPassInspectorLayer } = require('../../src/debug/RenderPassInspectorLayer') as typeof import('../../src/debug/RenderPassInspectorLayer');
    const layer = new RenderPassInspectorLayer(makeApp());
    expect(layer.viewMode).toBe('screen');
  });

  test('update with no active scene yields empty entries', () => {
    const { RenderPassInspectorLayer } = require('../../src/debug/RenderPassInspectorLayer') as typeof import('../../src/debug/RenderPassInspectorLayer');
    const layer = new RenderPassInspectorLayer(makeApp(null));
    layer.update(makeTime());
    expect(layer.entries).toEqual([]);
    expect(layer.totalPasses).toBe(0);
  });

  test('update with no filters yields empty entries', () => {
    const { RenderPassInspectorLayer } = require('../../src/debug/RenderPassInspectorLayer') as typeof import('../../src/debug/RenderPassInspectorLayer');
    const root = makeNode({ filters: [], children: [makeNode({ filters: [] }), makeNode({ filters: [] })] });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());
    expect(layer.entries).toEqual([]);
  });

  test('update collects entries for nodes with active filter chains', () => {
    const { RenderPassInspectorLayer } = require('../../src/debug/RenderPassInspectorLayer') as typeof import('../../src/debug/RenderPassInspectorLayer');
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
    const { RenderPassInspectorLayer } = require('../../src/debug/RenderPassInspectorLayer') as typeof import('../../src/debug/RenderPassInspectorLayer');
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
    const { RenderPassInspectorLayer } = require('../../src/debug/RenderPassInspectorLayer') as typeof import('../../src/debug/RenderPassInspectorLayer');
    const invisible = makeNode({ visible: false, filters: [makeFilter('BlurFilter')] });
    const layer = new RenderPassInspectorLayer(makeApp(invisible));
    layer.update(makeTime());
    expect(layer.entries).toEqual([]);
  });

  test('mask flag is reflected in entry', () => {
    const { RenderPassInspectorLayer } = require('../../src/debug/RenderPassInspectorLayer') as typeof import('../../src/debug/RenderPassInspectorLayer');
    const root = makeNode({ filters: [makeFilter('BlurFilter')], mask: { something: true } });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());
    expect(layer.entries[0].hasMask).toBe(true);
  });

  test('cacheAsBitmap flag is reflected in entry', () => {
    const { RenderPassInspectorLayer } = require('../../src/debug/RenderPassInspectorLayer') as typeof import('../../src/debug/RenderPassInspectorLayer');
    const root = makeNode({ filters: [makeFilter('BlurFilter')], cacheAsBitmap: true });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());
    expect(layer.entries[0].cachedAsBitmap).toBe(true);
  });

  test('recurses into Container children', () => {
    const { RenderPassInspectorLayer } = require('../../src/debug/RenderPassInspectorLayer') as typeof import('../../src/debug/RenderPassInspectorLayer');
    const child1 = makeNode({ filters: [makeFilter('A')] });
    const child2 = makeNode({ filters: [makeFilter('B')] });
    const root = makeNode({ children: [child1, child2] });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());
    expect(layer.entries.length).toBe(2);
  });

  test('destroy releases panel state and clears entries', () => {
    const { RenderPassInspectorLayer } = require('../../src/debug/RenderPassInspectorLayer') as typeof import('../../src/debug/RenderPassInspectorLayer');
    const root = makeNode({ filters: [makeFilter('A')] });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());
    expect(layer.entries.length).toBe(1);

    layer.destroy();
    expect(layer.entries).toEqual([]);
  });

  test('subsequent update replaces previous entries (no accumulation)', () => {
    const { RenderPassInspectorLayer } = require('../../src/debug/RenderPassInspectorLayer') as typeof import('../../src/debug/RenderPassInspectorLayer');
    const root = makeNode({ filters: [makeFilter('A')] });
    const layer = new RenderPassInspectorLayer(makeApp(root));
    layer.update(makeTime());
    layer.update(makeTime());
    layer.update(makeTime());
    expect(layer.entries.length).toBe(1);
  });
});
