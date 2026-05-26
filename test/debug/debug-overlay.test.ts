/**
 * Canvas-native DebugOverlay tests (0.6.17+).
 *
 * Exercises tree-shake architecture (debug not in root), subscription
 * lifecycle, visibility toggling, F1 keybinding, and render path.
 */

import * as debugExports from '@/debug/index';
import { DebugOverlay } from '@/debug/DebugOverlay';
import * as rootExports from '@/index';
import { Signal } from '@/core/Signal';
import { Keyboard } from '@/input/types';
import type { GlyphAtlasPool } from '@/rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '@/rendering/text/GlyphAtlasPool';

// Stub the glyph atlas pool so Text construction never touches a
// real 2D canvas context (jsdom's canvas does not implement measureText).
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
// Minimal Application mock — enough for DebugOverlay constructor + usage.
// ---------------------------------------------------------------------------

// A view-like object that satisfies the SceneNode.inView() call path.
// SceneNode.inView() calls view.getBounds().intersectsWith(...), so the
// view mock needs getBounds returning a Rectangle-like with intersectsWith.
const makeFakeView = () => ({
  width: 800,
  height: 600,
  getBounds: () => ({
    intersectsWith: () => true, // always in-view for tests
  }),
});

const makeBackend = () => {
  const view = makeFakeView();

  return {
    stats: {
      frameTimeMs: 0,
      drawCalls: 5,
      culledNodes: 2,
      submittedNodes: 10,
      batches: 3,
      renderPasses: 1,
      renderTargetChanges: 0,
      frame: 1,
    },
    view,
    setView: vi.fn().mockReturnThis(),
    draw: vi.fn().mockReturnThis(),
    flush: vi.fn().mockReturnThis(),
  };
};

const makeSceneManager = () => ({
  scene: null as null | { root: object },
});

const makeOnFrame = () => new Signal<[import('@/core/Time').Time]>();
const makeOnKeyDown = () => new Signal<[number]>();
const makeOnResize = () => new Signal<[number, number, unknown]>();

const makeApp = () => {
  const onFrame = makeOnFrame();
  const onKeyDown = makeOnKeyDown();
  const onResize = makeOnResize();

  return {
    canvas: { width: 800, height: 600 },
    backend: makeBackend(),
    scene: makeSceneManager(),
    input: { onKeyDown },
    onFrame,
    onResize,
  } as unknown as import('@/core/Application').Application;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DebugOverlay — tree-shake architecture', () => {
  test('DebugOverlay is NOT exported from the root barrel', () => {

    expect((rootExports as Record<string, unknown>)['DebugOverlay']).toBeUndefined();
  });

  test('DebugOverlay IS exported from the debug subpath', () => {

    expect(typeof (debugExports as Record<string, unknown>)['DebugOverlay']).toBe('function');
  });

  test('DebugLayer IS exported from the debug subpath', () => {

    expect(typeof (debugExports as Record<string, unknown>)['DebugLayer']).toBe('function');
  });

  test('PerformanceLayer IS exported from the debug subpath', () => {

    expect(typeof (debugExports as Record<string, unknown>)['PerformanceLayer']).toBe('function');
  });
});

describe('DebugOverlay — lifecycle', () => {
  test('new DebugOverlay(app) does not throw', () => {
    const app = makeApp();

    expect(() => new DebugOverlay(app)).not.toThrow();
  });

  test('constructor subscribes to app.onFrame', () => {
    const app = makeApp();

    expect(app.onFrame.count).toBe(0);

    const debug = new DebugOverlay(app);

    expect(app.onFrame.count).toBe(1);

    debug.destroy();
  });

  test('constructor subscribes to input.onKeyDown', () => {
    const app = makeApp();

    expect(app.input.onKeyDown.count).toBe(0);

    const debug = new DebugOverlay(app);

    expect(app.input.onKeyDown.count).toBe(1);

    debug.destroy();
  });

  test('layers.performance.visible defaults to false', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.performance.visible).toBe(false);

    debug.destroy();
  });

  test('destroy() removes onFrame and onKeyDown subscriptions', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(app.onFrame.count).toBe(1);
    expect(app.input.onKeyDown.count).toBe(1);

    debug.destroy();

    expect(app.onFrame.count).toBe(0);
    expect(app.input.onKeyDown.count).toBe(0);
  });
});

describe('DebugOverlay — render path', () => {
  test('with visible=false, dispatching onFrame does NOT call backend.setView', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    // visible defaults to false — dispatch a frame
    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    app.onFrame.dispatch(fakeTime);

    expect(app.backend.setView).not.toHaveBeenCalled();

    debug.destroy();
  });

  test('with visible=true, dispatching onFrame calls backend.setView', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    debug.layers.performance.visible = true;

    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    app.onFrame.dispatch(fakeTime);

    expect(app.backend.setView).toHaveBeenCalled();

    debug.destroy();
  });

  test('with visible=true, backend.setView is called twice (save + restore)', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    debug.layers.performance.visible = true;

    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    app.onFrame.dispatch(fakeTime);

    // Called at least twice: once to swap in debug view, once to restore.
    expect(app.backend.setView).toHaveBeenCalledTimes(2);

    debug.destroy();
  });
});

