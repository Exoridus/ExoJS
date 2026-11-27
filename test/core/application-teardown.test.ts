/**
 * `Application.destroy()` as an awaitable, bounded operation against a REAL
 * `SceneDirector`: the returned Promise, its idempotence, the `Destroying` /
 * `Destroyed` states, the grace period that keeps one never-settling
 * `Scene.unload()` from pinning the whole engine, and the
 * `Scene.lifecycleSignal` that lets a scene cooperate with all of it.
 */
import type { Mock } from 'vitest';

import { Application, ApplicationState } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneNavigationAbortedError } from '#core/scene/sceneErrors';

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
      // Core renderer bindings key their factory map on backendType, so a stub
      // naming a real backend also has to accept the renderers bound to it.
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

/** Matches the `sceneTeardownGraceMs` constant in Application.ts. */
const graceMs = 5000;

class PlainScene extends Scene {}
class SecondScene extends Scene {}

class ThrowingScene extends Scene {
  public override unload(): void {
    throw new Error('unload blew up');
  }
}

/** Never settles - the case the grace period exists for. */
class HangingScene extends Scene {
  public override unload(): Promise<void> {
    return new Promise<void>(() => {
      // deliberately never settles
    });
  }
}

/** Records whether the signal was already aborted when `unload()` ran. */
class WatchingScene extends Scene {
  public static abortedInUnload: boolean | null = null;

  public override unload(): void {
    WatchingScene.abortedInUnload = this.lifecycleSignal.aborted;
  }
}

/**
 * Stands in for any pending asynchronous work keyed to the signal: resolves on
 * abort instead of running to completion.
 */
class CooperativeScene extends Scene {
  public override async unload(): Promise<void> {
    await new Promise<void>(resolve => {
      this.lifecycleSignal.addEventListener('abort', () => resolve(), { once: true });
    });
  }
}

/**
 * The incoming half of `CooperativeScene`: its `load()` resolves only once the
 * lifecycle signal aborts, so a navigation to it stays in flight until
 * something aborts it.
 */
class SlowLoadingScene extends Scene {
  public static events: string[] = [];
  public static loadStarted = Promise.resolve();
  private static _loadStarted: () => void = () => {};

  public static arm(events: string[]): void {
    SlowLoadingScene.events = events;
    SlowLoadingScene.loadStarted = new Promise<void>(resolve => {
      SlowLoadingScene._loadStarted = resolve;
    });
  }

  public override async load(): Promise<void> {
    SlowLoadingScene._loadStarted();

    await new Promise<void>(resolve => {
      this.lifecycleSignal.addEventListener('abort', () => resolve(), { once: true });
    });
  }

  public override destroy(): void {
    SlowLoadingScene.events.push('scene.destroy');
  }
}

const createApp = (): Application =>
  new Application({
    backend: { type: 'webgl2' },
    scenes: {
      plain: PlainScene,
      second: SecondScene,
      throwing: ThrowingScene,
      hanging: HangingScene,
      watching: WatchingScene,
      cooperative: CooperativeScene,
      slowLoading: SlowLoadingScene,
    },
  });

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve = (): void => {};
  const promise = new Promise<void>(done => {
    resolve = done;
  });

  return { promise, resolve };
};

const parkedScene = async (kind: 'retained' | 'preloaded') => {
  const started = deferred();
  const release = deferred();
  const events: string[] = [];
  const scenes: Scene[] = [];

  class ParkedScene extends Scene {
    public override init(): void {
      scenes.push(this);
    }

    public override async unload(): Promise<void> {
      events.push('unload');
      started.resolve();
      await release.promise;
      events.push('unloaded');
    }

    public override destroy(): void {
      events.push('destroy');
    }
  }

  const app = new Application({ backend: { type: 'webgl2' }, scenes: { parked: ParkedScene, plain: PlainScene } });

  if (kind === 'retained') {
    await app.scenes.change(ParkedScene);
    await app.scenes.change(PlainScene, { suspendCurrent: true });
  } else {
    await app.scenes.preload(ParkedScene);
  }

  const resources = [vi.spyOn(app.loader, 'destroy'), vi.spyOn(app.input, 'destroy'), vi.spyOn(app.backend, 'destroy')];

  return { app, target: ParkedScene, scene: scenes[0]!, started: started.promise, release: release.resolve, events, resources };
};

let rafSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // No real frames: nothing here drives the loop.
  rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1);
});

afterEach(() => {
  rafSpy.mockRestore();
});

describe('Application.destroy() as an awaitable operation', () => {
  test('returns a Promise that fulfils only after the whole teardown chain has run', async () => {
    const app = createApp();

    app.onFrame.add(() => {});

    const pending = app.destroy();

    // onFrame is destroyed at the very end of the chain - still live here
    // proves the Promise is not already settled at return time.
    expect(app.onFrame.count).toBe(1);

    await pending;

    expect(app.onFrame.count).toBe(0);
  });

  test('reports `Destroying` while the returned Promise is pending and `Destroyed` afterwards', async () => {
    const app = createApp();
    const pending = app.destroy();

    expect(app.state).toBe(ApplicationState.Destroying);

    await pending;

    expect(app.state).toBe(ApplicationState.Destroyed);
  });

  test('is idempotent: a second call returns the same Promise and starts no second teardown', async () => {
    const app = createApp();
    const backendDestroy = vi.spyOn(app.backend, 'destroy');

    const first = app.destroy();
    const second = app.destroy();

    expect(second).toBe(first);

    await first;
    await app.destroy();

    expect(backendDestroy).toHaveBeenCalledTimes(1);
  });

  test('start() after destroy() fails loudly instead of running on torn-down subsystems', async () => {
    const app = createApp();

    await app.destroy();

    await expect(app.start()).rejects.toThrow('Application.start() was called after destroy()');
  });

  test('does not reject when scene teardown fails — the failure travels through onError instead', async () => {
    const app = createApp();
    const onError = vi.fn();

    app.onError.add(onError);

    await app.scenes.change(ThrowingScene);

    await expect(app.destroy()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });
});

describe('Application.destroy() scene-teardown grace period', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test.each([false, true])('keeps a cancelling preload owned until load settles (load fails: %s)', async fails => {
    const started = deferred();
    const release = deferred();
    const events: string[] = [];

    class LoadingScene extends Scene {
      public override async load(): Promise<void> {
        started.resolve();
        await release.promise;

        if (fails) {
          throw new Error('load failed');
        }
      }

      public override init(): void {
        events.push('init');
      }

      public override unload(): void {
        events.push('unload');
      }

      public override destroy(): void {
        events.push('destroy');
      }
    }

    const app = new Application({ backend: { type: 'webgl2' }, scenes: { loading: LoadingScene } });
    const preload = app.scenes.preload(LoadingScene);
    const prepared = preload.catch((error: unknown) => error);

    await started.promise;

    const resources = [vi.spyOn(app.loader, 'destroy'), vi.spyOn(app.backend, 'destroy')];
    const unloaded = app.scenes.unload(LoadingScene, { instance: 'preloaded' });
    const destroyed = app.destroy();

    try {
      await vi.advanceTimersByTimeAsync(0);

      expect(app.state).toBe(ApplicationState.Destroying);

      for (const resource of resources) {
        expect(resource).not.toHaveBeenCalled();
      }
    } finally {
      release.resolve();
      await Promise.all([prepared, unloaded, destroyed]);
    }

    expect(events).toEqual(['destroy']);

    for (const resource of resources) {
      expect(resource).toHaveBeenCalledTimes(1);
    }
  });

  test('an all-instance unload interrupted by destruction leaves the remaining instance owned', async () => {
    const { app, target, started, release, events, resources } = await parkedScene('retained');

    await app.scenes.preload(target);

    const unloaded = app.scenes.unload(target, { instance: 'all' });
    const rejected = unloaded.catch((error: unknown) => error);

    await started;

    const destroyed = app.destroy();

    try {
      await vi.advanceTimersByTimeAsync(0);

      expect(app.state).toBe(ApplicationState.Destroying);

      for (const resource of resources) {
        expect(resource).not.toHaveBeenCalled();
      }
    } finally {
      release();
      await Promise.all([rejected, destroyed]);
    }

    await expect(rejected).resolves.toBeInstanceOf(SceneNavigationAbortedError);
    expect(events).toEqual(['unload', 'unloaded', 'destroy', 'unload', 'unloaded', 'destroy']);

    for (const resource of resources) {
      expect(resource).toHaveBeenCalledTimes(1);
    }
  });

  test('a never-settling unload() no longer pins the application: teardown proceeds after the grace period', async () => {
    const app = createApp();
    const onError = vi.fn();

    app.onError.add(onError);

    await app.scenes.change(HangingScene);

    const backendDestroy = vi.spyOn(app.backend, 'destroy');
    const pending = app.destroy();
    let settled = false;

    void pending.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(graceMs - 1);

    expect(settled).toBe(false);
    expect(backendDestroy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(settled).toBe(true);
    expect(backendDestroy).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('gave up waiting for scene teardown') as string }),
    );
  });

  test('an ordinary teardown does not wait out the grace period', async () => {
    const app = createApp();

    await app.scenes.change(PlainScene);

    // No timer advance at all - a teardown that settles on its own must not
    // depend on the grace timer firing.
    await app.destroy();

    expect(app.state).toBe(ApplicationState.Destroyed);
  });
});

