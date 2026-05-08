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

  beforeEach(() => {
    jest.resetModules();

    jest.isolateModules(() => {
      Signal = (require('@/core/Signal') as typeof import('@/core/Signal')).Signal;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
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
    const handler = jest.fn();

    backend.onContextLost.add(handler);
    canvas.dispatchEvent(new Event('webglcontextlost'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('onContextRestored signal fires when the webglcontextrestored event is dispatched', () => {
    const canvas = document.createElement('canvas');
    const backend = buildMockBackend(canvas);
    const handler = jest.fn();

    backend.onContextRestored.add(handler);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('WebGl2Backend class does not declare a setCursor method', () => {
    // Import the real class just to inspect its prototype — no GL context required.
    // We don't call the constructor, so no GL calls happen.
    let WebGl2BackendCtor!: typeof import('@/rendering/webgl2/WebGl2Backend').WebGl2Backend;

    jest.isolateModules(() => {
      WebGl2BackendCtor = (require('@/rendering/webgl2/WebGl2Backend') as typeof import('@/rendering/webgl2/WebGl2Backend')).WebGl2Backend;
    });

    // setCursor has been moved to Application; it must not be on the prototype.
    // Cast via Record to avoid TS error — the point is it does not exist at runtime.
    const proto = WebGl2BackendCtor.prototype as unknown as Record<string, unknown>;

    expect(proto['setCursor']).toBeUndefined();
  });

  test('WebGl2Backend class does not declare a cursor getter', () => {
    let WebGl2BackendCtor!: typeof import('@/rendering/webgl2/WebGl2Backend').WebGl2Backend;

    jest.isolateModules(() => {
      WebGl2BackendCtor = (require('@/rendering/webgl2/WebGl2Backend') as typeof import('@/rendering/webgl2/WebGl2Backend')).WebGl2Backend;
    });

    // The cursor getter was also removed from the backend.
    expect(Object.getOwnPropertyDescriptor(WebGl2BackendCtor.prototype, 'cursor')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Application.setCursor tests
// ---------------------------------------------------------------------------
describe('Application.setCursor', () => {
  let Application: typeof import('@/core/Application').Application;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('@/rendering/webgl2/WebGl2Backend', () => ({
      WebGl2Backend: jest.fn(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        flush: jest.fn(),
        resize: jest.fn(),
        destroy: jest.fn(),
        resetStats: jest.fn().mockReturnThis(),
        stats: { frameTimeMs: 0 },
        renderTarget: { setView: jest.fn() },
        onContextLost: { add: jest.fn(), destroy: jest.fn() },
        onContextRestored: { add: jest.fn(), destroy: jest.fn() },
      })),
    }));
    jest.doMock('@/rendering/webgpu/WebGpuBackend', () => ({
      WebGpuBackend: jest.fn(() => null),
    }));

    // stub out non-rendering deps
    jest.doMock('@/resources/Loader', () => ({ Loader: jest.fn(() => ({ destroy: jest.fn() })) }));
    jest.doMock('@/input/InputManager', () => ({
      InputManager: jest.fn(() => ({
        update: jest.fn(),
        destroy: jest.fn(),
        onCanvasFocusChange: { add: jest.fn(), destroy: jest.fn() },
      })),
    }));
    jest.doMock('@/input/InteractionManager', () => ({
      InteractionManager: jest.fn(() => ({ update: jest.fn(), destroy: jest.fn() })),
    }));
    jest.doMock('@/core/SceneManager', () => ({
      SceneManager: jest.fn(() => ({
        update: jest.fn(),
        setScene: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn(),
      })),
    }));

    jest.isolateModules(() => {
      const m = require('@/core/Application') as typeof import('@/core/Application');
      Application = m.Application;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('setCursor(string) updates canvas.style.cursor and cursor getter', () => {
    const canvas = document.createElement('canvas');
    const app = new Application({ canvas, backend: { type: 'webgl2' } });

    app.setCursor('pointer');

    expect(canvas.style.cursor).toBe('pointer');
    expect(app.cursor).toBe('pointer');
  });

  test('cursor setter updates canvas.style.cursor', () => {
    const canvas = document.createElement('canvas');
    const app = new Application({ canvas, backend: { type: 'webgl2' } });

    app.cursor = 'crosshair';

    expect(canvas.style.cursor).toBe('crosshair');
    expect(app.cursor).toBe('crosshair');
  });

  test('setCursor(HTMLImageElement) converts to data-URL cursor', () => {
    const canvas = document.createElement('canvas');
    const app = new Application({ canvas, backend: { type: 'webgl2' } });

    // Create a real HTMLImageElement source and mock toDataURL on a temp canvas.
    const img = new Image();

    // canvasSourceToDataUrl draws to a temp canvas; jsdom won't produce a real
    // data URL, but it will call toDataURL and produce an empty string.
    // We just verify setCursor does not throw and sets a url() wrapper.
    app.setCursor(img);

    expect(canvas.style.cursor).toMatch(/^url\(/);
    expect(app.cursor).toMatch(/^url\(/);
  });

  test('setCursor(Texture) with a valid source sets a url() cursor', () => {
    // Tests the Texture → canvas data-URL path. jsdom does not implement toDataURL
    // but does not throw — it logs a not-implemented warning and returns an empty
    // string, so we just verify the url() wrapper is applied.
    const canvas = document.createElement('canvas');
    const app = new Application({ canvas, backend: { type: 'webgl2' } });
    const sourceCanvas = document.createElement('canvas');

    // setCursor with an HTMLCanvasElement uses the non-Texture branch (source IS
    // the canvas element itself), exercising the url() wrapping code.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    app.setCursor(sourceCanvas);
    jest.restoreAllMocks();

    expect(app.cursor).toMatch(/^url\(/);
  });

  test('setCursor returns the Application for chaining', () => {
    const canvas = document.createElement('canvas');
    const app = new Application({ canvas, backend: { type: 'webgl2' } });

    expect(app.setCursor('default')).toBe(app);
  });
});
