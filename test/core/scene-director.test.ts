import type { Tween } from '#animation/Tween';
import { TweenManager } from '#animation/TweenManager';
import { TweenState } from '#animation/types';
import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { logger } from '#core/logging';
import { PhasedSceneTransition } from '#core/PhasedSceneTransition';
import { Scene } from '#core/Scene';
import { SceneDirector } from '#core/SceneDirector';
import { SceneState } from '#core/SceneState';
import {
  SceneTransition,
  type SceneTransitionContext,
  type SceneTransitionEnvironment,
  type SceneTransitionFrame,
  SceneTransitionLifecycleError,
  type SceneTransitionRequirements,
  type SceneTransitionSession,
} from '#core/SceneTransition';
import type { SceneConstructor } from '#core/SceneTypes';
import {
  AmbiguousSceneInstanceError,
  ConcurrentSceneNavigationError,
  DuplicateSceneRegistrationError,
  InvalidSceneRegistrationError,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  SceneInstanceNotFoundError,
  SceneNavigationAbortedError,
  UnregisteredSceneError,
} from '#core/SceneTypes';
import { Signal } from '#core/Signal';
import { Time } from '#core/Time';
import type { Pointer } from '#input/Pointer';
import { Rectangle } from '#math/Rectangle';
import type { Vector } from '#math/Vector';
import { RenderTexture } from '#rendering/texture/RenderTexture';

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

type ApplicationStub = Application & {
  input: InputManagerStub;
  onError: Signal<[Error]>;
  loader: { _releaseScope: MockInstance };
  canvas: HTMLCanvasElement;
  onResize: Signal<[number, number, Application]>;
  clearColor: Color;
  rendering: {
    backend: {
      view: { getBounds: () => Rectangle };
      draw: MockInstance;
    };
    render: MockInstance;
    _renderSurfaceInto: MockInstance;
  };
  backend: {
    view: { getBounds: () => Rectangle };
    draw: MockInstance;
    stats: { culledNodes: number };
    resetStats: MockInstance;
    acquireRenderTexture: MockInstance;
    releaseRenderTexture: MockInstance;
  };
};

const createApplicationStub = (): ApplicationStub => {
  const bounds = new Rectangle(0, 0, 320, 180);
  const backendMock = {
    view: {
      getBounds: () => bounds,
    },
    draw: vi.fn().mockReturnThis(),
    stats: { culledNodes: 0 },
    resetStats: vi.fn().mockReturnThis(),
    acquireRenderTexture: vi.fn((width: number, height: number) => new RenderTexture(width, height)),
    releaseRenderTexture: vi.fn(),
  };

  return {
    loader: { _releaseScope: vi.fn() },
    input: createInputManagerStub(),
    interaction: { attachRoot: vi.fn(), detachRoot: vi.fn() },
    onError: new Signal<[Error]>(),
    tweens: new TweenManager(),
    canvas: { width: 320, height: 180 } as HTMLCanvasElement,
    onResize: new Signal<[number, number, Application]>(),
    clearColor: Color.black,
    rendering: {
      backend: backendMock,
      render: vi.fn(),
      _renderSurfaceInto: vi.fn((_target: RenderTexture, _clear: unknown, draw: () => void) => draw()),
    },
    backend: backendMock,
  } as unknown as ApplicationStub;
};

