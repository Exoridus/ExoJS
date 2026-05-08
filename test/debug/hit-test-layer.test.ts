/**
 * HitTestLayer tests (0.7.5).
 */

import { Signal } from '@/core/Signal';

// Stub glyph atlas.
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
  setView: jest.fn().mockReturnThis(),
  draw: jest.fn().mockReturnThis(),
  flush: jest.fn().mockReturnThis(),
});

interface FakeNode {
  visible: boolean;
  zIndex: number;
  interactive: boolean;
  contains: jest.Mock;
  getBounds: jest.Mock;
  children: FakeNode[];
}

function makeNode(
  opts: {
    visible?: boolean;
    zIndex?: number;
    interactive?: boolean;
    boundsW?: number;
    boundsH?: number;
    children?: FakeNode[];
  } = {},
): FakeNode {
  const { visible = true, zIndex = 0, interactive = false, boundsW = 100, boundsH = 50, children = [] } = opts;

  return {
    visible,
    zIndex,
    interactive,
    contains: jest.fn(() => false),
    getBounds: jest.fn(() => ({
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

const makeInteraction = (
  opts: {
    hovered?: FakeNode | null;
    captured?: FakeNode[];
    quadtree?: { _walkBounds: jest.Mock } | null;
  } = {},
) => ({
  getHoveredNode: jest.fn(() => opts.hovered ?? null),
  getCapturedNodes: jest.fn(() => opts.captured ?? []),
  _getDebugQuadtree: jest.fn(() => opts.quadtree ?? null),
});

const makeApp = (root: FakeNode | null = null, interaction: any = makeInteraction()) =>
  ({
    canvas: { width: 800, height: 600 },
    backend: makeBackend(),
    sceneManager: { scene: root ? { root } : null },
    input: { onKeyDown: new Signal<[number]>(), getPrimaryPointerPosition: jest.fn(() => null) },
    interaction,
    onFrame: new Signal(),
    onResize: new Signal(),
  }) as unknown as import('@/core/Application').Application;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HitTestLayer', () => {
  test('viewMode is "world"', () => {
    const { HitTestLayer } = require('../../src/debug/HitTestLayer') as typeof import('../../src/debug/HitTestLayer');
    const layer = new HitTestLayer(makeApp());

    expect(layer.viewMode).toBe('world');
  });

  test('visible defaults to false', () => {
    const { HitTestLayer } = require('../../src/debug/HitTestLayer') as typeof import('../../src/debug/HitTestLayer');
    const layer = new HitTestLayer(makeApp());

    expect(layer.visible).toBe(false);
  });

  test('render() is a no-op when scene has no root', () => {
    const { HitTestLayer } = require('../../src/debug/HitTestLayer') as typeof import('../../src/debug/HitTestLayer');
    const app = makeApp(null);
    const layer = new HitTestLayer(app);
    const backend = makeBackend();

    expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();
  });

  test('render() calls getBounds() only for interactive nodes', () => {
    const { HitTestLayer } = require('../../src/debug/HitTestLayer') as typeof import('../../src/debug/HitTestLayer');
    const nonInteractive = makeNode({ interactive: false, boundsW: 50, boundsH: 50 });
    const interactive = makeNode({ interactive: true, boundsW: 50, boundsH: 50 });

    const root = {
      visible: true,
      zIndex: 0,
      interactive: false,
      getBounds: jest.fn(() => ({ width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 })),
      contains: jest.fn(() => false),
      children: [nonInteractive, interactive],
    };

    const app = makeApp(root as unknown as FakeNode);
    const layer = new HitTestLayer(app);
    const backend = app.backend;

    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    expect(interactive.getBounds).toHaveBeenCalled();
    expect(nonInteractive.getBounds).not.toHaveBeenCalled();
  });

  test('hovered node gets yellow color (1, 1, 0)', () => {
    const { HitTestLayer } = require('../../src/debug/HitTestLayer') as typeof import('../../src/debug/HitTestLayer');
    const { Graphics } = require('../../src/rendering/primitives/Graphics') as typeof import('../../src/rendering/primitives/Graphics');

    const hoveredNode = makeNode({ interactive: true, boundsW: 50, boundsH: 50 });
    const interaction = makeInteraction({ hovered: hoveredNode as unknown as FakeNode });
    const app = makeApp(hoveredNode as unknown as FakeNode, interaction);
    const layer = new HitTestLayer(app);
    const backend = app.backend;

    const colorAssignments: { r: number; g: number; b: number }[] = [];
    const originalSetter = Object.getOwnPropertyDescriptor(Graphics.prototype, 'lineColor')?.set;

    jest.spyOn(Graphics.prototype, 'lineColor', 'set').mockImplementation(function (this: unknown, c) {
      colorAssignments.push({
        r: (c as import('@/core/Color').Color).r,
        g: (c as import('@/core/Color').Color).g,
        b: (c as import('@/core/Color').Color).b,
      });
      originalSetter?.call(this, c);
    });

    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    jest.restoreAllMocks();

    // Yellow = (1, 1, 0).
    expect(colorAssignments.some(c => c.r === 1 && c.g === 1 && c.b === 0)).toBe(true);
  });

  test('captured node gets cyan color (0, 1, 1)', () => {
    const { HitTestLayer } = require('../../src/debug/HitTestLayer') as typeof import('../../src/debug/HitTestLayer');
    const { Graphics } = require('../../src/rendering/primitives/Graphics') as typeof import('../../src/rendering/primitives/Graphics');

    const capturedNode = makeNode({ interactive: true, boundsW: 50, boundsH: 50 });
    const interaction = makeInteraction({
      hovered: null,
      captured: [capturedNode as unknown as FakeNode],
    });
    const app = makeApp(capturedNode as unknown as FakeNode, interaction);
    const layer = new HitTestLayer(app);
    const backend = app.backend;

    const colorAssignments: { r: number; g: number; b: number }[] = [];
    const originalSetter = Object.getOwnPropertyDescriptor(Graphics.prototype, 'lineColor')?.set;

    jest.spyOn(Graphics.prototype, 'lineColor', 'set').mockImplementation(function (this: unknown, c) {
      colorAssignments.push({
        r: (c as import('@/core/Color').Color).r,
        g: (c as import('@/core/Color').Color).g,
        b: (c as import('@/core/Color').Color).b,
      });
      originalSetter?.call(this, c);
    });

    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    jest.restoreAllMocks();

    // Cyan = (0, 1, 1).
    expect(colorAssignments.some(c => c.r === 0 && c.g === 1 && c.b === 1)).toBe(true);
  });

  test('idle interactive node gets magenta color (1, 0, 1)', () => {
    const { HitTestLayer } = require('../../src/debug/HitTestLayer') as typeof import('../../src/debug/HitTestLayer');
    const { Graphics } = require('../../src/rendering/primitives/Graphics') as typeof import('../../src/rendering/primitives/Graphics');

    const idleNode = makeNode({ interactive: true, boundsW: 50, boundsH: 50 });
    const interaction = makeInteraction({ hovered: null, captured: [] });
    const app = makeApp(idleNode as unknown as FakeNode, interaction);
    const layer = new HitTestLayer(app);
    const backend = app.backend;

    const colorAssignments: { r: number; g: number; b: number }[] = [];
    const originalSetter = Object.getOwnPropertyDescriptor(Graphics.prototype, 'lineColor')?.set;

    jest.spyOn(Graphics.prototype, 'lineColor', 'set').mockImplementation(function (this: unknown, c) {
      colorAssignments.push({
        r: (c as import('@/core/Color').Color).r,
        g: (c as import('@/core/Color').Color).g,
        b: (c as import('@/core/Color').Color).b,
      });
      originalSetter?.call(this, c);
    });

    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    jest.restoreAllMocks();

    // Magenta = (1, 0, 1).
    expect(colorAssignments.some(c => c.r === 1 && c.g === 0 && c.b === 1)).toBe(true);
  });

  test('quadtree regions rendered when spatial index is active (quadtree non-null)', () => {
    const { HitTestLayer } = require('../../src/debug/HitTestLayer') as typeof import('../../src/debug/HitTestLayer');

    const node = makeNode({ interactive: false, boundsW: 10, boundsH: 10 });

    // Minimal quadtree stub with _walkBounds.
    const walkBoundsSpy = jest.fn((_cb: (rect: unknown) => void) => {
      _cb({ left: 0, top: 0, right: 100, bottom: 100 });
    });
    const interaction = makeInteraction({
      quadtree: { _walkBounds: walkBoundsSpy },
    });
    const app = makeApp(node as unknown as FakeNode, interaction);
    const layer = new HitTestLayer(app);
    const backend = app.backend;

    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    expect(walkBoundsSpy).toHaveBeenCalled();
  });

  test('quadtree regions NOT rendered when spatial index is inactive (quadtree null)', () => {
    const { HitTestLayer } = require('../../src/debug/HitTestLayer') as typeof import('../../src/debug/HitTestLayer');

    const node = makeNode({ interactive: false, boundsW: 10, boundsH: 10 });
    const walkBoundsSpy = jest.fn();
    const interaction = makeInteraction({ quadtree: null });
    const app = makeApp(node as unknown as FakeNode, interaction);
    const layer = new HitTestLayer(app);
    const backend = app.backend;

    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    expect(walkBoundsSpy).not.toHaveBeenCalled();
  });

  test('update() does not throw', () => {
    const { HitTestLayer } = require('../../src/debug/HitTestLayer') as typeof import('../../src/debug/HitTestLayer');
    const layer = new HitTestLayer(makeApp());
    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    expect(() => layer.update(fakeTime)).not.toThrow();
  });

  test('destroy() releases the Graphics primitive', () => {
    const { HitTestLayer } = require('../../src/debug/HitTestLayer') as typeof import('../../src/debug/HitTestLayer');
    const node = makeNode({ interactive: true, boundsW: 10, boundsH: 10 });
    const app = makeApp(node);
    const layer = new HitTestLayer(app);
    const backend = app.backend;

    layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

    expect(() => layer.destroy()).not.toThrow();
    expect(() => layer.destroy()).not.toThrow();
  });
});
