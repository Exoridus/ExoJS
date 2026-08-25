/**
 * Canvas-native DebugOverlay tests (0.6.17+).
 *
 * Exercises tree-shake architecture (debug not in root), subscription
 * lifecycle, visibility toggling, the F-key bindings, and render path.
 */

import { Signal } from '#core/Signal';
import { Time } from '#core/units';
import { DebugOverlay } from '#debug/DebugOverlay';
import * as debugExports from '#debug/index';
import { RenderPassInspectorLayer } from '#debug/RenderPassInspectorLayer';
import * as rootExports from '#index';
import { InputManager } from '#input/InputManager';
import { Keyboard } from '#input/types';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';

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
// Minimal Application mock - enough for DebugOverlay constructor + usage.
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

const makeSceneDirector = () => ({
  scene: null as null | { root: object },
});

const makeOnFrame = () => new Signal<[import('#core/units').Seconds]>();
const makeOnResize = () => new Signal<[number, number, unknown]>();

/**
 * Stand-in for the binding side of `InputManager`. The overlay claims its
 * keys through `onStart` - registering a binding is what marks a key consumed
 * so its browser default is suppressed - so the mock records the callbacks
 * per channel and lets `pressKey` fire one.
 */
const makeInput = () => {
  const bound = new Map<number, (value: number) => void>();

  return {
    bound,
    onStart: (channel: number, callback: (value: number) => void) => {
      bound.set(channel, callback);

      return {
        unbind: (): void => {
          bound.delete(channel);
        },
      };
    },
  };
};

type MockInput = ReturnType<typeof makeInput>;

const mockInput = (app: import('#core/Application').Application): MockInput => app.input as unknown as MockInput;

/** Fire the overlay's binding for `channel`, if it claimed one. */
const pressKey = (app: import('#core/Application').Application, channel: number): void => {
  mockInput(app).bound.get(channel)?.(1);
};

const makeApp = () => {
  const onFrame = makeOnFrame();
  const onResize = makeOnResize();

  return {
    canvas: { width: 800, height: 600 },
    backend: makeBackend(),
    scenes: makeSceneDirector(),
    input: makeInput(),
    onFrame,
    onResize,
  } as unknown as import('#core/Application').Application;
};

/**
 * Same mock, but with a REAL {@link InputManager} on a real canvas - the only
 * way to observe what the overlay's keybindings do to the actual DOM event,
 * which is the whole point of claiming them through bindings.
 */
