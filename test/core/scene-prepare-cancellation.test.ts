/**
 * A scene whose preparation is cancelled while its `load()` is still pending -
 * by `Application.stop()`, `Application.destroy()`, a superseding `preload()`
 * or `unload()` - never runs `init()`, never reaches `Ready` and is torn down
 * exactly once through the failed-activation path, against a REAL
 * `Application` and `SceneDirector`.
 */
import { Asset } from '#assets/Asset';
import { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneNavigationAbortedError } from '#core/scene/sceneErrors';
import { SceneState } from '#core/scene/SceneState';
import {
  SceneTransition,
  type SceneTransitionEnvironment,
  type SceneTransitionRequirements,
  type SceneTransitionSession,
} from '#core/scene/SceneTransition';
import { Time } from '#core/units';

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
  WebGl2Backend: vi.fn().mockImplementation(function () {
    return {
      onContextLost: { add: vi.fn() },
      onContextRestored: { add: vi.fn() },
      onRenderError: { add: vi.fn(), destroy: vi.fn() },
      stats: {
        frameTimeMs: 0,
        drawCalls: 0,
        culledNodes: 0,
        submittedNodes: 0,
        batches: 0,
        renderPasses: 0,
        renderTargetChanges: 0,
        frame: 0,
        rawFrameDeltaMs: 0,
      },
      resetStats: vi.fn().mockReturnThis(),
      flush: vi.fn().mockReturnThis(),
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      resize: vi.fn().mockReturnThis(),
      view: { getBounds: vi.fn().mockReturnValue({ left: 0, top: 0, right: 800, bottom: 600 }) },
      renderTarget: {},
      rendererRegistry: { bindRenderer: vi.fn() },
      backendType: 'webgl2',
      setView: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      execute: vi.fn().mockReturnThis(),
      clear: vi.fn().mockReturnThis(),
      pushScissorRect: vi.fn().mockReturnThis(),
      popScissorRect: vi.fn().mockReturnThis(),
      acquireRenderTexture: vi.fn(),
      releaseRenderTexture: vi.fn().mockReturnThis(),
      composeWithAlphaMask: vi.fn().mockReturnThis(),
    };
  }),
}));

class ManualSession implements SceneTransitionSession {
  public readonly placement = 'screen' as const;
  public done = false;

  public update(): void {}

  public render(): void {}

  public destroy(): void {}
}

class ManualTransition extends SceneTransition {
  public environment: SceneTransitionEnvironment | null = null;

  public getRequirements(): SceneTransitionRequirements {
    return { outgoingFrame: 'none', currentFrame: 'none' };
  }

  protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
    this.environment = environment;

    return new ManualSession();
  }
}

class TitleScene extends Scene {}

interface Probe {
  readonly Scene: typeof Scene<string>;
  /** Every hook each instance ran, prefixed with the instance's activation data. */
  readonly events: string[];
  /** Every state the director reported for an instance of this probe. */
  readonly states: SceneState[];
  /** Fulfils once the first `load()` has started. */
  readonly started: Promise<void>;
  open(): void;
  fail(error: Error): void;
}

/**
 * A scene whose `load()` registers a scene system and a loader claim, then waits
 * for the test to open a gate. A cooperative probe also stops waiting when its
 * lifecycle signal aborts; the default one ignores the signal.
 */
const createProbe = ({ cooperative = false } = {}): Probe => {
  const events: string[] = [];
  const states: SceneState[] = [];
  let open!: () => void;
  let fail!: (error: Error) => void;
  let markStarted!: () => void;
  const gate = new Promise<void>((resolve, reject) => {
    open = resolve;
    fail = reject;
  });
  const started = new Promise<void>(resolve => (markStarted = resolve));

  gate.catch(() => {});

  class GatedScene extends Scene<string> {
    private _data = '';

    public override async load(data: string): Promise<void> {
      this._data = data;
      events.push(`${data}:load`);
      this.systems.add({ update: () => {}, destroy: () => events.push(`${data}:system.destroy`) });
      await this.loader.load(Asset.type('json', `${data}.json`));
      markStarted();

      if (cooperative) {
        await Promise.race([
          gate,
          new Promise<void>(resolve => this.lifecycleSignal.addEventListener('abort', () => resolve(), { once: true })),
        ]);
      } else {
        await gate;
      }
    }

    public override init(data: string): void {
      events.push(`${data}:init`);
    }

    public override unload(): void {
      events.push(`${this._data}:unload`);
    }

    public override destroy(): void {
      events.push(`${this._data}:destroy`);
    }
  }

  return { Scene: GatedScene, events, states, started, open: () => open(), fail: error => fail(error) };
};

