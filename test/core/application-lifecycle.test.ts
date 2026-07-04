/**
 * Coverage-focused tests for the parts of Application.ts not exercised by the
 * other test/core/application*.test.ts files: the simple getter cluster,
 * capabilities gating, setCursor()/cursor, sizingMode (get/set + the
 * per-mode `_applySizingMode` CSS/ResizeObserver wiring), resize(),
 * `_mountCanvas`, `_backingStoreToDesign`, the constructor's
 * materialize-bindings failure paths, createBackend()'s
 * materializeRendererBindings failure paths, the onContextLost/Restored and
 * onDeviceLost/Restored → onBackendLost/onBackendRestored relay, and
 * capture() delegation.
 */

import { Color } from '#core/Color';

// ---------------------------------------------------------------------------
// ResizeObserver mock — jsdom does not implement it. Exposed as a class so
// individual tests can inspect `.instances` and manually fire `.trigger()`
// instead of relying on a real layout engine.
// ---------------------------------------------------------------------------

class MockResizeObserver implements ResizeObserver {
  public static instances: MockResizeObserver[] = [];

  private readonly _callback: ResizeObserverCallback;
  public readonly observe: MockInstance = vi.fn();
  public readonly unobserve: MockInstance = vi.fn();
  public readonly disconnect: MockInstance = vi.fn();

  public constructor(callback: ResizeObserverCallback) {
    this._callback = callback;
    MockResizeObserver.instances.push(this);
  }

  /** Manually invoke the observer callback (entries/observer args are unused by Application). */
  public trigger(): void {
    this._callback([], this);
  }
}

// ---------------------------------------------------------------------------
// Harness — mirrors application.test.ts's loadApplicationHarness, extended
// with override hooks for the failure-path and destroy-spy tests below.
// ---------------------------------------------------------------------------

interface LifecycleHarnessOptions {
  materializeAssetBindings?: MockInstance;
  materializeRendererBindings?: MockInstance;
  materializeSerializerBindings?: MockInstance;
  loaderDestroy?: MockInstance;
  webglDestroy?: MockInstance;
  webgpuDestroy?: MockInstance;
  webglInitialize?: MockInstance;
  webgpuInitialize?: MockInstance;
}

/** Temporarily override `navigator.gpu`; returns a restore function. */
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

interface LifecycleHarness {
  readonly Application: typeof import('#core/Application').Application;
  readonly ApplicationStatus: typeof import('#core/Application').ApplicationStatus;
  readonly Texture: typeof import('#rendering/texture/Texture').Texture;
  readonly loader: { destroy: MockInstance };
  readonly webglManager: {
    initialize: MockInstance;
    flush: MockInstance;
    resize: MockInstance;
    destroy: MockInstance;
    resetStats: MockInstance;
    stats: { frameTimeMs: number };
    renderTarget: { setView: MockInstance };
    clearColor: Color;
    onContextLost: { add: MockInstance };
    onContextRestored: { add: MockInstance };
  };
  readonly webgpuManager: {
    initialize: MockInstance;
    flush: MockInstance;
    resize: MockInstance;
    destroy: MockInstance;
    resetStats: MockInstance;
    stats: { frameTimeMs: number };
    renderTarget: { setView: MockInstance };
    clearColor: Color;
    onDeviceLost: { add: MockInstance };
    onDeviceRestored: { add: MockInstance };
  };
  readonly sceneManager: { update: MockInstance; setScene: MockInstance; destroy: MockInstance };
}

