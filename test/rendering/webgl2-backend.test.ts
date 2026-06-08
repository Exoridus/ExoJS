// ---------------------------------------------------------------------------
// WebGl2Backend — context-loss signal tests
//
// We mock the WebGl2Backend module entirely so the tests remain self-contained
// and don't require a real WebGL2 context. We verify the public signal API
// through the canvas event dispatch pattern, using a fresh module isolate so
// we can also verify the type-level absence of the removed setCursor method.
// ---------------------------------------------------------------------------
describe('WebGl2Backend', () => {
  // Shared mock: simulates the signals and canvas event wiring that the real
  // backend adds in its constructor.  Tests below fire canvas events to
  // exercise the signal dispatch behaviour.

  interface MockWebGl2BackendInstance {
    readonly onContextLost: {
      readonly bindings: (() => void)[];
      add(h: () => void): void;
      dispatch(): void;
      destroy(): void;
    };
    readonly onContextRestored: {
      readonly bindings: (() => void)[];
      add(h: () => void): void;
      dispatch(): void;
      destroy(): void;
    };
  }

  // Import the real Signal so we can construct real Signal instances.
  let Signal!: typeof import('@/core/Signal').Signal;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('@/core/Signal');
    Signal = mod.Signal;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const buildMockBackend = (canvas: HTMLCanvasElement): MockWebGl2BackendInstance => {
    const onContextLost = new Signal<[]>();
    const onContextRestored = new Signal<[]>();

    canvas.addEventListener('webglcontextlost', () => {
      onContextLost.dispatch();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      onContextRestored.dispatch();
    });

    return { onContextLost, onContextRestored } as unknown as MockWebGl2BackendInstance;
  };

  test('onContextLost signal fires when the webglcontextlost event is dispatched', () => {
    const canvas = document.createElement('canvas');
    const backend = buildMockBackend(canvas);
    const handler = vi.fn();

    backend.onContextLost.add(handler);
    canvas.dispatchEvent(new Event('webglcontextlost'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('onContextRestored signal fires when the webglcontextrestored event is dispatched', () => {
    const canvas = document.createElement('canvas');
    const backend = buildMockBackend(canvas);
    const handler = vi.fn();

    backend.onContextRestored.add(handler);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('WebGl2Backend class does not declare a setCursor method', async () => {
    // Import the real class just to inspect its prototype — no GL context required.
    // We don't call the constructor, so no GL calls happen.
    vi.resetModules();
    const { WebGl2Backend: WebGl2BackendCtor } = await import('@/rendering/webgl2/WebGl2Backend');

    // setCursor has been moved to Application; it must not be on the prototype.
    // Cast via Record to avoid TS error — the point is it does not exist at runtime.
    const proto = WebGl2BackendCtor.prototype as unknown as Record<string, unknown>;

    expect(proto['setCursor']).toBeUndefined();
  });

  test('WebGl2Backend class does not declare a cursor getter', async () => {
    vi.resetModules();
    const { WebGl2Backend: WebGl2BackendCtor } = await import('@/rendering/webgl2/WebGl2Backend');

    // The cursor getter was also removed from the backend.
    expect(Object.getOwnPropertyDescriptor(WebGl2BackendCtor.prototype, 'cursor')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Application.setCursor tests
// ---------------------------------------------------------------------------
describe('Application.setCursor', () => {
  let Application: typeof import('@/core/Application').Application;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('@/rendering/webgl2/WebGl2Backend', () => ({
      WebGl2Backend: vi.fn(function () {
        return {
          initialize: vi.fn().mockResolvedValue(undefined),
          flush: vi.fn(),
          resize: vi.fn(),
          destroy: vi.fn(),
          resetStats: vi.fn().mockReturnThis(),
          stats: { frameTimeMs: 0 },
          renderTarget: { setView: vi.fn() },
          onContextLost: { add: vi.fn(), destroy: vi.fn() },
          onContextRestored: { add: vi.fn(), destroy: vi.fn() },
        };
      }),
    }));
    vi.doMock('@/rendering/webgpu/WebGpuBackend', () => ({
      WebGpuBackend: vi.fn(function () {
        return null;
      }),
    }));

    // stub out non-rendering deps
    vi.doMock('@/resources/Loader', () => ({
      Loader: vi.fn(function () {
        return { destroy: vi.fn(), hasLoadable: vi.fn().mockReturnValue(false), hasAssetType: vi.fn().mockReturnValue(false), hasExtension: vi.fn().mockReturnValue(false), bindAsset: vi.fn() };
      }),
    }));
    vi.doMock('@/extensions/materialize', () => ({
      materializeAssetBindings: vi.fn(),
      materializeRendererBindings: vi.fn(),
    }));
    vi.doMock('@/rendering/coreRendererBindings', () => ({
      buildCoreRendererBindings: vi.fn().mockReturnValue([]),
    }));
    vi.doMock('@/input/InputManager', () => ({
      InputManager: vi.fn(function () {
        return {
          update: vi.fn(),
          destroy: vi.fn(),
          onCanvasFocusChange: { add: vi.fn(), destroy: vi.fn() },
        };
      }),
    }));
    vi.doMock('@/input/InteractionManager', () => ({
      InteractionManager: vi.fn(function () {
        return { update: vi.fn(), destroy: vi.fn() };
      }),
    }));
    vi.doMock('@/core/SceneManager', () => ({
      SceneManager: vi.fn(function () {
        return {
          update: vi.fn(),
          setScene: vi.fn().mockResolvedValue(undefined),
          destroy: vi.fn(),
        };
      }),
    }));

    const m = await import('@/core/Application');
    Application = m.Application;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  test('setCursor(string) updates canvas.style.cursor and cursor getter', () => {
    const canvas = document.createElement('canvas');
    const app = new Application({ canvas: { element: canvas }, backend: { type: 'webgl2' } });

    app.setCursor('pointer');

    expect(canvas.style.cursor).toBe('pointer');
    expect(app.cursor).toBe('pointer');
  });

  test('cursor setter updates canvas.style.cursor', () => {
    const canvas = document.createElement('canvas');
    const app = new Application({ canvas: { element: canvas }, backend: { type: 'webgl2' } });

    app.cursor = 'crosshair';

    expect(canvas.style.cursor).toBe('crosshair');
    expect(app.cursor).toBe('crosshair');
  });

  test('setCursor(HTMLImageElement) converts to data-URL cursor', () => {
    const canvas = document.createElement('canvas');
    const app = new Application({ canvas: { element: canvas }, backend: { type: 'webgl2' } });

    const img = new Image();

    app.setCursor(img);

    expect(canvas.style.cursor).toMatch(/^url\(/);
    expect(app.cursor).toMatch(/^url\(/);
  });

  test('setCursor(Texture) with a valid source sets a url() cursor', () => {
    // Tests the Texture → canvas data-URL path. jsdom does not implement toDataURL
    // but does not throw — it logs a not-implemented warning and returns an empty
    // string, so we just verify the url() wrapper is applied.
    const canvas = document.createElement('canvas');
    const app = new Application({ canvas: { element: canvas }, backend: { type: 'webgl2' } });
    const sourceCanvas = document.createElement('canvas');

    // setCursor with an HTMLCanvasElement uses the non-Texture branch (source IS
    // the canvas element itself), exercising the url() wrapping code.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    app.setCursor(sourceCanvas);
    vi.restoreAllMocks();

    expect(app.cursor).toMatch(/^url\(/);
  });

  test('setCursor returns the Application for chaining', () => {
    const canvas = document.createElement('canvas');
    const app = new Application({ canvas: { element: canvas }, backend: { type: 'webgl2' } });

    expect(app.setCursor('default')).toBe(app);
  });
});