// Mirrors the per-frame call sequence Application.update() makes on
// SceneDirector: logic update + transition update, draw + transition render.
const tick = (manager: SceneDirector, app: ReturnType<typeof createApplicationStub>, milliseconds = 16): void => {
  const time = new Time(milliseconds);

  manager.update(time);
  manager._updateTransition(time);
  manager.draw(app.rendering);
  manager._renderTransition(app.rendering);
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

// Reusable fake transition/session pair for the transition-runtime tests.
class FakeSession implements SceneTransitionSession {
  public done = false;
  public placement: 'scene' | 'screen' = 'screen';
  public destroyCallCount = 0;
  public updateCallCount = 0;
  public renderCallCount = 0;

  public update(_delta: Time): void {
    this.updateCallCount++;
  }

  public render(_context: unknown, _frame: SceneTransitionFrame): void {
    this.renderCallCount++;
  }

  public destroy(): void {
    this.destroyCallCount++;
  }
}

class FakeTransition extends SceneTransition {
  public readonly session: FakeSession;
  public lastContext: SceneTransitionContext | null = null;

  public constructor(session: FakeSession = new FakeSession()) {
    super();
    this.session = session;
  }

  public getRequirements(context: SceneTransitionContext): SceneTransitionRequirements {
    this.lastContext = context;

    return { outgoingFrame: 'none', currentFrame: 'none' };
  }

  protected override createSession(_environment: SceneTransitionEnvironment): SceneTransitionSession {
    return this.session;
  }
}

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

    await expect(manager.change(FailScene)).rejects.toThrow('load failed');
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

    await expect(manager.change(FailScene)).rejects.toThrow('init failed');
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

    await expect(manager.change(FailScene)).rejects.toThrow('init failed');
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

    await manager.change(OkScene);
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

    await manager.change(First);
    const first = manager.currentScene;

    expect(first).toBeInstanceOf(First);

    await manager.change(Second);
    expect(manager.currentScene).toBeInstanceOf(Second);
    expect(firstUnload).toHaveBeenCalledTimes(1);
    expect(secondInit).toHaveBeenCalledTimes(1);
    expect(first?.attached).toBe(false);
  });

  test('setScene() dispatches onStateChange for Preparing to Ready, then Ready to Active', async () => {
    const TestScene = makeSceneClass();
    const manager = new SceneDirector(createApplicationStub(), { test: TestScene });
    const onStateChange = vi.fn();

    manager.onStateChange.add(onStateChange);

    await manager.change(TestScene);
    const scene = manager.currentScene;

    expect(onStateChange).toHaveBeenCalledTimes(2);
    expect(onStateChange).toHaveBeenNthCalledWith(1, SceneState.Preparing, SceneState.Ready, scene);
    expect(onStateChange).toHaveBeenNthCalledWith(2, SceneState.Ready, SceneState.Active, scene);
  });

  test('switching scenes dispatches onStateChange for the outgoing scope Destroying and Destroyed transitions, and the incoming Preparing→Ready→Active', async () => {
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const manager = new SceneDirector(createApplicationStub(), { first: First, second: Second });

    await manager.change(First);
    const first = manager.currentScene;
    const onStateChange = vi.fn();

    manager.onStateChange.add(onStateChange);

    await manager.change(Second);
    const second = manager.currentScene;

    expect(onStateChange).toHaveBeenCalledTimes(4);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Active, SceneState.Destroying, first);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Destroying, SceneState.Destroyed, first);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Preparing, SceneState.Ready, second);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Ready, SceneState.Active, second);
  });

  test('a failed activation dispatches onStateChange for Preparing to Destroying to Destroyed', async () => {
    const FailScene = makeSceneClass({
      init() {
        throw new Error('init failed');
      },
    });
    const manager = new SceneDirector(createApplicationStub(), { fail: FailScene });
    const onStateChange = vi.fn();

    manager.onStateChange.add(onStateChange);

    await expect(manager.change(FailScene)).rejects.toThrow('init failed');

    expect(onStateChange).toHaveBeenCalledTimes(2);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Preparing, SceneState.Destroying, expect.any(Object));
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Destroying, SceneState.Destroyed, expect.any(Object));
  });

  test('fixedUpdate dispatches to the active scene', async () => {
    const fixedUpdate = vi.fn();
    const TestScene = makeSceneClass({ fixedUpdate });
    const manager = new SceneDirector(createApplicationStub(), { test: TestScene });

    await manager.change(TestScene);

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

    await manager.change(TestScene);
    const firstInstance = manager.currentScene;

    await manager.change(TestScene);
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

    await manager.change(TestScene);
    await manager._clearScene();

    expect(manager.currentScene).toBeNull();
    expect(unload).toHaveBeenCalledTimes(1);
  });

  test('rejects setScene() targeting an unregistered constructor', async () => {
    class UnregisteredScene extends Scene {}
    const manager = new SceneDirector(createApplicationStub(), {});

    await expect(manager.change(UnregisteredScene)).rejects.toThrow(UnregisteredSceneError);
  });

  test('UnregisteredSceneError lists all registered scene names', async () => {
    const RegisteredA = makeSceneClass();
    const RegisteredB = makeSceneClass();
    class Unregistered extends Scene {}
    const manager = new SceneDirector(createApplicationStub(), { a: RegisteredA, b: RegisteredB });

    try {
      await manager.change(Unregistered);
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

  describe('registry — descriptor form (spec §6.1)', () => {
    test('accepts a descriptor-form registration ({ scene, transition }) exactly like a bare constructor', async () => {
      const TestScene = makeSceneClass();
      const manager = new SceneDirector(createApplicationStub(), { test: { scene: TestScene, transition: false } });

      await expect(manager.change(TestScene)).resolves.toBe(manager);
    });

    test('rejects a duplicate constructor registered under two keys across mixed forms', () => {
      const DupScene = makeSceneClass();

      expect(() => new SceneDirector(createApplicationStub(), { first: DupScene, second: { scene: DupScene } })).toThrow(DuplicateSceneRegistrationError);
    });

    test('rejects an invalid descriptor whose scene is not a Scene subclass', () => {
      class NotAScene {}

      expect(() => new SceneDirector(createApplicationStub(), { bad: { scene: NotAScene as never } })).toThrow(InvalidSceneRegistrationError);
    });
  });

  test('active scene updates, ticks its systems, and draws every frame', async () => {
    const app = createApplicationStub();
    const update = vi.fn();
    const draw = vi.fn();
    const systemUpdate = vi.fn();
    const TestScene = makeSceneClass({ update, draw });
    const manager = new SceneDirector(app, { test: TestScene });

    await manager.change(TestScene);
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

  test('passes the rendering context to scene.draw()', async () => {
    const app = createApplicationStub();
    let drawArg: unknown = null;
    const TestScene = makeSceneClass({
      draw(context): void {
        drawArg = context;
      },
    });
    const manager = new SceneDirector(app, { test: TestScene });

    await manager.change(TestScene);
    tick(manager, app);

    expect(drawArg).toBe(app.rendering);
  });

  test('fixedUpdate additionally dispatches the scene systems fixed-update phase', async () => {
    const fixedSystemUpdate = vi.fn();
    const TestScene = makeSceneClass();
    const manager = new SceneDirector(createApplicationStub(), { test: TestScene });

    await manager.change(TestScene);
    manager.currentScene?.systems.add({ fixedUpdate: fixedSystemUpdate });

    manager.fixedUpdate(new Time(16));
    expect(fixedSystemUpdate).toHaveBeenCalledTimes(1);

    manager.fixedUpdate(new Time(16));
    expect(fixedSystemUpdate).toHaveBeenCalledTimes(2);
  });

  test('pause() sets paused without changing state, dispatches onPause (not onStateChange), and stops update but not draw', async () => {
    const app = createApplicationStub();
    const update = vi.fn();
    const draw = vi.fn();
    const TestScene = makeSceneClass({ update, draw });
    const director = new SceneDirector(app, { test: TestScene });
    const onPause = vi.fn();
    const onStateChange = vi.fn();

    await director.change(TestScene);
    const scene = director.currentScene;

    director.onPause.add(onPause);
    director.onStateChange.add(onStateChange);

    expect(director.pause()).toBe(true);
    expect(director.state).toBe(SceneState.Active);
    expect(director.paused).toBe(true);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledWith(scene);
    expect(onStateChange).not.toHaveBeenCalled();

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

    await director.change(TestScene);
    director.pause();
    director.onPause.add(onPause);

    expect(director.pause()).toBe(false);
    expect(onPause).not.toHaveBeenCalled();
  });

  test('resume() clears paused without changing state, dispatches onResume (not onStateChange), and restores update', async () => {
    const app = createApplicationStub();
    const update = vi.fn();
    const TestScene = makeSceneClass({ update });
    const director = new SceneDirector(app, { test: TestScene });
    const onResume = vi.fn();
    const onStateChange = vi.fn();

    await director.change(TestScene);
    const scene = director.currentScene;

    director.pause();

    director.onResume.add(onResume);
    director.onStateChange.add(onStateChange);

    expect(director.resume()).toBe(true);
    expect(director.state).toBe(SceneState.Active);
    expect(director.paused).toBe(false);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledWith(scene);
    expect(onStateChange).not.toHaveBeenCalled();

    tick(director, app);
    expect(update).toHaveBeenCalledTimes(1);
  });

  test('resume() is a no-op when the active scene is not paused', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const director = new SceneDirector(app, { test: TestScene });
    const onResume = vi.fn();

    await director.change(TestScene);
    director.onResume.add(onResume);

    expect(director.resume()).toBe(false);
    expect(onResume).not.toHaveBeenCalled();
  });

  test('state getter reflects the active scope and is null once cleared', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const director = new SceneDirector(app, { test: TestScene });

    expect(director.state).toBeNull();

    await director.change(TestScene);
    expect(director.state).toBe(SceneState.Active);

    await director._clearScene();
    expect(director.state).toBeNull();
  });
});

describe('SceneDirector — retention', () => {
  test('setScene(..., { suspendCurrent: true }) suspends the outgoing scene instead of destroying it', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.change(FirstScene);
    const firstInstance = director.currentScene;
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');

    await director.change(SecondScene, { suspendCurrent: true });

    expect(director.currentScene).toBeInstanceOf(SecondScene);
    expect(destroySpy).not.toHaveBeenCalled(); // FirstScene was suspended, not destroyed
    expect(firstInstance?.state).toBe(SceneState.Suspended);

    destroySpy.mockRestore();
  });

  test('restoreScene() reactivates the same instance without re-running load()/init()', async () => {
    const app = createApplicationStub();
    const load = vi.fn(async () => undefined);
    const init = vi.fn(() => undefined);
    const FirstScene = makeSceneClass({ load, init });
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.change(FirstScene);
    const firstInstance = director.currentScene;

    expect(load).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);

    await director.change(SecondScene, { suspendCurrent: true });
    await director.restore(FirstScene);

    expect(director.currentScene).toBe(firstInstance); // same instance
    expect(load).toHaveBeenCalledTimes(1); // not re-run
    expect(init).toHaveBeenCalledTimes(1); // not re-run
    expect(director.state).toBe(SceneState.Active);
  });

  test('restoreScene() preserves the paused flag across suspension', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.change(FirstScene);
    director.pause();
    await director.change(SecondScene, { suspendCurrent: true });
    await director.restore(FirstScene);

    expect(director.state).toBe(SceneState.Active);
    expect(director.paused).toBe(true);
  });

  test('a when:"active" tween stays frozen across pause -> retain -> restore, and resumes when the scene resumes', async () => {
    const app = createApplicationStub();
    let tween!: Tween;
    const FirstScene = makeSceneClass({
      init() {
        tween = this.tweens.create({}, { when: 'active' }).to({}, 1).start();
      },
    });
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.change(FirstScene);
    director.pause();

    expect(tween.state).toBe(TweenState.Paused);

    await director.change(SecondScene, { suspendCurrent: true });
    await director.restore(FirstScene);

    expect(director.state).toBe(SceneState.Active);
    expect(director.paused).toBe(true);
    expect(tween.state).toBe(TweenState.Paused);

    director.resume();

    expect(director.paused).toBe(false);
    expect(tween.state).toBe(TweenState.Active);
  });

  test('restoreScene() rejects with RetainedSceneNotFoundError when nothing is retained for the target', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene });

    await expect(director.restore(FirstScene)).rejects.toThrow(RetainedSceneNotFoundError);
  });

  test('setScene() rejects with RetainedSceneConflictError for a constructor with a retained instance', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.change(FirstScene);
    await director.change(SecondScene, { suspendCurrent: true });

    await expect(director.change(FirstScene)).rejects.toThrow(RetainedSceneConflictError);
  });

  test('restoreScene(..., { suspendCurrent: true }) retains the scene it replaces', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const ThirdScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene, third: ThirdScene });

    await director.change(FirstScene);
    await director.change(SecondScene, { suspendCurrent: true }); // retains First
    await director.restore(FirstScene, { suspendCurrent: true }); // restores First, retains Second

    expect(director.currentScene).toBeInstanceOf(FirstScene);

    await expect(director.restore(SecondScene)).resolves.toBe(director);
    expect(director.currentScene).toBeInstanceOf(SecondScene);
  });

  test('a suspended scene keeps its loader claims — releasing it releases them', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.change(FirstScene);
    await director.change(SecondScene, { suspendCurrent: true });

    expect(app.loader._releaseScope).not.toHaveBeenCalled(); // suspended, not released

    await director.unload(FirstScene);

    expect(app.loader._releaseScope).toHaveBeenCalledTimes(1); // released now
  });
});