const makeAppWithRealInput = (): { app: import('#core/Application').Application; canvas: HTMLCanvasElement; input: InputManager } => {
  const canvas = document.createElement('canvas');

  canvas.width = 800;
  canvas.height = 600;

  const app = {
    canvas,
    platform: new BrowserPlatform(canvas),
    width: 800,
    height: 600,
    pixelRatio: 1,
    options: { input: { gamepadDefinitions: [], pointerDistanceThreshold: 10 } },
    _backingStoreToLogical: (x: number, y: number): { x: number; y: number } => ({ x, y }),
    backend: makeBackend(),
    scenes: makeSceneDirector(),
    onFrame: makeOnFrame(),
    onResize: makeOnResize(),
  } as unknown as import('#core/Application').Application;

  const input = new InputManager(app);

  (app as { input: InputManager }).input = input;

  return { app, canvas, input };
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

  test('constructor claims each shortcut through an input binding, not the onKeyDown signal', () => {
    const app = makeApp();

    expect(mockInput(app).bound.size).toBe(0);

    const debug = new DebugOverlay(app);

    // A binding is what marks a key consumed, so the browser's own F1 help
    // window / F3 find bar stay shut while the overlay owns those keys. A
    // plain `onKeyDown` subscription runs a frame late and prevents nothing.
    expect([...mockInput(app).bound.keys()].sort((a, b) => a - b)).toEqual([Keyboard.F1, Keyboard.F2, Keyboard.F3, Keyboard.F4, Keyboard.F6]);

    debug.destroy();
  });

  test('a real keydown on a shortcut key is consumed, toggles its layer, and is released on destroy', () => {
    const { app, canvas, input } = makeAppWithRealInput();
    const debug = new DebugOverlay(app);

    canvas.dispatchEvent(new FocusEvent('focus'));

    // F3 opens the browser's find bar by default - the overlay owns it now.
    const claimed = new KeyboardEvent('keydown', { code: 'F3', cancelable: true });

    window.dispatchEvent(claimed);
    expect(claimed.defaultPrevented).toBe(true);

    input.preUpdate(0 as never);
    expect(debug.layers.hitTest.visible).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'F3' }));
    input.preUpdate(0 as never);
    debug.destroy();

    const released = new KeyboardEvent('keydown', { code: 'F3', cancelable: true });

    window.dispatchEvent(released);
    expect(released.defaultPrevented).toBe(false);

    input.destroy();
  });

  test('a key the overlay does not claim keeps its browser default', () => {
    const { app, canvas, input } = makeAppWithRealInput();
    const debug = new DebugOverlay(app);

    canvas.dispatchEvent(new FocusEvent('focus'));

    // F5 is deliberately unbound, so the browser still reloads on it.
    const unclaimed = new KeyboardEvent('keydown', { code: 'F5', cancelable: true });

    window.dispatchEvent(unclaimed);

    expect(unclaimed.defaultPrevented).toBe(false);

    debug.destroy();
    input.destroy();
  });

  test('layers.performance.visible defaults to false', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.performance.visible).toBe(false);

    debug.destroy();
  });

  test('destroy() drops the frame subscription and releases every claimed key', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(app.onFrame.count).toBe(1);
    expect(mockInput(app).bound.size).toBe(5);

    debug.destroy();

    expect(app.onFrame.count).toBe(0);
    // Released, so the browser gets its own F1/F3 behavior back.
    expect(mockInput(app).bound.size).toBe(0);
  });
});

describe('DebugOverlay — render path', () => {
  test('with visible=false, dispatching onFrame does NOT call backend.setView', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    // visible defaults to false - dispatch a frame
    const fakeTime = Time.toSeconds(Time.milliseconds(16));

    app.onFrame.dispatch(fakeTime);

    expect(app.backend.setView).not.toHaveBeenCalled();

    debug.destroy();
  });

  test('with visible=true, dispatching onFrame calls backend.setView', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    debug.layers.performance.visible = true;

    const fakeTime = Time.toSeconds(Time.milliseconds(16));

    app.onFrame.dispatch(fakeTime);

    expect(app.backend.setView).toHaveBeenCalled();

    debug.destroy();
  });

  test('with visible=true, backend.setView is called twice (save + restore)', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    debug.layers.performance.visible = true;

    const fakeTime = Time.toSeconds(Time.milliseconds(16));

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

    pressKey(app, Keyboard.F1);

    expect(debug.layers.performance.visible).toBe(true);

    debug.destroy();
  });

  test('dispatching F1 twice toggles back to false', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    pressKey(app, Keyboard.F1);
    expect(debug.layers.performance.visible).toBe(true);

    pressKey(app, Keyboard.F1);
    expect(debug.layers.performance.visible).toBe(false);

    debug.destroy();
  });

  test('other keys do not affect performance.visible', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    pressKey(app, Keyboard.F2);
    pressKey(app, Keyboard.Space);
    pressKey(app, Keyboard.A);

    expect(debug.layers.performance.visible).toBe(false);

    debug.destroy();
  });
});

