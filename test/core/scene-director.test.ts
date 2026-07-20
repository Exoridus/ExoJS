import type { Application } from '#core/Application';
import { logger } from '#core/logging';
import { Scene } from '#core/Scene';
import { SceneDirector } from '#core/SceneDirector';
import { SceneState } from '#core/SceneState';
import type { SceneConstructor } from '#core/SceneTypes';
import { DuplicateSceneRegistrationError, UnregisteredSceneError } from '#core/SceneTypes';
import { Signal } from '#core/Signal';
import { Time } from '#core/Time';
import type { Pointer } from '#input/Pointer';
import { Rectangle } from '#math/Rectangle';
import type { Vector } from '#math/Vector';

interface InputManagerStub {
  readonly onKeyDown: Signal<[number]>;
  readonly onKeyUp: Signal<[number]>;
  readonly onPointerEnter: Signal<[Pointer]>;
  readonly onPointerLeave: Signal<[Pointer]>;
  readonly onPointerDown: Signal<[Pointer]>;
  readonly onPointerMove: Signal<[Pointer]>;
  readonly onPointerUp: Signal<[Pointer]>;
  readonly onPointerTap: Signal<[Pointer]>;
  readonly onPointerSwipe: Signal<[Pointer]>;
  readonly onPointerCancel: Signal<[Pointer]>;
  readonly onMouseWheel: Signal<[Vector]>;
}

const createInputManagerStub = (): InputManagerStub => ({
  onKeyDown: new Signal<[number]>(),
  onKeyUp: new Signal<[number]>(),
  onPointerEnter: new Signal<[Pointer]>(),
  onPointerLeave: new Signal<[Pointer]>(),
  onPointerDown: new Signal<[Pointer]>(),
  onPointerMove: new Signal<[Pointer]>(),
  onPointerUp: new Signal<[Pointer]>(),
  onPointerTap: new Signal<[Pointer]>(),
  onPointerSwipe: new Signal<[Pointer]>(),
  onPointerCancel: new Signal<[Pointer]>(),
  onMouseWheel: new Signal<[Vector]>(),
});

const createApplicationStub = (): Application & {
  input: InputManagerStub;
  onError: Signal<[Error]>;
  loader: { _releaseScope: MockInstance };
  rendering: {
    backend: {
      view: { getBounds: () => Rectangle };
      draw: MockInstance;
    };
    render: MockInstance;
  };
  backend: {
    view: { getBounds: () => Rectangle };
    draw: MockInstance;
    stats: { culledNodes: number };
    resetStats: MockInstance;
  };
} => {
  const bounds = new Rectangle(0, 0, 320, 180);
  const backendMock = {
    view: {
      getBounds: () => bounds,
    },
    draw: vi.fn().mockReturnThis(),
    stats: { culledNodes: 0 },
    resetStats: vi.fn().mockReturnThis(),
  };

  return {
    loader: { _releaseScope: vi.fn() },
    input: createInputManagerStub(),
    interaction: { attachRoot: vi.fn(), detachRoot: vi.fn() },
    onError: new Signal<[Error]>(),
    rendering: {
      backend: backendMock,
      render: vi.fn(),
    },
    backend: backendMock,
  } as unknown as Application & {
    input: InputManagerStub;
    onError: Signal<[Error]>;
    loader: { _releaseScope: MockInstance };
    rendering: {
      backend: {
        view: { getBounds: () => Rectangle };
        draw: MockInstance;
      };
      render: MockInstance;
    };
    backend: {
      view: { getBounds: () => Rectangle };
      draw: MockInstance;
      stats: { culledNodes: number };
      resetStats: MockInstance;
    };
  };
};

// Mirrors the per-frame call sequence Application.update() makes on
// SceneDirector: logic update, draw, then the transition overlay last.
const tick = (manager: SceneDirector, app: ReturnType<typeof createApplicationStub>, milliseconds = 16): void => {
  const time = new Time(milliseconds);

  manager.update(time);
  manager.draw(app.rendering);
  manager._drawTransition(app.rendering, time);
};

type SceneHooks = Partial<Pick<Scene, 'load' | 'init' | 'update' | 'fixedUpdate' | 'draw' | 'unload' | 'destroy'>>;

// Registration key is fixed per constructor ("scene") — every test registers
// exactly the constructor(s) it needs against a fresh SceneDirector, so key
// collisions across tests never happen.
const makeSceneClass = (hooks: SceneHooks = {}): SceneConstructor<void> =>
  class extends Scene {
    public constructor() {
      super();
      Object.assign(this, hooks);
    }
  };