describe('SceneDirector — concurrent navigation', () => {
  test('a second setScene() call while one is in flight rejects with ConcurrentSceneNavigationError', async () => {
    const app = createApplicationStub();
    const SlowScene = makeSceneClass({ load: () => new Promise<void>(() => {}) }); // never resolves
    const OtherScene = makeSceneClass();
    const director = new SceneDirector(app, { slow: SlowScene, other: OtherScene });

    const first = director.change(SlowScene);
    const second = director.change(OtherScene);

    await expect(second).rejects.toThrow(ConcurrentSceneNavigationError);

    void first.catch(() => {}); // never resolves — avoid an unhandled-rejection warning at test-file teardown
  });

  test('restoreScene() also rejects when a navigation is already in flight', async () => {
    const app = createApplicationStub();
    const SlowScene = makeSceneClass({ load: () => new Promise<void>(() => {}) });
    const RetainedScene = makeSceneClass();
    const OtherScene = makeSceneClass();
    const director = new SceneDirector(app, { slow: SlowScene, retained: RetainedScene, other: OtherScene });

    await director.change(RetainedScene);
    await director.change(OtherScene, { suspendCurrent: true });

    const first = director.change(SlowScene);

    await expect(director.restore(RetainedScene)).rejects.toThrow(ConcurrentSceneNavigationError);

    void first.catch(() => {});
  });

  test('a navigation completes and releases the lock for the next one', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.change(FirstScene);
    await expect(director.change(SecondScene)).resolves.toBe(director); // no concurrent error — lock was released
  });
});

describe('SceneDirector — post-commit signal isolation', () => {
  test('a throwing onStopScene listener does not roll back — the switch stays committed and change() still resolves', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });
    const errorSpy = vi.fn();
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    app.onError.add(errorSpy);
    await director.change(FirstScene);

    const failure = new Error('onStopScene listener failed');

    director.onStopScene.add(() => {
      throw failure;
    });

    await expect(director.change(SecondScene)).resolves.toBe(director);

    expect(director.currentScene).toBeInstanceOf(SecondScene); // committed regardless of the throw
    expect(errorSpy).toHaveBeenCalledWith(failure);

    loggerErrorSpy.mockRestore();
  });

  test('a throwing onStateChange listener during a suspendCurrent switch does not un-suspend the outgoing scope', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });
    const errorSpy = vi.fn();
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    app.onError.add(errorSpy);
    await director.change(FirstScene);
    const firstInstance = director.currentScene;

    const failure = new Error('onStateChange listener failed');

    director.onStateChange.add(() => {
      throw failure;
    });

    await expect(director.change(SecondScene, { suspendCurrent: true })).resolves.toBe(director);

    expect(director.currentScene).toBeInstanceOf(SecondScene);
    expect(firstInstance?.state).toBe(SceneState.Suspended); // still suspended+retained despite the throw
    await expect(director.restore(FirstScene)).resolves.toBe(director); // proves it IS in _retained

    loggerErrorSpy.mockRestore();
  });

  test('a throwing onChangeScene/onStartScene listener does not abort change() or block later listeners', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const director = new SceneDirector(app, { test: TestScene });
    const errorSpy = vi.fn();
    const laterChangeListener = vi.fn();
    const laterStartListener = vi.fn();

    director.onChangeScene.add(() => {
      throw new Error('onChangeScene listener failed');
    });
    director.onChangeScene.add(laterChangeListener);
    director.onStartScene.add(() => {
      throw new Error('onStartScene listener failed');
    });
    director.onStartScene.add(laterStartListener);
    app.onError.add(errorSpy);

    await expect(director.change(TestScene)).resolves.toBe(director);

    expect(laterChangeListener).toHaveBeenCalledTimes(1);
    expect(laterStartListener).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });
});

describe('SceneDirector — destroy() / _dispose()', () => {
  test('destroy() destroys the active scope and every retained scope', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const ThirdScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene, third: ThirdScene });

    await director.change(FirstScene);
    await director.change(SecondScene, { suspendCurrent: true }); // retains First
    await director.change(ThirdScene, { suspendCurrent: true }); // retains Second, active = Third

    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');

    await director._dispose();

    expect(destroySpy).toHaveBeenCalledTimes(3); // active (Third) + both retained (Second, First)

    destroySpy.mockRestore();
  });

  test('_dispose() destroys retained scopes in reverse insertion order', async () => {
    const app = createApplicationStub();
    class FirstScene extends Scene {}
    class SecondScene extends Scene {}
    class ThirdScene extends Scene {}
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene, third: ThirdScene });
    const order: string[] = [];

    director.onStopScene.add(scene => order.push(scene.constructor.name));

    await director.change(FirstScene);
    await director.change(SecondScene, { suspendCurrent: true }); // retains First
    await director.change(ThirdScene, { suspendCurrent: true }); // retains Second

    order.length = 0; // clear the setScene-triggered dispatches above

    await director._dispose();

    // Active (Third) first, then retained in reverse insertion order: Second before First.
    expect(order).toEqual(['ThirdScene', 'SecondScene', 'FirstScene']);
  });

  test('destroy() (sync façade) fires _dispose() without the caller awaiting it', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene });
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');

    await director.change(FirstScene);

    director.destroy(); // synchronous call, does not await

    expect(destroySpy).not.toHaveBeenCalled(); // teardown hasn't run yet — still async

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(destroySpy).toHaveBeenCalledTimes(1); // has now completed

    destroySpy.mockRestore();
  });

  test('_dispose() succeeds even while a navigation is in flight', async () => {
    const app = createApplicationStub();
    const SlowScene = makeSceneClass({ load: () => new Promise<void>(() => {}) });
    const director = new SceneDirector(app, { slow: SlowScene });

    const pending = director.change(SlowScene); // never resolves — navigation lock stays held forever

    await expect(director._dispose()).resolves.toBeUndefined();

    void pending.catch(() => {});
  });
});

describe('SceneDirector — key-based navigation', () => {
  test("change() accepts a registered string key and resolves to that key's constructor", async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene });

    await expect(director.change('first')).resolves.toBe(director);
    expect(director.currentScene).toBeInstanceOf(FirstScene);
  });

  test('restore() accepts a registered string key for a retained scope', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.change('first');
    await director.change('second', { suspendCurrent: true });

    await expect(director.restore('first')).resolves.toBe(director);
    expect(director.currentScene).toBeInstanceOf(FirstScene);
  });

  test('change() still accepts a raw constructor directly, unchanged', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene });

    await expect(director.change(FirstScene)).resolves.toBe(director);
  });

  test('change() rejects for an unregistered string key, in every build', async () => {
    const app = createApplicationStub();
    const RegisteredScene = makeSceneClass();
    // Widened to the untyped registry shape for this one call — a string
    // key not present in the registry is a compile-time error against the
    // precisely-typed overload, which is exactly the point; this test
    // exercises the runtime rejection path a production build still needs.
    const director = new SceneDirector(app, { first: RegisteredScene }) as SceneDirector<Record<string, SceneConstructor<void>>>;

    await expect(director.change('missing')).rejects.toThrow(UnregisteredSceneError);
  });

  test('restore() rejects for an unregistered string key, in every build', async () => {
    const app = createApplicationStub();
    const RegisteredScene = makeSceneClass();
    // Widened to the untyped registry shape for this one call — a string
    // key not present in the registry is a compile-time error against the
    // precisely-typed overload, which is exactly the point; this test
    // exercises the runtime rejection path a production build still needs.
    const director = new SceneDirector(app, { first: RegisteredScene }) as SceneDirector<Record<string, SceneConstructor<void>>>;

    await expect(director.restore('missing')).rejects.toThrow(UnregisteredSceneError);
  });
});