describe('Application.destroy() owns parked scene cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test.each(['retained', 'preloaded'] as const)('tracks unload(%s) before a teardown callback can destroy the application', async kind => {
    const { app, target, scene, started, release, events, resources } = await parkedScene(kind);
    let destroyed = Promise.resolve();
    let destructionStarted = false;

    const destroy = (): void => {
      destructionStarted = true;
      destroyed = app.destroy();
    };

    if (kind === 'retained') {
      app.scenes.onStopScene.add(stopped => {
        if (stopped === scene) {
          destroy();
        }
      });
    } else {
      scene.lifecycleSignal.addEventListener('abort', destroy, { once: true });
    }

    const unloaded = app.scenes.unload(target, { instance: kind });

    try {
      await started;
      await vi.advanceTimersByTimeAsync(0);

      expect(destructionStarted).toBe(true);
      expect(app.state).toBe(ApplicationState.Destroying);

      for (const resource of resources) {
        expect(resource).not.toHaveBeenCalled();
      }
    } finally {
      release();
      await Promise.all([unloaded, destroyed]);
    }

    expect(events).toEqual(['unload', 'unloaded', 'destroy']);

    for (const resource of resources) {
      expect(resource).toHaveBeenCalledTimes(1);
    }
  });

  test.each(['retained', 'preloaded'] as const)('unload(%s) rejects once application destruction begins', async kind => {
    const { app, target, started, release, events, resources } = await parkedScene(kind);
    const destroyed = app.destroy();
    const unloaded = app.scenes.unload(target, { instance: kind });
    let unloadError: unknown = null;

    void unloaded.catch((error: unknown) => {
      unloadError = error;
    });

    try {
      await vi.advanceTimersByTimeAsync(0);

      expect(unloadError).toBeInstanceOf(SceneNavigationAbortedError);
      await started;
      await vi.advanceTimersByTimeAsync(0);

      expect(app.state).toBe(ApplicationState.Destroying);

      for (const resource of resources) {
        expect(resource).not.toHaveBeenCalled();
      }
    } finally {
      release();
      await Promise.allSettled([destroyed, unloaded]);
    }

    expect(events).toEqual(['unload', 'unloaded', 'destroy']);

    for (const resource of resources) {
      expect(resource).toHaveBeenCalledTimes(1);
    }
  });

  test.each(['retained', 'preloaded'] as const)('waits for an earlier unload(%s) before releasing owned resources', async kind => {
    const { app, target, started, release, events, resources } = await parkedScene(kind);
    const unloaded = app.scenes.unload(target, { instance: kind });

    await started;

    const destroyed = app.destroy();

    try {
      await vi.advanceTimersByTimeAsync(0);

      expect(app.state).toBe(ApplicationState.Destroying);
      expect(events).toEqual(['unload']);

      for (const resource of resources) {
        expect(resource).not.toHaveBeenCalled();
      }
    } finally {
      release();
      await Promise.all([unloaded, destroyed]);
    }

    expect(events).toEqual(['unload', 'unloaded', 'destroy']);

    for (const resource of resources) {
      expect(resource).toHaveBeenCalledTimes(1);
    }
  });

  test.each(['retained', 'preloaded'] as const)('bounds an earlier unload(%s) by the shutdown grace period', async kind => {
    const { app, target, started, release, events, resources } = await parkedScene(kind);
    const onError = vi.fn();

    app.onError.add(onError);

    const unloaded = app.scenes.unload(target, { instance: kind });

    await started;

    const destroyed = app.destroy();

    try {
      await vi.advanceTimersByTimeAsync(graceMs - 1);

      expect(app.state).toBe(ApplicationState.Destroying);

      for (const resource of resources) {
        expect(resource).not.toHaveBeenCalled();
      }

      await vi.advanceTimersByTimeAsync(1);
      await destroyed;

      expect(app.state).toBe(ApplicationState.Destroyed);
      expect(events).toEqual(['unload']);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('gave up waiting for scene teardown') as string }),
      );

      for (const resource of resources) {
        expect(resource).toHaveBeenCalledTimes(1);
      }
    } finally {
      release();
      await Promise.all([unloaded, destroyed]);
    }

    expect(events).toEqual(['unload', 'unloaded', 'destroy']);
  });
});

