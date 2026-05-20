/**
 * Canvas-native DebugOverlay tests (0.6.17+).
 *
 * Exercises tree-shake architecture (debug not in root), subscription
 * lifecycle, visibility toggling, F1 keybinding, and render path.
 */

import { Signal } from '@/core/Signal';
import { Keyboard } from '@/input/types';

// Stub out the glyph atlas singleton so Text construction never touches a
// real 2D canvas context (jsdom's canvas does not implement measureText).
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
    setView: jest.fn().mockReturnThis(),
    draw: jest.fn().mockReturnThis(),
    flush: jest.fn().mockReturnThis(),
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
    sceneManager: makeSceneManager(),
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
    const rootExports = require('../../src/index') as Record<string, unknown>;

    expect(rootExports['DebugOverlay']).toBeUndefined();
  });

  test('DebugOverlay IS exported from the debug subpath', () => {
    const debugExports = require('../../src/debug/index') as Record<string, unknown>;

    expect(typeof debugExports['DebugOverlay']).toBe('function');
  });

  test('DebugLayer IS exported from the debug subpath', () => {
    const debugExports = require('../../src/debug/index') as Record<string, unknown>;

    expect(typeof debugExports['DebugLayer']).toBe('function');
  });

  test('PerformanceLayer IS exported from the debug subpath', () => {
    const debugExports = require('../../src/debug/index') as Record<string, unknown>;

    expect(typeof debugExports['PerformanceLayer']).toBe('function');
  });
});

describe('DebugOverlay — lifecycle', () => {
  test('new DebugOverlay(app) does not throw', () => {
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
    const app = makeApp();

    expect(() => new DebugOverlay(app)).not.toThrow();
  });

  test('constructor subscribes to app.onFrame', () => {
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
    const app = makeApp();

    expect(app.onFrame.count).toBe(0);

    const debug = new DebugOverlay(app);

    expect(app.onFrame.count).toBe(1);

    debug.destroy();
  });

  test('constructor subscribes to input.onKeyDown', () => {
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
    const app = makeApp();

    expect(app.input.onKeyDown.count).toBe(0);

    const debug = new DebugOverlay(app);

    expect(app.input.onKeyDown.count).toBe(1);

    debug.destroy();
  });

  test('layers.performance.visible defaults to false', () => {
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.performance.visible).toBe(false);

    debug.destroy();
  });

  test('destroy() removes onFrame and onKeyDown subscriptions', () => {
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
    const app = makeApp();
    const debug = new DebugOverlay(app);

    // visible defaults to false — dispatch a frame
    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    app.onFrame.dispatch(fakeTime);

    expect(app.backend.setView).not.toHaveBeenCalled();

    debug.destroy();
  });

  test('with visible=true, dispatching onFrame calls backend.setView', () => {
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
    const app = makeApp();
    const debug = new DebugOverlay(app);

    debug.layers.performance.visible = true;

    const fakeTime = { milliseconds: 16, seconds: 0.016 } as import('@/core/Time').Time;

    app.onFrame.dispatch(fakeTime);

    expect(app.backend.setView).toHaveBeenCalled();

    debug.destroy();
  });

  test('with visible=true, backend.setView is called twice (save + restore)', () => {
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.performance.visible).toBe(false);

    app.input.onKeyDown.dispatch(Keyboard.F1);

    expect(debug.layers.performance.visible).toBe(true);

    debug.destroy();
  });

  test('dispatching F1 twice toggles back to false', () => {
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
    const app = makeApp();
    const debug = new DebugOverlay(app);

    app.input.onKeyDown.dispatch(Keyboard.F1);
    expect(debug.layers.performance.visible).toBe(true);

    app.input.onKeyDown.dispatch(Keyboard.F1);
    expect(debug.layers.performance.visible).toBe(false);

    debug.destroy();
  });

  test('other keys do not affect performance.visible', () => {
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.visible).toBe(true);

    debug.destroy();
  });

  test('visible=false suppresses rendering even when layers are visible', () => {
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
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
    const debugExports = require('../../src/debug/index') as Record<string, unknown>;

    expect(typeof debugExports['BoundingBoxesLayer']).toBe('function');
  });

  test('HitTestLayer IS exported from debug subpath', () => {
    const debugExports = require('../../src/debug/index') as Record<string, unknown>;

    expect(typeof debugExports['HitTestLayer']).toBe('function');
  });

  test('PointerStackLayer IS exported from debug subpath', () => {
    const debugExports = require('../../src/debug/index') as Record<string, unknown>;

    expect(typeof debugExports['PointerStackLayer']).toBe('function');
  });

  test('DebugLayerViewMode type guard: "world" and "screen" are valid values', () => {
    // Type-level check (values exist at runtime via the layer getters).
    const { BoundingBoxesLayer } = require('../../src/debug/BoundingBoxesLayer') as typeof import('../../src/debug/BoundingBoxesLayer');
    const { PerformanceLayer } = require('../../src/debug/PerformanceLayer') as typeof import('../../src/debug/PerformanceLayer');
    const { DebugOverlay } = require('../../src/debug/DebugOverlay') as typeof import('../../src/debug/DebugOverlay');
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.boundingBoxes.viewMode).toBe('world');
    expect(debug.layers.hitTest.viewMode).toBe('world');
    expect(debug.layers.performance.viewMode).toBe('screen');
    expect(debug.layers.pointerStack.viewMode).toBe('screen');

    debug.destroy();
  });
});