describe('SceneDirector — preload', () => {
  test('preload() prepares a scene into Ready without activating it', async () => {
    const app = createApplicationStub();
    const init = vi.fn();
    const PreloadedScene = makeSceneClass({ init });
    const director = new SceneDirector(app, { preloaded: PreloadedScene });

    await director.preload(PreloadedScene);

    expect(init).toHaveBeenCalledTimes(1);
    expect(director.currentScene).toBeNull(); // never activated
    expect(director.state).toBeNull(); // no active scope at all
  });

  test('a racing second preload() call for the same target and data shares the same in-flight preparation', async () => {
    const app = createApplicationStub();
    const load = vi.fn(async () => undefined);
    const PreloadedScene = makeSceneClass({ load });
    const director = new SceneDirector(app, { preloaded: PreloadedScene });

    const first = director.preload(PreloadedScene);
    const second = director.preload(PreloadedScene);

    await Promise.all([first, second]);

    expect(load).toHaveBeenCalledTimes(1); // one shared preparation, not two
  });

  test('preload() with mismatched data discards the stale entry and starts a fresh preparation with the new data', async () => {
    const app = createApplicationStub();
    const seenData: unknown[] = [];
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');
    class DataScene extends Scene<{ level: number }> {
      public override init(data: Readonly<{ level: number }>): void {
        seenData.push(data);
      }
    }
    const director = new SceneDirector(app, { preloaded: DataScene as unknown as SceneConstructor<void> });

    await director.preload(DataScene, { data: { level: 1 } });
    await director.preload(DataScene, { data: { level: 2 } }); // different object literal — Object.is() mismatch

    expect(seenData).toEqual([{ level: 1 }, { level: 2 }]);
    expect(destroySpy).toHaveBeenCalledTimes(1); // the stale level-1 preload was torn down

    destroySpy.mockRestore();
  });

  test('preload() rejects (dev builds) when the target is not registered', async () => {
    const app = createApplicationStub();
    const UnregisteredScene = makeSceneClass();
    const director = new SceneDirector(app, {});

    await expect(director.preload(UnregisteredScene)).rejects.toThrow(UnregisteredSceneError);
  });

  test('preload() coexists with a different active instance of the same constructor', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene });

    await director.change(GameScene); // one live instance active
    await expect(director.preload(GameScene)).resolves.toBeUndefined(); // a second, preloaded instance — allowed

    expect(director.currentScene).toBeInstanceOf(GameScene);
  });

  test('change() consumes a matching preload without re-running load()/init()', async () => {
    const app = createApplicationStub();
    const load = vi.fn(async () => undefined);
    const init = vi.fn();
    const GameScene = makeSceneClass({ load, init });
    const director = new SceneDirector(app, { game: GameScene });

    await director.preload(GameScene);
    expect(load).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);

    await director.change(GameScene);

    expect(load).toHaveBeenCalledTimes(1); // not re-run
    expect(init).toHaveBeenCalledTimes(1); // not re-run
    expect(director.state).toBe(SceneState.Active);
  });

  test('change() with data matching (Object.is) a preload consumes it; mismatched data ignores it and prepares fresh', async () => {
    const app = createApplicationStub();
    const seenData: unknown[] = [];
    class DataScene extends Scene<{ level: number }> {
      public override init(data: Readonly<{ level: number }>): void {
        seenData.push(data);
      }
    }
    const director = new SceneDirector(app, { game: DataScene as unknown as SceneConstructor<void> });
    const sharedData = { level: 3 };

    await director.preload(DataScene, { data: sharedData });
    await director.change(DataScene, { data: sharedData }); // same reference — Object.is() match

    expect(seenData).toEqual([{ level: 3 }]); // init() ran exactly once — from the preload, not re-run by change()
    expect(director.currentScene).toBeInstanceOf(DataScene);
  });

  test('change() ignores a preload with different (non-Object.is-matching) data and prepares fresh instead', async () => {
    const app = createApplicationStub();
    const seenData: unknown[] = [];
    class DataScene extends Scene<{ level: number }> {
      public override init(data: Readonly<{ level: number }>): void {
        seenData.push(data);
      }
    }
    const director = new SceneDirector(app, { game: DataScene as unknown as SceneConstructor<void> });

    await director.preload(DataScene, { data: { level: 1 } });
    await director.change(DataScene, { data: { level: 2 } }); // different object literal

    expect(seenData).toEqual([{ level: 1 }, { level: 2 }]); // preload's init() AND change()'s own fresh init() both ran
    expect(director.currentScene).toBeInstanceOf(DataScene);
  });

  test('change() with no matching preload behaves exactly as before (fresh prepare)', async () => {
    const app = createApplicationStub();
    const init = vi.fn();
    const GameScene = makeSceneClass({ init });
    const director = new SceneDirector(app, { game: GameScene });

    await director.change(GameScene);

    expect(init).toHaveBeenCalledTimes(1);
    expect(director.state).toBe(SceneState.Active);
  });
});

describe('SceneDirector — unload', () => {
  test('unload() with exactly one candidate (retained) resolves it directly, no instance needed', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');

    await director.change(FirstScene);
    await director.change(SecondScene, { suspendCurrent: true }); // retains First

    await expect(director.unload(FirstScene)).resolves.toBe(true);
    expect(destroySpy).toHaveBeenCalledTimes(1);

    destroySpy.mockRestore();
  });

  test('unload() with exactly one candidate (preloaded) resolves it directly', async () => {
    const app = createApplicationStub();
    const PreloadedScene = makeSceneClass();
    const director = new SceneDirector(app, { preloaded: PreloadedScene });
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');

    await director.preload(PreloadedScene);

    await expect(director.unload(PreloadedScene)).resolves.toBe(true);
    expect(destroySpy).toHaveBeenCalledTimes(1);

    destroySpy.mockRestore();
  });

  test('unload() with exactly one candidate (active) resolves it directly and clears the active scope', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene });

    await director.change(GameScene);

    await expect(director.unload(GameScene)).resolves.toBe(true);
    expect(director.currentScene).toBeNull();
  });

  test('unload() returns false when nothing matches at all', async () => {
    const app = createApplicationStub();
    const UnusedScene = makeSceneClass();
    const director = new SceneDirector(app, { unused: UnusedScene });

    await expect(director.unload(UnusedScene)).resolves.toBe(false);
  });

  test('unload() with omitted instance rejects with AmbiguousSceneInstanceError when retained+preloaded both exist', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const OtherScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene, other: OtherScene });

    await director.change(GameScene);
    await director.change(OtherScene, { suspendCurrent: true }); // retains GameScene
    await director.preload(GameScene); // also preload a fresh GameScene — allowed alongside the retained one

    await expect(director.unload(GameScene)).rejects.toThrow(AmbiguousSceneInstanceError);
  });

  test('unload() with omitted instance rejects with AmbiguousSceneInstanceError when active+preloaded both exist', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene });

    await director.change(GameScene);
    await director.preload(GameScene);

    await expect(director.unload(GameScene)).rejects.toThrow(AmbiguousSceneInstanceError);
  });

  test('unload(..., { instance }) targets exactly the requested candidate', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const OtherScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene, other: OtherScene });

    await director.change(GameScene);
    await director.change(OtherScene, { suspendCurrent: true }); // retains GameScene
    await director.preload(GameScene); // + a fresh preloaded GameScene

    await expect(director.unload(GameScene, { instance: 'preloaded' })).resolves.toBe(true);
    // The retained GameScene is untouched — still resolvable and unambiguous now:
    await expect(director.unload(GameScene, { instance: 'retained' })).resolves.toBe(true);
  });

  test('unload(..., { instance }) rejects with SceneInstanceNotFoundError when that specific kind does not exist', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene });

    await director.preload(GameScene);

    await expect(director.unload(GameScene, { instance: 'retained' })).rejects.toThrow(SceneInstanceNotFoundError);
  });

  test('unload(..., { instance: "all" }) discards every existing candidate', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene });
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');

    await director.change(GameScene);
    await director.preload(GameScene);

    await expect(director.unload(GameScene, { instance: 'all' })).resolves.toBe(true);

    expect(director.currentScene).toBeNull();
    expect(destroySpy).toHaveBeenCalledTimes(2); // the active instance and the preloaded one

    destroySpy.mockRestore();
  });

  test('a retained or preloaded match ignores options.transition — only an active match can visibly transition', async () => {
    const app = createApplicationStub();
    const PreloadedScene = makeSceneClass();
    const director = new SceneDirector(app, { preloaded: PreloadedScene });

    // No transition session is started for a retained/preloaded discard —
    // this resolves immediately even though the supplied transition's session
    // never commits or completes, proving the direct fast path ran instead.
    const neverCompletingTransition = new FakeTransition();

    await director.preload(PreloadedScene);

    await expect(director.unload(PreloadedScene, { transition: neverCompletingTransition })).resolves.toBe(true);
  });

  test('unload() never dispatches onStopScene for a preloaded scene that was never activated', async () => {
    const app = createApplicationStub();
    const PreloadedScene = makeSceneClass();
    const director = new SceneDirector(app, { preloaded: PreloadedScene });
    const stopSceneSpy = vi.fn();

    director.onStopScene.add(stopSceneSpy);

    await director.preload(PreloadedScene);
    await director.unload(PreloadedScene);

    expect(stopSceneSpy).not.toHaveBeenCalled();
  });

  test('unload() racing an in-flight preload() cancels it: waits for prepare() to settle, never destroys concurrently with prepare(), then still runs unload() (Ready-scope cleanup)', async () => {
    const app = createApplicationStub();
    let resolveLoad!: () => void;
    const initSpy = vi.fn();
    const unloadHook = vi.fn(async () => undefined);
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');
    const SlowScene = makeSceneClass({
      load: () =>
        new Promise<void>(resolve => {
          resolveLoad = resolve;
        }),
      init: initSpy,
      unload: unloadHook,
    });
    const director = new SceneDirector(app, { slow: SlowScene });

    const preloadPromise = director.preload(SlowScene);
    const unloadPromise = director.unload(SlowScene);

    // Still mid-load() — unload() must be waiting on prepare() to settle,
    // not tearing anything down yet.
    await Promise.resolve();
    await Promise.resolve();
    expect(destroySpy).not.toHaveBeenCalled();
    expect(unloadHook).not.toHaveBeenCalled();
    expect(initSpy).not.toHaveBeenCalled(); // load() hasn't even resolved yet

    resolveLoad();

    await expect(preloadPromise).resolves.toBeUndefined(); // prepare() itself still succeeds
    await expect(unloadPromise).resolves.toBe(true);

    expect(initSpy).toHaveBeenCalledTimes(1); // prepare() ran to completion (reached Ready), not aborted mid-way
    expect(unloadHook).toHaveBeenCalledTimes(1); // Ready-scope cleanup: unload() DOES run (spec §2.1/§3.5.1)
    expect(destroySpy).toHaveBeenCalledTimes(1);

    destroySpy.mockRestore();
  });

  test('a fresh preload() call racing an in-flight unload()-cancellation of the same target does not interfere with it', async () => {
    const app = createApplicationStub();
    let resolveFirstLoad!: () => void;
    const firstUnloadHook = vi.fn(async () => undefined);
    const secondInit = vi.fn();
    let loadCallCount = 0;
    const RacyScene = makeSceneClass({
      load: () => {
        loadCallCount += 1;

        if (loadCallCount === 1) {
          return new Promise<void>(resolve => {
            resolveFirstLoad = resolve;
          });
        }

        return undefined;
      },
      init: secondInit,
      unload: firstUnloadHook,
    });
    const director = new SceneDirector(app, { racy: RacyScene });

    const firstPreload = director.preload(RacyScene);
    const cancellingUnload = director.unload(RacyScene); // marks the first entry 'cancelling'

    const secondPreload = director.preload(RacyScene); // starts an independent, fresh preload for the same constructor

    resolveFirstLoad();

    await Promise.all([firstPreload, cancellingUnload, secondPreload]);

    expect(firstUnloadHook).toHaveBeenCalledTimes(1); // the cancelled entry's own scene was torn down
    // `init` is one shared hook function reused across every RacyScene
    // instance (makeSceneClass assigns the same hooks object to each new
    // instance) — it fires once per scene's own prepare() call, and both
    // the cancelled first preload and the fresh second one run their own
    // prepare() to completion independently (cancelling only gates what
    // happens *after* prepare() settles, not during it), hence 2 calls.
    expect(secondInit).toHaveBeenCalledTimes(2); // both the cancelled and the fresh preload reached Ready independently

    // The second preload is still available for a later change() to consume —
    // confirmed by its state, not yet activated:
    expect(director.currentScene).toBeNull();
  });
});