const loadHarness = async (options: LifecycleHarnessOptions = {}): Promise<LifecycleHarness> => {
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
    destroy: options.webglDestroy ?? vi.fn(),
    resetStats: vi.fn().mockReturnThis(),
    stats: { frameTimeMs: 0 },
    renderTarget: { setView: vi.fn() },
    clearColor: new Color(100, 149, 237, 1),
    onContextLost: { add: vi.fn(), destroy: vi.fn() },
    onContextRestored: { add: vi.fn(), destroy: vi.fn() },
    rendererRegistry,
    backendType: 'webgl2',
  };
  const webgpuManager = {
    initialize: options.webgpuInitialize ?? vi.fn().mockResolvedValue(undefined),
    flush: vi.fn(),
    resize: vi.fn(),
    destroy: options.webgpuDestroy ?? vi.fn(),
    resetStats: vi.fn().mockReturnThis(),
    stats: { frameTimeMs: 0 },
    renderTarget: { setView: vi.fn() },
    clearColor: new Color(10, 20, 30, 1),
    onDeviceLost: { add: vi.fn(), destroy: vi.fn() },
    onDeviceRestored: { add: vi.fn(), destroy: vi.fn() },
    rendererRegistry,
    backendType: 'webgpu',
  };
  const sceneManager = {
    update: vi.fn(),
    setScene: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  };
  const inputManager = {
    update: vi.fn(),
    destroy: vi.fn(),
    canvasFocused: false,
    onCanvasFocusChange: { add: vi.fn(), remove: vi.fn(), dispatch: vi.fn(), destroy: vi.fn() },
  };
  const loader = {
    destroy: options.loaderDestroy ?? vi.fn(),
    hasLoadable: vi.fn().mockReturnValue(false),
    hasAssetType: vi.fn().mockReturnValue(false),
    hasExtension: vi.fn().mockReturnValue(false),
    bindAsset: vi.fn(),
  };

  vi.resetModules();
  vi.doMock('#rendering/webgl2/WebGl2Backend', () => ({
    WebGl2Backend: vi.fn(function () {
      return webglManager;
    }),
  }));
  vi.doMock('#rendering/webgpu/WebGpuBackend', () => ({
    WebGpuBackend: vi.fn(function () {
      return webgpuManager;
    }),
  }));
  vi.doMock('#resources/Loader', () => ({
    Loader: vi.fn(function () {
      return loader;
    }),
  }));
  vi.doMock('#extensions/materialize', () => ({
    materializeAssetBindings: options.materializeAssetBindings ?? vi.fn(),
    materializeRendererBindings: options.materializeRendererBindings ?? vi.fn(),
    materializeSerializerBindings: options.materializeSerializerBindings ?? vi.fn(),
  }));
  vi.doMock('#rendering/coreRendererBindings', () => ({
    buildCoreRendererBindings: vi.fn().mockReturnValue([]),
  }));
  vi.doMock('#input/InputManager', () => ({
    InputManager: vi.fn(function () {
      return inputManager;
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
  const { Texture } = await import('#rendering/texture/Texture');

  return {
    Application,
    ApplicationStatus,
    Texture,
    loader,
    webglManager,
    webgpuManager,
    sceneManager,
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Application lifecycle / getters / sizing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    MockResizeObserver.instances = [];
  });

  // -------------------------------------------------------------------------
  // Simple getters
  // -------------------------------------------------------------------------

  describe('simple getters', () => {
    test('exposes sane values for every read-only stat/config getter before start()', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });

      expect(app.startupTime.seconds).toBeGreaterThanOrEqual(0);
      expect(app.activeTime.seconds).toBe(0);
      expect(app.frameTime.seconds).toBe(0);
      expect(app.frameCount).toBe(0);
      expect(app.frameAlpha).toBe(0);
      expect(app.fixedTimeStep).toBeCloseTo(1 / 60, 5);
      expect(app.backend).toBeDefined();
      expect(app.rendering).toBeDefined();
      expect(app.canvasFocused).toBe(false);
      expect(app.documentVisible).toBe(true);
      expect(app.cursor).toBe('default');
      expect(app.sizingMode).toBe('fixed');
      expect(app.clearColor).toBeInstanceOf(Color);
      expect(app.audio).toBeDefined();
      expect(app.width).toBe(800);
      expect(app.height).toBe(600);
      expect(app.pixelRatio).toBe(1);
    });

    test('fixedTimeStep constructor option configures the fixed-step size', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' }, fixedTimeStep: 0.02 });

      expect(app.fixedTimeStep).toBeCloseTo(0.02, 5);
    });

    test('omitting fixedTimeStep falls back to the 60Hz default', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });

      expect(app.fixedTimeStep).toBeCloseTo(1 / 60, 5);
    });

    test('seed constructor option makes app.random deterministic', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' }, seed: 42 });

      expect(app.random.seed).toBe(42);
    });

    test('clearColor getter returns the backend clearColor instance', async () => {
      const { Application, webglManager } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });

      expect(app.clearColor).toBe(webglManager.clearColor);
    });

    test('clearColor setter copies into the backend clearColor rather than replacing it', async () => {
      const { Application, webglManager } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });
      const original = webglManager.clearColor;

      app.clearColor = new Color(1, 2, 3, 0.5);

      expect(app.clearColor).toBe(original); // same instance, mutated in place
      expect(original.r).toBe(1);
      expect(original.g).toBe(2);
      expect(original.b).toBe(3);
      expect(original.a).toBeCloseTo(0.5, 5);
    });
  });

  // -------------------------------------------------------------------------
  // capabilities getter
  // -------------------------------------------------------------------------

  describe('capabilities getter', () => {
    test('throws before start() resolves', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });

      expect(() => app.capabilities).toThrow('Application.capabilities is unavailable before start() resolves.');
    });

    test('returns the resolved Capabilities instance after start() resolves', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

      try {
        await app.start({} as import('#core/Scene').Scene);

        expect(() => app.capabilities).not.toThrow();
        expect(typeof app.capabilities.webgl2).toBe('boolean');
      } finally {
        rafSpy.mockRestore();
      }
    });
  });

  // -------------------------------------------------------------------------
  // cursor / setCursor
  // -------------------------------------------------------------------------

  describe('cursor / setCursor', () => {
    test('a plain string cursor value passes through verbatim', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });

      app.cursor = 'pointer';

      expect(app.cursor).toBe('pointer');
      expect(app.canvas.style.cursor).toBe('pointer');
    });

    test('setCursor with a Texture that has a source rasterizes it to a data: URL', async () => {
      const { Application, Texture } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });
      const source = document.createElement('canvas');
      const texture = new Texture(source);

      app.setCursor(texture);

      expect(app.cursor).toMatch(/^url\(data:image\/png;base64,.*\), auto$/);
      expect(app.canvas.style.cursor).toBe(app.cursor);
    });

    test('setCursor with a Texture that has no source throws', async () => {
      const { Application, Texture } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });
      const emptyTexture = new Texture(null);

      expect(() => app.setCursor(emptyTexture)).toThrow('Provided Texture has no source.');
    });

    test('setCursor with a raw HTMLCanvasElement source rasterizes it too', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });
      const source = document.createElement('canvas');

      app.setCursor(source);

      expect(app.cursor).toMatch(/^url\(data:image\/png;base64,.*\), auto$/);
    });

    test('setCursor returns `this` (fluent)', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });

      expect(app.setCursor('crosshair')).toBe(app);
    });
  });

  // -------------------------------------------------------------------------
  // sizingMode getter/setter
  // -------------------------------------------------------------------------

  describe('sizingMode setter', () => {
    test('is a no-op when assigned the current mode (no observer churn)', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const { Application } = await loadHarness();
      const parent = document.createElement('div');
      const canvas = document.createElement('canvas');
      parent.appendChild(canvas);

      const app = new Application({ canvas: { element: canvas, sizingMode: 'fill' }, backend: { type: 'webgl2' } });
      const observer = MockResizeObserver.instances[0];

      app.sizingMode = 'fill';

      expect(observer.disconnect).not.toHaveBeenCalled();
      expect(app.sizingMode).toBe('fill');
    });

    test('disconnects the old observer and applies the new mode when assigned a different value', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const { Application } = await loadHarness();
      const parent = document.createElement('div');
      const canvas = document.createElement('canvas');
      parent.appendChild(canvas);

      const app = new Application({ canvas: { element: canvas, sizingMode: 'fill' }, backend: { type: 'webgl2' } });
      const observer = MockResizeObserver.instances[0];

      app.sizingMode = 'fixed';

      expect(observer.disconnect).toHaveBeenCalledTimes(1);
      expect(app.sizingMode).toBe('fixed');
    });
  });

  // -------------------------------------------------------------------------
  // _mountCanvas
  // -------------------------------------------------------------------------

  describe('_mountCanvas', () => {
    test('appends the canvas to a CSS selector target', async () => {
      const { Application } = await loadHarness();
      const container = document.createElement('div');
      container.id = 'lifecycle-test-root';
      document.body.appendChild(container);

      try {
        const app = new Application({ canvas: { mount: '#lifecycle-test-root' }, backend: { type: 'webgl2' } });

        expect(container.contains(app.canvas)).toBe(true);
      } finally {
        document.body.removeChild(container);
      }
    });

    test('appends the canvas to an element target', async () => {
      const { Application } = await loadHarness();
      const container = document.createElement('div');

      const app = new Application({ canvas: { mount: container }, backend: { type: 'webgl2' } });

      expect(container.contains(app.canvas)).toBe(true);
    });

    test('is a no-op when mount is omitted (canvas stays unattached)', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });

      expect(app.canvas.parentElement).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // _applySizingMode — 'fit' / 'shrink' / 'fixed' (pure CSS, no observer)
  // -------------------------------------------------------------------------

  describe('_applySizingMode: CSS-only modes', () => {
    test('"fit" sets width/height 100% and objectFit contain', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ canvas: { sizingMode: 'fit' }, backend: { type: 'webgl2' } });

      expect(app.canvas.style.width).toBe('100%');
      expect(app.canvas.style.height).toBe('100%');
      expect(app.canvas.style.objectFit).toBe('contain');
    });

    test('"shrink" sets maxWidth/maxHeight 100% and objectFit contain', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ canvas: { sizingMode: 'shrink' }, backend: { type: 'webgl2' } });

      expect(app.canvas.style.maxWidth).toBe('100%');
      expect(app.canvas.style.maxHeight).toBe('100%');
      expect(app.canvas.style.objectFit).toBe('contain');
    });

    test('"fixed" (default) leaves sizing CSS untouched', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ canvas: { sizingMode: 'fixed' }, backend: { type: 'webgl2' } });

      expect(app.canvas.style.objectFit).toBe('');
      expect(app.canvas.style.maxWidth).toBe('');
      expect(app.sizingMode).toBe('fixed');
    });
  });

  // -------------------------------------------------------------------------
  // _applySizingMode: 'fill'
  // -------------------------------------------------------------------------

  describe('_applySizingMode: "fill"', () => {
    test('breaks early when ResizeObserver is undefined, even with a parent present', async () => {
      // No vi.stubGlobal here — ResizeObserver is undefined by default in jsdom.
      expect(typeof ResizeObserver).toBe('undefined');

      const { Application } = await loadHarness();
      const parent = document.createElement('div');
      const canvas = document.createElement('canvas');
      parent.appendChild(canvas);

      expect(() => new Application({ canvas: { element: canvas, sizingMode: 'fill' }, backend: { type: 'webgl2' } })).not.toThrow();
      expect(MockResizeObserver.instances).toHaveLength(0);
    });

    test('breaks early when the canvas has no parent element, even with ResizeObserver defined', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const { Application } = await loadHarness();
      const canvas = document.createElement('canvas'); // never mounted anywhere

      new Application({ canvas: { element: canvas, sizingMode: 'fill' }, backend: { type: 'webgl2' } });

      expect(MockResizeObserver.instances).toHaveLength(0);
    });

    test('installs a ResizeObserver on the parent and resizes on valid dimensions', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const { Application, webglManager } = await loadHarness();
      const parent = document.createElement('div');
      const canvas = document.createElement('canvas');
      parent.appendChild(canvas);

      const app = new Application({ canvas: { element: canvas, sizingMode: 'fill' }, backend: { type: 'webgl2' } });

      expect(MockResizeObserver.instances).toHaveLength(1);
      const observer = MockResizeObserver.instances[0];
      expect(observer.observe).toHaveBeenCalledWith(parent);

      Object.defineProperty(parent, 'clientWidth', { value: 640, configurable: true });
      Object.defineProperty(parent, 'clientHeight', { value: 480, configurable: true });
      observer.trigger();

      expect(webglManager.resize).toHaveBeenCalledWith(640, 480);
      expect(app.width).toBe(640);
      expect(app.height).toBe(480);
    });

    test('ignores a resize-observer callback firing with a zero-sized parent', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const { Application, webglManager } = await loadHarness();
      const parent = document.createElement('div');
      const canvas = document.createElement('canvas');
      parent.appendChild(canvas);

      new Application({ canvas: { element: canvas, sizingMode: 'fill' }, backend: { type: 'webgl2' } });

      const observer = MockResizeObserver.instances[0];
      Object.defineProperty(parent, 'clientWidth', { value: 0, configurable: true });
      Object.defineProperty(parent, 'clientHeight', { value: 0, configurable: true });
      observer.trigger();

      expect(webglManager.resize).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // _applySizingMode: 'letterbox'
  // -------------------------------------------------------------------------

  describe('_applySizingMode: "letterbox"', () => {
    test('breaks early when ResizeObserver is undefined, even with a parent present', async () => {
      const { Application } = await loadHarness();
      const parent = document.createElement('div');
      const canvas = document.createElement('canvas');
      parent.appendChild(canvas);

      expect(() => new Application({ canvas: { element: canvas, sizingMode: 'letterbox' }, backend: { type: 'webgl2' } })).not.toThrow();
      expect(MockResizeObserver.instances).toHaveLength(0);
    });

    test('breaks early when the canvas has no parent element, even with ResizeObserver defined', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const { Application } = await loadHarness();
      const canvas = document.createElement('canvas');

      new Application({ canvas: { element: canvas, sizingMode: 'letterbox' }, backend: { type: 'webgl2' } });

      expect(MockResizeObserver.instances).toHaveLength(0);
    });

    test('installs a ResizeObserver, styles the parent as letterbox bars, and lays out on valid dimensions', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const { Application } = await loadHarness();
      const parent = document.createElement('div');
      const canvas = document.createElement('canvas');
      parent.appendChild(canvas);

      const app = new Application({
        canvas: { element: canvas, sizingMode: 'letterbox', width: 800, height: 600 },
        backend: { type: 'webgl2' },
      });

      expect(parent.style.display).toBe('flex');
      expect(parent.style.alignItems).toBe('center');
      expect(parent.style.justifyContent).toBe('center');
      expect(parent.style.overflow).toBe('hidden');
      // jsdom normalizes the CSS color keyword/hex to its rgb() serialization on read-back.
      expect(parent.style.background).toBe('rgb(0, 0, 0)');

      expect(MockResizeObserver.instances).toHaveLength(1);
      const observer = MockResizeObserver.instances[0];
      expect(observer.observe).toHaveBeenCalledWith(parent);

      Object.defineProperty(parent, 'clientWidth', { value: 640, configurable: true });
      Object.defineProperty(parent, 'clientHeight', { value: 480, configurable: true });
      observer.trigger();

      // 800x600 design fit into 640x480 parent -> scale 0.8 both axes (exact fit).
      expect(app.canvas.width).toBe(640);
      expect(app.canvas.height).toBe(480);
      expect(app.canvas.style.width).toBe('640px');
      expect(app.canvas.style.height).toBe('480px');
    });

    test('ignores a layout callback firing with a zero-sized parent', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const { Application } = await loadHarness();
      const parent = document.createElement('div');
      const canvas = document.createElement('canvas');
      parent.appendChild(canvas);

      const app = new Application({ canvas: { element: canvas, sizingMode: 'letterbox' }, backend: { type: 'webgl2' } });
      const widthBefore = app.canvas.width;
      const heightBefore = app.canvas.height;

      const observer = MockResizeObserver.instances[0];
      Object.defineProperty(parent, 'clientWidth', { value: 0, configurable: true });
      Object.defineProperty(parent, 'clientHeight', { value: 0, configurable: true });
      observer.trigger();

      expect(app.canvas.width).toBe(widthBefore);
      expect(app.canvas.height).toBe(heightBefore);
    });
  });

  // -------------------------------------------------------------------------
  // resize()
  // -------------------------------------------------------------------------

  describe('resize()', () => {
    test('asserts positive dimensions', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });

      expect(() => app.resize(0, 100)).toThrow(/must be positive/);
      expect(() => app.resize(100, -5)).toThrow(/must be positive/);
    });

    test('updates canvas/backend/rendering, updates options.canvas, and dispatches onResize', async () => {
      const { Application, webglManager } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' }, canvas: { width: 200, height: 100 } });
      const onResizeHandler = vi.fn();
      app.onResize.add(onResizeHandler);

      app.resize(400, 300);

      expect(app.width).toBe(400);
      expect(app.height).toBe(300);
      expect(app.canvas.width).toBe(400);
      expect(app.canvas.height).toBe(300);
      expect(webglManager.resize).toHaveBeenCalledWith(400, 300);
      expect(app.options.canvas?.width).toBe(400);
      expect(app.options.canvas?.height).toBe(300);
      expect(onResizeHandler).toHaveBeenCalledWith(400, 300, app);
    });
  });

  // -------------------------------------------------------------------------
  // _backingStoreToDesign
  // -------------------------------------------------------------------------

  describe('_backingStoreToDesign', () => {
    test('falls back to a 1px backing size when canvas.width/height are 0', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' }, canvas: { width: 800, height: 600 } });

      app.canvas.width = 0;
      app.canvas.height = 0;

      const point = app._backingStoreToDesign(10, 20);

      // backingWidth/backingHeight fall back to 1 -> straight multiply by design size.
      expect(point.x).toBe(10 * 800);
      expect(point.y).toBe(20 * 600);
    });

    test('maps a real backing-store coordinate into design space', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' }, canvas: { width: 800, height: 600, pixelRatio: 2 } });

      // backing store is 1600x1200 at pixelRatio 2; the center maps to the design center.
      const point = app._backingStoreToDesign(800, 600);

      expect(point.x).toBeCloseTo(400, 5);
      expect(point.y).toBeCloseTo(300, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Constructor materialization failure paths
  // -------------------------------------------------------------------------

  describe('constructor materialization failures', () => {
    test('rethrows and destroys the loader when materializeAssetBindings throws', async () => {
      const materializeError = new Error('asset materialize failed');
      const materializeAssetBindings = vi.fn(() => {
        throw materializeError;
      });
      const { Application, loader } = await loadHarness({ materializeAssetBindings });

      expect(() => new Application({ backend: { type: 'webgl2' } })).toThrow(materializeError);
      expect(loader.destroy).toHaveBeenCalledTimes(1);
    });

    test('swallows a secondary loader.destroy() failure and still rethrows the original error', async () => {
      const materializeError = new Error('asset materialize failed');
      const materializeAssetBindings = vi.fn(() => {
        throw materializeError;
      });
      const loaderDestroy = vi.fn(() => {
        throw new Error('destroy also failed');
      });
      const { Application, loader } = await loadHarness({ materializeAssetBindings, loaderDestroy });

      expect(() => new Application({ backend: { type: 'webgl2' } })).toThrow(materializeError);
      expect(loader.destroy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // createBackend() materializeRendererBindings failure paths
  // -------------------------------------------------------------------------

  describe('createBackend() materializeRendererBindings failures', () => {
    test('webgpu path: rethrows and destroys the backend', async () => {
      const err = new Error('renderer materialize failed (webgpu)');
      const materializeRendererBindings = vi.fn(() => {
        throw err;
      });
      const { Application, webgpuManager } = await loadHarness({ materializeRendererBindings });

      expect(() => new Application({ backend: { type: 'webgpu' } })).toThrow(err);
      expect(webgpuManager.destroy).toHaveBeenCalledTimes(1);
    });

    test('webgpu path: swallows a secondary backend.destroy() failure and still rethrows the original error', async () => {
      const err = new Error('renderer materialize failed (webgpu)');
      const materializeRendererBindings = vi.fn(() => {
        throw err;
      });
      const webgpuDestroy = vi.fn(() => {
        throw new Error('destroy also failed');
      });
      const { Application, webgpuManager } = await loadHarness({ materializeRendererBindings, webgpuDestroy });

      expect(() => new Application({ backend: { type: 'webgpu' } })).toThrow(err);
      expect(webgpuManager.destroy).toHaveBeenCalledTimes(1);
    });

    test('webgl2 path: rethrows and destroys the backend', async () => {
      const err = new Error('renderer materialize failed (webgl2)');
      const materializeRendererBindings = vi.fn(() => {
        throw err;
      });
      const { Application, webglManager } = await loadHarness({ materializeRendererBindings });

      expect(() => new Application({ backend: { type: 'webgl2' } })).toThrow(err);
      expect(webglManager.destroy).toHaveBeenCalledTimes(1);
    });

    test('webgl2 path: swallows a secondary backend.destroy() failure and still rethrows the original error', async () => {
      const err = new Error('renderer materialize failed (webgl2)');
      const materializeRendererBindings = vi.fn(() => {
        throw err;
      });
      const webglDestroy = vi.fn(() => {
        throw new Error('destroy also failed');
      });
      const { Application, webglManager } = await loadHarness({ materializeRendererBindings, webglDestroy });

      expect(() => new Application({ backend: { type: 'webgl2' } })).toThrow(err);
      expect(webglManager.destroy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // onBackendLost / onBackendRestored relay
  // -------------------------------------------------------------------------

  describe('onBackendLost / onBackendRestored relay', () => {
    test('webgl2: onContextLost/onContextRestored dispatch onBackendLost/onBackendRestored', async () => {
      const { Application, webglManager } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });

      const lostHandler = vi.fn();
      const restoredHandler = vi.fn();
      app.onBackendLost.add(lostHandler);
      app.onBackendRestored.add(restoredHandler);

      const onContextLostCallback = webglManager.onContextLost.add.mock.calls[0][0] as () => void;
      const onContextRestoredCallback = webglManager.onContextRestored.add.mock.calls[0][0] as () => void;

      onContextLostCallback();
      onContextRestoredCallback();

      expect(lostHandler).toHaveBeenCalledTimes(1);
      expect(restoredHandler).toHaveBeenCalledTimes(1);
    });

    test('webgpu: onDeviceLost/onDeviceRestored dispatch onBackendLost/onBackendRestored', async () => {
      const { Application, webgpuManager } = await loadHarness();
      const app = new Application({ backend: { type: 'webgpu' } });

      const lostHandler = vi.fn();
      const restoredHandler = vi.fn();
      app.onBackendLost.add(lostHandler);
      app.onBackendRestored.add(restoredHandler);

      const onDeviceLostCallback = webgpuManager.onDeviceLost.add.mock.calls[0][0] as () => void;
      const onDeviceRestoredCallback = webgpuManager.onDeviceRestored.add.mock.calls[0][0] as () => void;

      onDeviceLostCallback();
      onDeviceRestoredCallback();

      expect(lostHandler).toHaveBeenCalledTimes(1);
      expect(restoredHandler).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // capture()
  // -------------------------------------------------------------------------

  describe('capture()', () => {
    test('delegates to rendering.capture with the same args and return value', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });
      const fakeTexture = {} as import('#rendering/texture/RenderTexture').RenderTexture;
      const captureSpy = vi.spyOn(app.rendering, 'capture').mockReturnValue(fakeTexture);
      const node = {} as import('#rendering/RenderNode').RenderNode;
      const options: import('#rendering/RenderingContext').CaptureOptions = { width: 64, height: 64 };

      const result = app.capture(node, options);

      expect(captureSpy).toHaveBeenCalledWith(node, options);
      expect(result).toBe(fakeTexture);
    });
  });

  // -------------------------------------------------------------------------
  // screenToWorld
  // -------------------------------------------------------------------------

  describe('screenToWorld()', () => {
    test('delegates to rendering.view.screenToWorld with the same args and return value', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });
      const fakePoint = { x: 42, y: 24 };
      const spy = vi.spyOn(app.rendering.view, 'screenToWorld').mockReturnValue(fakePoint);

      const result = app.screenToWorld(10, 20);

      expect(spy).toHaveBeenCalledWith(10, 20);
      expect(result).toBe(fakePoint);
    });
  });

  // -------------------------------------------------------------------------
  // resolveAutoPixelRatio fallback (no explicit canvas.pixelRatio option)
  // -------------------------------------------------------------------------

  describe('pixelRatio auto-resolution', () => {
    test('falls back to 1 when devicePixelRatio is unavailable', async () => {
      const previousDpr = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
      Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: undefined });

      try {
        const { Application } = await loadHarness();
        const app = new Application({ backend: { type: 'webgl2' } });

        expect(app.pixelRatio).toBe(1);
      } finally {
        if (previousDpr) {
          Object.defineProperty(globalThis, 'devicePixelRatio', previousDpr);
        } else {
          Reflect.deleteProperty(globalThis as Record<string, unknown>, 'devicePixelRatio');
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Constructor defaults / edge inputs
  // -------------------------------------------------------------------------

  describe('constructor defaults / edge inputs', () => {
    test('constructs with zero arguments, using the default {} options', async () => {
      const { Application } = await loadHarness();

      expect(() => new Application()).not.toThrow();
    });

    test('preserves a pre-existing tabindex attribute when no tabIndex option is given', async () => {
      const { Application } = await loadHarness();
      const canvas = document.createElement('canvas');
      canvas.setAttribute('tabindex', '7');

      const app = new Application({ canvas: { element: canvas }, backend: { type: 'webgl2' } });

      expect(app.canvas.tabIndex).toBe(7);
    });

    test('an explicit (empty) extensions list takes the buildSnapshot() path', async () => {
      const { Application } = await loadHarness();

      expect(() => new Application({ backend: { type: 'webgl2' }, extensions: [] })).not.toThrow();
    });

    test('defensive fallback: a null extensions value (bypassing the type system) still falls back to an empty array', async () => {
      // `extensions` is typed `readonly Extension[] | undefined`, so a well-typed caller
      // can never pass `null`. A caller that bypasses the type system still hits
      // `appSettings.extensions === undefined` as false (null !== undefined) and takes
      // the buildSnapshot() branch, where `appSettings.extensions ?? []` guards against
      // exactly this null case.
      const { Application } = await loadHarness();

      expect(
        () => new Application({ backend: { type: 'webgl2' }, extensions: null as unknown as ReadonlyArray<import('#extensions/Extension').Extension> }),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // start(): idempotency + hello banner branches
  // -------------------------------------------------------------------------

  describe('start()', () => {
    test('is idempotent — a second call while already Running does not re-initialize', async () => {
      const { Application, webglManager, sceneManager } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

      try {
        await app.start({} as import('#core/Scene').Scene);
        expect(webglManager.initialize).toHaveBeenCalledTimes(1);
        expect(sceneManager.setScene).toHaveBeenCalledTimes(1);

        await app.start({} as import('#core/Scene').Scene);

        expect(webglManager.initialize).toHaveBeenCalledTimes(1);
        expect(sceneManager.setScene).toHaveBeenCalledTimes(1);
      } finally {
        rafSpy.mockRestore();
      }
    });

    test('prints the startup banner by default (hello: true)', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      try {
        await app.start({} as import('#core/Scene').Scene);

        expect(logSpy).toHaveBeenCalled();
      } finally {
        rafSpy.mockRestore();
        logSpy.mockRestore();
      }
    });

    test('suppresses the startup banner when hello: false', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' }, hello: false });
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      try {
        await app.start({} as import('#core/Scene').Scene);

        expect(logSpy).not.toHaveBeenCalled();
      } finally {
        rafSpy.mockRestore();
        logSpy.mockRestore();
      }
    });
  });

  // -------------------------------------------------------------------------
  // stop(): onError dispatch ternary (error instanceof Error ? error : new Error(...))
  // -------------------------------------------------------------------------

  describe('stop(): onError dispatch on scene-teardown failure', () => {
    test('dispatches the original Error instance when the rejection value is already an Error', async () => {
      const { Application, ApplicationStatus, sceneManager } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const teardownError = new Error('scene teardown failed');
      sceneManager.setScene.mockRejectedValueOnce(teardownError);

      (app as unknown as Record<string, unknown>)['_status'] = ApplicationStatus.Running;
      const errorHandler = vi.fn();
      app.onError.add(errorHandler);

      app.stop();
      await Promise.resolve();
      await Promise.resolve();

      expect(errorHandler).toHaveBeenCalledWith(teardownError);
      consoleErrorSpy.mockRestore();
    });

    test('wraps a non-Error rejection value into a new Error', async () => {
      const { Application, ApplicationStatus, sceneManager } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      sceneManager.setScene.mockRejectedValueOnce('a plain string rejection');

      (app as unknown as Record<string, unknown>)['_status'] = ApplicationStatus.Running;
      const errorHandler = vi.fn();
      app.onError.add(errorHandler);

      app.stop();
      await Promise.resolve();
      await Promise.resolve();

      expect(errorHandler).toHaveBeenCalledTimes(1);
      const receivedError = errorHandler.mock.calls[0][0] as Error;
      expect(receivedError).toBeInstanceOf(Error);
      expect(receivedError.message).toBe('a plain string rejection');
      consoleErrorSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // resize(): defensive `options.canvas ?? {}` fallback
  // -------------------------------------------------------------------------

  describe('resize(): options.canvas defensive fallback', () => {
    test('rebuilds options.canvas from {} if it was cleared out from under it', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });

      app.options.canvas = undefined;

      expect(() => app.resize(320, 240)).not.toThrow();
      expect(app.options.canvas).toEqual({ width: 320, height: 240, pixelRatio: 1 });
    });
  });

  // -------------------------------------------------------------------------
  // _onDocumentVisibilityChange: no-op when visibilityState didn't actually change
  // -------------------------------------------------------------------------

  describe('_onDocumentVisibilityChange', () => {
    test('does not dispatch onVisibilityChange when the visibility value is unchanged', async () => {
      const { Application } = await loadHarness();
      const app = new Application({ backend: { type: 'webgl2' } });

      // jsdom's default document.visibilityState is 'visible', matching the
      // Application's default `_documentVisible = true` — so this event fires
      // with no actual change.
      expect(app.documentVisible).toBe(true);

      const handler = vi.fn();
      app.onVisibilityChange.add(handler);

      document.dispatchEvent(new Event('visibilitychange'));

      expect(handler).not.toHaveBeenCalled();
      expect(app.documentVisible).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // createBackend(): defensive `options.rendering ?? {}` fallback, reached via
  // the webgpu -> webgl2 auto-fallback retry in initializeBackend().
  // -------------------------------------------------------------------------

  describe('createBackend(): options.rendering defensive fallback', () => {
    test('re-invocation during the webgpu -> webgl2 fallback falls back to {} if options.rendering was cleared', async () => {
      const restoreGpu = setNavigatorGpu({});
      const webgpuInitialize = vi.fn().mockRejectedValue(new Error('webgpu init failed'));
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

      try {
        const { Application, webglManager } = await loadHarness({ webgpuInitialize });
        const app = new Application({ canvas: { element: document.createElement('canvas') } });

        app.options.rendering = undefined;

        await app.start({} as import('#core/Scene').Scene);

        expect(webglManager.initialize).toHaveBeenCalledTimes(1);
        expect(app.backend).toBe(webglManager);
      } finally {
        restoreGpu();
        rafSpy.mockRestore();
      }
    });
  });
});
