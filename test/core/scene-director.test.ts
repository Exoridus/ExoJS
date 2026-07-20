import type { Application } from '#core/Application';
import { logger } from '#core/logging';
import { Scene } from '#core/Scene';
import { SceneDirector } from '#core/SceneDirector';
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

type SceneHooks = Partial<Pick<Scene, 'load' | 'init' | 'update' | 'fixedUpdate' | 'draw' | 'unload'>>;

const makeScene = (hooks: SceneHooks = {}): Scene => Object.assign(new Scene(), hooks);

describe('SceneDirector', () => {
  test('keeps scene unset and cleans up when load() fails, without calling unload()', async () => {
    const manager = new SceneDirector(createApplicationStub());
    const unload = vi.fn(async () => undefined);
    const scene = makeScene({
      async load() {
        throw new Error('load failed');
      },
      unload,
    });
    const destroySpy = vi.spyOn(scene, 'destroy');
    const changeSpy = vi.fn();

    manager.onChangeScene.add(changeSpy);

    await expect(manager.setScene(scene)).rejects.toThrow('load failed');
    expect(manager.currentScene).toBeNull();
    // definition §16: unload() is never called for a scene that never completed activation.
    expect(unload).not.toHaveBeenCalled();
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(scene.attached).toBe(false);
    expect(changeSpy).not.toHaveBeenCalled();
  });

  test('keeps scene unset and cleans up when init() fails, without calling unload()', async () => {
    const manager = new SceneDirector(createApplicationStub());
    const load = vi.fn(async () => undefined);
    const unload = vi.fn(async () => undefined);
    const scene = makeScene({
      load,
      init() {
        throw new Error('init failed');
      },
      unload,
    });
    const destroySpy = vi.spyOn(scene, 'destroy');
    const changeSpy = vi.fn();

    manager.onChangeScene.add(changeSpy);

    await expect(manager.setScene(scene)).rejects.toThrow('init failed');
    expect(manager.currentScene).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(unload).not.toHaveBeenCalled();
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(scene.attached).toBe(false);
    expect(changeSpy).not.toHaveBeenCalled();
  });

  test('a failed activation reports cleanup-stage errors through the app error pipeline without masking the original error', async () => {
    const app = createApplicationStub();
    const manager = new SceneDirector(app);
    const scene = makeScene({
      init() {
        throw new Error('init failed');
      },
      destroy() {
        throw new Error('user destroy failed');
      },
    });
    const errorSpy = vi.fn();
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    app.onError.add(errorSpy);

    await expect(manager.setScene(scene)).rejects.toThrow('init failed');
    expect(manager.currentScene).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'user destroy failed' }));

    loggerErrorSpy.mockRestore();
  });

  test('does not leak unhandled rejections when destroy() unload fails, and reports it through the app error pipeline', async () => {
    const app = createApplicationStub();
    const manager = new SceneDirector(app);
    const unload = vi.fn(async () => {
      throw new Error('unload failed');
    });
    const scene = makeScene({
      async load() {
        // noop
      },
      init() {
        // noop
      },
      unload,
    });
    const errorSpy = vi.fn();
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    app.onError.add(errorSpy);

    await manager.setScene(scene);
    manager.destroy();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(unload).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'unload failed' }));

    loggerErrorSpy.mockRestore();
  });

  test('setScene switches the active scene and ends the previous one permanently', async () => {
    const manager = new SceneDirector(createApplicationStub());
    const firstUnload = vi.fn(async () => undefined);
    const secondInit = vi.fn(() => undefined);
    const first = makeScene({ unload: firstUnload });
    const second = makeScene({ init: secondInit });

    await manager.setScene(first);
    expect(manager.currentScene).toBe(first);

    await manager.setScene(second);
    expect(manager.currentScene).toBe(second);
    expect(firstUnload).toHaveBeenCalledTimes(1);
    expect(secondInit).toHaveBeenCalledTimes(1);
    expect(first.attached).toBe(false);
  });

  test('fixedUpdate dispatches to the active scene', async () => {
    const manager = new SceneDirector(createApplicationStub());
    const fixedUpdate = vi.fn();
    const scene = makeScene({ fixedUpdate });

    await manager.setScene(scene);

    manager.fixedUpdate(new Time(16));
    expect(fixedUpdate).toHaveBeenCalledTimes(1);

    manager.fixedUpdate(new Time(16));
    expect(fixedUpdate).toHaveBeenCalledTimes(2);
  });

  test('setScene to the already-active scene is a no-op', async () => {
    const manager = new SceneDirector(createApplicationStub());
    const init = vi.fn(() => undefined);
    const unload = vi.fn(async () => undefined);
    const scene = makeScene({ init, unload });

    await manager.setScene(scene);
    await manager.setScene(scene);

    expect(init).toHaveBeenCalledTimes(1);
    expect(unload).toHaveBeenCalledTimes(0);
    expect(manager.currentScene).toBe(scene);
  });

  test('setScene(null) clears the active scene', async () => {
    const manager = new SceneDirector(createApplicationStub());
    const unload = vi.fn(async () => undefined);
    const scene = makeScene({ unload });

    await manager.setScene(scene);
    await manager.setScene(null);

    expect(manager.currentScene).toBeNull();
    expect(unload).toHaveBeenCalledTimes(1);
  });

  test('active scene updates, ticks its systems, and draws every frame', async () => {
    const app = createApplicationStub();
    const manager = new SceneDirector(app);
    const update = vi.fn();
    const draw = vi.fn();
    const systemUpdate = vi.fn();
    const scene = makeScene({ update, draw });

    await manager.setScene(scene);
    scene.systems.add({ update: systemUpdate });

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
    const manager = new SceneDirector(app);
    const first = makeScene({});
    const second = makeScene({});

    await manager.setScene(first);

    const transitionPromise = manager.setScene(second, {
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
    expect(manager.currentScene).toBe(first);

    tick(manager, app, 60);
    for (let i = 0; i < 64 && !transitionSettled; i++) {
      await Promise.resolve();
      tick(manager, app, 100);
    }

    expect(transitionSettled).toBe(true);
    await expect(transitionPromise).resolves.toBe(manager);
    expect(manager.currentScene).toBe(second);
    expect(app.backend.draw).toHaveBeenCalled();
  });

  test('transition failure rejects and leaves manager in a valid state', async () => {
    const app = createApplicationStub();
    const manager = new SceneDirector(app);
    const first = makeScene({});
    const failing = makeScene({
      init() {
        throw new Error('transition target failed');
      },
    });
    const fallback = makeScene({});

    await manager.setScene(first);

    const transitionPromise = manager.setScene(failing, {
      transition: {
        type: 'fade',
        duration: 60,
      },
    });

    tick(manager, app, 60);
    await Promise.resolve();

    await expect(transitionPromise).rejects.toThrow('transition target failed');
    expect(manager.currentScene).toBe(first);

    await expect(manager.setScene(fallback)).resolves.toBe(manager);
    expect(manager.currentScene).toBe(fallback);
  });

  test('passes the rendering context to scene.draw()', async () => {
    const app = createApplicationStub();
    const manager = new SceneDirector(app);
    let drawArg: unknown = null;
    const scene = makeScene({
      draw(context): void {
        drawArg = context;
      },
    });

    await manager.setScene(scene);
    tick(manager, app);

    expect(drawArg).toBe(app.rendering);
  });

  test('fixedUpdate additionally dispatches the scene systems fixed-update phase', async () => {
    const manager = new SceneDirector(createApplicationStub());
    const fixedSystemUpdate = vi.fn();
    const scene = makeScene({});

    await manager.setScene(scene);
    scene.systems.add({ fixedUpdate: fixedSystemUpdate });

    manager.fixedUpdate(new Time(16));
    expect(fixedSystemUpdate).toHaveBeenCalledTimes(1);

    manager.fixedUpdate(new Time(16));
    expect(fixedSystemUpdate).toHaveBeenCalledTimes(2);
  });
});
