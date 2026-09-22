/**
 * `onAppInitialized`: the one process-wide hook, and the lifetime contract it
 * deliberately does not offer.
 */
import type { Application as ApplicationType } from '#core/Application';
import type { Signal } from '#core/Signal';

interface Harness {
  readonly Application: typeof import('#core/Application').Application;
  readonly ApplicationState: typeof import('#core/Application').ApplicationState;
  /**
   * Taken from the same module graph as `Application`. `vi.resetModules()`
   * gives the freshly imported engine its own `devHooks` module, so a
   * statically imported signal would be a different object than the one the
   * application under test dispatches on.
   */
  readonly onAppInitialized: Signal<[app: ApplicationType]>;
  /** Applications announced since the harness was loaded, in announcement order. */
  readonly announced: ApplicationType[];
}

const loadHarness = async (): Promise<Harness> => {
  const backend = {
    initialize: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    resetStats: vi.fn().mockReturnThis(),
    stats: { frameTimeMs: 0 },
    renderTarget: { setView: vi.fn() },
    supportedTextureFormats: [],
    rootResolution: 1,
    clearColor: { copy: vi.fn() },
    onContextLost: { add: vi.fn(), destroy: vi.fn() },
    onContextRestored: { add: vi.fn(), destroy: vi.fn() },
    onDeviceLost: { add: vi.fn(), destroy: vi.fn() },
    onDeviceRestored: { add: vi.fn(), destroy: vi.fn() },
    onRenderError: { add: vi.fn(), destroy: vi.fn() },
  };

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
  vi.doMock('#extensions/materialize', () => ({
    materializeAssetTypes: vi.fn(),
    materializeRendererBindings: vi.fn(),
    materializeSerializerBindings: vi.fn(),
  }));
  vi.doMock('#rendering/coreRendererBindings', () => ({ buildCoreRendererBindings: vi.fn().mockReturnValue([]) }));

  const { Application, ApplicationState } = await import('#core/Application');
  const { onAppInitialized } = await import('#core/application/devHooks');
  const announced: ApplicationType[] = [];

  onAppInitialized.add(app => {
    announced.push(app);
  });

  return { Application, ApplicationState, onAppInitialized, announced };
};

describe('onAppInitialized', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  test('a started application is announced exactly once, with itself', async () => {
    const { Application, announced } = await loadHarness();
    const app = new Application({ backend: { type: 'webgl2' } });

    await app.start();

    expect(announced).toEqual([app]);

    void app.destroy();
  });

  test('a constructed but never started application is not announced', async () => {
    const { Application, announced } = await loadHarness();
    const app = new Application({ backend: { type: 'webgl2' } });

    expect(announced).toEqual([]);

    void app.destroy();
  });

  test('a restart after stop() does not announce the application a second time', async () => {
    const { Application, announced } = await loadHarness();
    const app = new Application({ backend: { type: 'webgl2' } });

    await app.start();
    app.stop();
    await app.start();

    expect(announced).toHaveLength(1);

    void app.destroy();
  });

  test('two applications are announced separately, in startup order', async () => {
    const { Application, announced } = await loadHarness();
    const first = new Application({ backend: { type: 'webgl2' } });
    const second = new Application({ backend: { type: 'webgl2' } });

    await first.start();
    await second.start();

    expect(announced).toEqual([first, second]);

    void first.destroy();
    void second.destroy();
  });

  test('the announcement carries a usable application, ahead of the initial navigation', async () => {
    const { Application, ApplicationState, onAppInitialized } = await loadHarness();
    const app = new Application({ backend: { type: 'webgl2' } });
    const observed: Array<{ backend: boolean; capabilities: boolean; state: string }> = [];
    const probe = (announced: ApplicationType): void => {
      observed.push({
        backend: announced.backend !== null,
        // Throws before start() resolves unless capabilities have settled.
        capabilities: announced.capabilities !== null,
        // Still Loading: the announcement precedes the initial navigation.
        state: announced.state,
      });
    };

    onAppInitialized.add(probe);

    try {
      await app.start();
    } finally {
      onAppInitialized.remove(probe);
    }

    expect(observed).toEqual([{ backend: true, capabilities: true, state: ApplicationState.Loading }]);

    void app.destroy();
  });

  test('it is a notification, not a registry: a listener added afterwards hears nothing', async () => {
    const { Application, onAppInitialized } = await loadHarness();
    const app = new Application({ backend: { type: 'webgl2' } });

    await app.start();

    const late: ApplicationType[] = [];
    const lateListener = (announced: ApplicationType): void => {
      late.push(announced);
    };

    onAppInitialized.add(lateListener);

    expect(late).toEqual([]);

    onAppInitialized.remove(lateListener);
    void app.destroy();
  });
});
