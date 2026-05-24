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
  readonly Application: typeof import('@/core/Application').Application;
  readonly ApplicationStatus: typeof import('@/core/Application').ApplicationStatus;
  readonly LoaderMock: jest.Mock;
  readonly InputManagerMock: jest.Mock;
  readonly webglManager: {
    initialize: jest.Mock;
    flush: jest.Mock;
    resize: jest.Mock;
    destroy: jest.Mock;
    resetStats: jest.Mock;
    stats: { frameTimeMs: number };
    renderTarget: { setView: jest.Mock };
  };
  readonly webgpuManager: {
    initialize: jest.Mock;
    flush: jest.Mock;
    resize: jest.Mock;
    destroy: jest.Mock;
    resetStats: jest.Mock;
    stats: { frameTimeMs: number };
    renderTarget: { setView: jest.Mock };
  };
  readonly BackendMock: jest.Mock;
  readonly WebGpuBackendMock: jest.Mock;
  readonly sceneManager: {
    update: jest.Mock;
    setScene: jest.Mock;
    destroy: jest.Mock;
  };
}

const loadApplicationHarness = (
  options: {
    webgpuInitialize?: jest.Mock;
    webglInitialize?: jest.Mock;
  } = {},
): ApplicationTestHarness => {
  const webglManager = {
    initialize: options.webglInitialize ?? jest.fn().mockResolvedValue(undefined),
    flush: jest.fn(),
    resize: jest.fn(),
    destroy: jest.fn(),
    resetStats: jest.fn().mockReturnThis(),
    stats: { frameTimeMs: 0 },
    renderTarget: { setView: jest.fn() },
    onContextLost: { add: jest.fn(), destroy: jest.fn() },
    onContextRestored: { add: jest.fn(), destroy: jest.fn() },
  };
  const webgpuManager = {
    initialize: options.webgpuInitialize ?? jest.fn().mockResolvedValue(undefined),
    flush: jest.fn(),
    resize: jest.fn(),
    destroy: jest.fn(),
    resetStats: jest.fn().mockReturnThis(),
    stats: { frameTimeMs: 0 },
    renderTarget: { setView: jest.fn() },
    onDeviceLost: { add: jest.fn(), destroy: jest.fn() },
    onDeviceRestored: { add: jest.fn(), destroy: jest.fn() },
  };
  const sceneManager = {
    update: jest.fn(),
    setScene: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn(),
  };
  const inputManager = {
    update: jest.fn(),
    destroy: jest.fn(),
    onCanvasFocusChange: { add: jest.fn(), remove: jest.fn(), dispatch: jest.fn(), destroy: jest.fn() },
  };
  const loader = {
    destroy: jest.fn(),
  };
  const BackendMock = jest.fn(() => webglManager);
  const WebGpuBackendMock = jest.fn(() => webgpuManager);
  const LoaderMock = jest.fn(() => loader);
  const InputManagerMock = jest.fn(() => inputManager);
  let Application!: typeof import('@/core/Application').Application;
  let ApplicationStatus!: typeof import('@/core/Application').ApplicationStatus;

  jest.resetModules();
  jest.doMock('@/rendering/webgl2/WebGl2Backend', () => ({
    WebGl2Backend: BackendMock,
  }));
  jest.doMock('@/rendering/webgpu/WebGpuBackend', () => ({
    WebGpuBackend: WebGpuBackendMock,
  }));
  jest.doMock('@/resources/Loader', () => ({
    Loader: LoaderMock,
  }));
  jest.doMock('@/input/InputManager', () => ({
    InputManager: InputManagerMock,
  }));
  jest.doMock('@/input/InteractionManager', () => ({
    InteractionManager: jest.fn(() => ({
      update: jest.fn(),
      destroy: jest.fn(),
      getHoveredNode: jest.fn().mockReturnValue(null),
    })),
  }));
  jest.doMock('@/core/SceneManager', () => ({
    SceneManager: jest.fn(() => sceneManager),
  }));

  jest.isolateModules(() => {
    const module = require('@/core/Application') as typeof import('@/core/Application');
    Application = module.Application;
    ApplicationStatus = module.ApplicationStatus;
  });

  return {
    Application,
    ApplicationStatus,
    LoaderMock,
    InputManagerMock,
    webglManager,
    webgpuManager,
    BackendMock,
    WebGpuBackendMock,
    sceneManager,
  };
};

