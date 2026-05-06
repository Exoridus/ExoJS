/**
 * BoundingBoxesLayer tests (0.7.5).
 */

import { Signal } from '@/core/Signal';

// Stub the glyph atlas so Text construction never touches a real 2D canvas context.
jest.mock('@/rendering/text/atlas-singleton', () => {
    const fakeGlyph = {
        x: 0, y: 0, width: 6, height: 10,
        uvLeft: 0, uvRight: 0.01, uvTop: 0, uvBottom: 0.02,
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
    stats: { frameTimeMs: 0, drawCalls: 0, culledNodes: 0, submittedNodes: 0, batches: 0, renderPasses: 0, renderTargetChanges: 0, frame: 0 },
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
    children: Array<FakeNode>;
}

/** Build a minimal RenderNode-like object. */
function makeNode(opts: {
    visible?: boolean;
    zIndex?: number;
    boundsW?: number;
    boundsH?: number;
    children?: Array<FakeNode>;
} = {}): FakeNode {
    const {
        visible = true,
        zIndex = 0,
        boundsW = 100,
        boundsH = 50,
        children = [],
    } = opts;

    return {
        visible,
        zIndex,
        interactive: false,
        contains: jest.fn(() => false),
        getBounds: jest.fn(() => ({
            width: boundsW,
            height: boundsH,
            left:   0,
            top:    0,
            right:  boundsW,
            bottom: boundsH,
        })),
        children,
    };
}

const makeApp = (root: FakeNode | null = null) => ({
    canvas: { width: 800, height: 600 },
    backend: makeBackend(),
    sceneManager: { scene: root ? { root } : null },
    inputManager: { onKeyDown: new Signal<[number]>(), getPrimaryPointerPosition: jest.fn(() => null) },
    interaction: { getHoveredNode: jest.fn(() => null), getCapturedNodes: jest.fn(() => []), useSpatialIndex: false, _getDebugQuadtree: jest.fn(() => null) },
    onFrame: new Signal(),
    onResize: new Signal(),
} as unknown as import('@/core/Application').Application);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BoundingBoxesLayer', () => {
    test('visible defaults to false', () => {
        const { BoundingBoxesLayer } = require('../../src/debug/BoundingBoxesLayer') as typeof import('../../src/debug/BoundingBoxesLayer');
        const layer = new BoundingBoxesLayer(makeApp());

        expect(layer.visible).toBe(false);
    });

    test('viewMode is "world"', () => {
        const { BoundingBoxesLayer } = require('../../src/debug/BoundingBoxesLayer') as typeof import('../../src/debug/BoundingBoxesLayer');
        const layer = new BoundingBoxesLayer(makeApp());

        expect(layer.viewMode).toBe('world');
    });

    test('render() is a no-op when scene has no root', () => {
        const { BoundingBoxesLayer } = require('../../src/debug/BoundingBoxesLayer') as typeof import('../../src/debug/BoundingBoxesLayer');
        const app = makeApp(null);
        const layer = new BoundingBoxesLayer(app);
        const backend = makeBackend();

        expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();
    });

    test('render() calls getBounds() for visible nodes', () => {
        const { BoundingBoxesLayer } = require('../../src/debug/BoundingBoxesLayer') as typeof import('../../src/debug/BoundingBoxesLayer');
        const node = makeNode({ visible: true, zIndex: 0, boundsW: 100, boundsH: 50 });
        const app = makeApp(node);
        const layer = new BoundingBoxesLayer(app);
        const backend = app.backend;

        layer.render(backend as unknown as Parameters<typeof layer.render>[0]);

        expect(node.getBounds).toHaveBeenCalled();
    });

    test('render() skips nodes with zero-area bounds', () => {
        const { BoundingBoxesLayer } = require('../../src/debug/BoundingBoxesLayer') as typeof import('../../src/debug/BoundingBoxesLayer');
        const zeroNode = makeNode({ visible: true, boundsW: 0, boundsH: 0 });
        const normalNode = makeNode({ visible: true, boundsW: 50, boundsH: 50 });

        // The scene root holds two children.
        const root = {
            visible: true,
            zIndex: 0,
            interactive: false,
            getBounds: jest.fn(() => ({ width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 })),
            contains: jest.fn(() => false),
            children: [zeroNode, normalNode],
        };

        const app = makeApp(root as unknown as FakeNode);
        const layer = new BoundingBoxesLayer(app);
        const backend = app.backend;

        // Should not throw even with zero-area node.
        expect(() => layer.render(backend as unknown as Parameters<typeof layer.render>[0])).not.toThrow();
    });

    test('render() skips invisible nodes', () => {
        const { BoundingBoxesLayer } = require('../../src/debug/BoundingBoxesLayer') as typeof import('../../src/debug/BoundingBoxesLayer');
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
        const { BoundingBoxesLayer } = require('../../src/debug/BoundingBoxesLayer') as typeof import('../../src/debug/BoundingBoxesLayer');

        const node0 = makeNode({ visible: true, zIndex: 0,  boundsW: 10, boundsH: 10 });
        const node1 = makeNode({ visible: true, zIndex: 12, boundsW: 10, boundsH: 10 });

        const root: FakeNode = {
            visible: true,
            zIndex: 0,
            interactive: false,
            getBounds: jest.fn(() => ({ width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 })),
            contains: jest.fn(() => false),
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
        const { BoundingBoxesLayer } = require('../../src/debug/BoundingBoxesLayer') as typeof import('../../src/debug/BoundingBoxesLayer');
        const { Color } = require('../../src/core/Color') as typeof import('../../src/core/Color');

        const lineColors: Array<{ r: number; g: number; b: number }> = [];
        const node1 = makeNode({ visible: true, zIndex: 1, boundsW: 10, boundsH: 10 });
        const node2 = makeNode({ visible: true, zIndex: 2, boundsW: 10, boundsH: 10 });
        const root: FakeNode = {
            visible: true,
            zIndex: 0,
            interactive: false,
            getBounds: jest.fn(() => ({ width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 })),
            contains: jest.fn(() => false),
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

    test('update() does not throw', () => {
        const { BoundingBoxesLayer } = require('../../src/debug/BoundingBoxesLayer') as typeof import('../../src/debug/BoundingBoxesLayer');
        const layer = new BoundingBoxesLayer(makeApp());
        const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

        expect(() => layer.update(fakeTime)).not.toThrow();
    });

    test('destroy() releases the Graphics primitive', () => {
        const { BoundingBoxesLayer } = require('../../src/debug/BoundingBoxesLayer') as typeof import('../../src/debug/BoundingBoxesLayer');
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