/** Flush enough microtask turns for fire-and-forget teardown chains to settle. */
const settle = async (turns = 20): Promise<void> => {
  for (let turn = 0; turn < turns; turn++) {
    await Promise.resolve();
  }
};

const outcome = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => 'resolved',
    (error: unknown) => error,
  );

const apps: Application[] = [];

const createApp = (...probes: Probe[]): { app: Application; errors: Error[]; claims: () => string[] } => {
  const scenes: Record<string, typeof Scene<string> | typeof TitleScene> = { title: TitleScene };

  probes.forEach((probe, index) => (scenes[`probe${index}`] = probe.Scene));

  const app = new Application({ backend: { type: 'webgl2' }, scenes });
  const errors: Error[] = [];

  app.onError.add(error => errors.push(error));
  app.scenes.onStateChange.add((_previous, next, scene) => {
    for (const probe of probes) {
      if (scene instanceof probe.Scene) {
        probe.states.push(next);
      }
    }
  });
  apps.push(app);

  const claims = (): string[] =>
    app.loader
      .inspect()
      .filter(row => row.claims > 0)
      .flatMap(row => row.aliases);

  return { app, errors, claims };
};

let rafSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } })),
  );
});

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.destroy();
  }

  vi.unstubAllGlobals();
  rafSpy.mockRestore();
});

const cancelledCleanup = (data: string): string[] => [`${data}:load`, `${data}:system.destroy`, `${data}:destroy`];

describe('scene preparation that is not cancelled', () => {
  test('runs load() then init() exactly once and activates the scene', async () => {
    const probe = createProbe();
    const { app, errors } = createApp(probe);

    await app.start(TitleScene);

    const navigation = app.scenes.change(probe.Scene, { data: 'a' });

    await probe.started;
    probe.open();
    await navigation;

    expect(app.scenes.currentScene).toBeInstanceOf(probe.Scene);
    expect(probe.events).toEqual(['a:load', 'a:init']);
    expect(probe.states).toEqual([SceneState.Ready, SceneState.Active]);
    expect(errors).toEqual([]);
  });

  test('is not rejected by unrelated preload activity that is cancelled meanwhile', async () => {
    const incoming = createProbe();
    const unrelated = createProbe();
    const { app, errors } = createApp(incoming, unrelated);

    await app.start(TitleScene);

    const navigation = app.scenes.change(incoming.Scene, { data: 'a' });
    const preload = outcome(app.scenes.preload(unrelated.Scene, { data: 'b' }));

    await incoming.started;
    await unrelated.started;

    const unloaded = app.scenes.unload(unrelated.Scene);

    incoming.open();
    await navigation;
    unrelated.open();

    expect(await unloaded).toBe(true);
    expect(await preload).toBe('resolved');
    expect(app.scenes.currentScene).toBeInstanceOf(incoming.Scene);
    expect(incoming.events).toEqual(['a:load', 'a:init']);
    expect(unrelated.events).toEqual(cancelledCleanup('b'));
    expect(errors).toEqual([]);
  });
});

