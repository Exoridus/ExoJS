import type { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneScope } from '#core/scene/SceneScope';
import { SceneState } from '#core/scene/SceneState';
import { Signal } from '#core/Signal';
import { Time } from '#core/units';

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

    test('runs load() then init() in order, ends in Ready — no facility attachment or Scene signal yet', async () => {
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

      scene.onActivate.add(() => events.push('onActivate'));

      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);

      expect(events).toEqual(['load:start', 'load:end', 'init']);
      expect(scope.state).toBe(SceneState.Ready);
      // Roots/onActivate are deferred to activate() - the Ready checkpoint
      // itself produces no application-wide effect.
      expect(app.interaction.attachRoot).not.toHaveBeenCalled();
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

    test('activate() transitions Ready to Active; frame methods only dispatch once Active', async () => {
      const app = createAppStub();
      const update = vi.fn();
      const scene = Object.assign(new Scene(), { update });
      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);
      expect(scope.state).toBe(SceneState.Ready);

      scope.update(Time.toSeconds(Time.milliseconds(16)));
      expect(update).not.toHaveBeenCalled(); // still Ready

      scope.activate();
      expect(scope.state).toBe(SceneState.Active);

      scope.update(Time.toSeconds(Time.milliseconds(16)));
      expect(update).toHaveBeenCalledTimes(1);
    });

    test('activate() attaches the scene root to interaction dispatch (deferred from prepare())', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);
      expect(app.interaction.attachRoot).not.toHaveBeenCalled();

      scope.activate();
      expect(app.interaction.attachRoot).toHaveBeenCalledWith(scene.root);
    });

    test('activate() dispatches Scene.onActivate after facility activation, before reporting the state change', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const events: string[] = [];
      const scope = new SceneScope(app, scene, () => events.push('onStateChange'));

      vi.spyOn(app.interaction, 'attachRoot').mockImplementation(() => events.push('attachRoot'));
      scene.onActivate.add(() => events.push('onActivate'));

      await scope.prepare(undefined);
      events.length = 0;
      scope.activate();

      expect(events).toEqual(['attachRoot', 'onActivate', 'onStateChange']);
    });

    test('prepare() reports Preparing to Ready, activate() reports Ready to Active, via the injected onStateChange callback', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const onStateChange = vi.fn();
      const scope = new SceneScope(app, scene, onStateChange);

      await scope.prepare(undefined);
      expect(onStateChange).toHaveBeenCalledTimes(1);
      expect(onStateChange).toHaveBeenNthCalledWith(1, SceneState.Preparing, SceneState.Ready);

      scope.activate();
      expect(onStateChange).toHaveBeenCalledTimes(2);
      expect(onStateChange).toHaveBeenNthCalledWith(2, SceneState.Ready, SceneState.Active);
    });

    test('a throwing Scene.onActivate listener is reported through the app error pipeline and does not block activation', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const errorSpy = vi.fn();

      app.onError.add(errorSpy);
      scene.onActivate.add(() => {
        throw new Error('onActivate listener failed');
      });

      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);
      scope.activate();

      expect(scope.state).toBe(SceneState.Active);
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'onActivate listener failed' }));
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

  describe('failed-activation cleanup', () => {
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
      // roots were never attached (prepare() never got that far) - nothing to detach.
      expect(app.interaction.detachRoot).not.toHaveBeenCalled();
    });

    test('releases loader claims after scene.destroy(), matching the successful teardown order', async () => {
      const app = createAppStub();
      const order: string[] = [];
      const scene = Object.assign(new Scene(), {
        init(): void {
          throw new Error('init failed');
        },
        destroy(): void {
          order.push('scene.destroy');
        },
      });
      const scope = new SceneScope(app, scene);

      await expect(scope.prepare(undefined)).rejects.toThrow('init failed');

      (app.loader._releaseScope as ReturnType<typeof vi.fn>).mockImplementation(() => {
        order.push('loader.release');
      });

      scope.destroyFailedActivation();

      // destroy() names "release loader claims last" as the normative order, so
      // a Scene.destroy() override reaching for this.loader must see the same
      // live claim scope whether activation succeeded or failed.
      expect(order).toEqual(['scene.destroy', 'loader.release']);
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

    test('reports Preparing to Destroying then Destroying to Destroyed via the injected onStateChange callback', async () => {
      const app = createAppStub();
      const scene = Object.assign(new Scene(), {
        init(): void {
          throw new Error('init failed');
        },
      });
      const onStateChange = vi.fn();
      const scope = new SceneScope(app, scene, onStateChange);

      await expect(scope.prepare(undefined)).rejects.toThrow('init failed');

      scope.destroyFailedActivation();

      expect(onStateChange).toHaveBeenCalledTimes(2);
      expect(onStateChange).toHaveBeenNthCalledWith(1, SceneState.Preparing, SceneState.Destroying);
      expect(onStateChange).toHaveBeenNthCalledWith(2, SceneState.Destroying, SceneState.Destroyed);
    });
  });

  describe('permanent teardown', () => {
    const activate = async (app: Application, scene: Scene): Promise<SceneScope<void>> => {
      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);
      scope.activate();

      return scope;
    };

    test('reports Active to Destroying then Destroying to Destroyed via the injected onStateChange callback', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const onStateChange = vi.fn();
      const scope = new SceneScope(app, scene, onStateChange);

      await scope.prepare(undefined);
      scope.activate();
      onStateChange.mockClear(); // only interested in destroy()'s own transitions here

      await scope.destroy();

      expect(onStateChange).toHaveBeenCalledTimes(2);
      expect(onStateChange).toHaveBeenNthCalledWith(1, SceneState.Active, SceneState.Destroying);
      expect(onStateChange).toHaveBeenNthCalledWith(2, SceneState.Destroying, SceneState.Destroyed);
    });

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
      vi.mocked(app.interaction.detachRoot).mockImplementation(() => {
        events.push('interaction.detachRoot');
      });
      scene.destroy = (): void => {
        events.push('scene.destroy');
      };
      vi.mocked(app.loader._releaseScope).mockImplementation(() => {
        events.push('loader._releaseScope');
      });

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

      const loaderDestroySpy = vi.mocked(app.loader._releaseScope);

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

      scope.update(Time.toSeconds(Time.milliseconds(16)));
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('retention', () => {
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
      const animationsSuspendSpy = vi.spyOn(scope.animations, 'suspend');

      expect(scope.suspend()).toBe(true);

      expect(scope.state).toBe(SceneState.Suspended);
      expect(inputsSuspendSpy).toHaveBeenCalledTimes(1);
      expect(interactionSuspendSpy).toHaveBeenCalledTimes(1);
      expect(tweensSuspendSpy).toHaveBeenCalledTimes(1);
      expect(audioSuspendSpy).toHaveBeenCalledTimes(1);
      expect(animationsSuspendSpy).toHaveBeenCalledTimes(1);
    });

    test('suspend() while paused preserves the paused flag across suspend/restore', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);

      scope.pause();
      expect(scope.suspend()).toBe(true);
      expect(scope.state).toBe(SceneState.Suspended);
      expect(scope.paused).toBe(true);

      expect(scope.restore()).toBe(true);
      expect(scope.state).toBe(SceneState.Active);
      expect(scope.paused).toBe(true);
    });

    test('suspend() is a no-op outside Active', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = new SceneScope(app, scene); // still Preparing

      expect(scope.suspend()).toBe(false);
      expect(scope.state).toBe(SceneState.Preparing);
    });

    test('suspend() dispatches Scene.onSuspend after facility suspension', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);
      const events: string[] = [];

      vi.spyOn(scope.interaction, 'suspend').mockImplementation(() => events.push('interaction.suspend'));
      scene.onSuspend.add(() => events.push('onSuspend'));

      scope.suspend();

      expect(events).toEqual(['interaction.suspend', 'onSuspend']);
    });

    test('restore() flushes pending audio and dispatches Scene.onActivate', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);
      const events: string[] = [];

      scope.suspend();

      vi.spyOn(scope.audio, '_flushPending').mockImplementation(() => events.push('audio._flushPending'));
      scene.onActivate.add(() => events.push('onActivate'));

      scope.restore();

      expect(events).toEqual(['audio._flushPending', 'onActivate']);
    });

    test('restore() returns to Active when suspended from Active', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);

      scope.suspend();

      const inputsResumeSpy = vi.spyOn(scope.inputs, 'resume');
      const interactionResumeSpy = vi.spyOn(scope.interaction, 'resume');
      const tweensRestoreSpy = vi.spyOn(scope.tweens, 'restore');
      const audioRestoreSpy = vi.spyOn(scope.audio, 'restore');

      expect(scope.restore()).toBe(true);

      expect(scope.state).toBe(SceneState.Active);
      expect(inputsResumeSpy).toHaveBeenCalledTimes(1);
      expect(interactionResumeSpy).toHaveBeenCalledTimes(1);
      expect(tweensRestoreSpy).toHaveBeenCalledTimes(1);
      expect(audioRestoreSpy).toHaveBeenCalledTimes(1);
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

      scope.fixedUpdate(Time.toSeconds(Time.milliseconds(16)));
      scope.update(Time.toSeconds(Time.milliseconds(16)));
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

    test('suspend() detaches the scene root from interaction, restore() reattaches it', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);

      scope.suspend();
      expect(app.interaction.detachRoot).toHaveBeenCalledWith(scope.scene.root);

      vi.mocked(app.interaction.attachRoot).mockClear();
      scope.restore();
      expect(app.interaction.attachRoot).toHaveBeenCalledWith(scope.scene.root);
    });
  });

  describe('pause()/resume()', () => {
    const activate = async (app: Application, scene: Scene): Promise<SceneScope<void>> => {
      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);
      scope.activate();

      return scope;
    };

    test('pause() sets paused without changing state, and dispatches scene.onPause', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);
      const onPause = vi.fn();

      scene.onPause.add(onPause);

      expect(scope.pause()).toBe(true);

      expect(scope.state).toBe(SceneState.Active);
      expect(scope.paused).toBe(true);
      expect(onPause).toHaveBeenCalledTimes(1);
    });

    test('pause() calls tweens.pause(), audio.pause() and animations.pause()', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);

      const tweensPauseSpy = vi.spyOn(scope.tweens, 'pause');
      const audioPauseSpy = vi.spyOn(scope.audio, 'pause');
      const animationsPauseSpy = vi.spyOn(scope.animations, 'pause');

      scope.pause();

      expect(tweensPauseSpy).toHaveBeenCalledTimes(1);
      expect(audioPauseSpy).toHaveBeenCalledTimes(1);
      expect(animationsPauseSpy).toHaveBeenCalledTimes(1);
    });

    test('resume() calls tweens.resume(), audio.resume() and animations.resume()', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);

      scope.pause();

      const tweensResumeSpy = vi.spyOn(scope.tweens, 'resume');
      const audioResumeSpy = vi.spyOn(scope.audio, 'resume');
      const animationsResumeSpy = vi.spyOn(scope.animations, 'resume');

      scope.resume();

      expect(tweensResumeSpy).toHaveBeenCalledTimes(1);
      expect(audioResumeSpy).toHaveBeenCalledTimes(1);
      expect(animationsResumeSpy).toHaveBeenCalledTimes(1);
    });

    test('pause() is a no-op outside Active, and a no-op when already paused', async () => {
      const app = createAppStub();
      const preparingScope = new SceneScope(app, new Scene()); // still Preparing

      expect(preparingScope.pause()).toBe(false);

      const scene = new Scene();
      const scope = await activate(app, scene);

      scope.pause();

      const onPause = vi.fn();
      scene.onPause.add(onPause);

      expect(scope.pause()).toBe(false);
      expect(onPause).not.toHaveBeenCalled();
    });

    test('resume() clears paused without changing state, and dispatches scene.onResume', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);

      scope.pause();

      const onResume = vi.fn();
      scene.onResume.add(onResume);

      expect(scope.resume()).toBe(true);

      expect(scope.state).toBe(SceneState.Active);
      expect(scope.paused).toBe(false);
      expect(onResume).toHaveBeenCalledTimes(1);
    });

    test('a throwing Scene.onPause listener is reported through the app error pipeline and does not propagate', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);
      const errorSpy = vi.fn();

      app.onError.add(errorSpy);
      scene.onPause.add(() => {
        throw new Error('onPause listener failed');
      });

      expect(() => scope.pause()).not.toThrow();

      expect(scope.paused).toBe(true);
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'onPause listener failed' }));
    });

    test('a throwing Scene.onResume listener is reported through the app error pipeline and does not propagate', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);
      const errorSpy = vi.fn();

      scope.pause();

      app.onError.add(errorSpy);
      scene.onResume.add(() => {
        throw new Error('onResume listener failed');
      });

      expect(() => scope.resume()).not.toThrow();

      expect(scope.paused).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'onResume listener failed' }));
    });

    test('resume() is a no-op when not currently paused', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);
      const onResume = vi.fn();

      scene.onResume.add(onResume);

      expect(scope.resume()).toBe(false);
      expect(onResume).not.toHaveBeenCalled();
    });
  });
});
