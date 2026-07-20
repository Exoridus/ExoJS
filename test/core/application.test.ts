const setNavigatorGpu = (gpu: unknown): (() => void) => {
  const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  const navigatorWithGpu = navigator as Navigator & Partial<Record<'gpu', unknown>>;

  Object.defineProperty(navigator, 'gpu', {
    configurable: true,
    value: gpu,
  });

  return (): void => {
    if (previousGpu) {
      Object.defineProperty(navigator, 'gpu', previousGpu);
    } else {
      Reflect.deleteProperty(navigatorWithGpu, 'gpu');
    }
  };
};

interface ApplicationTestHarness {
  readonly Application: typeof import('#core/Application').Application;
  readonly ApplicationStatus: typeof import('#core/Application').ApplicationStatus;
  readonly LoaderMock: MockInstance;
  readonly InputManagerMock: MockInstance;
  readonly webglManager: {
    initialize: MockInstance;
    flush: MockInstance;
    resize: MockInstance;
    destroy: MockInstance;
    resetStats: MockInstance;
    stats: { frameTimeMs: number };
    renderTarget: { setView: MockInstance };
  };
  readonly webgpuManager: {
    initialize: MockInstance;
    flush: MockInstance;
    resize: MockInstance;
    destroy: MockInstance;
    resetStats: MockInstance;
    stats: { frameTimeMs: number };
    renderTarget: { setView: MockInstance };
  };
  readonly BackendMock: MockInstance;
  readonly WebGpuBackendMock: MockInstance;
  readonly sceneDirector: {
    update: MockInstance;
    setScene: MockInstance;
    destroy: MockInstance;
  };
}