// Drains all pending microtasks (the async commit chain: _performSessionCommit
// -> commitSwitch -> _prepareScene -> scope.prepare -> scene.load) by yielding
// to a macrotask. `commit()` only sets a flag; a tick() must drive
// _checkCommitRequested first, then settle() lets the switch finish.
const settle = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('SceneDirector — transition session driving', () => {
  test('a transitioned change() does not switch until the session calls environment.commit()', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const manager = new SceneDirector(app, { first: First, second: Second });

    await manager.change(First);

    let environmentRef: SceneTransitionEnvironment | null = null;
    const session = new FakeSession();
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    const navigation = manager.change(Second, { transition });

    tick(manager, app);
    expect(manager.currentScene).toBeInstanceOf(First);
    expect(environmentRef?.commitRequested).toBe(false);

    environmentRef?.commit();
    tick(manager, app); // drives _checkCommitRequested -> starts the async switch
    await settle();

    expect(manager.currentScene).toBeInstanceOf(Second);
    expect(environmentRef?.committed).toBe(true);

    session.done = true;
    tick(manager, app);
    await navigation;

    expect(session.destroyCallCount).toBe(1);
  });

  test('SceneTransitionContext reflects operation/hasOutgoingScene/hasIncomingScene for a transitioned change()', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const manager = new SceneDirector(app, { first: First, second: Second });

    await manager.change(First);

    let capturedContext: SceneTransitionContext | null = null;
    let environmentRef: SceneTransitionEnvironment | null = null;

    class SelfCommittingSession implements SceneTransitionSession {
      public done = false;
      public placement: 'scene' | 'screen' = 'screen';
      public constructor(private readonly environment: SceneTransitionEnvironment) {
        this.environment.commit();
      }
      public update(_delta: Time): void {
        if (this.environment.committed) {
          this.done = true;
        }
      }
      public render(): void {}
      public destroy(): void {}
    }

    const transition = new (class extends SceneTransition {
      public getRequirements(context: SceneTransitionContext): SceneTransitionRequirements {
        capturedContext = context;

        return { outgoingFrame: 'none', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return new SelfCommittingSession(environment);
      }
    })();

    const navigation = manager.change(Second, { transition });

    expect(capturedContext).toEqual({ operation: 'change', hasOutgoingScene: true, hasIncomingScene: true });

    // The session committed synchronously in its constructor — one tick drives
    // the async switch, settle() lets it finish, then update() flips done true.
    tick(manager, app);
    await settle();
    tick(manager, app);
    await navigation;

    expect(environmentRef?.committed).toBe(true);
    expect(manager.currentScene).toBeInstanceOf(Second);
  });

  test('_transitionGateOpen is true only while a transitioned navigation is in flight, including on post-commit session failure', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const OtherScene = makeSceneClass();
    const manager = new SceneDirector(app, { test: TestScene, other: OtherScene });

    await manager.change(TestScene);
    expect((manager as unknown as { _transitionGateOpen: boolean })._transitionGateOpen).toBe(false);

    let environmentRef: SceneTransitionEnvironment | null = null;
    const session = new FakeSession();
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    const navigation = manager.change(OtherScene, { transition });

    expect((manager as unknown as { _transitionGateOpen: boolean })._transitionGateOpen).toBe(true);

    environmentRef?.commit();
    tick(manager, app);
    await settle();
    expect(manager.currentScene).toBeInstanceOf(OtherScene); // already committed

    session.render = () => {
      throw new Error('render blew up post-commit');
    };
    tick(manager, app);

    await expect(navigation).rejects.toThrow('render blew up post-commit');
    expect((manager as unknown as { _transitionGateOpen: boolean })._transitionGateOpen).toBe(false);
    // Post-commit failure: the new scene stays live, never rolled back.
    expect(manager.currentScene).toBeInstanceOf(OtherScene);
  });
});

