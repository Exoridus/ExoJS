import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { SceneManager } from '#core/SceneManager';
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
    loader: {},
    input: createInputManagerStub(),
    interaction: { attachRoot: vi.fn(), detachRoot: vi.fn() },
    rendering: {
      backend: backendMock,
      render: vi.fn(),
    },
    backend: backendMock,
  } as unknown as Application & {
    input: InputManagerStub;
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

const tick = (manager: SceneManager, milliseconds = 16): void => {
  manager.update(new Time(milliseconds));
};

type SceneHooks = Partial<Pick<Scene, 'load' | 'init' | 'update' | 'fixedUpdate' | 'draw' | 'unload'>>;

const makeScene = (hooks: SceneHooks = {}): Scene => Object.assign(new Scene(), hooks);

describe('SceneManager', () => {
  test('keeps scene unset and cleans up when load() fails', async () => {
    const manager = new SceneManager(createApplicationStub());
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
    expect(unload).toHaveBeenCalledTimes(1);
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(scene.app).toBeNull();
    expect(changeSpy).not.toHaveBeenCalled();
  });

  test('keeps scene unset and cleans up when init() fails', async () => {
    const manager = new SceneManager(createApplicationStub());
    const load = vi.fn(async () => undefined);
    const unload = vi.fn(async () => undefined);
    const scene = makeScene({
      load,
      async init() {
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
    expect(unload).toHaveBeenCalledTimes(1);
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(scene.app).toBeNull();
    expect(changeSpy).not.toHaveBeenCalled();
  });

  test('surfaces both init and cleanup errors when recovery unload fails', async () => {
    const manager = new SceneManager(createApplicationStub());
    const scene = makeScene({
      async init() {
        throw new Error('init failed');
      },
      async unload() {
        throw new Error('cleanup failed');
      },
    });
    const destroySpy = vi.spyOn(scene, 'destroy');

    await expect(manager.setScene(scene)).rejects.toThrow('Failed to initialize scene: init failed. Cleanup also failed: cleanup failed.');
    expect(manager.currentScene).toBeNull();
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(scene.app).toBeNull();
  });

  test('does not leak unhandled rejections when destroy() unload fails', async () => {
    const manager = new SceneManager(createApplicationStub());
    const unload = vi.fn(async () => {
      throw new Error('unload failed');
    });
    const scene = makeScene({
      async load() {
        // noop
      },
      async init() {
        // noop
      },
      unload,
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await manager.setScene(scene);
    manager.destroy();
    await Promise.resolve();
    await Promise.resolve();

    expect(unload).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('[ExoJS:scene]', 'SceneManager.destroy() failed to unload the active scene.', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  test('setScene switches the active scene and unloads the previous one', async () => {
    const manager = new SceneManager(createApplicationStub());
    const firstUnload = vi.fn(async () => undefined);
    const secondInit = vi.fn(async () => undefined);
    const first = makeScene({ unload: firstUnload });
    const second = makeScene({ init: secondInit });

    await manager.setScene(first);
    expect(manager.currentScene).toBe(first);

    await manager.setScene(second);
    expect(manager.currentScene).toBe(second);
    expect(firstUnload).toHaveBeenCalledTimes(1);
    expect(secondInit).toHaveBeenCalledTimes(1);
  });

  test('fixedUpdate dispatches to the active scene unless it is paused', async () => {
    const manager = new SceneManager(createApplicationStub());
    const fixedUpdate = vi.fn();
    const scene = makeScene({ fixedUpdate });

    await manager.setScene(scene);

    manager.fixedUpdate(new Time(16));
    expect(fixedUpdate).toHaveBeenCalledTimes(1);

    scene.paused = true;
    manager.fixedUpdate(new Time(16));
    expect(fixedUpdate).toHaveBeenCalledTimes(1); // paused → skipped
  });

  test('setScene to the already-active scene is a no-op', async () => {
    const manager = new SceneManager(createApplicationStub());
    const init = vi.fn(async () => undefined);
    const unload = vi.fn(async () => undefined);
    const scene = makeScene({ init, unload });

    await manager.setScene(scene);
    await manager.setScene(scene);

    expect(init).toHaveBeenCalledTimes(1);
    expect(unload).toHaveBeenCalledTimes(0);
    expect(manager.currentScene).toBe(scene);
  });

  test('setScene(null) clears the active scene', async () => {
    const manager = new SceneManager(createApplicationStub());
    const unload = vi.fn(async () => undefined);
    const scene = makeScene({ unload });

    await manager.setScene(scene);
    await manager.setScene(null);

    expect(manager.currentScene).toBeNull();
    expect(unload).toHaveBeenCalledTimes(1);
  });

  test('paused scene skips update and systems but keeps drawing', async () => {
    const manager = new SceneManager(createApplicationStub());
    const update = vi.fn();
    const draw = vi.fn();
    const scene = makeScene({ update, draw });
    const tickSystems = vi.spyOn(scene, '_tickSystems');

    await manager.setScene(scene);
    tick(manager);
    expect(update).toHaveBeenCalledTimes(1);
    expect(tickSystems).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledTimes(1);

    scene.paused = true;
    tick(manager);
    expect(update).toHaveBeenCalledTimes(1);
    expect(tickSystems).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledTimes(2);

    scene.paused = false;
    tick(manager);
    expect(update).toHaveBeenCalledTimes(2);
    expect(tickSystems).toHaveBeenCalledTimes(2);
    expect(draw).toHaveBeenCalledTimes(3);
  });

  test('fade transition runs and completes around setScene', async () => {
    const app = createApplicationStub();
    const manager = new SceneManager(app);
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

    tick(manager, 50);
    expect(manager.currentScene).toBe(first);

    tick(manager, 60);
    for (let i = 0; i < 64 && !transitionSettled; i++) {
      await Promise.resolve();
      tick(manager, 100);
    }

    expect(transitionSettled).toBe(true);
    await expect(transitionPromise).resolves.toBe(manager);
    expect(manager.currentScene).toBe(second);
    expect(app.backend.draw).toHaveBeenCalled();
  });

  test('transition failure rejects and leaves manager in a valid state', async () => {
    const manager = new SceneManager(createApplicationStub());
    const first = makeScene({});
    const failing = makeScene({
      async init() {
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

    tick(manager, 60);
    await Promise.resolve();

    await expect(transitionPromise).rejects.toThrow('transition target failed');
    expect(manager.currentScene).toBe(first);

    await expect(manager.setScene(fallback)).resolves.toBe(manager);
    expect(manager.currentScene).toBe(fallback);
  });

  test('passes the rendering context to scene.draw()', async () => {
    const app = createApplicationStub();
    const manager = new SceneManager(app);
    let drawArg: unknown = null;
    const scene = makeScene({
      draw(context): void {
        drawArg = context;
      },
    });

    await manager.setScene(scene);
    tick(manager);

    expect(drawArg).toBe(app.rendering);
  });
});
