import type { MockInstance } from 'vitest';

/**
 * Failure isolation of scene and application teardown: one cleanup step that
 * throws must not strand the steps after it, must not destroy anything twice,
 * and must not replace the error that started the teardown. A throwing
 * `Application.onError` listener is part of the same contract - the error
 * pipeline is user code too.
 */
import { Application, ApplicationState } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneScope } from '#core/scene/SceneScope';
import { SceneState } from '#core/scene/SceneState';
import { Signal } from '#core/Signal';
import type { System } from '#core/System';
import type { Destroyable } from '#core/types';
import type { Extension } from '#extensions/Extension';
import { Container } from '#rendering/Container';

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
  WebGl2Backend: vi.fn().mockImplementation(function () {
    return {
      onContextLost: { add: vi.fn(), destroy: vi.fn() },
      onContextRestored: { add: vi.fn(), destroy: vi.fn() },
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
      clearColor: { copy: vi.fn() },
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

class Resource implements Destroyable {
  public calls = 0;

  public constructor(
    private readonly _name: string,
    private readonly _log: string[],
    private readonly _fail = false,
  ) {}

  public destroy(): void {
    this.calls++;
    this._log.push(this._name);

    if (this._fail) {
      throw new Error(`${this._name} failed`);
    }
  }
}

/** Minimal Application stand-in covering every touchpoint SceneScope activation/teardown reaches. */
const createAppStub = (): Application =>
  ({
    loader: { _releaseScope: vi.fn() },
    interaction: {
      attachRoot: vi.fn(),
      detachRoot: vi.fn(),
      attachUIRoot: vi.fn(),
      detachUIRoot: vi.fn(),
    },
    onError: new Signal<[Error]>(),
  }) as unknown as Application;

/** Flatten the `AggregateError`s a development-build `DestroyScope` raises into their messages. */
const messagesOf = (errors: readonly unknown[]): string[] =>
  errors.flatMap(error =>
    error instanceof AggregateError ? messagesOf(error.errors) : [error instanceof Error ? error.message : String(error)],
  );

const expectSceneInternalsReleased = (scene: Scene): void => {
  expect(scene.onActivate.count).toBe(0);
  expect(scene.onPause.count).toBe(0);
  expect(scene.onResume.count).toBe(0);
  expect(scene.onSuspend.count).toBe(0);
  expect(scene.root.destroyed).toBe(true);
  // The scope reference is dropped, so a facility getter is unavailable again.
  expect(() => scene.loader).toThrow(/unavailable/);
};

describe('scene teardown with a throwing tracked resource', () => {
  test('every tracked resource is attempted once and the remaining internals are still released', async () => {
    const app = createAppStub();
    const log: string[] = [];
    const reported: Error[] = [];
    const scene = new Scene();
    const first = scene.track(new Resource('first', log));
    const middle = scene.track(new Resource('middle', log, true));
    const last = scene.track(new Resource('last', log));
    const child = new Container();

    scene.root.addChild(child);
    scene.onActivate.add(() => {});
    scene.onPause.add(() => {});
    app.onError.add(error => void reported.push(error));

    const scope = new SceneScope(app, scene);

    await scope.prepare(undefined);
    scope.activate();
    await scope.destroy();

    expect(log).toEqual(['last', 'middle', 'first']);
    expect([first.calls, middle.calls, last.calls]).toEqual([1, 1, 1]);
    expect(child.destroyed).toBe(true);
    expectSceneInternalsReleased(scene);
    expect(app.loader._releaseScope).toHaveBeenCalledTimes(1);
    expect(scope.state).toBe(SceneState.Destroyed);
    expect(messagesOf(reported)).toEqual(['middle failed']);
  });

  test('a scene whose init() fails after tracking resources is cleaned up without unload()', async () => {
    const app = createAppStub();
    const log: string[] = [];
    const reported: Error[] = [];
    const unload = vi.fn();
    const scene = Object.assign(new Scene(), {
      init(this: Scene): void {
        this.track(new Resource('good', log));
        this.track(new Resource('bad', log, true));
        this.onPause.add(() => {});

        throw new Error('init failed');
      },
      unload,
    });

    app.onError.add(error => void reported.push(error));

    const scope = new SceneScope(app, scene);

    await expect(scope.prepare(undefined)).rejects.toThrow('init failed');

    scope.destroyFailedActivation();

    expect(log).toEqual(['bad', 'good']);
    expect(unload).not.toHaveBeenCalled();
    expectSceneInternalsReleased(scene);
    expect(app.loader._releaseScope).toHaveBeenCalledTimes(1);
    expect(scope.state).toBe(SceneState.Destroyed);
    expect(messagesOf(reported)).toEqual(['bad failed']);
  });

  test('a throwing node destroy() does not keep the scene attached, and several failures arrive together', () => {
    const scene = new Scene();
    const child = new (class extends Container {
      public override destroy(): void {
        super.destroy();

        throw new Error('node failed');
      }
    })();

    scene.track(new Resource('tracked', [], true));
    scene.root.addChild(child);
    scene.onResume.add(() => {});
    scene._attach(createAppStub(), {} as SceneScope);

    let thrown: unknown = null;

    try {
      scene._teardownInternals();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect(messagesOf([thrown])).toEqual(['tracked failed', 'node failed']);
    expect(scene.onResume.count).toBe(0);
    expect(() => scene.loader).toThrow(/unavailable/);
  });

  test('repeated teardown on either path destroys nothing twice', async () => {
    const app = createAppStub();
    const log: string[] = [];
    const scene = new Scene();
    const resource = scene.track(new Resource('resource', log, true));
    const destroyHook = vi.spyOn(scene, 'destroy');
    const scope = new SceneScope(app, scene);

    await scope.prepare(undefined);
    scope.activate();

    await Promise.all([scope.destroy(), scope.destroy()]);
    await scope.destroy();
    scope.destroyFailedActivation();

    expect(resource.calls).toBe(1);
    expect(destroyHook).toHaveBeenCalledTimes(1);
    expect(app.loader._releaseScope).toHaveBeenCalledTimes(1);
  });
});

describe('scene teardown with a throwing error reporter', () => {
  test('every collected failure still reaches the other onError listeners and destroy() settles', async () => {
    const app = createAppStub();
    const log: string[] = [];
    const reported: Error[] = [];
    const scene = Object.assign(new Scene(), {
      destroy(): void {
        throw new Error('scene.destroy failed');
      },
    });

    scene.track(new Resource('tracked', log, true));
    app.onError.add(() => {
      throw new Error('reporter failed');
    });
    app.onError.add(error => void reported.push(error));

    const scope = new SceneScope(app, scene);

    await scope.prepare(undefined);
    scope.activate();

    await expect(scope.destroy()).resolves.toBeUndefined();

    expect(scope.state).toBe(SceneState.Destroyed);
    expect(app.loader._releaseScope).toHaveBeenCalledTimes(1);
    expect(messagesOf(reported)).toEqual(['scene.destroy failed', 'tracked failed']);
  });

  test('failed-activation cleanup never throws, even when a listener does', async () => {
    const app = createAppStub();
    const scene = Object.assign(new Scene(), {
      init(this: Scene): void {
        this.track(new Resource('tracked', [], true));

        throw new Error('init failed');
      },
    });

    app.onError.add(() => {
      throw new Error('reporter failed');
    });

    const scope = new SceneScope(app, scene);

    await expect(scope.prepare(undefined)).rejects.toThrow('init failed');

    expect(() => scope.destroyFailedActivation()).not.toThrow();
    expect(scope.state).toBe(SceneState.Destroyed);
  });
});

let rafSpy: MockInstance;

beforeEach(() => {
  rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as ReturnType<typeof requestAnimationFrame>);
});

afterEach(() => {
  rafSpy.mockRestore();
});

class InitFailingScene extends Scene {
  public static readonly log: string[] = [];

  public override init(): void {
    this.track(new Resource('tracked', InitFailingScene.log, true));

    throw new Error('init failed');
  }
}

class PreloadedScene extends Scene {
  public static readonly log: string[] = [];
  public static readonly unload = vi.fn();

  public override init(): void {
    this.track(new Resource('preloaded', PreloadedScene.log));
  }

  public override unload(): void {
    PreloadedScene.unload();
  }
}

class OrderedScene extends Scene {
  public static order: string[] = [];

  public override unload(): void {
    OrderedScene.order.push('scene.unload');
  }

  public override destroy(): void {
    OrderedScene.order.push('scene.destroy');
  }
}

const createApp = (extensions: Extension[] = []): Application =>
  new Application({
    backend: { type: 'webgl2' },
    extensions,
    scenes: { initFailing: InitFailingScene, preloaded: PreloadedScene, ordered: OrderedScene },
  });

describe('navigation failure', () => {
  test('a scene whose init() fails rejects with the original error even when the error reporter throws', async () => {
    const app = createApp();

    app.onError.add(() => {
      throw new Error('reporter failed');
    });

    await expect(app.scenes.change(InitFailingScene)).rejects.toThrow('init failed');
    expect(InitFailingScene.log).toEqual(['tracked']);

    await app.destroy();
  });

  test('a preloaded scene that never activated is torn down once by application teardown', async () => {
    const app = createApp();

    await app.scenes.preload(PreloadedScene);
    await app.destroy();

    // A preloaded scope completed load() and init(), so its Ready-scope
    // cleanup includes unload() even though it never became active.
    expect(PreloadedScene.log).toEqual(['preloaded']);
    expect(PreloadedScene.unload).toHaveBeenCalledTimes(1);
  });
});

describe('application teardown', () => {
  test('a throwing subsystem stage does not strand the stages after it, and its error is reported', async () => {
    const app = createApp();
    const reported: Error[] = [];
    const backendDestroy = vi.spyOn(app.backend, 'destroy');
    const inputDestroy = vi.spyOn(app.input, 'destroy');

    vi.spyOn(app.loader, 'destroy').mockImplementation(() => {
      throw new Error('loader.destroy failed');
    });
    app.onError.add(error => void reported.push(error));
    app.onFrame.add(() => {});

    await app.destroy();

    expect(inputDestroy).toHaveBeenCalledTimes(1);
    expect(backendDestroy).toHaveBeenCalledTimes(1);
    expect(app.onFrame.count).toBe(0);
    expect(app.onError.count).toBe(0);
    expect(messagesOf(reported)).toEqual(['loader.destroy failed']);
    expect(app.state).toBe(ApplicationState.Destroyed);
  });

  test('a throwing error reporter neither rejects destroy() nor leaves the application short of Destroyed', async () => {
    const app = createApp();
    const backendDestroy = vi.spyOn(app.backend, 'destroy');

    vi.spyOn(app.loader, 'destroy').mockImplementation(() => {
      throw new Error('loader.destroy failed');
    });
    app.onError.add(() => {
      throw new Error('reporter failed');
    });

    await expect(app.destroy()).resolves.toBeUndefined();

    expect(backendDestroy).toHaveBeenCalledTimes(1);
    expect(app.state).toBe(ApplicationState.Destroyed);
  });

  test('every owner destroys its resources exactly once, in the documented order', async () => {
    OrderedScene.order = [];

    const order = OrderedScene.order;
    const extensionSystem: System = { update: vi.fn(), destroy: () => void order.push('extension system') };
    const extension: Extension = {
      id: 'ordered',
      install: app => {
        app.systems.add(extensionSystem);

        return () => void order.push('extension disposer');
      },
    };
    const app = createApp([extension]);
    const userSystem: System = { update: vi.fn(), destroy: () => void order.push('user system') };

    app.systems.add(userSystem);

    const loaderDestroy = vi.spyOn(app.loader, 'destroy').mockImplementation(() => void order.push('loader'));
    const tweensDestroy = vi.spyOn(app.tweens, 'destroy');
    const backendDestroy = vi.spyOn(app.backend, 'destroy').mockImplementation(() => void order.push('backend'));

    await app.scenes.change(OrderedScene);
    await app.destroy();

    // Ordinary systems - an extension's included - are destroyed after the
    // loader. A System.destroy() that still needs the loader therefore runs
    // against a released one; reordering that is a separate migration.
    expect(order).toEqual(['scene.unload', 'scene.destroy', 'extension disposer', 'loader', 'user system', 'extension system', 'backend']);
    expect(loaderDestroy).toHaveBeenCalledTimes(1);
    expect(tweensDestroy).toHaveBeenCalledTimes(1);
    expect(backendDestroy).toHaveBeenCalledTimes(1);
  });
});