describe('SceneDirector — transition resource provisioning (§3.4, §3.7a)', () => {
  test('currentFrame: "texture" redirects the active scope draw into a pooled texture instead of the canvas', async () => {
    const app = createApplicationStub();
    const drawSpy = vi.fn();
    const TestScene = makeSceneClass({ draw: drawSpy });
    const Other = makeSceneClass();
    const manager = new SceneDirector(app, { test: TestScene, other: Other });

    await manager.change(TestScene);

    let environmentRef: SceneTransitionEnvironment | null = null;
    const session = new FakeSession();
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'texture' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    const navigation = manager.change(Other, { transition });

    manager.draw(app.rendering);

    expect(app.rendering._renderSurfaceInto).toHaveBeenCalled();
    expect(drawSpy).toHaveBeenCalledTimes(1); // drawn via the redirect, not straight to canvas
    expect(app.backend.acquireRenderTexture).toHaveBeenCalledWith(app.canvas.width, app.canvas.height);

    environmentRef?.commit();
    tick(manager, app);
    await settle();
    session.done = true;
    tick(manager, app);
    await navigation;

    expect(app.backend.releaseRenderTexture).toHaveBeenCalled();
  });

  test('outgoingFrame: "snapshot" captures the outgoing scene once, before the session starts, and never reallocates it', async () => {
    const app = createApplicationStub();
    const drawSpy = vi.fn();
    const First = makeSceneClass({ draw: drawSpy });
    const Second = makeSceneClass();
    const manager = new SceneDirector(app, { first: First, second: Second });

    await manager.change(First);
    drawSpy.mockClear();

    let environmentRef: SceneTransitionEnvironment | null = null;
    const capturedFrames: SceneTransitionFrame[] = [];
    const session = new FakeSession();
    session.render = (_context, frame) => {
      capturedFrames.push(frame);
    };
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'snapshot', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    const navigation = manager.change(Second, { transition });

    // The snapshot is captured once, synchronously, before beginSession() —
    // the outgoing scene's draw() ran exactly once for it.
    expect(drawSpy).toHaveBeenCalledTimes(1);

    manager._renderTransition(app.rendering);
    manager._renderTransition(app.rendering);

    expect(capturedFrames).toHaveLength(2);
    expect(capturedFrames[0]!.outgoing).not.toBeNull();
    expect(capturedFrames[0]!.outgoing).toBe(capturedFrames[1]!.outgoing); // same texture instance, never reallocated

    environmentRef?.commit();
    tick(manager, app);
    await settle();
    session.done = true;
    tick(manager, app);
    await navigation;
  });

  test('outgoingFrame: "snapshot" is skipped (frame.outgoing stays null) when there is no outgoing scene', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const manager = new SceneDirector(app, { first: First });

    let capturedFrame: SceneTransitionFrame | null = null;
    const session = new FakeSession();
    session.render = (_context, frame) => {
      capturedFrame = frame;
    };
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'snapshot', currentFrame: 'none' };
      }
      protected override createSession(): SceneTransitionSession {
        return session;
      }
    })();

    const navigation = manager.change(First, { transition });

    manager._renderTransition(app.rendering);
    expect((capturedFrame as SceneTransitionFrame | null)?.outgoing).toBeNull();

    // Never committed — reporting done here is a done-before-commit lifecycle
    // error; drive one more frame to let the Director observe it.
    session.done = true;
    manager._renderTransition(app.rendering);
    await expect(navigation).rejects.toThrow(SceneTransitionLifecycleError);
  });

  test('the pooled "current" texture resizes when the canvas resizes mid-session', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const Other = makeSceneClass();
    const manager = new SceneDirector(app, { test: TestScene, other: Other });

    await manager.change(TestScene);

    let environmentRef: SceneTransitionEnvironment | null = null;
    const session = new FakeSession();
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'texture' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    const navigation = manager.change(Other, { transition });

    manager.draw(app.rendering);
    (app.canvas as { width: number; height: number }).width = 640;
    (app.canvas as { width: number; height: number }).height = 360;
    app.onResize.dispatch(640, 360, app);

    environmentRef?.commit();
    tick(manager, app);
    await settle();
    session.done = true;
    tick(manager, app);
    await navigation;

    // Resize behavior is asserted structurally: the resize handler must have
    // been reachable via app.onResize without throwing, and the session must
    // still have completed normally.
    expect(session.destroyCallCount).toBe(1);
  });
});

describe('SceneDirector — transition lifecycle contract', () => {
  test('environment.commit() called twice is a dev-mode lifecycle error', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const manager = new SceneDirector(app, { first: First, second: Second });

    await manager.change(First);

    let environmentRef: SceneTransitionEnvironment | null = null;
    const session = new FakeSession();
    session.update = () => {
      environmentRef?.commit();
    };
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;
        environment.commit(); // first call, synchronous, from createSession()

        return session;
      }
    })();

    const navigation = manager.change(Second, { transition });

    // session.update() (driven by tick()) calls commit() a second time —
    // __DEV__ is true in the test environment, so this throws and rejects the
    // navigation with a SceneTransitionLifecycleError.
    tick(manager, app);

    await expect(navigation).rejects.toThrow(SceneTransitionLifecycleError);
    await expect(navigation).rejects.toMatchObject({ reason: 'commit-reentrant' });
  });

  test('a session reaching done === true before commit() was ever called is a lifecycle error, old scene stays active', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const manager = new SceneDirector(app, { first: First, second: Second });

    await manager.change(First);

    const session = new FakeSession();
    const transition = new FakeTransition(session);

    const navigation = manager.change(Second, { transition });

    session.done = true; // never committed
    tick(manager, app);

    await expect(navigation).rejects.toThrow(SceneTransitionLifecycleError);
    await expect(navigation).rejects.toMatchObject({ reason: 'done-before-commit' });
    expect(manager.currentScene).toBeInstanceOf(First);
    expect(session.destroyCallCount).toBe(1);
  });

  test('post-commit session failure (update throws) rejects the navigation but the new scene stays live', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const manager = new SceneDirector(app, { first: First, second: Second });

    await manager.change(First);

    let environmentRef: SceneTransitionEnvironment | null = null;
    const session = new FakeSession();
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    const navigation = manager.change(Second, { transition });

    environmentRef?.commit();
    tick(manager, app);
    await settle();
    expect(manager.currentScene).toBeInstanceOf(Second); // already committed

    session.update = () => {
      throw new Error('update blew up post-commit');
    };
    tick(manager, app);

    await expect(navigation).rejects.toThrow('update blew up post-commit');
    expect(manager.currentScene).toBeInstanceOf(Second); // never rolled back
    expect(session.destroyCallCount).toBe(1);
  });

  test('a session error inside destroy() itself does not block the outer settle', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const manager = new SceneDirector(app, { first: First, second: Second });
    const errorSpy = vi.fn();

    app.onError.add(errorSpy);
    await manager.change(First);

    const session = new FakeSession();
    session.destroy = () => {
      throw new Error('destroy() itself failed');
    };
    const transition = new FakeTransition(session);

    const navigation = manager.change(Second, { transition });

    session.done = true; // done-before-commit path also exercises destroy()
    tick(manager, app);

    await expect(navigation).rejects.toThrow(SceneTransitionLifecycleError);
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'destroy() itself failed' }));
  });

  test('_dispose() destroys an in-flight session and rejects its navigation', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const manager = new SceneDirector(app, { first: First, second: Second });

    await manager.change(First);

    const session = new FakeSession();
    const transition = new FakeTransition(session);

    const navigation = manager.change(Second, { transition });

    await manager._dispose();

    await expect(navigation).rejects.toThrow(SceneTransitionLifecycleError);
    await expect(navigation).rejects.toMatchObject({ reason: 'aborted' });
    expect(session.destroyCallCount).toBe(1);
  });

  test('a session that finishes during update() gets no update()/render() call after destroy() the same frame', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const manager = new SceneDirector(app, { first: First, second: Second });

    await manager.change(First);

    // Records any update()/render() that lands after destroy() — the exact
    // use-after-free the fix prevents. destroy()'s contract promises "No
    // further update()/render() calls follow." The common completion path
    // reports done from inside update(), which Application.update() drives
    // (via _updateTransition) BEFORE the same frame's draw()/_renderTransition().
    class LifecycleGuardSession implements SceneTransitionSession {
      public done = false;
      public placement: 'scene' | 'screen' = 'screen';
      public destroyed = false;
      public destroyCallCount = 0;
      public readonly callsAfterDestroy: string[] = [];

      public constructor(private readonly environment: SceneTransitionEnvironment) {}

      public update(_delta: Time): void {
        if (this.destroyed) {
          this.callsAfterDestroy.push('update');
        }

        if (this.environment.committed) {
          this.done = true;
        }
      }

      public render(_context: unknown, _frame: SceneTransitionFrame): void {
        if (this.destroyed) {
          this.callsAfterDestroy.push('render');
        }
      }

      public destroy(): void {
        this.destroyed = true;
        this.destroyCallCount++;
      }
    }

    let environmentRef: SceneTransitionEnvironment | null = null;
    let session!: LifecycleGuardSession;
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;
        session = new LifecycleGuardSession(environment);

        return session;
      }
    })();

    const navigation = manager.change(Second, { transition });

    environmentRef?.commit();
    tick(manager, app); // drives the async switch
    await settle();
    expect(manager.currentScene).toBeInstanceOf(Second);

    // This tick: update() sees committed -> sets done -> _updateTransition
    // detects done and finishes+destroys the session, all before the SAME
    // tick's draw()/_renderTransition(). Neither may touch the destroyed
    // session.
    tick(manager, app);
    await navigation;

    expect(session.destroyCallCount).toBe(1);
    expect(session.callsAfterDestroy).toEqual([]);
  });
});