describe('Scene.lifecycleSignal', () => {
  test('is not aborted while the scene is alive', async () => {
    const app = createApp();

    await app.scenes.change(PlainScene);

    expect(app.scenes.currentScene?.lifecycleSignal.aborted).toBe(false);

    await app.destroy();
  });

  test('is already aborted by the time unload() runs', async () => {
    const app = createApp();

    WatchingScene.abortedInUnload = null;

    await app.scenes.change(WatchingScene);
    await app.destroy();

    expect(WatchingScene.abortedInUnload).toBe(true);
  });

  test('aborts when the scene is replaced, not only at application teardown', async () => {
    const app = createApp();

    await app.scenes.change(PlainScene);

    const first = app.scenes.currentScene;

    await app.scenes.change(SecondScene);

    expect(first?.lifecycleSignal.aborted).toBe(true);
    expect(app.scenes.currentScene?.lifecycleSignal.aborted).toBe(false);

    await app.destroy();
  });

  test('aborts a navigation still inside load(), so the incoming scene is torn down before the backend is', async () => {
    const app = createApp();
    const events: string[] = [];

    SlowLoadingScene.arm(events);

    // Never awaited here: the navigation only settles once destroy() aborts
    // it. Its rejection belongs to this caller, not to the teardown.
    const navigation = app.scenes.change(SlowLoadingScene);

    navigation.catch(() => {});

    await SlowLoadingScene.loadStarted;

    (app.backend.destroy as unknown as Mock).mockImplementation(() => events.push('backend.destroy'));

    // No fake timers: without the abort reaching the incoming scene, load()
    // would hold this open for the full grace period and the backend would be
    // released while the scene was still preparing.
    await app.destroy();

    expect(events).toEqual(['scene.destroy', 'backend.destroy']);
    expect(app.state).toBe(ApplicationState.Destroyed);
  });

  test('lets a cooperative scene bail out, so teardown settles well inside the grace period', async () => {
    const app = createApp();

    await app.scenes.change(CooperativeScene);

    // No fake timers here on purpose: if the abort never reached the scene
    // this test would hang rather than fail on a timer assertion.
    await app.destroy();

    expect(app.state).toBe(ApplicationState.Destroyed);
  });
});