describe('Application', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('update flushes renderer once per frame while running', () => {
    const { Application, ApplicationStatus } = loadApplicationHarness();
    const app = Object.create(Application.prototype) as import('@/core/Application').Application;
    const rawApp = app as unknown as Record<string, unknown>;
    const inputManager = { update: jest.fn() };
    const tweens = { update: jest.fn() };
    const sceneManager = { update: jest.fn() };
    const viewUpdate = jest.fn();
    const backend = {
      flush: jest.fn(),
      resetStats: jest.fn().mockReturnThis(),
      stats: { frameTimeMs: 0 },
      view: { update: viewUpdate },
    };
    const frameClock = {
      elapsedTime: { milliseconds: 16, seconds: 0.016 },
      restart: jest.fn(),
    };

    const interaction = { update: jest.fn() };

    rawApp['_status'] = ApplicationStatus.Running;
    rawApp['input'] = inputManager;
    rawApp['interaction'] = interaction;
    rawApp['tweens'] = tweens;
    rawApp['scene'] = sceneManager;
    rawApp['_backend'] = backend;
    rawApp['_frameClock'] = frameClock;
    rawApp['_updateHandler'] = jest.fn();
    rawApp['_frameCount'] = 0;
    rawApp['onFrame'] = { dispatch: jest.fn() };

    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    app.update();

    expect(inputManager.update).toHaveBeenCalledTimes(1);
    expect(sceneManager.update).toHaveBeenCalledTimes(1);
    expect(viewUpdate).toHaveBeenCalledWith(16);
    expect(backend.resetStats).toHaveBeenCalledTimes(1);
    expect(backend.flush).toHaveBeenCalledTimes(1);
    expect(backend.stats.frameTimeMs).toBeGreaterThanOrEqual(0);
    expect(frameClock.restart).toHaveBeenCalledTimes(1);
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  test('defaults to WebGPU when available', () => {
    const restoreGpu = setNavigatorGpu({});

    try {
      const { Application, BackendMock, WebGpuBackendMock } = loadApplicationHarness();

      new Application({
        canvas: { element: document.createElement('canvas') },
      });

      expect(WebGpuBackendMock).toHaveBeenCalledTimes(1);
      expect(BackendMock).not.toHaveBeenCalled();
    } finally {
      restoreGpu();
    }
  });

  test('defaults to WebGL2 when WebGPU is unavailable', () => {
    const restoreGpu = setNavigatorGpu(undefined);

    try {
      const { Application, BackendMock, WebGpuBackendMock } = loadApplicationHarness();

      new Application({
        canvas: { element: document.createElement('canvas') },
      });

      expect(BackendMock).toHaveBeenCalledTimes(1);
      expect(WebGpuBackendMock).not.toHaveBeenCalled();
    } finally {
      restoreGpu();
    }
  });

  test('explicit webgl2 selection still bypasses WebGPU', () => {
    const restoreGpu = setNavigatorGpu({});

    try {
      const { Application, BackendMock, WebGpuBackendMock } = loadApplicationHarness();

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
    const webgpuInitialize = jest.fn().mockRejectedValue(webgpuError);
    const webglInitialize = jest.fn().mockResolvedValue(undefined);
    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    try {
      const { Application, webglManager, webgpuManager, BackendMock, WebGpuBackendMock, sceneManager } = loadApplicationHarness({
        webgpuInitialize,
        webglInitialize,
      });
      const app = new Application({
        canvas: { element: document.createElement('canvas') },
      });

      await app.start({} as import('@/core/Scene').Scene);

      expect(WebGpuBackendMock).toHaveBeenCalledTimes(1);
      expect(webgpuManager.initialize).toHaveBeenCalledTimes(1);
      expect(webgpuManager.destroy).toHaveBeenCalledTimes(1);
      expect(BackendMock).toHaveBeenCalledTimes(1);
      expect(webglManager.initialize).toHaveBeenCalledTimes(1);
      expect(sceneManager.setScene).toHaveBeenCalledTimes(1);
      expect(app.backend).toBe(webglManager);
    } finally {
      restoreGpu();
      rafSpy.mockRestore();
    }
  });

  test('explicit webgpu selection still fails instead of falling back', async () => {
    const restoreGpu = setNavigatorGpu({});
    const webgpuError = new Error('webgpu failed');
    const webgpuInitialize = jest.fn().mockRejectedValue(webgpuError);
    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    try {
      const { Application, webgpuManager, BackendMock } = loadApplicationHarness({ webgpuInitialize });
      const app = new Application({
        canvas: { element: document.createElement('canvas') },
        backend: { type: 'webgpu' },
      });

      await expect(app.start({} as import('@/core/Scene').Scene)).rejects.toThrow(webgpuError);
      expect(webgpuManager.initialize).toHaveBeenCalledTimes(1);
      expect(webgpuManager.destroy).not.toHaveBeenCalled();
      expect(BackendMock).not.toHaveBeenCalled();
    } finally {
      restoreGpu();
      rafSpy.mockRestore();
    }
  });

  test('backend exposes a renderTarget on both backend paths', () => {
    const restoreGpu = setNavigatorGpu({});

    try {
      const { Application } = loadApplicationHarness();
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

  test('constructs canvas from grouped canvas options (width/height + element)', () => {
    const { Application } = loadApplicationHarness();
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

  test('passes grouped loader options through to Loader constructor', () => {
    const { Application, LoaderMock } = loadApplicationHarness();
    const fetchOptions: RequestInit = { credentials: 'include' };
    const cache = {} as import('@/resources/CacheStore').CacheStore;
    const cacheStrategy = { resolve: jest.fn() } as unknown as import('@/resources/CacheStrategy').CacheStrategy;

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

  test('passes grouped input options to InputManager', () => {
    const { Application, InputManagerMock } = loadApplicationHarness();

    new Application({
      input: {
        gamepadDefinitions: [],
        gamepadSlotStrategy: 'compact',
        pointerDistanceThreshold: 24,
      },
    });

    const appArg = InputManagerMock.mock.calls[0][0] as import('@/core/Application').Application;

    expect(appArg.options.input?.gamepadSlotStrategy).toBe('compact');
    expect(appArg.options.input?.pointerDistanceThreshold).toBe(24);
    expect(appArg.options.input?.gamepadDefinitions).toEqual([]);
  });

  test('passes grouped rendering options to WebGl2Backend path', () => {
    const { Application, BackendMock } = loadApplicationHarness();

    new Application({
      backend: { type: 'webgl2' },
      rendering: {
        debug: true,
        webglAttributes: { antialias: true },
        spriteRendererBatchSize: 128,
        particleRendererBatchSize: 256,
      },
    });

    const appArg = BackendMock.mock.calls[0][0] as import('@/core/Application').Application;

    expect(appArg.options.rendering?.debug).toBe(true);
    expect(appArg.options.rendering?.webglAttributes).toEqual({ antialias: true });
    expect(appArg.options.rendering?.spriteRendererBatchSize).toBe(128);
    expect(appArg.options.rendering?.particleRendererBatchSize).toBe(256);
  });

  test('applies canvas pixelRatio to backing size and keeps resize logical', () => {
    const { Application, webglManager } = loadApplicationHarness();
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

  test('applies tabIndex/imageRendering from canvas options', () => {
    const { Application } = loadApplicationHarness();
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

  test('ignores removed flat options at runtime (no compatibility shim)', () => {
    const { Application } = loadApplicationHarness();
    const app = new Application({ width: 123, height: 45 } as unknown as import('@/core/Application').ApplicationOptions);

    expect(app.canvas.width).toBe(800);
    expect(app.canvas.height).toBe(600);
  });

  test('stop() catches async scene teardown failures instead of leaking rejections', async () => {
    const { Application, ApplicationStatus } = loadApplicationHarness();
    const app = Object.create(Application.prototype) as import('@/core/Application').Application;
    const rawApp = app as unknown as Record<string, unknown>;
    const sceneTeardownError = new Error('scene teardown failed');
    const sceneManager = {
      setScene: jest.fn().mockRejectedValue(sceneTeardownError),
    };
    const activeClock = { stop: jest.fn() };
    const frameClock = { stop: jest.fn() };
    const cancelSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    rawApp['_status'] = ApplicationStatus.Running;
    rawApp['_frameRequest'] = 99;
    rawApp['scene'] = sceneManager;
    rawApp['_activeClock'] = activeClock;
    rawApp['_frameClock'] = frameClock;

    app.stop();
    await Promise.resolve();

    expect(sceneManager.setScene).toHaveBeenCalledWith(null);
    expect(cancelSpy).toHaveBeenCalledWith(99);
    expect(activeClock.stop).toHaveBeenCalledTimes(1);
    expect(frameClock.stop).toHaveBeenCalledTimes(1);
    expect(app.status).toBe(ApplicationStatus.Stopped);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Application.stop() failed to unload the active scene.', sceneTeardownError);

    cancelSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