describe('SceneDirector', () => {
  test('keeps scene unset and cleans up when load() fails, without calling unload()', async () => {
    const unload = vi.fn(async () => undefined);
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');
    const FailScene = makeSceneClass({
      async load() {
        throw new Error('load failed');
      },
      unload,
    });
    const manager = new SceneDirector(createApplicationStub(), { fail: FailScene });
    const changeSpy = vi.fn();

    manager.onChangeScene.add(changeSpy);

    await expect(manager.setScene(FailScene)).rejects.toThrow('load failed');
    expect(manager.currentScene).toBeNull();
    // definition §16: unload() is never called for a scene that never completed activation.
    expect(unload).not.toHaveBeenCalled();
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(changeSpy).not.toHaveBeenCalled();

    destroySpy.mockRestore();
  });

  test('keeps scene unset and cleans up when init() fails, without calling unload()', async () => {
    const load = vi.fn(async () => undefined);
    const unload = vi.fn(async () => undefined);
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');
    const FailScene = makeSceneClass({
      load,
      init() {
        throw new Error('init failed');
      },
      unload,
    });
    const manager = new SceneDirector(createApplicationStub(), { fail: FailScene });
    const changeSpy = vi.fn();

    manager.onChangeScene.add(changeSpy);

    await expect(manager.setScene(FailScene)).rejects.toThrow('init failed');
    expect(manager.currentScene).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(unload).not.toHaveBeenCalled();
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(changeSpy).not.toHaveBeenCalled();

    destroySpy.mockRestore();
  });

  test('a failed activation reports cleanup-stage errors through the app error pipeline without masking the original error', async () => {
    const app = createApplicationStub();
    const FailScene = makeSceneClass({
      init() {
        throw new Error('init failed');
      },
      destroy() {
        throw new Error('user destroy failed');
      },
    });
    const manager = new SceneDirector(app, { fail: FailScene });
    const errorSpy = vi.fn();
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    app.onError.add(errorSpy);

    await expect(manager.setScene(FailScene)).rejects.toThrow('init failed');
    expect(manager.currentScene).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'user destroy failed' }));

    loggerErrorSpy.mockRestore();
  });

  test('does not leak unhandled rejections when destroy() unload fails, and reports it through the app error pipeline', async () => {
    const app = createApplicationStub();
    const unload = vi.fn(async () => {
      throw new Error('unload failed');
    });
    const OkScene = makeSceneClass({
      async load() {
        // noop
      },
      init() {
        // noop
      },
      unload,
    });
    const manager = new SceneDirector(app, { ok: OkScene });
    const errorSpy = vi.fn();
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    app.onError.add(errorSpy);

    await manager.setScene(OkScene);
    manager.destroy();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(unload).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'unload failed' }));

    loggerErrorSpy.mockRestore();
  });

  test('setScene switches the active scene and ends the previous one permanently', async () => {
    const firstUnload = vi.fn(async () => undefined);
    const secondInit = vi.fn(() => undefined);
    const First = makeSceneClass({ unload: firstUnload });
    const Second = makeSceneClass({ init: secondInit });
    const manager = new SceneDirector(createApplicationStub(), { first: First, second: Second });

    await manager.setScene(First);
    const first = manager.currentScene;

    expect(first).toBeInstanceOf(First);

    await manager.setScene(Second);
    expect(manager.currentScene).toBeInstanceOf(Second);
    expect(firstUnload).toHaveBeenCalledTimes(1);
    expect(secondInit).toHaveBeenCalledTimes(1);
    expect(first?.attached).toBe(false);
  });

  test('fixedUpdate dispatches to the active scene', async () => {
    const fixedUpdate = vi.fn();
    const TestScene = makeSceneClass({ fixedUpdate });
    const manager = new SceneDirector(createApplicationStub(), { test: TestScene });

    await manager.setScene(TestScene);

    manager.fixedUpdate(new Time(16));
    expect(fixedUpdate).toHaveBeenCalledTimes(1);

    manager.fixedUpdate(new Time(16));
    expect(fixedUpdate).toHaveBeenCalledTimes(2);
  });

  test('setScene always creates a fresh instance, even for the same constructor (definition §11.4)', async () => {
    const init = vi.fn(() => undefined);
    const unload = vi.fn(async () => undefined);
    const TestScene = makeSceneClass({ init, unload });
    const manager = new SceneDirector(createApplicationStub(), { test: TestScene });

    await manager.setScene(TestScene);
    const firstInstance = manager.currentScene;

    await manager.setScene(TestScene);
    const secondInstance = manager.currentScene;

    expect(init).toHaveBeenCalledTimes(2);
    expect(unload).toHaveBeenCalledTimes(1);
    expect(secondInstance).not.toBe(firstInstance);
    expect(firstInstance?.attached).toBe(false);
  });

  test('_clearScene() clears the active scene', async () => {
    const unload = vi.fn(async () => undefined);
    const TestScene = makeSceneClass({ unload });
    const manager = new SceneDirector(createApplicationStub(), { test: TestScene });

    await manager.setScene(TestScene);
    await manager._clearScene();

    expect(manager.currentScene).toBeNull();
    expect(unload).toHaveBeenCalledTimes(1);
  });

  test('rejects setScene() targeting an unregistered constructor', async () => {
    class UnregisteredScene extends Scene {}
    const manager = new SceneDirector(createApplicationStub(), {});

    await expect(manager.setScene(UnregisteredScene)).rejects.toThrow(UnregisteredSceneError);
  });

  test('UnregisteredSceneError lists all registered scene names', async () => {
    const RegisteredA = makeSceneClass();
    const RegisteredB = makeSceneClass();
    class Unregistered extends Scene {}
    const manager = new SceneDirector(createApplicationStub(), { a: RegisteredA, b: RegisteredB });

    try {
      await manager.setScene(Unregistered);
      expect.unreachable('setScene should have rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(UnregisteredSceneError);
      expect((error as UnregisteredSceneError).registeredNames).toEqual(['a', 'b']);
      expect((error as UnregisteredSceneError).constructorName).toBe('Unregistered');
    }
  });

  test('constructor throws DuplicateSceneRegistrationError naming both conflicting keys', () => {
    const DupScene = makeSceneClass();

    try {
      new SceneDirector(createApplicationStub(), { first: DupScene, second: DupScene });
      expect.unreachable('constructor should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DuplicateSceneRegistrationError);
      expect((error as DuplicateSceneRegistrationError).keys).toEqual(['first', 'second']);
    }
  });

  test('active scene updates, ticks its systems, and draws every frame', async () => {
    const app = createApplicationStub();
    const update = vi.fn();
    const draw = vi.fn();
    const systemUpdate = vi.fn();
    const TestScene = makeSceneClass({ update, draw });
    const manager = new SceneDirector(app, { test: TestScene });

    await manager.setScene(TestScene);
    manager.currentScene?.systems.add({ update: systemUpdate });

    tick(manager, app);
    expect(update).toHaveBeenCalledTimes(1);
    expect(systemUpdate).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledTimes(1);

    tick(manager, app);
    expect(update).toHaveBeenCalledTimes(2);
    expect(systemUpdate).toHaveBeenCalledTimes(2);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  test('fade transition runs and completes around setScene', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const manager = new SceneDirector(app, { first: First, second: Second });

    await manager.setScene(First);

    const transitionPromise = manager.setScene(Second, {
      transition: {
        type: 'fade',
        duration: 100,
      },
    });
    let transitionSettled = false;

    void transitionPromise.then(() => {
      transitionSettled = true;
    });

    tick(manager, app, 50);
    expect(manager.currentScene).toBeInstanceOf(First);

    tick(manager, app, 60);
    for (let i = 0; i < 64 && !transitionSettled; i++) {
      await Promise.resolve();
      tick(manager, app, 100);
    }

    expect(transitionSettled).toBe(true);
    await expect(transitionPromise).resolves.toBe(manager);
    expect(manager.currentScene).toBeInstanceOf(Second);
    expect(app.backend.draw).toHaveBeenCalled();
  });

  test('transition failure rejects and leaves manager in a valid state', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Failing = makeSceneClass({
      init() {
        throw new Error('transition target failed');
      },
    });
    const Fallback = makeSceneClass();
    const manager = new SceneDirector(app, { first: First, failing: Failing, fallback: Fallback });

    await manager.setScene(First);

    const transitionPromise = manager.setScene(Failing, {
      transition: {
        type: 'fade',
        duration: 60,
      },
    });

    tick(manager, app, 60);
    await Promise.resolve();

    await expect(transitionPromise).rejects.toThrow('transition target failed');
    expect(manager.currentScene).toBeInstanceOf(First);

    await expect(manager.setScene(Fallback)).resolves.toBe(manager);
    expect(manager.currentScene).toBeInstanceOf(Fallback);
  });

  test('passes the rendering context to scene.draw()', async () => {
    const app = createApplicationStub();
    let drawArg: unknown = null;
    const TestScene = makeSceneClass({
      draw(context): void {
        drawArg = context;
      },
    });
    const manager = new SceneDirector(app, { test: TestScene });

    await manager.setScene(TestScene);
    tick(manager, app);

    expect(drawArg).toBe(app.rendering);
  });

  test('fixedUpdate additionally dispatches the scene systems fixed-update phase', async () => {
    const fixedSystemUpdate = vi.fn();
    const TestScene = makeSceneClass();
    const manager = new SceneDirector(createApplicationStub(), { test: TestScene });

    await manager.setScene(TestScene);
    manager.currentScene?.systems.add({ fixedUpdate: fixedSystemUpdate });

    manager.fixedUpdate(new Time(16));
    expect(fixedSystemUpdate).toHaveBeenCalledTimes(1);

    manager.fixedUpdate(new Time(16));
    expect(fixedSystemUpdate).toHaveBeenCalledTimes(2);
  });

  test('pause() transitions Active to Paused, dispatches onPause and onStateChange, and stops update but not draw', async () => {
    const app = createApplicationStub();
    const update = vi.fn();
    const draw = vi.fn();
    const TestScene = makeSceneClass({ update, draw });
    const director = new SceneDirector(app, { test: TestScene });
    const onPause = vi.fn();
    const onStateChange = vi.fn();

    director.onPause.add(onPause);
    director.onStateChange.add(onStateChange);

    await director.setScene(TestScene);
    const scene = director.currentScene;

    expect(director.pause()).toBe(true);
    expect(director.state).toBe(SceneState.Paused);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledWith(scene);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Active, SceneState.Paused, scene);

    tick(director, app);
    expect(update).not.toHaveBeenCalled();
    expect(draw).toHaveBeenCalledTimes(1);
  });

  test('pause() is a no-op when no scene is active', () => {
    const director = new SceneDirector(createApplicationStub(), {});

    expect(director.pause()).toBe(false);
    expect(director.state).toBeNull();
  });

  test('pause() is a no-op when the active scene is already paused', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const director = new SceneDirector(app, { test: TestScene });
    const onPause = vi.fn();

    await director.setScene(TestScene);
    director.pause();
    director.onPause.add(onPause);

    expect(director.pause()).toBe(false);
    expect(onPause).not.toHaveBeenCalled();
  });

  test('resume() transitions Paused back to Active, dispatches onResume and onStateChange, and restores update', async () => {
    const app = createApplicationStub();
    const update = vi.fn();
    const TestScene = makeSceneClass({ update });
    const director = new SceneDirector(app, { test: TestScene });
    const onResume = vi.fn();
    const onStateChange = vi.fn();

    await director.setScene(TestScene);
    const scene = director.currentScene;

    director.pause();

    director.onResume.add(onResume);
    director.onStateChange.add(onStateChange);

    expect(director.resume()).toBe(true);
    expect(director.state).toBe(SceneState.Active);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledWith(scene);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Paused, SceneState.Active, scene);

    tick(director, app);
    expect(update).toHaveBeenCalledTimes(1);
  });

  test('resume() is a no-op when the active scene is not paused', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const director = new SceneDirector(app, { test: TestScene });
    const onResume = vi.fn();

    await director.setScene(TestScene);
    director.onResume.add(onResume);

    expect(director.resume()).toBe(false);
    expect(onResume).not.toHaveBeenCalled();
  });

  test('state getter reflects the active scope and is null once cleared', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const director = new SceneDirector(app, { test: TestScene });

    expect(director.state).toBeNull();

    await director.setScene(TestScene);
    expect(director.state).toBe(SceneState.Active);

    await director._clearScene();
    expect(director.state).toBeNull();
  });

  test('_transitionGateOpen is true only while a fade transition is in flight, including on failure', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const OtherScene = makeSceneClass();
    const manager = new SceneDirector(app, { test: TestScene, other: OtherScene });

    await manager.setScene(TestScene);
    expect((manager as unknown as { _transitionGateOpen: boolean })._transitionGateOpen).toBe(false);

    const transitionPromise = manager.setScene(OtherScene, {
      transition: { type: 'fade', duration: 60 },
    });

    expect((manager as unknown as { _transitionGateOpen: boolean })._transitionGateOpen).toBe(true);

    tick(manager, app, 60);
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
      tick(manager, app, 60);
    }
    await transitionPromise;

    expect((manager as unknown as { _transitionGateOpen: boolean })._transitionGateOpen).toBe(false);
  });

  test('_transitionGateOpen closes even when the transition target fails to activate', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const FailScene = makeSceneClass({
      init() {
        throw new Error('boom');
      },
    });
    const manager = new SceneDirector(app, { test: TestScene, fail: FailScene });

    await manager.setScene(TestScene);

    const transitionPromise = manager.setScene(FailScene, {
      transition: { type: 'fade', duration: 60 },
    });

    tick(manager, app, 60);
    await Promise.resolve();

    await expect(transitionPromise).rejects.toThrow('boom');
    expect((manager as unknown as { _transitionGateOpen: boolean })._transitionGateOpen).toBe(false);
  });
});