describe('scene preparation cancelled while load() is pending', () => {
  test('Application.stop(): init() never runs, the navigation rejects as aborted, and cleanup runs exactly once', async () => {
    const probe = createProbe();
    const { app, errors, claims } = createApp(probe);

    await app.start(TitleScene);

    const navigation = outcome(app.scenes.change(probe.Scene, { data: 'a' }));

    await probe.started;
    expect(claims()).toEqual(['a.json']);

    app.stop();
    app.stop();
    probe.open();

    expect(await navigation).toBeInstanceOf(SceneNavigationAbortedError);
    await settle();

    expect(probe.events).toEqual(cancelledCleanup('a'));
    expect(probe.states).toEqual([SceneState.Destroying, SceneState.Destroyed]);
    expect(app.scenes.currentScene).toBeNull();
    expect(claims()).toEqual([]);
    expect(errors).toEqual([]);

    // The application can still prepare and activate a scene afterwards.
    await app.start(probe.Scene, { data: 'b' });

    expect(app.scenes.currentScene).toBeInstanceOf(probe.Scene);
    expect(probe.events.slice(3)).toEqual(['b:load', 'b:init']);
    expect(claims()).toEqual(['b.json']);
  });

  test('Application.destroy(): init() never runs, and repeated destroy calls clean up only once', async () => {
    const probe = createProbe();
    const { app, errors, claims } = createApp(probe);

    await app.start(TitleScene);

    const navigation = outcome(app.scenes.change(probe.Scene, { data: 'a' }));

    await probe.started;

    const destroyed = app.destroy();

    expect(app.destroy()).toBe(destroyed);
    probe.open();
    await destroyed;

    expect(await navigation).toBeInstanceOf(SceneNavigationAbortedError);
    expect(probe.events).toEqual(cancelledCleanup('a'));
    expect(probe.states).not.toContain(SceneState.Ready);
    expect(claims()).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a load() that honours the lifecycle signal settles on its own, and init() still never runs', async () => {
    const probe = createProbe({ cooperative: true });
    const { app, errors } = createApp(probe);

    await app.start(TitleScene);

    const navigation = outcome(app.scenes.change(probe.Scene, { data: 'a' }));

    await probe.started;
    app.stop();

    expect(await navigation).toBeInstanceOf(SceneNavigationAbortedError);
    await settle();

    expect(probe.events).toEqual(cancelledCleanup('a'));
    expect(errors).toEqual([]);
  });

  test('a load() that rejects with its own error keeps that error, whether or not it was cancelled first', async () => {
    for (const cancel of [false, true]) {
      const probe = createProbe();
      const { app } = createApp(probe);
      const failure = new Error(`load failed (cancelled: ${String(cancel)})`);

      await app.start(TitleScene);

      const navigation = outcome(app.scenes.change(probe.Scene, { data: 'a' }));

      await probe.started;

      if (cancel) {
        app.stop();
      }

      probe.fail(failure);

      expect(await navigation).toBe(failure);
      await settle();

      expect(probe.events).toEqual(cancelledCleanup('a'));
      // A stop clears the active scene; a plain failure leaves it in place.
      expect(app.scenes.currentScene === null ? null : app.scenes.currentScene.constructor).toBe(cancel ? null : TitleScene);
    }
  });

  test('a transitioned navigation stopped after its commit began: init() never runs and nothing activates', async () => {
    const probe = createProbe();
    const { app, errors } = createApp(probe);

    await app.start(TitleScene);

    const transition = new ManualTransition();
    const navigation = outcome(app.scenes.change(probe.Scene, { data: 'a', transition }));

    await settle(4);
    transition.environment?.commit();
    app.scenes._updateTransition(Time.toSeconds(Time.milliseconds(16)));
    await probe.started;

    app.stop();
    probe.open();

    expect(await navigation).not.toBe('resolved');
    await settle();

    expect(probe.events).toEqual(cancelledCleanup('a'));
    expect(probe.states).not.toContain(SceneState.Ready);
    expect(app.scenes.currentScene).toBeNull();
    // An aborted transition session reports its abort reason; nothing else is reported.
    expect(errors).toEqual([expect.any(SceneNavigationAbortedError)]);
  });
});