describe('DebugOverlay — F2/F3/F4 keybindings', () => {
  test('F2 toggles boundingBoxes layer', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.boundingBoxes.visible).toBe(false);

    pressKey(app, Keyboard.F2);
    expect(debug.layers.boundingBoxes.visible).toBe(true);

    pressKey(app, Keyboard.F2);
    expect(debug.layers.boundingBoxes.visible).toBe(false);

    debug.destroy();
  });

  test('F3 toggles hitTest layer', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.hitTest.visible).toBe(false);

    pressKey(app, Keyboard.F3);
    expect(debug.layers.hitTest.visible).toBe(true);

    pressKey(app, Keyboard.F3);
    expect(debug.layers.hitTest.visible).toBe(false);

    debug.destroy();
  });

  test('F4 toggles pointerStack layer', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.pointerStack.visible).toBe(false);

    pressKey(app, Keyboard.F4);
    expect(debug.layers.pointerStack.visible).toBe(true);

    pressKey(app, Keyboard.F4);
    expect(debug.layers.pointerStack.visible).toBe(false);

    debug.destroy();
  });

  test('F1 does not affect boundingBoxes/hitTest/pointerStack', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    pressKey(app, Keyboard.F1);

    expect(debug.layers.boundingBoxes.visible).toBe(false);
    expect(debug.layers.hitTest.visible).toBe(false);
    expect(debug.layers.pointerStack.visible).toBe(false);

    debug.destroy();
  });
});

describe('DebugOverlay — render-pass inspector layer', () => {
  test('layers.renderPassInspector is a managed RenderPassInspectorLayer', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(debug.layers.renderPassInspector).toBeInstanceOf(RenderPassInspectorLayer);
    expect(debug.layers.renderPassInspector.visible).toBe(false);
    expect(debug.layers.renderPassInspector.viewMode).toBe('screen');

    debug.destroy();
  });

  test('F6 toggles the renderPassInspector layer', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    pressKey(app, Keyboard.F6);
    expect(debug.layers.renderPassInspector.visible).toBe(true);

    pressKey(app, Keyboard.F6);
    expect(debug.layers.renderPassInspector.visible).toBe(false);

    debug.destroy();
  });

  test('F5 is deliberately unbound — it reloads the page in every browser', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    pressKey(app, Keyboard.F5);

    for (const layer of Object.values(debug.layers)) {
      expect(layer.visible).toBe(false);
    }

    debug.destroy();
  });

  test('the visible inspector renders through the screen-space view swap', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    debug.layers.renderPassInspector.visible = true;

    const fakeTime = Time.toSeconds(Time.milliseconds(16));

    app.onFrame.dispatch(fakeTime);

    expect(app.backend.setView).toHaveBeenCalledTimes(2);

    debug.destroy();
  });

  test('destroy() tears the inspector down along with the other layers', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);
    const spy = vi.spyOn(debug.layers.renderPassInspector, 'destroy');

    debug.destroy();

    expect(spy).toHaveBeenCalledTimes(1);
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

    const fakeTime = Time.toSeconds(Time.milliseconds(16));

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

    const fakeTime = Time.toSeconds(Time.milliseconds(16));

    app.onFrame.dispatch(fakeTime);

    expect(app.backend.setView).toHaveBeenCalled();

    debug.destroy();
  });

  test('restoring visible=true after false resumes rendering', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    debug.layers.performance.visible = true;
    debug.visible = false;

    const fakeTime = Time.toSeconds(Time.milliseconds(16));

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

    const fakeTime = Time.toSeconds(Time.milliseconds(16));

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

    const fakeTime = Time.toSeconds(Time.milliseconds(16));

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

    const fakeTime = Time.toSeconds(Time.milliseconds(16));

    app.onFrame.dispatch(fakeTime);

    // setView called twice (screen-mode swap + restore); NOT for world-mode.
    expect(app.backend.setView).toHaveBeenCalledTimes(2);

    debug.destroy();
  });
});

describe('DebugOverlay — resize handling', () => {
  test('dispatching app.onResize resizes and recenters the internal overlay view without throwing', () => {
    const app = makeApp();
    const debug = new DebugOverlay(app);

    expect(() => app.onResize.dispatch(1024, 768, app)).not.toThrow();

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
