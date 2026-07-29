/**
 * The platform seam itself: that an application uses the adapter it was given,
 * falls back to the browser one when it was given none, and that ownership of
 * the adapter's teardown follows who created it.
 */

import { BrowserPlatform } from '#platform/BrowserPlatform';
import type { PlatformAdapter, PlatformSubscription } from '#platform/PlatformAdapter';

/**
 * `Application` with a stubbed render backend. jsdom has no WebGL context, so
 * the real backend cannot even be torn down — and none of this file's subject
 * matter involves rendering.
 */
const loadApplication = async (): Promise<typeof import('#core/Application').Application> => {
  const backend = {
    initialize: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    resetStats: vi.fn().mockReturnThis(),
    stats: { frameTimeMs: 0 },
    clearColor: { copy: vi.fn() },
    renderTarget: { setView: vi.fn() },
    onContextLost: { add: vi.fn(), destroy: vi.fn() },
    onContextRestored: { add: vi.fn(), destroy: vi.fn() },
    onDeviceLost: { add: vi.fn(), destroy: vi.fn() },
    onDeviceRestored: { add: vi.fn(), destroy: vi.fn() },
    onRenderError: { add: vi.fn(), destroy: vi.fn() },
    backendType: 'webgl2',
  };

  const BackendMock = vi.fn(function () {
    return backend;
  });

  vi.resetModules();
  vi.doMock('#rendering/webgl2/WebGl2Backend', () => ({ WebGl2Backend: BackendMock }));
  vi.doMock('#rendering/webgpu/WebGpuBackend', () => ({ WebGpuBackend: BackendMock }));

  return (await import('#core/Application')).Application;
};

/** A recording adapter — enough surface for construction and a frame or two. */
const createRecordingPlatform = (): PlatformAdapter & { readonly calls: string[]; visible: boolean; emitVisibility: (visible: boolean) => void } => {
  const calls: string[] = [];
  const visibilityListeners = new Set<(visible: boolean) => void>();

  return {
    calls,
    visible: true,
    surfaceFocused: false,
    get documentVisible(): boolean {
      return this.visible;
    },
    emitVisibility(visible: boolean): void {
      this.visible = visible;

      for (const listener of visibilityListeners) {
        listener(visible);
      }
    },
    focusSurface: () => void calls.push('focusSurface'),
    getSurfaceMetrics: () => ({ left: 0, top: 0, width: 800, height: 600, backingWidth: 800, backingHeight: 600 }),
    setCursor: (value: string) => void calls.push(`setCursor:${value}`),
    setTouchAction: (value: string) => void calls.push(`setTouchAction:${value}`),
    capturePointer: (id: number) => void calls.push(`capturePointer:${id}`),
    releasePointer: (id: number) => void calls.push(`releasePointer:${id}`),
    pollGamepads: () => [],
    onVisibilityChange(listener: (visible: boolean) => void): PlatformSubscription {
      visibilityListeners.add(listener);

      return () => void visibilityListeners.delete(listener);
    },
    requestFrame: () => {
      calls.push('requestFrame');

      return 1;
    },
    cancelFrame: (handle: number) => void calls.push(`cancelFrame:${handle}`),
    onSurfaceEvent: () => () => undefined,
    onWindowEvent: () => () => undefined,
    destroy: () => void calls.push('destroy'),
  };
};

describe('platform injection', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to a BrowserPlatform bound to the application canvas', async () => {
    const Application = await loadApplication();
    const app = new Application();

    // Not `instanceof`: the harness re-imports the module graph, so the class
    // the application constructed is a different identity from the one above.
    expect(app.platform.constructor.name).toBe('BrowserPlatform');
    expect((app.platform as BrowserPlatform).surface).toBe(app.canvas);

    app.destroy();
  });

  it('uses the injected adapter instead', async () => {
    const Application = await loadApplication();
    const platform = createRecordingPlatform();
    const app = new Application({ platform });

    expect(app.platform).toBe(platform);

    app.destroy();
  });

  it('routes input touch-action and the cursor through the adapter', async () => {
    const Application = await loadApplication();
    const platform = createRecordingPlatform();
    const app = new Application({ platform });

    app.setCursor('crosshair');

    expect(platform.calls).toContain('setTouchAction:none');
    expect(platform.calls).toContain('setCursor:crosshair');

    app.destroy();
  });

  it('reads document visibility from the adapter and follows its changes', async () => {
    const Application = await loadApplication();
    const platform = createRecordingPlatform();
    const app = new Application({ platform });
    const seen: boolean[] = [];

    app.onVisibilityChange.add(visible => void seen.push(visible));

    expect(app.documentVisible).toBe(true);

    platform.emitVisibility(false);

    expect(app.documentVisible).toBe(false);
    expect(seen).toEqual([false]);

    app.destroy();
  });

  it('leaves an injected adapter for its owner to dispose', async () => {
    const Application = await loadApplication();
    const platform = createRecordingPlatform();
    const app = new Application({ platform });

    app.destroy();

    expect(platform.calls).not.toContain('destroy');
  });
});

describe('BrowserPlatform', () => {
  let canvas: HTMLCanvasElement;
  let platform: BrowserPlatform;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    platform = new BrowserPlatform(canvas);
  });

  afterEach(() => {
    platform.destroy();
  });

  it('reports surface focus against the active element', () => {
    document.body.append(canvas);
    canvas.tabIndex = -1;

    expect(platform.surfaceFocused).toBe(false);

    platform.focusSurface();

    expect(platform.surfaceFocused).toBe(true);

    canvas.remove();
  });

  it('reports the backing store alongside the display rect', () => {
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 5,
      top: 7,
      right: 205,
      bottom: 157,
      width: 200,
      height: 150,
      x: 5,
      y: 7,
      toJSON: () => ({}),
    } as DOMRect);

    expect(platform.getSurfaceMetrics()).toEqual({ left: 5, top: 7, width: 200, height: 150, backingWidth: 400, backingHeight: 300 });
  });

  it('detaches a subscription exactly once', () => {
    const seen = vi.fn();
    const unsubscribe = platform.onSurfaceEvent('pointerdown', seen);

    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(seen).toHaveBeenCalledTimes(1);

    unsubscribe();
    unsubscribe();

    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('drops every subscription on destroy', () => {
    const seen = vi.fn();

    platform.onSurfaceEvent('pointerdown', seen);
    platform.destroy();

    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(seen).not.toHaveBeenCalled();
  });

  it('reports no gamepads when the host does not provide the API', () => {
    const previous = Object.getOwnPropertyDescriptor(window.navigator, 'getGamepads');

    Reflect.deleteProperty(window.navigator as unknown as Record<string, unknown>, 'getGamepads');

    expect(platform.pollGamepads()).toEqual([]);

    if (previous) {
      Object.defineProperty(window.navigator, 'getGamepads', previous);
    }
  });

  it('survives a pointer capture the host rejects', () => {
    expect(() => platform.capturePointer(1)).not.toThrow();
    expect(() => platform.releasePointer(1)).not.toThrow();
  });
});