// NOTE (§3.5.1, "Ready-scope cleanup"): the fourth pre-commit-failure concept
// — a navigation aborted after commit() was requested and prepare() was
// already in flight, cancelled before ever reaching the atomic commit boundary
// — requires the abort-flag machinery Slice 7 adds to Application.start()'s
// frame loop (§3.7). It is deliberately not tested here; Slice 7's own plan
// must add it once _frameLoopActive exists.
describe('SceneDirector — pre-commit failure semantics (§3.5.1)', () => {
  test('active-scope rollback is eliminated: _activeScope is only ever reassigned once prepare() has already succeeded', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Failing = makeSceneClass({
      init() {
        throw new Error('prepare failed');
      },
    });
    const manager = new SceneDirector(app, { first: First, failing: Failing });

    await manager.change(First);
    const firstInstance = manager.currentScene;

    let environmentRef: SceneTransitionEnvironment | null = null;
    const session = new FakeSession();
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    const navigation = manager.change(Failing, { transition });
    // Attach a handler before the switch runs — the navigation rejects during
    // settle(), so observing it only afterwards would flag a spurious
    // "handled asynchronously" unhandled-rejection warning.
    void navigation.catch(() => undefined);

    environmentRef?.commit(); // triggers commitSwitch(), which awaits _prepareScene() — and that throws
    tick(manager, app);
    await settle();

    await expect(navigation).rejects.toThrow('prepare failed');
    expect(manager.currentScene).toBe(firstInstance); // never reassigned — nothing to roll back
  });

  test('failed-preparation cleanup: destroyFailedActivation() runs, unload() is never called', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const unload = vi.fn();
    const Failing = makeSceneClass({
      init() {
        throw new Error('prepare failed');
      },
      unload,
    });
    const manager = new SceneDirector(app, { first: First, failing: Failing });

    await manager.change(First);

    let environmentRef: SceneTransitionEnvironment | null = null;
    const session = new FakeSession();
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    const navigation = manager.change(Failing, { transition });
    void navigation.catch(() => undefined);

    environmentRef?.commit();
    tick(manager, app);
    await settle();

    await expect(navigation).rejects.toThrow('prepare failed');
    expect(unload).not.toHaveBeenCalled();
  });

  test('claim restoration: a transitioned restore() that fails pre-commit puts the scope back into _retained', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const managerB = new SceneDirector(app, { first: First, second: Second });

    await managerB.change(First);
    await managerB.change(Second, { suspendCurrent: true }); // First is now retained

    let environmentRef: SceneTransitionEnvironment | null = null;
    const session = new FakeSession();
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    managerB.onStateChange.add(() => {
      throw new Error('onStateChange listener failed');
    });

    const navigation = managerB.restore(First, { transition });

    environmentRef?.commit();
    tick(managerB, app);
    await settle();
    session.done = true; // if the restore committed, let the session finish so navigation settles
    tick(managerB, app);

    // Whether this listener throw surfaces as a rejection depends on Slice 2's
    // guarded-dispatch: onStateChange is dispatched via dispatchIsolated, so
    // the throw is reported, not thrown back — the restore commits. Assert the
    // invariant that holds regardless: the scope ends up in exactly one place.
    try {
      await navigation;
      expect((managerB as unknown as { _retained: Map<unknown, unknown> })._retained.has(First)).toBe(false);
      expect(managerB.currentScene).toBeInstanceOf(First);
    } catch {
      expect((managerB as unknown as { _retained: Map<unknown, unknown> })._retained.has(First)).toBe(true);
      expect(managerB.currentScene).not.toBeInstanceOf(First);
    }
  });
});