const loadApplicationHarness = async (
  options: {
    webgpuInitialize?: MockInstance;
    webglInitialize?: MockInstance;
  } = {},
): Promise<ApplicationTestHarness> => {
  const rendererRegistry = {
    bindRenderer: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    resolve: vi.fn(),
    renderers: vi.fn().mockReturnValue([]),
    registerRenderer: vi.fn(),
  };
  const webglManager = {
    initialize: options.webglInitialize ?? vi.fn().mockResolvedValue(undefined),
    flush: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    resetStats: vi.fn().mockReturnThis(),
    stats: { frameTimeMs: 0 },
    renderTarget: { setView: vi.fn() },
    onContextLost: { add: vi.fn(), destroy: vi.fn() },
    onContextRestored: { add: vi.fn(), destroy: vi.fn() },
    onRenderError: { add: vi.fn(), destroy: vi.fn() },
    rendererRegistry,
    backendType: 'webgl2',
  };
  const webgpuManager = {
    initialize: options.webgpuInitialize ?? vi.fn().mockResolvedValue(undefined),
    flush: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    resetStats: vi.fn().mockReturnThis(),
    stats: { frameTimeMs: 0 },
    renderTarget: { setView: vi.fn() },
    onDeviceLost: { add: vi.fn(), destroy: vi.fn() },
    onDeviceRestored: { add: vi.fn(), destroy: vi.fn() },
    onRenderError: { add: vi.fn(), destroy: vi.fn() },
    rendererRegistry,
    backendType: 'webgpu',
  };
  const sceneDirector = {
    update: vi.fn(),
    setScene: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  };
  const inputManager = {
    update: vi.fn(),
    destroy: vi.fn(),
    onCanvasFocusChange: { add: vi.fn(), remove: vi.fn(), dispatch: vi.fn(), destroy: vi.fn() },
  };
  const loader = {
    destroy: vi.fn(),
    hasLoadable: vi.fn().mockReturnValue(false),
    hasAssetType: vi.fn().mockReturnValue(false),
    hasExtension: vi.fn().mockReturnValue(false),
    bindAsset: vi.fn(),
  };
  const BackendMock = vi.fn(function () {
    return webglManager;
  });
  const WebGpuBackendMock = vi.fn(function () {
    return webgpuManager;
  });
  const LoaderMock = vi.fn(function () {
    return loader;
  });
  const InputManagerMock = vi.fn(function () {
    return inputManager;
  });

  vi.resetModules();
  vi.doMock('#rendering/webgl2/WebGl2Backend', () => ({
    WebGl2Backend: BackendMock,
  }));
  vi.doMock('#rendering/webgpu/WebGpuBackend', () => ({
    WebGpuBackend: WebGpuBackendMock,
  }));
  vi.doMock('#resources/Loader', () => ({
    Loader: LoaderMock,
  }));
  vi.doMock('#extensions/materialize', () => ({
    materializeAssetBindings: vi.fn(),
    materializeRendererBindings: vi.fn(),
    materializeSerializerBindings: vi.fn(),
  }));
  vi.doMock('#rendering/coreRendererBindings', () => ({
    buildCoreRendererBindings: vi.fn().mockReturnValue([]),
  }));
  vi.doMock('#input/InputManager', () => ({
    InputManager: InputManagerMock,
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
  vi.doMock('#core/SceneDirector', () => ({
    SceneDirector: vi.fn(function () {
      return sceneDirector;
    }),
  }));

  const { Application, ApplicationStatus } = await import('#core/Application');

  return {
    Application,
    ApplicationStatus,
    LoaderMock,
    InputManagerMock,
    webglManager,
    webgpuManager,
    BackendMock,
    WebGpuBackendMock,
    sceneDirector,
  };
};

describe('Application', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  test('update flushes renderer once per frame while running', async () => {
    const { Application, ApplicationStatus } = await loadApplicationHarness();
    const app = Object.create(Application.prototype) as import('#core/Application').Application;
    const rawApp = app as unknown as Record<string, unknown>;
    const systemsUpdate = vi.fn();
    const systems = {
      _beginFrame: vi.fn(),
      _endFrame: vi.fn(),
      _fixedUpdate: vi.fn(),
      _update: systemsUpdate,
      _draw: vi.fn(),
    };
    const sceneDirector = {
      _beginFrame: vi.fn(),
      _endFrame: vi.fn(),
      fixedUpdate: vi.fn(),
      update: vi.fn(),
      draw: vi.fn(),
      _drawTransition: vi.fn(),
    };
    const backend = {
      flush: vi.fn(),
      resetStats: vi.fn().mockReturnThis(),
      stats: { frameTimeMs: 0 },
    };
    const frameClock = {
      elapsedTime: { milliseconds: 16, seconds: 0.016 },
      restart: vi.fn(),
    };

    rawApp['_status'] = ApplicationStatus.Running;
    rawApp['pauseOnHidden'] = false;
    rawApp['_documentVisible'] = true;
    rawApp['systems'] = systems;
    rawApp['scenes'] = sceneDirector;
    rawApp['input'] = { _prepareFrame: vi.fn() };
    rawApp['interaction'] = { _prepareFrame: vi.fn() };
    rawApp['_audio'] = { _prepareFrame: vi.fn() };
    rawApp['tweens'] = { _prepareFrame: vi.fn() };
    rawApp['_rendering'] = { _prepareFrame: vi.fn() };
    rawApp['_backend'] = backend;
    rawApp['_frameClock'] = frameClock;
    rawApp['_fixed'] = { advance: () => 0, alpha: 0 };
    rawApp['_updateHandler'] = vi.fn();
    rawApp['_frameCount'] = 0;
    rawApp['onFrame'] = { dispatch: vi.fn() };
    rawApp['onFixedFrame'] = { dispatch: vi.fn() };

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    app.update();

    expect(systemsUpdate).toHaveBeenCalledTimes(1);
    expect(sceneDirector.update).toHaveBeenCalledTimes(1);
    expect(backend.resetStats).toHaveBeenCalledTimes(1);
    expect(backend.flush).toHaveBeenCalledTimes(1);
    expect(backend.stats.frameTimeMs).toBeGreaterThanOrEqual(0);
    expect(frameClock.restart).toHaveBeenCalledTimes(1);
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  test('defaults to WebGPU when available', async () => {
    const restoreGpu = setNavigatorGpu({});

    try {
      const { Application, BackendMock, WebGpuBackendMock } = await loadApplicationHarness();

      new Application({
        canvas: { element: document.createElement('canvas') },
      });

      expect(WebGpuBackendMock).toHaveBeenCalledTimes(1);
      expect(BackendMock).not.toHaveBeenCalled();
    } finally {
      restoreGpu();
    }
  });

  test('defaults to WebGL2 when WebGPU is unavailable', async () => {
    const restoreGpu = setNavigatorGpu(undefined);

    try {
      const { Application, BackendMock, WebGpuBackendMock } = await loadApplicationHarness();

      new Application({
        canvas: { element: document.createElement('canvas') },
      });

      expect(BackendMock).toHaveBeenCalledTimes(1);
      expect(WebGpuBackendMock).not.toHaveBeenCalled();
    } finally {
      restoreGpu();
    }
  });

  test('explicit webgl2 selection still bypasses WebGPU', async () => {
    const restoreGpu = setNavigatorGpu({});

    try {
      const { Application, BackendMock, WebGpuBackendMock } = await loadApplicationHarness();

      new Application({
        canvas: { element: document.createElement('canvas') },
        backend: { type: 'webgl2' },
      });

      expect(BackendMock).toHaveBeenCalledTimes(1);
      expect(WebGpuBackendMock).not.toHaveBeenCalled();
    } finally {
      restoreGpu();
    }
  });

  test('auto backend falls back to WebGL2 when WebGPU initialization fails', async () => {
    const restoreGpu = setNavigatorGpu({});
    const webgpuError = new Error('webgpu failed');
    const webgpuInitialize = vi.fn().mockRejectedValue(webgpuError);
    const webglInitialize = vi.fn().mockResolvedValue(undefined);
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    try {
      const { Application, webglManager, webgpuManager, BackendMock, WebGpuBackendMock, sceneDirector } = await loadApplicationHarness({
        webgpuInitialize,
        webglInitialize,
      });
      const app = new Application({
        canvas: { element: document.createElement('canvas') },
      });

      await app.start({} as import('#core/Scene').Scene);

      expect(WebGpuBackendMock).toHaveBeenCalledTimes(1);
      expect(webgpuManager.initialize).toHaveBeenCalledTimes(1);
      expect(webgpuManager.destroy).toHaveBeenCalledTimes(1);
      expect(BackendMock).toHaveBeenCalledTimes(1);
      expect(webglManager.initialize).toHaveBeenCalledTimes(1);
      expect(sceneDirector.setScene).toHaveBeenCalledTimes(1);
      expect(app.backend).toBe(webglManager);
    } finally {
      restoreGpu();
      rafSpy.mockRestore();
    }
  });

  test('explicit webgpu selection still fails instead of falling back', async () => {
    const restoreGpu = setNavigatorGpu({});
    const webgpuError = new Error('webgpu failed');
    const webgpuInitialize = vi.fn().mockRejectedValue(webgpuError);
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    try {
      const { Application, webgpuManager, BackendMock } = await loadApplicationHarness({ webgpuInitialize });
      const app = new Application({
        canvas: { element: document.createElement('canvas') },
        backend: { type: 'webgpu' },
      });

      await expect(app.start({} as import('#core/Scene').Scene)).rejects.toThrow(webgpuError);
      expect(webgpuManager.initialize).toHaveBeenCalledTimes(1);
      expect(webgpuManager.destroy).not.toHaveBeenCalled();
      expect(BackendMock).not.toHaveBeenCalled();
    } finally {
      restoreGpu();
      rafSpy.mockRestore();
    }
  });

  test('backend exposes a renderTarget on both backend paths', async () => {
    const restoreGpu = setNavigatorGpu({});

    try {
      const { Application } = await loadApplicationHarness();
      const webgpuApp = new Application({
        canvas: { element: document.createElement('canvas') },
        backend: { type: 'webgpu' },
      });
      const webglApp = new Application({
        canvas: { element: document.createElement('canvas') },
        backend: { type: 'webgl2' },
      });

      expect(webgpuApp.backend.renderTarget).toBeDefined();
      expect(typeof webgpuApp.backend.renderTarget.setView).toBe('function');
      expect(webglApp.backend.renderTarget).toBeDefined();
      expect(typeof webglApp.backend.renderTarget.setView).toBe('function');
    } finally {
      restoreGpu();
    }
  });

  test('constructs canvas from grouped canvas options (width/height + element)', async () => {
    const { Application } = await loadApplicationHarness();
    const canvas = document.createElement('canvas');
    const app = new Application({
      canvas: {
        element: canvas,
        width: 320,
        height: 180,
      },
    });

    expect(app.canvas).toBe(canvas);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(180);
    expect(canvas.style.width).toBe('320px');
    expect(canvas.style.height).toBe('180px');
    expect(canvas.tabIndex).toBe(-1);
  });

  test('passes grouped loader options through to Loader constructor', async () => {
    const { Application, LoaderMock } = await loadApplicationHarness();
    const fetchOptions: RequestInit = { credentials: 'include' };
    const cache = {} as import('#resources/CacheStore').CacheStore;
    const cacheStrategy = { resolve: vi.fn() } as unknown as import('#resources/CacheStrategy').CacheStrategy;

    new Application({
      loader: {
        basePath: '/assets/',
        fetchOptions,
        cache,
        cacheStrategy,
        concurrency: 3,
      },
    });

    expect(LoaderMock).toHaveBeenCalledWith({
      basePath: '/assets/',
      fetchOptions,
      cache,
      cacheStrategy,
      concurrency: 3,
    });
  });

  test('passes grouped input options to InputManager', async () => {
    const { Application, InputManagerMock } = await loadApplicationHarness();

    new Application({
      input: {
        gamepadDefinitions: [],
        gamepadSlotStrategy: 'compact',
        pointerDistanceThreshold: 24,
      },
    });

    const appArg = InputManagerMock.mock.calls[0][0] as import('#core/Application').Application;

    expect(appArg.options.input?.gamepadSlotStrategy).toBe('compact');
    expect(appArg.options.input?.pointerDistanceThreshold).toBe(24);
    expect(appArg.options.input?.gamepadDefinitions).toEqual([]);
  });

  test('passes grouped rendering options to WebGl2Backend path', async () => {
    const { Application, BackendMock } = await loadApplicationHarness();

    new Application({
      backend: { type: 'webgl2' },
      rendering: {
        debug: true,
        webglAttributes: { antialias: true },
        spriteRendererBatchSize: 128,
      },
    });

    const appArg = BackendMock.mock.calls[0][0] as import('#core/Application').Application;

    expect(appArg.options.rendering?.debug).toBe(true);
    expect(appArg.options.rendering?.webglAttributes).toEqual({ antialias: true });
    expect(appArg.options.rendering?.spriteRendererBatchSize).toBe(128);
  });

  test('applies canvas pixelRatio to backing size and keeps resize logical', async () => {
    const { Application, webglManager } = await loadApplicationHarness();
    const app = new Application({
      backend: { type: 'webgl2' },
      canvas: {
        width: 200,
        height: 100,
        pixelRatio: 2,
      },
    });

    expect(app.canvas.width).toBe(400);
    expect(app.canvas.height).toBe(200);
    expect(app.canvas.style.width).toBe('200px');
    expect(app.canvas.style.height).toBe('100px');

    app.resize(300, 150);

    expect(app.canvas.width).toBe(600);
    expect(app.canvas.height).toBe(300);
    expect(app.canvas.style.width).toBe('300px');
    expect(app.canvas.style.height).toBe('150px');
    expect(webglManager.resize).toHaveBeenCalledWith(300, 150);
  });

  test('applies tabIndex/imageRendering from canvas options', async () => {
    const { Application } = await loadApplicationHarness();
    const canvas = document.createElement('canvas');
    const app = new Application({
      canvas: {
        element: canvas,
        tabIndex: 0,
        imageRendering: 'pixelated',
      },
    });

    expect(app.canvas.tabIndex).toBe(0);
    expect(app.canvas.style.imageRendering).toBe('pixelated');
  });

  test('ignores removed flat options at runtime (no compatibility shim)', async () => {
    const { Application } = await loadApplicationHarness();
    const app = new Application({ width: 123, height: 45 } as unknown as import('#core/Application').ApplicationOptions);

    expect(app.canvas.width).toBe(800);
    expect(app.canvas.height).toBe(600);
  });

  test('stop() catches async scene teardown failures instead of leaking rejections', async () => {
    const { Application, ApplicationStatus } = await loadApplicationHarness();
    const app = Object.create(Application.prototype) as import('#core/Application').Application;
    const rawApp = app as unknown as Record<string, unknown>;
    const sceneTeardownError = new Error('scene teardown failed');
    const sceneDirector = {
      setScene: vi.fn().mockRejectedValue(sceneTeardownError),
    };
    const activeClock = { stop: vi.fn() };
    const frameClock = { stop: vi.fn() };
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    rawApp['_status'] = ApplicationStatus.Running;
    rawApp['_frameRequest'] = 99;
    rawApp['scenes'] = sceneDirector;
    rawApp['_activeClock'] = activeClock;
    rawApp['_frameClock'] = frameClock;
    rawApp['_fixed'] = { advance: () => 0, alpha: 0 };

    app.stop();
    await Promise.resolve();

    expect(sceneDirector.setScene).toHaveBeenCalledWith(null);
    expect(cancelSpy).toHaveBeenCalledWith(99);
    expect(activeClock.stop).toHaveBeenCalledTimes(1);
    expect(frameClock.stop).toHaveBeenCalledTimes(1);
    expect(app.status).toBe(ApplicationStatus.Stopped);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '%c[ExoJS][Application]',
      expect.stringContaining('color'),
      'Application.stop() failed to unload the active scene.',
      sceneTeardownError,
    );

    cancelSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
