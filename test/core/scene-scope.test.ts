import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { SceneScope } from '#core/SceneScope';
import { SceneState } from '#core/SceneState';
import { Signal } from '#core/Signal';
import { Time } from '#core/Time';

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

describe('SceneScope', () => {
  describe('activation', () => {
    test('state is Preparing immediately after construction, before prepare() resolves', () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = new SceneScope(app, scene);

      expect(scope.state).toBe(SceneState.Preparing);
    });

    test('facility getters throw before attach, and become available from load() onward', async () => {
      const app = createAppStub();
      const events: string[] = [];

      class RecordingScene extends Scene {
        public override load(): void {
          events.push('load:facilities-available');
          // Touching every facility must not throw once attached.
          void this.systems;
          void this.loader;
          void this.inputs;
          void this.interaction;
          void this.tweens;
          void this.audio;
        }

        public override init(): void {
          events.push('init:facilities-available');
          void this.systems;
        }
      }

      const scene = new RecordingScene();

      expect(() => scene.systems).toThrow(/unavailable/);

      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);

      expect(events).toEqual(['load:facilities-available', 'init:facilities-available']);
    });

    test('runs load() then init() in order (definition §5.1), attaches roots, and dispatches onLoad only after both complete', async () => {
      const app = createAppStub();
      const events: string[] = [];

      class RecordingScene extends Scene {
        public override async load(): Promise<void> {
          events.push('load:start');
          await Promise.resolve();
          events.push('load:end');
        }

        public override init(): void {
          events.push('init');
        }
      }

      const scene = new RecordingScene();

      scene.onLoad.add(() => events.push('onLoad'));

      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);

      expect(events).toEqual(['load:start', 'load:end', 'init', 'onLoad']);
      expect(app.interaction.attachRoot).toHaveBeenCalledWith(scene.root);
    });

    test('the same data instance is passed to both load() and init()', async () => {
      const app = createAppStub();
      const seen: unknown[] = [];

      class DataScene extends Scene<{ readonly level: number }> {
        public override load(data: Readonly<{ readonly level: number }>): void {
          seen.push(data);
        }

        public override init(data: Readonly<{ readonly level: number }>): void {
          seen.push(data);
        }
      }

      const scene = new DataScene();
      const data = { level: 3 };
      const scope = new SceneScope(app, scene);

      await scope.prepare(data);

      expect(seen).toHaveLength(2);
      expect(seen[0]).toBe(data);
      expect(seen[1]).toBe(data);
    });

    test('activate() transitions Preparing to Active; frame methods only dispatch once Active', async () => {
      const app = createAppStub();
      const update = vi.fn();
      const scene = Object.assign(new Scene(), { update });
      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);

      scope.update(new Time(16));
      expect(update).not.toHaveBeenCalled(); // still Preparing

      scope.activate();
      expect(scope.state).toBe(SceneState.Active);

      scope.update(new Time(16));
      expect(update).toHaveBeenCalledTimes(1);
    });

    test('a synchronous init() (the common case) passes without a lifecycle error', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = new SceneScope(app, scene);

      await expect(scope.prepare(undefined)).resolves.toBeUndefined();
    });

    test('an async init() override fails activation with a clear lifecycle error', async () => {
      const app = createAppStub();
      const scene = Object.assign(new Scene(), {
        async init(): Promise<void> {
          /* never actually awaited by the engine */
        },
      });
      const scope = new SceneScope(app, scene);

      await expect(scope.prepare(undefined)).rejects.toThrow(/must be synchronous/);
    });
  });

  describe('failed-activation cleanup (definition §16)', () => {
    test('destroys engine-managed registrations, releases loader claims, calls scene.destroy(), but never unload()', async () => {
      const app = createAppStub();
      const unload = vi.fn();
      const scene = Object.assign(new Scene(), {
        init(): void {
          throw new Error('init failed');
        },
        unload,
      });
      const destroySpy = vi.spyOn(scene, 'destroy');
      const scope = new SceneScope(app, scene);

      await expect(scope.prepare(undefined)).rejects.toThrow('init failed');

      const systemsDestroySpy = vi.spyOn(scope.systems, 'destroy');
      const tweensDestroySpy = vi.spyOn(scope.tweens, 'destroy');
      const audioDestroySpy = vi.spyOn(scope.audio, 'destroy');
      const inputsDestroySpy = vi.spyOn(scope.inputs, 'destroy');
      const interactionDestroySpy = vi.spyOn(scope.interaction, 'destroy');

      scope.destroyFailedActivation();

      expect(systemsDestroySpy).toHaveBeenCalledTimes(1);
      expect(tweensDestroySpy).toHaveBeenCalledTimes(1);
      expect(audioDestroySpy).toHaveBeenCalledTimes(1);
      expect(inputsDestroySpy).toHaveBeenCalledTimes(1);
      expect(interactionDestroySpy).toHaveBeenCalledTimes(1);
      expect(app.loader._releaseScope).toHaveBeenCalledTimes(1);
      expect(destroySpy).toHaveBeenCalledTimes(1);
      expect(unload).not.toHaveBeenCalled();
      expect(scope.state).toBe(SceneState.Destroyed);
      // roots were never attached (prepare() never got that far) — nothing to detach.
      expect(app.interaction.detachRoot).not.toHaveBeenCalled();
    });

    test('is idempotent', async () => {
      const app = createAppStub();
      const scene = Object.assign(new Scene(), {
        init(): void {
          throw new Error('init failed');
        },
      });
      const destroySpy = vi.spyOn(scene, 'destroy');
      const scope = new SceneScope(app, scene);

      await expect(scope.prepare(undefined)).rejects.toThrow('init failed');

      scope.destroyFailedActivation();
      scope.destroyFailedActivation();

      expect(destroySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('permanent teardown (definition §17)', () => {
    const activate = async (app: Application, scene: Scene): Promise<SceneScope<void>> => {
      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);
      scope.activate();

      return scope;
    };

    test('runs in normative order: disable input/interaction, unload(), destroy systems, tweens+audio, inputs+interaction, detach roots, scene.destroy()+internals, loader claims last', async () => {
      const app = createAppStub();
      const events: string[] = [];
      const scene = new Scene();
      const scope = await activate(app, scene);

      vi.spyOn(scope.inputs, 'suspend').mockImplementation(() => events.push('inputs.suspend'));
      vi.spyOn(scope.interaction, 'suspend').mockImplementation(() => events.push('interaction.suspend'));
      scene.unload = async (): Promise<void> => {
        events.push('scene.unload');
      };
      vi.spyOn(scope.systems, 'destroy').mockImplementation(() => events.push('systems.destroy'));
      vi.spyOn(scope.tweens, 'destroy').mockImplementation(() => events.push('tweens.destroy'));
      vi.spyOn(scope.audio, 'destroy').mockImplementation(() => events.push('audio.destroy'));
      vi.spyOn(scope.inputs, 'destroy').mockImplementation(() => events.push('inputs.destroy'));
      vi.spyOn(scope.interaction, 'destroy').mockImplementation(() => events.push('interaction.destroy'));
      (app.interaction.detachRoot as MockInstance).mockImplementation(() => events.push('interaction.detachRoot'));
      scene.destroy = (): void => {
        events.push('scene.destroy');
      };
      (app.loader._releaseScope as MockInstance).mockImplementation(() => events.push('loader._releaseScope'));

      await scope.destroy();

      expect(events).toEqual([
        'inputs.suspend',
        'interaction.suspend',
        'scene.unload',
        'systems.destroy',
        'tweens.destroy',
        'audio.destroy',
        'inputs.destroy',
        'interaction.destroy',
        'interaction.detachRoot',
        'scene.destroy',
        'loader._releaseScope',
      ]);
      expect(scope.state).toBe(SceneState.Destroyed);
    });

    test('is idempotent — unload() and destroy() run at most once per activation', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const unload = vi.fn(async () => undefined);
      const scope = await activate(app, scene);

      scene.unload = unload;
      const destroySpy = vi.spyOn(scene, 'destroy');

      await scope.destroy();
      await scope.destroy();
      await scope.destroy();

      expect(unload).toHaveBeenCalledTimes(1);
      expect(destroySpy).toHaveBeenCalledTimes(1);
      expect(scope.state).toBe(SceneState.Destroyed);
    });

    test('a cleanup-stage error does not skip later stages, and is reported through the app error pipeline', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);
      const errorSpy = vi.fn();

      app.onError.add(errorSpy);

      scene.unload = async (): Promise<void> => {
        throw new Error('unload stage failed');
      };

      const loaderDestroySpy = app.loader._releaseScope as MockInstance;

      await scope.destroy();

      // Later stages still ran despite the unload() failure.
      expect(loaderDestroySpy).toHaveBeenCalledTimes(1);
      expect(scope.state).toBe(SceneState.Destroyed);
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'unload stage failed' }));
    });

    test('gates fixedUpdate/update/draw once Destroying — no dispatch after teardown starts', async () => {
      const app = createAppStub();
      const update = vi.fn();
      const scene = Object.assign(new Scene(), { update });
      const scope = await activate(app, scene);

      await scope.destroy();

      scope.update(new Time(16));
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('retention (definition §14)', () => {
    const activate = async (app: Application, scene: Scene): Promise<SceneScope<void>> => {
      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);
      scope.activate();

      return scope;
    };

    test('suspend() transitions Active to Suspended and suspends every facility except the loader', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);

      const inputsSuspendSpy = vi.spyOn(scope.inputs, 'suspend');
      const interactionSuspendSpy = vi.spyOn(scope.interaction, 'suspend');
      const tweensSuspendSpy = vi.spyOn(scope.tweens, 'suspend');
      const audioSuspendSpy = vi.spyOn(scope.audio, 'suspend');

      expect(scope.suspend()).toBe(true);

      expect(scope.state).toBe(SceneState.Suspended);
      expect(inputsSuspendSpy).toHaveBeenCalledTimes(1);
      expect(interactionSuspendSpy).toHaveBeenCalledTimes(1);
      expect(tweensSuspendSpy).toHaveBeenCalledTimes(1);
      expect(audioSuspendSpy).toHaveBeenCalledTimes(1);
    });

    test('suspend() from Paused records Paused as the pre-suspend state', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);

      scope.pause();
      expect(scope.suspend()).toBe(true);
      expect(scope.state).toBe(SceneState.Suspended);

      expect(scope.restore()).toBe(true);
      expect(scope.state).toBe(SceneState.Paused);
    });

    test('suspend() is a no-op outside Active/Paused', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = new SceneScope(app, scene); // still Preparing

      expect(scope.suspend()).toBe(false);
      expect(scope.state).toBe(SceneState.Preparing);
    });

    test('restore() returns to Active when suspended from Active', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);

      scope.suspend();

      const inputsResumeSpy = vi.spyOn(scope.inputs, 'resume');
      const interactionResumeSpy = vi.spyOn(scope.interaction, 'resume');
      const tweensResumeSpy = vi.spyOn(scope.tweens, 'resume');
      const audioResumeSpy = vi.spyOn(scope.audio, 'resume');

      expect(scope.restore()).toBe(true);

      expect(scope.state).toBe(SceneState.Active);
      expect(inputsResumeSpy).toHaveBeenCalledTimes(1);
      expect(interactionResumeSpy).toHaveBeenCalledTimes(1);
      expect(tweensResumeSpy).toHaveBeenCalledTimes(1);
      expect(audioResumeSpy).toHaveBeenCalledTimes(1);
    });

    test('restore() is a no-op outside Suspended', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);

      expect(scope.restore()).toBe(false);
      expect(scope.state).toBe(SceneState.Active);
    });

    test('fixedUpdate/update/draw never dispatch while Suspended', async () => {
      const app = createAppStub();
      const update = vi.fn();
      const draw = vi.fn();
      const scene = Object.assign(new Scene(), { update, draw });
      const scope = await activate(app, scene);

      scope.suspend();

      scope.fixedUpdate(new Time(16));
      scope.update(new Time(16));
      scope.draw({} as never);

      expect(update).not.toHaveBeenCalled();
      expect(draw).not.toHaveBeenCalled();
    });

    test('a facility suspend() failure never blocks the state transition or the other facilities, and is reported through the app error pipeline', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);
      const errorSpy = vi.fn();

      app.onError.add(errorSpy);

      vi.spyOn(scope.inputs, 'suspend').mockImplementation(() => {
        throw new Error('inputs suspend failed');
      });
      const interactionSuspendSpy = vi.spyOn(scope.interaction, 'suspend');

      expect(scope.suspend()).toBe(true);

      expect(scope.state).toBe(SceneState.Suspended);
      expect(interactionSuspendSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'inputs suspend failed' }));
    });

    test('suspend() then destroy() tears the scope down normally (retained-then-released path)', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);

      scope.suspend();

      await scope.destroy();

      expect(scope.state).toBe(SceneState.Destroyed);
    });
  });
});