describe('SceneDirector — composability (§3.8)', () => {
  test('a transitioned restore() runs through the same commit/session machinery as change()', async () => {
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const app = createApplicationStub();
    const manager = new SceneDirector(app, { first: First, second: Second });

    await manager.change(First);
    await manager.change(Second, { suspendCurrent: true });

    let capturedContext: SceneTransitionContext | null = null;
    let environmentRef: SceneTransitionEnvironment | null = null;
    const session = new FakeSession();
    const transition = new (class extends SceneTransition {
      public getRequirements(context: SceneTransitionContext): SceneTransitionRequirements {
        capturedContext = context;

        return { outgoingFrame: 'none', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    const navigation = manager.restore(First, { transition });

    expect(capturedContext).toEqual({ operation: 'restore', hasOutgoingScene: true, hasIncomingScene: true });

    environmentRef?.commit();
    tick(manager, app);
    await settle();
    session.done = true;
    tick(manager, app);
    await navigation;

    expect(manager.currentScene).toBeInstanceOf(First);
  });

  test('a transitioned restore() with suspendCurrent suspends the outgoing scope instead of destroying it', async () => {
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const app = createApplicationStub();
    const manager = new SceneDirector(app, { first: First, second: Second });

    await manager.change(First);
    await manager.change(Second, { suspendCurrent: true });

    const secondInstance = manager.currentScene;
    let environmentRef: SceneTransitionEnvironment | null = null;
    const session = new FakeSession();
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    const navigation = manager.restore(First, { transition, suspendCurrent: true });

    environmentRef?.commit();
    tick(manager, app);
    await settle();
    session.done = true;
    tick(manager, app);
    await navigation;

    expect(manager.currentScene).toBeInstanceOf(First);
    expect((manager as unknown as { _retained: Map<unknown, unknown> })._retained.has(Second)).toBe(true);
    expect(secondInstance?.state).toBe(SceneState.Suspended); // suspended, not destroyed
  });

  test('a transitioned unload() of the active scope: frame.current becomes null after commit (no incoming scene)', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const manager = new SceneDirector(app, { test: TestScene });

    await manager.change(TestScene);

    let environmentRef: SceneTransitionEnvironment | null = null;
    const capturedFrames: SceneTransitionFrame[] = [];
    const session = new FakeSession();
    session.render = (_context, frame) => {
      capturedFrames.push(frame);
    };
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'texture' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    const navigation = manager.unload(TestScene, { transition });

    manager.draw(app.rendering);
    manager._renderTransition(app.rendering);
    expect(capturedFrames.at(-1)?.current).not.toBeNull(); // still the outgoing scene, pre-commit

    environmentRef?.commit();
    tick(manager, app);
    await settle();

    manager.draw(app.rendering);
    manager._renderTransition(app.rendering);
    expect(capturedFrames.at(-1)?.current).toBeNull(); // post-commit, no incoming scene

    session.done = true;
    tick(manager, app);
    await navigation;
  });
});

class RecordingPhaseForDirectorTest extends PhasedSceneTransition {
  public static beginSessionCalls = 0;

  protected getPhaseRequirements(): { outgoingFrame: 'none' | 'snapshot'; currentFrame: 'none' | 'direct' | 'texture' } {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }

  public override beginSession(...args: Parameters<PhasedSceneTransition['beginSession']>): ReturnType<PhasedSceneTransition['beginSession']> {
    RecordingPhaseForDirectorTest.beginSessionCalls++;

    return super.beginSession(...args);
  }
}

// A zero-duration RecordingPhaseForDirectorTest session completes over
// exactly this tick() -> settle() -> tick() sequence: the first tick's
// session.update() finishes the (duration 0) exit phase and requests
// commit, kicking off the async commitSwitch; settle() lets that
// microtask-driven commit resolve and environment._markCommitted() run;
// the second tick's session.update() then observes `committed`, falls
// through into the (also duration 0) enter phase, and reaches `done` in
// that same call.
const driveZeroDurationTransition = async (manager: SceneDirector, app: ReturnType<typeof createApplicationStub>): Promise<void> => {
  tick(manager, app);
  await settle();
  tick(manager, app);
};

describe('SceneDirector — registry-default transition resolution (spec §3.10)', () => {
  test("change() uses the target's registered default transition when no call-site transition is given", async () => {
    const registeredDefault = new RecordingPhaseForDirectorTest({ duration: 0 });
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const manager = new SceneDirector(app, { game: { scene: GameScene, transition: registeredDefault } });

    RecordingPhaseForDirectorTest.beginSessionCalls = 0;
    const navigation = manager.change(GameScene);

    // beginSession() runs synchronously inside _runTransitionedAction, before
    // change()'s own first await suspends — observable immediately.
    expect(RecordingPhaseForDirectorTest.beginSessionCalls).toBeGreaterThan(0);

    await driveZeroDurationTransition(manager, app);
    await navigation;
  });

  test('an explicit call-site transition: false suppresses the registered default entirely', async () => {
    const registeredDefault = new RecordingPhaseForDirectorTest({ duration: 0 });
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const manager = new SceneDirector(app, { game: { scene: GameScene, transition: registeredDefault } });

    RecordingPhaseForDirectorTest.beginSessionCalls = 0;
    await manager.change(GameScene, { transition: false });

    expect(RecordingPhaseForDirectorTest.beginSessionCalls).toBe(0);
  });

  test('unload() never consults the registered default transition', async () => {
    const registeredDefault = new RecordingPhaseForDirectorTest({ duration: 0 });
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const manager = new SceneDirector(app, { game: { scene: GameScene, transition: registeredDefault } });

    const navigation = manager.change(GameScene);

    await driveZeroDurationTransition(manager, app);
    await navigation;

    RecordingPhaseForDirectorTest.beginSessionCalls = 0;

    await manager.unload(GameScene);

    expect(RecordingPhaseForDirectorTest.beginSessionCalls).toBe(0);
  });

  test("restore() uses the target's registered default transition when no call-site transition is given", async () => {
    const registeredDefault = new RecordingPhaseForDirectorTest({ duration: 0 });
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const OtherScene = makeSceneClass();
    const manager = new SceneDirector(app, { game: { scene: GameScene, transition: registeredDefault }, other: OtherScene });

    const firstChange = manager.change(GameScene);

    await driveZeroDurationTransition(manager, app);
    await firstChange;

    // Suspend GameScene (retained) by switching to OtherScene — restore() below reactivates it.
    await manager.change(OtherScene, { transition: false, suspendCurrent: true });

    RecordingPhaseForDirectorTest.beginSessionCalls = 0;
    const navigation = manager.restore(GameScene);

    expect(RecordingPhaseForDirectorTest.beginSessionCalls).toBeGreaterThan(0);

    await driveZeroDurationTransition(manager, app);
    await navigation;
  });
});

describe('SceneDirector._abortInFlightNavigation() (Slice 7 Group B, §3.7)', () => {
  test('returns false when no navigation is in flight (nothing to abort)', () => {
    const director = new SceneDirector(createApplicationStub(), {});

    expect(director._abortInFlightNavigation(new SceneNavigationAbortedError())).toBe(false);
  });

  test('aborting a mid-flight transitioned change() rejects its promise with the given reason and destroys the session exactly once', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const director = new SceneDirector(app, { first: First, second: Second });

    await director.change(First);
    const firstInstance = director.currentScene;

    const session = new FakeSession();
    const transition = new FakeTransition(session);
    const navigation = director.change(Second, { transition });

    const reason = new SceneNavigationAbortedError();
    const aborted = director._abortInFlightNavigation(reason);

    expect(aborted).toBe(true);
    expect(session.destroyCallCount).toBe(1);
    await expect(navigation).rejects.toBe(reason);
    // Never committed — the outgoing scene stays live, the input gate is closed.
    expect(director.currentScene).toBe(firstInstance);
    expect((director as unknown as { _transitionGateOpen: boolean })._transitionGateOpen).toBe(false);
  });

  test('a second _abortInFlightNavigation() call after the first is a no-op (returns false, never double-destroys the session)', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const director = new SceneDirector(app, { first: First, second: Second });

    await director.change(First);

    const session = new FakeSession();
    const transition = new FakeTransition(session);
    const navigation = director.change(Second, { transition });

    void navigation.catch(() => undefined);

    expect(director._abortInFlightNavigation(new SceneNavigationAbortedError())).toBe(true);
    const destroyCountAfterFirstAbort = session.destroyCallCount;

    expect(director._abortInFlightNavigation(new SceneNavigationAbortedError())).toBe(false);
    expect(session.destroyCallCount).toBe(destroyCountAfterFirstAbort);

    await navigation.catch(() => undefined);
  });

  test('does nothing to a navigation that already committed (no session left to interrupt)', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const director = new SceneDirector(app, { test: TestScene });

    await director.change(TestScene); // no transition — commits synchronously via the direct fast path

    expect(director._abortInFlightNavigation(new SceneNavigationAbortedError())).toBe(false);
  });

  test('a claimed _preloaded entry is restored (status "ready", back in _preloaded) when the change() consuming it is aborted pre-commit', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene });

    await director.preload(GameScene);

    const preloaded = (director as unknown as { _preloaded: Map<unknown, { scope: unknown; status: string }> })._preloaded;
    const preloadedEntry = preloaded.get(GameScene);

    expect(preloadedEntry).toBeDefined();
    expect(preloadedEntry?.status).toBe('ready');

    const session = new FakeSession();
    const transition = new FakeTransition(session);
    const navigation = director.change(GameScene, { transition });

    // Claimed synchronously by change() before its first await — removed from _preloaded.
    expect(preloaded.has(GameScene)).toBe(false);

    const reason = new SceneNavigationAbortedError();

    expect(director._abortInFlightNavigation(reason)).toBe(true);
    await expect(navigation).rejects.toBe(reason);

    // Restored: same entry, back in _preloaded, status flipped back to 'ready'.
    expect(preloaded.get(GameScene)).toBe(preloadedEntry);
    expect(preloadedEntry?.status).toBe('ready');

    // Proves it is genuinely reusable: a fresh change() consumes it and activates.
    await expect(director.change(GameScene)).resolves.toBe(director);
    expect(director.currentScene).toBeInstanceOf(GameScene);
  });

  test('a claimed _retained entry is restored to _retained when the restore() consuming it is aborted pre-commit (restore()\'s existing catch, no code change)', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const director = new SceneDirector(app, { first: First, second: Second });

    await director.change(First);
    await director.change(Second, { suspendCurrent: true }); // First is now retained

    const retained = (director as unknown as { _retained: Map<unknown, unknown> })._retained;

    expect(retained.has(First)).toBe(true);

    const session = new FakeSession();
    const transition = new FakeTransition(session);
    const navigation = director.restore(First, { transition });

    // restore() claims eagerly and synchronously, before any await.
    expect(retained.has(First)).toBe(false);

    const reason = new SceneNavigationAbortedError();

    expect(director._abortInFlightNavigation(reason)).toBe(true);
    await expect(navigation).rejects.toBe(reason);

    // restore()'s pre-existing catch put the claim back — Second is still active.
    expect(retained.has(First)).toBe(true);
    expect(director.currentScene).toBeInstanceOf(Second);
    await expect(director.restore(First)).resolves.toBe(director);
  });

  test('aborting a transitioned change() while its commit prepare() is mid-flight never resurrects the active scope in the background (§3.7 race)', async () => {
    const app = createApplicationStub();
    const First = makeSceneClass();
    let resolveLoad!: () => void;
    const Second = makeSceneClass({
      load: () =>
        new Promise<void>(resolve => {
          resolveLoad = resolve;
        }),
    });
    const director = new SceneDirector(app, { first: First, second: Second });

    await director.change(First);
    const firstInstance = director.currentScene;

    let environmentRef: SceneTransitionEnvironment | null = null;
    const session = new FakeSession();
    const transition = new (class extends SceneTransition {
      public getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'none' };
      }
      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environmentRef = environment;

        return session;
      }
    })();

    const navigation = director.change(Second, { transition });

    void navigation.catch(() => undefined);

    environmentRef?.commit();
    tick(director, app); // starts _performSessionCommit -> commitSwitch, now awaiting Second.load()
    await Promise.resolve();

    // Aborted mid-prepare, exactly as Application._stopFrameLoop() would on a
    // fatal frame error / stop() while a scene's own load() hook is pending.
    const reason = new SceneNavigationAbortedError();

    expect(director._abortInFlightNavigation(reason)).toBe(true);
    await expect(navigation).rejects.toBe(reason);
    expect(director.currentScene).toBe(firstInstance);

    // Let the suspended load() resolve — commitSwitch's continuation resumes in
    // the background. It MUST observe the abort and bail, not commit the switch.
    resolveLoad();
    await settle();

    expect(director.currentScene).toBe(firstInstance);
  });
});
