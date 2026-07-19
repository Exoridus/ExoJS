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
});