describe('DebugOverlay — F1 keybinding', () => {
  test('dispatching F1 toggles performance.visible from false to true', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.performance.visible).toBe(false);

    app.input.onKeyDown.dispatch(Keyboard.F1);

    expect(debug.layers.performance.visible).toBe(true);

    debug.destroy();
  });

  test('dispatching F1 twice toggles back to false', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    app.input.onKeyDown.dispatch(Keyboard.F1);
    expect(debug.layers.performance.visible).toBe(true);

    app.input.onKeyDown.dispatch(Keyboard.F1);
    expect(debug.layers.performance.visible).toBe(false);

    debug.destroy();
  });

  test('other keys do not affect performance.visible', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    app.input.onKeyDown.dispatch(Keyboard.F2);
    app.input.onKeyDown.dispatch(Keyboard.Space);
    app.input.onKeyDown.dispatch(Keyboard.A);

    expect(debug.layers.performance.visible).toBe(false);

    debug.destroy();
  });
});

describe('DebugOverlay — F2/F3/F4 keybindings', () => {
  test('F2 toggles boundingBoxes layer', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.boundingBoxes.visible).toBe(false);

    app.input.onKeyDown.dispatch(Keyboard.F2);
    expect(debug.layers.boundingBoxes.visible).toBe(true);

    app.input.onKeyDown.dispatch(Keyboard.F2);
    expect(debug.layers.boundingBoxes.visible).toBe(false);

    debug.destroy();
  });

  test('F3 toggles hitTest layer', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.hitTest.visible).toBe(false);

    app.input.onKeyDown.dispatch(Keyboard.F3);
    expect(debug.layers.hitTest.visible).toBe(true);

    app.input.onKeyDown.dispatch(Keyboard.F3);
    expect(debug.layers.hitTest.visible).toBe(false);

    debug.destroy();
  });

  test('F4 toggles pointerStack layer', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.pointerStack.visible).toBe(false);

    app.input.onKeyDown.dispatch(Keyboard.F4);
    expect(debug.layers.pointerStack.visible).toBe(true);

    app.input.onKeyDown.dispatch(Keyboard.F4);
    expect(debug.layers.pointerStack.visible).toBe(false);

    debug.destroy();
  });

  test('F1 does not affect boundingBoxes/hitTest/pointerStack', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    app.input.onKeyDown.dispatch(Keyboard.F1);

    expect(debug.layers.boundingBoxes.visible).toBe(false);
    expect(debug.layers.hitTest.visible).toBe(false);
    expect(debug.layers.pointerStack.visible).toBe(false);

    debug.destroy();
  });
});

describe('DebugOverlay — master visible switch', () => {
  test('visible defaults to true', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.visible).toBe(true);

    debug.destroy();
  });

  test('visible=false suppresses rendering even when layers are visible', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    debug.visible = false;
    debug.layers.performance.visible = true;
    debug.layers.boundingBoxes.visible = true;

    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    app.onFrame.dispatch(fakeTime);

    // backend.setView should NOT have been called.
    expect(app.backend.setView).not.toHaveBeenCalled();

    debug.destroy();
  });

  test('visible=true (default) lets layers render', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    debug.visible = true;
    debug.layers.performance.visible = true;

    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    app.onFrame.dispatch(fakeTime);

    expect(app.backend.setView).toHaveBeenCalled();

    debug.destroy();
  });

  test('restoring visible=true after false resumes rendering', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    debug.layers.performance.visible = true;
    debug.visible = false;

    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    app.onFrame.dispatch(fakeTime);
    expect(app.backend.setView).not.toHaveBeenCalled();

    debug.visible = true;
    app.onFrame.dispatch(fakeTime);
    expect(app.backend.setView).toHaveBeenCalled();

    debug.destroy();
  });
});

describe('DebugOverlay — view-mode routing', () => {
  test('world-mode layers do NOT trigger setView (render in scene view)', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    // Enable only a world-mode layer (boundingBoxes).
    debug.layers.boundingBoxes.visible = true;

    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    app.onFrame.dispatch(fakeTime);

    // World-space layers render without setView; setView should NOT be called.
    expect(app.backend.setView).not.toHaveBeenCalled();

    debug.destroy();
  });

  test('screen-mode layers trigger setView twice (swap + restore)', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    // Enable only a screen-mode layer (performance).
    debug.layers.performance.visible = true;

    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    app.onFrame.dispatch(fakeTime);

    // Screen-space layers call setView twice: once to swap, once to restore.
    expect(app.backend.setView).toHaveBeenCalledTimes(2);

    debug.destroy();
  });

  test('world + screen layers: setView called for screen layer only', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    // Enable both a world-mode and a screen-mode layer.
    debug.layers.boundingBoxes.visible = true;
    debug.layers.performance.visible = true;

    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    app.onFrame.dispatch(fakeTime);

    // setView called twice (screen-mode swap + restore); NOT for world-mode.
    expect(app.backend.setView).toHaveBeenCalledTimes(2);

    debug.destroy();
  });
});

describe('DebugOverlay — new layer exports', () => {
  test('BoundingBoxesLayer IS exported from debug subpath', () => {

    expect(typeof (debugExports as Record<string, unknown>)['BoundingBoxesLayer']).toBe('function');
  });

  test('HitTestLayer IS exported from debug subpath', () => {

    expect(typeof (debugExports as Record<string, unknown>)['HitTestLayer']).toBe('function');
  });

  test('PointerStackLayer IS exported from debug subpath', () => {

    expect(typeof (debugExports as Record<string, unknown>)['PointerStackLayer']).toBe('function');
  });

  test('DebugLayerViewMode type guard: "world" and "screen" are valid values', () => {
    // Type-level check (values exist at runtime via the layer getters).
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.boundingBoxes.viewMode).toBe('world');
    expect(debug.layers.hitTest.viewMode).toBe('world');
    expect(debug.layers.performance.viewMode).toBe('screen');
    expect(debug.layers.pointerStack.viewMode).toBe('screen');

    debug.destroy();
  });
});
