import type { MockInstance } from 'vitest';

import { Signal } from '#core/Signal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FocusVisibilityHarness {
  readonly Application: typeof import('#core/Application').Application;
  readonly ApplicationState: typeof import('#core/Application').ApplicationState;
  readonly inputSystemMock: {
    update: MockInstance;
    preUpdate: MockInstance;
    _finishInteractionFrame: MockInstance;
    destroy: MockInstance;
    canvasFocused: boolean;
    onCanvasFocusChange: Signal<[focused: boolean]>;
  };
  readonly sceneDirectorMock: {
    _beginFrame: MockInstance;
    _endFrame: MockInstance;
    fixedUpdate: MockInstance;
    update: MockInstance;
    draw: MockInstance;
    _updateTransition: MockInstance;
    _transitionPlacement: MockInstance;
    _renderTransition: MockInstance;
    setScene: MockInstance;
    destroy: MockInstance;
  };
  readonly interactionMock: {
    update: MockInstance;
    preUpdate: MockInstance;
    destroy: MockInstance;
  };
}

const loadHarness = async (): Promise<FocusVisibilityHarness> => {
  const onCanvasFocusChange = new Signal<[focused: boolean]>();

  const inputSystemMock = {
    update: vi.fn(),
    preUpdate: vi.fn(),
    _finishInteractionFrame: vi.fn(),
    destroy: vi.fn(),
    canvasFocused: false,
    onCanvasFocusChange,
  };

  const sceneDirectorMock = {
    _beginFrame: vi.fn(),
    _endFrame: vi.fn(),
    preUpdate: vi.fn(),
    fixedUpdate: vi.fn(),
    update: vi.fn(),
    draw: vi.fn(),
    _updateTransition: vi.fn(),
    _transitionPlacement: vi.fn(() => null),
    _renderTransition: vi.fn(),
    setScene: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  };

  const interactionMock = {
    update: vi.fn(),
    preUpdate: vi.fn(),
    destroy: vi.fn(),
  };

  const backendMock = {
    initialize: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    resetStats: vi.fn().mockReturnThis(),
    stats: { frameTimeMs: 0 },
    onContextLost: { add: vi.fn(), destroy: vi.fn() },
    onContextRestored: { add: vi.fn(), destroy: vi.fn() },
    onRenderError: { add: vi.fn(), destroy: vi.fn() },
    onDeviceLost: { add: vi.fn(), destroy: vi.fn() },
    onDeviceRestored: { add: vi.fn(), destroy: vi.fn() },
  };

  vi.resetModules();
  vi.doMock('#rendering/webgl2/WebGl2Backend', () => ({
    WebGl2Backend: vi.fn(function () {
      return backendMock;
    }),
  }));
  vi.doMock('#rendering/webgpu/WebGpuBackend', () => ({
    WebGpuBackend: vi.fn(function () {
      return backendMock;
    }),
  }));
  vi.doMock('#assets/Loader', () => ({
    Loader: vi.fn(function () {
      return {
        destroy: vi.fn(),
        hasLoadable: vi.fn().mockReturnValue(false),
        hasAssetType: vi.fn().mockReturnValue(false),
        hasExtension: vi.fn().mockReturnValue(false),
        bindAsset: vi.fn(),
      };
    }),
  }));
  vi.doMock('#extensions/materialize', () => ({
    materializeAssetTypes: vi.fn(),
    materializeRendererBindings: vi.fn(),
    materializeSerializerBindings: vi.fn(),
  }));
  vi.doMock('#rendering/coreRendererBindings', () => ({
    buildCoreRendererBindings: vi.fn().mockReturnValue([]),
  }));
  vi.doMock('#input/InputSystem', () => ({
    InputSystem: vi.fn(function () {
      return inputSystemMock;
    }),
  }));
  vi.doMock('#input/FocusController', () => ({
    FocusController: vi.fn(function () {
      return {
        focused: null,
        focus: vi.fn(),
        blur: vi.fn(),
        pushScope: vi.fn(),
        popScope: vi.fn(),
        clearScopes: vi.fn(),
        focusNext: vi.fn(),
        focusPrevious: vi.fn(),
        _notifyNodeRemoved: vi.fn(),
        destroy: vi.fn(),
      };
    }),
  }));
  vi.doMock('#input/InteractionSystem', () => ({
    InteractionSystem: vi.fn(function () {
      return interactionMock;
    }),
  }));
  vi.doMock('#core/scene/SceneDirector', () => ({
    SceneDirector: vi.fn(function () {
      return sceneDirectorMock;
    }),
  }));

  const mod = await import('#core/Application');

  return {
    Application: mod.Application,
    ApplicationState: mod.ApplicationState,
    inputSystemMock,
    sceneDirectorMock,
    interactionMock,
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Application focus / visibility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  test('canvasFocused reflects input.canvasFocused', async () => {
    const { Application, inputSystemMock } = await loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    expect(app.canvasFocused).toBe(false);

    inputSystemMock.canvasFocused = true;
    expect(app.canvasFocused).toBe(true);

    void app.destroy();
  });

  test('focusing the canvas dispatches onCanvasFocusChange(true)', async () => {
    const { Application, inputSystemMock } = await loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    const handler = vi.fn();
    app.onCanvasFocusChange.add(handler);

    inputSystemMock.onCanvasFocusChange.dispatch(true);
    expect(handler).toHaveBeenCalledWith(true);

    void app.destroy();
  });

  test('blurring the canvas dispatches onCanvasFocusChange(false)', async () => {
    const { Application, inputSystemMock } = await loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    const handler = vi.fn();
    app.onCanvasFocusChange.add(handler);

    inputSystemMock.onCanvasFocusChange.dispatch(false);
    expect(handler).toHaveBeenCalledWith(false);

    void app.destroy();
  });

  test('documentVisible is true initially', async () => {
    const { Application } = await loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    // jsdom visibilityState defaults to 'visible'
    expect(app.documentVisible).toBe(true);

    void app.destroy();
  });

  test('visibilitychange event flips documentVisible and dispatches signal', async () => {
    const { Application } = await loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    const handler = vi.fn();
    app.onVisibilityChange.add(handler);

    // Simulate hidden
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(app.documentVisible).toBe(false);
    expect(handler).toHaveBeenCalledWith(false);

    // Restore visible
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(app.documentVisible).toBe(true);
    expect(handler).toHaveBeenCalledWith(true);
    expect(handler).toHaveBeenCalledTimes(2);

    void app.destroy();
  });

  test('pauseOnHidden=true skips frame body but keeps rAF scheduled when hidden', async () => {
    const { Application, ApplicationState, sceneDirectorMock, interactionMock, inputSystemMock } = await loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });
    const rawApp = app as unknown as Record<string, unknown>;

    // Simulate hidden document
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(app.documentVisible).toBe(false);

    // Set up raw state for update()
    rawApp['_state'] = ApplicationState.Running;
    rawApp['_frameLoopActive'] = true;
    rawApp['_updateHandler'] = vi.fn();
    rawApp['_frameClock'] = {
      elapsedTime: { milliseconds: 16, seconds: 0.016 },
      restart: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    };
    rawApp['_activeClock'] = { stop: vi.fn(), start: vi.fn(), destroy: vi.fn() };
    rawApp['_startupClock'] = { start: vi.fn(), destroy: vi.fn() };
    rawApp['onFrame'] = { dispatch: vi.fn(), destroy: vi.fn() };
    rawApp['onResize'] = { dispatch: vi.fn(), destroy: vi.fn() };

    app.pauseOnHidden = true;

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 42);

    app.update();

    // rAF still scheduled
    expect(rafSpy).toHaveBeenCalledTimes(1);
    // But game-state subsystems NOT called
    expect(inputSystemMock.update).not.toHaveBeenCalled();
    expect(sceneDirectorMock.update).not.toHaveBeenCalled();
    expect(interactionMock.update).not.toHaveBeenCalled();

    // Restore
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });

    // Set status/loop-flag to Stopped/false so destroy() doesn't try to stop real clocks
    rawApp['_state'] = ApplicationState.Stopped;
    rawApp['_frameLoopActive'] = false;
    void app.destroy();
  });

  test('pauseOnHidden=false (default) updates normally even when hidden', async () => {
    const { Application, ApplicationState, sceneDirectorMock, inputSystemMock } = await loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });
    const rawApp = app as unknown as Record<string, unknown>;

    // Simulate hidden document
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    rawApp['_state'] = ApplicationState.Running;
    rawApp['_frameLoopActive'] = true;
    rawApp['_updateHandler'] = vi.fn();
    rawApp['_frameClock'] = {
      elapsedTime: { milliseconds: 16, seconds: 0.016 },
      restart: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    };
    rawApp['_activeClock'] = { stop: vi.fn(), start: vi.fn(), destroy: vi.fn() };
    rawApp['_startupClock'] = { start: vi.fn(), destroy: vi.fn() };
    rawApp['onFrame'] = { dispatch: vi.fn(), destroy: vi.fn() };
    rawApp['onResize'] = { dispatch: vi.fn(), destroy: vi.fn() };
    rawApp['_backend'] = {
      flush: vi.fn(),
      resetStats: vi.fn().mockReturnThis(),
      stats: { frameTimeMs: 0 },
      destroy: vi.fn(),
    };
    rawApp['interaction'] = { update: vi.fn(), preUpdate: vi.fn(), destroy: vi.fn() };
    rawApp['tweens'] = { update: vi.fn(), preUpdate: vi.fn(), destroy: vi.fn() };
    rawApp['_frameCount'] = 0;

    // pauseOnHidden defaults to false
    expect(app.pauseOnHidden).toBe(false);

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    app.update();

    expect(inputSystemMock.preUpdate).toHaveBeenCalledTimes(1);
    expect(sceneDirectorMock.update).toHaveBeenCalledTimes(1);

    // Restore
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });

    // Set status/loop-flag to Stopped/false so destroy() doesn't try to stop real clocks
    rawApp['_state'] = ApplicationState.Stopped;
    rawApp['_frameLoopActive'] = false;
    void app.destroy();
  });

  test('destroy() unsubscribes visibilitychange listener', async () => {
    const { Application } = await loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    const handler = vi.fn();
    app.onVisibilityChange.add(handler);

    void app.destroy();

    // After destroy, dispatching visibilitychange should not call our handler
    // (because the signal is destroyed and the listener is removed from document)
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    // The document listener was removed, so _documentVisible won't update and signal won't fire
    expect(handler).not.toHaveBeenCalled();

    // Restore
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });
});
