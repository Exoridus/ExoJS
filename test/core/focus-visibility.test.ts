import { Signal } from '@/core/Signal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FocusVisibilityHarness {
  readonly Application: typeof import('@/core/Application').Application;
  readonly ApplicationStatus: typeof import('@/core/Application').ApplicationStatus;
  readonly inputManagerMock: {
    update: jest.Mock;
    destroy: jest.Mock;
    canvasFocused: boolean;
    onCanvasFocusChange: Signal<[focused: boolean]>;
  };
  readonly sceneManagerMock: {
    update: jest.Mock;
    setScene: jest.Mock;
    destroy: jest.Mock;
  };
  readonly interactionMock: {
    update: jest.Mock;
    destroy: jest.Mock;
  };
}

const loadHarness = (): FocusVisibilityHarness => {
  const onCanvasFocusChange = new Signal<[focused: boolean]>();

  const inputManagerMock = {
    update: jest.fn(),
    destroy: jest.fn(),
    canvasFocused: false,
    onCanvasFocusChange,
  };

  const sceneManagerMock = {
    update: jest.fn(),
    setScene: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn(),
  };

  const interactionMock = {
    update: jest.fn(),
    destroy: jest.fn(),
  };

  const backendMock = {
    initialize: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn(),
    resize: jest.fn(),
    destroy: jest.fn(),
    resetStats: jest.fn().mockReturnThis(),
    stats: { frameTimeMs: 0 },
    onContextLost: { add: jest.fn(), destroy: jest.fn() },
    onContextRestored: { add: jest.fn(), destroy: jest.fn() },
    onDeviceLost: { add: jest.fn(), destroy: jest.fn() },
    onDeviceRestored: { add: jest.fn(), destroy: jest.fn() },
  };

  let Application!: typeof import('@/core/Application').Application;
  let ApplicationStatus!: typeof import('@/core/Application').ApplicationStatus;

  jest.resetModules();
  jest.doMock('@/rendering/webgl2/WebGl2Backend', () => ({
    WebGl2Backend: jest.fn(() => backendMock),
  }));
  jest.doMock('@/rendering/webgpu/WebGpuBackend', () => ({
    WebGpuBackend: jest.fn(() => backendMock),
  }));
  jest.doMock('@/resources/Loader', () => ({
    Loader: jest.fn(() => ({ destroy: jest.fn() })),
  }));
  jest.doMock('@/input/InputManager', () => ({
    InputManager: jest.fn(() => inputManagerMock),
  }));
  jest.doMock('@/input/InteractionManager', () => ({
    InteractionManager: jest.fn(() => interactionMock),
  }));
  jest.doMock('@/core/SceneManager', () => ({
    SceneManager: jest.fn(() => sceneManagerMock),
  }));

  jest.isolateModules(() => {
    const mod = require('@/core/Application') as typeof import('@/core/Application');
    Application = mod.Application;
    ApplicationStatus = mod.ApplicationStatus;
  });

  return { Application, ApplicationStatus, inputManagerMock, sceneManagerMock, interactionMock };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Application focus / visibility', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('canvasFocused reflects input.canvasFocused', () => {
    const { Application, inputManagerMock } = loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    expect(app.canvasFocused).toBe(false);

    inputManagerMock.canvasFocused = true;
    expect(app.canvasFocused).toBe(true);

    app.destroy();
  });

  test('focusing the canvas dispatches onCanvasFocusChange(true)', () => {
    const { Application, inputManagerMock } = loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    const handler = jest.fn();
    app.onCanvasFocusChange.add(handler);

    inputManagerMock.onCanvasFocusChange.dispatch(true);
    expect(handler).toHaveBeenCalledWith(true);

    app.destroy();
  });

  test('blurring the canvas dispatches onCanvasFocusChange(false)', () => {
    const { Application, inputManagerMock } = loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    const handler = jest.fn();
    app.onCanvasFocusChange.add(handler);

    inputManagerMock.onCanvasFocusChange.dispatch(false);
    expect(handler).toHaveBeenCalledWith(false);

    app.destroy();
  });

  test('documentVisible is true initially', () => {
    const { Application } = loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    // jsdom visibilityState defaults to 'visible'
    expect(app.documentVisible).toBe(true);

    app.destroy();
  });

  test('visibilitychange event flips documentVisible and dispatches signal', () => {
    const { Application } = loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    const handler = jest.fn();
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

    app.destroy();
  });

  test('pauseOnHidden=true skips frame body but keeps rAF scheduled when hidden', () => {
    const { Application, ApplicationStatus, sceneManagerMock, interactionMock, inputManagerMock } = loadHarness();
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
    rawApp['_status'] = ApplicationStatus.Running;
    rawApp['_updateHandler'] = jest.fn();
    rawApp['_frameClock'] = {
      elapsedTime: { milliseconds: 16, seconds: 0.016 },
      restart: jest.fn(),
      stop: jest.fn(),
      destroy: jest.fn(),
    };
    rawApp['_activeClock'] = { stop: jest.fn(), start: jest.fn(), destroy: jest.fn() };
    rawApp['_startupClock'] = { start: jest.fn(), destroy: jest.fn() };
    rawApp['onFrame'] = { dispatch: jest.fn(), destroy: jest.fn() };
    rawApp['onResize'] = { dispatch: jest.fn(), destroy: jest.fn() };

    app.pauseOnHidden = true;

    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 42);

    app.update();

    // rAF still scheduled
    expect(rafSpy).toHaveBeenCalledTimes(1);
    // But game-state subsystems NOT called
    expect(inputManagerMock.update).not.toHaveBeenCalled();
    expect(sceneManagerMock.update).not.toHaveBeenCalled();
    expect(interactionMock.update).not.toHaveBeenCalled();

    // Restore
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });

    // Set status to Stopped so destroy() doesn't try to stop real clocks
    rawApp['_status'] = ApplicationStatus.Stopped;
    app.destroy();
  });

  test('pauseOnHidden=false (default) updates normally even when hidden', () => {
    const { Application, ApplicationStatus, sceneManagerMock, inputManagerMock } = loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });
    const rawApp = app as unknown as Record<string, unknown>;

    // Simulate hidden document
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    rawApp['_status'] = ApplicationStatus.Running;
    rawApp['_updateHandler'] = jest.fn();
    rawApp['_frameClock'] = {
      elapsedTime: { milliseconds: 16, seconds: 0.016 },
      restart: jest.fn(),
      stop: jest.fn(),
      destroy: jest.fn(),
    };
    rawApp['_activeClock'] = { stop: jest.fn(), start: jest.fn(), destroy: jest.fn() };
    rawApp['_startupClock'] = { start: jest.fn(), destroy: jest.fn() };
    rawApp['onFrame'] = { dispatch: jest.fn(), destroy: jest.fn() };
    rawApp['onResize'] = { dispatch: jest.fn(), destroy: jest.fn() };
    rawApp['_backend'] = {
      flush: jest.fn(),
      resetStats: jest.fn().mockReturnThis(),
      stats: { frameTimeMs: 0 },
      destroy: jest.fn(),
    };
    rawApp['interaction'] = { update: jest.fn(), destroy: jest.fn() };
    rawApp['tweens'] = { update: jest.fn(), destroy: jest.fn() };
    rawApp['_frameCount'] = 0;

    // pauseOnHidden defaults to false
    expect(app.pauseOnHidden).toBe(false);

    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    app.update();

    expect(inputManagerMock.update).toHaveBeenCalledTimes(1);
    expect(sceneManagerMock.update).toHaveBeenCalledTimes(1);

    // Restore
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });

    // Set status to Stopped so destroy() doesn't try to stop real clocks
    rawApp['_status'] = ApplicationStatus.Stopped;
    app.destroy();
  });

  test('destroy() unsubscribes visibilitychange listener', () => {
    const { Application } = loadHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    const handler = jest.fn();
    app.onVisibilityChange.add(handler);

    app.destroy();

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
