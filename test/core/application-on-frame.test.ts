/**
 * Tests for Application.onFrame signal (added in 0.6.17).
 */

// ---------------------------------------------------------------------------
// Minimal harness
// ---------------------------------------------------------------------------

interface OnFrameTestHarness {
  readonly Application: typeof import('#core/Application').Application;
  readonly ApplicationStatus: typeof import('#core/Application').ApplicationStatus;
  readonly sceneManager: { update: MockInstance; setScene: MockInstance; destroy: MockInstance };
  readonly backend: {
    flush: MockInstance;
    resetStats: MockInstance;
    stats: { frameTimeMs: number };
    view: object;
    setView: MockInstance;
  };
}

const loadOnFrameHarness = async (): Promise<OnFrameTestHarness> => {
  const backend = {
    initialize: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    resetStats: vi.fn().mockReturnThis(),
    stats: { frameTimeMs: 0 },
    renderTarget: { setView: vi.fn() },
    view: {},
    setView: vi.fn().mockReturnThis(),
    onContextLost: { add: vi.fn(), destroy: vi.fn() },
    onContextRestored: { add: vi.fn(), destroy: vi.fn() },
    onRenderError: { add: vi.fn(), destroy: vi.fn() },
    onDeviceLost: { add: vi.fn(), destroy: vi.fn() },
    onDeviceRestored: { add: vi.fn(), destroy: vi.fn() },
    onRenderError: { add: vi.fn(), destroy: vi.fn() },
  };
  const sceneManager = {
    update: vi.fn(),
    setScene: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  };
  // Plain object that satisfies the onKeyDown Signal shape needed by DebugOverlay
  // (Application itself doesn't use onKeyDown in its constructor, so a minimal stub suffices).
  const onKeyDown = { add: vi.fn(), remove: vi.fn(), dispatch: vi.fn(), destroy: vi.fn(), bindings: [] };

  vi.resetModules();

  vi.doMock('#rendering/webgl2/WebGl2Backend', () => ({
    WebGl2Backend: vi.fn(function () {
      return backend;
    }),
  }));
  vi.doMock('#rendering/webgpu/WebGpuBackend', () => ({
    WebGpuBackend: vi.fn(function () {
      return backend;
    }),
  }));
  vi.doMock('#resources/Loader', () => ({
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
    materializeAssetBindings: vi.fn(),
    materializeRendererBindings: vi.fn(),
    materializeSerializerBindings: vi.fn(),
  }));
  vi.doMock('#rendering/coreRendererBindings', () => ({
    buildCoreRendererBindings: vi.fn().mockReturnValue([]),
  }));
  const onCanvasFocusChange = { add: vi.fn(), remove: vi.fn(), dispatch: vi.fn(), destroy: vi.fn() };
  vi.doMock('#input/InputManager', () => ({
    InputManager: vi.fn(function () {
      return { update: vi.fn(), destroy: vi.fn(), onKeyDown, onCanvasFocusChange };
    }),
  }));
  vi.doMock('#input/FocusManager', () => ({
    FocusManager: vi.fn(function () {
      return {
        focused: null,
        focus: vi.fn(),
        blur: vi.fn(),
        pushScope: vi.fn(),
        popScope: vi.fn(),
        focusNext: vi.fn(),
        focusPrevious: vi.fn(),
        _notifyNodeRemoved: vi.fn(),
        destroy: vi.fn(),
      };
    }),
  }));
  vi.doMock('#input/InteractionManager', () => ({
    InteractionManager: vi.fn(function () {
      return {
        update: vi.fn(),
        destroy: vi.fn(),
        getHoveredNode: vi.fn().mockReturnValue(null),
      };
    }),
  }));
  vi.doMock('#core/SceneManager', () => ({
    SceneManager: vi.fn(function () {
      return sceneManager;
    }),
  }));

  const { Application, ApplicationStatus } = await import('#core/Application');

  return { Application, ApplicationStatus, sceneManager, backend };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Application.onFrame', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  test('app.onFrame exists and has Signal-shaped API (add / remove / dispatch / count)', async () => {
    const { Application } = await loadOnFrameHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    expect(app.onFrame).toBeDefined();
    expect(typeof app.onFrame.add).toBe('function');
    expect(typeof app.onFrame.remove).toBe('function');
    expect(typeof app.onFrame.dispatch).toBe('function');
    expect(typeof app.onFrame.count).toBe('number');

    app.destroy();
  });

  test('app.update() dispatches onFrame after sceneManager.update and before backend.flush', async () => {
    const { Application, ApplicationStatus } = await loadOnFrameHarness();
    const app = Object.create(Application.prototype) as import('#core/Application').Application;
    const rawApp = app as unknown as Record<string, unknown>;

    const callOrder: string[] = [];
    const sceneManager = {
      _beginFrame: vi.fn(),
      _endFrame: vi.fn(),
      fixedUpdate: vi.fn(),
      update: vi.fn(() => {
        callOrder.push('sceneManager.update');
      }),
      draw: vi.fn(),
      _drawTransition: vi.fn(),
    };

    // Get the Signal class from the same module registry that Application uses.
    const { Signal } = await import('#core/Signal');

    const onFrame = new Signal<[import('#core/Time').Time]>();

    onFrame.add(() => {
      callOrder.push('onFrame.dispatch');
    });

    const backend = {
      flush: vi.fn(() => {
        callOrder.push('backend.flush');
      }),
      resetStats: vi.fn().mockReturnThis(),
      stats: { frameTimeMs: 0 },
      view: { update: vi.fn() },
    };

    rawApp['_status'] = ApplicationStatus.Running;
    rawApp['pauseOnHidden'] = false;
    rawApp['_documentVisible'] = true;
    rawApp['systems'] = { _beginFrame: vi.fn(), _endFrame: vi.fn(), _fixedUpdate: vi.fn(), _update: vi.fn(), _draw: vi.fn() };
    rawApp['scene'] = sceneManager;
    rawApp['input'] = { _prepareFrame: vi.fn() };
    rawApp['interaction'] = { _prepareFrame: vi.fn() };
    rawApp['_audio'] = { _prepareFrame: vi.fn() };
    rawApp['tweens'] = { _prepareFrame: vi.fn() };
    rawApp['_rendering'] = { _prepareFrame: vi.fn() };
    rawApp['_backend'] = backend;
    rawApp['_frameClock'] = { elapsedTime: { milliseconds: 16, seconds: 0.016 }, restart: vi.fn() };
    rawApp['_fixed'] = { advance: () => 0, alpha: 0 };
    rawApp['_updateHandler'] = vi.fn();
    rawApp['_frameCount'] = 0;
    rawApp['onFrame'] = onFrame;
    rawApp['onFixedFrame'] = { dispatch: vi.fn() };

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    app.update();

    expect(callOrder).toEqual(['sceneManager.update', 'onFrame.dispatch', 'backend.flush']);
  });

  test('app.destroy() destroys the onFrame signal (bindings cleared)', async () => {
    const { Application } = await loadOnFrameHarness();
    const app = new Application({ canvas: { element: document.createElement('canvas') } });

    const handler = vi.fn();

    app.onFrame.add(handler);
    expect(app.onFrame.count).toBeGreaterThan(0);

    app.destroy();

    expect(app.onFrame.count).toBe(0);
  });
});