describe('preloaded scene preparation cancelled while load() is pending', () => {
  test('unload(): the preload settles without init(), and the scene is destroyed once without unload()', async () => {
    const probe = createProbe();
    const { app, errors, claims } = createApp(probe);

    const preload = outcome(app.scenes.preload(probe.Scene, { data: 'a' }));

    await probe.started;

    const unloaded = app.scenes.unload(probe.Scene);

    probe.open();

    expect(await unloaded).toBe(true);
    expect(await preload).toBe('resolved');
    expect(probe.events).toEqual(cancelledCleanup('a'));
    expect(probe.states).toEqual([SceneState.Destroying, SceneState.Destroyed]);
    expect(claims()).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a preload superseded by different data never initializes; the newer one is consumed by change()', async () => {
    const probe = createProbe();
    const { app, errors } = createApp(probe);

    await app.start(TitleScene);

    const first = outcome(app.scenes.preload(probe.Scene, { data: 'one' }));
    const second = app.scenes.preload(probe.Scene, { data: 'two' });

    await probe.started;
    probe.open();

    expect(await first).toBe('resolved');
    await second;
    await settle();

    // The two loads finish in either order; only what ran matters.
    expect([...probe.events].sort()).toEqual(['one:destroy', 'one:load', 'one:system.destroy', 'two:init', 'two:load']);

    await app.scenes.change(probe.Scene, { data: 'two' });

    expect(app.scenes.currentScene).toBeInstanceOf(probe.Scene);
    expect(probe.events.filter(event => event.endsWith(':init'))).toEqual(['two:init']);
    expect(errors).toEqual([]);
  });

  test('a preload claimed by change() and then stopped never initializes; change() rejects and the preload settles', async () => {
    const probe = createProbe();
    const { app, errors } = createApp(probe);

    await app.start(TitleScene);

    const preload = outcome(app.scenes.preload(probe.Scene, { data: 'a' }));

    await probe.started;

    const navigation = outcome(app.scenes.change(probe.Scene, { data: 'a' }));

    await settle(4);
    app.stop();
    probe.open();

    expect(await navigation).toBeInstanceOf(SceneNavigationAbortedError);
    expect(await preload).toBe('resolved');
    await settle();

    expect(probe.events).toEqual(cancelledCleanup('a'));
    expect(probe.states).not.toContain(SceneState.Ready);
    expect(app.scenes.currentScene).toBeNull();
    expect(errors).toEqual([]);
  });

  test('a preload claimed by a transitioned change() that is aborted before its commit, with no slot to return to, is cancelled rather than unloaded mid-load()', async () => {
    for (const end of ['destroy', 'stop'] as const) {
      const probe = createProbe();
      const { app, errors } = createApp(probe);

      await app.start(TitleScene);

      const preload = outcome(app.scenes.preload(probe.Scene, { data: 'a' }));

      await probe.started;

      const navigation = outcome(app.scenes.change(probe.Scene, { data: 'a', transition: new ManualTransition() }));

      await settle(4);

      let ended: Promise<unknown>;

      if (end === 'destroy') {
        ended = app.destroy();
      } else {
        // A newer preload takes the slot the claimed entry would return to.
        void app.scenes.preload(probe.Scene, { data: 'b' });
        app.stop();
        ended = Promise.resolve();
      }

      expect(await navigation).not.toBe('resolved');
      // Torn down only once its load() settles, never while it is still running.
      expect(probe.events.filter(event => event.startsWith('a:'))).toEqual(['a:load']);

      probe.open();
      await ended;
      await settle();

      expect(await preload).toBe('resolved');
      expect(probe.events.filter(event => event.startsWith('a:'))).toEqual(cancelledCleanup('a'));
      expect(errors.filter(error => !(error instanceof SceneNavigationAbortedError))).toEqual([]);
    }
  });

  test('Application.destroy() during a preload never initializes it', async () => {
    const probe = createProbe();
    const { app, errors } = createApp(probe);

    const preload = outcome(app.scenes.preload(probe.Scene, { data: 'a' }));

    await probe.started;

    const destroyed = app.destroy();

    probe.open();
    await destroyed;

    expect(await preload).toBe('resolved');
    expect(probe.events).toEqual(cancelledCleanup('a'));
    expect(errors).toEqual([]);
  });
});
