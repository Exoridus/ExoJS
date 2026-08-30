/**
 * `Application.stop()` against a REAL `SceneDirector` (no director mock): the
 * stop contract says the active scene is unloaded, and that must hold whether
 * or not a navigation happens to be in flight at the moment `stop()` is
 * called - transitioned or not. A stop is allowed to interrupt a navigation;
 * `ConcurrentSceneNavigationError` must never escape to the user for it.
 */
import { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { ConcurrentSceneNavigationError } from '#core/scene/sceneErrors';
import { SceneTransition, type SceneTransitionEnvironment, type SceneTransitionRequirements, type SceneTransitionSession } from '#core/scene/SceneTransition';
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

/** A session that never finishes on its own - commit is driven manually. */
class ManualSession implements SceneTransitionSession {
  public readonly placement = 'screen' as const;
  public done = false;
  public update(): void {
    // driven manually
  }
  public render(): void {
    // nothing to draw
  }
  public destroy(): void {
    // nothing to release
  }
}

class ManualTransition extends SceneTransition {
  public environment: SceneTransitionEnvironment | null = null;
  public readonly session = new ManualSession();

  public getRequirements(): SceneTransitionRequirements {
    return { outgoingFrame: 'none', currentFrame: 'none' };
  }

  protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
    this.environment = environment;

    return this.session;
  }
}

/** Flush enough microtask turns for every fire-and-forget teardown chain to settle. */
const settle = async (turns = 12): Promise<void> => {
  for (let turn = 0; turn < turns; turn++) {
    await Promise.resolve();
  }
};

describe('Application.stop() unloads the active scene regardless of an in-flight navigation', () => {
  let rafSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // No real frames: every test here drives the loop by hand (or not at all).
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1);
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  test('stop() with no navigation in flight unloads the active scene (happy path)', async () => {
    const unloaded = vi.fn();

    class TitleScene extends Scene {
      public override unload(): void {
        unloaded();
      }
    }

    const app = new Application({ backend: { type: 'webgl2' }, scenes: { title: TitleScene } });
    const errors: Error[] = [];

    app.onError.add(error => errors.push(error));

    try {
      await app.start(TitleScene);

      expect(app.scenes.currentScene).toBeInstanceOf(TitleScene);

      app.stop();
      await settle();

      expect(app.scenes.currentScene).toBeNull();
      expect(unloaded).toHaveBeenCalledTimes(1);
      expect(errors).toEqual([]);
    } finally {
      void app.destroy();
    }
  });

  test('stop() during a non-transitioned navigation still unloads the active scene and never surfaces ConcurrentSceneNavigationError', async () => {
    let releaseLoad: (() => void) | null = null;

    class TitleScene extends Scene {}
    class GameScene extends Scene {
      public override load(): Promise<void> {
        return new Promise<void>(resolve => {
          releaseLoad = resolve;
        });
      }
    }

    const app = new Application({ backend: { type: 'webgl2' }, scenes: { title: TitleScene, game: GameScene } });
    const errors: Error[] = [];

    app.onError.add(error => errors.push(error));

    try {
      await app.start(TitleScene);

      const title = app.scenes.currentScene;

      expect(title).toBeInstanceOf(TitleScene);

      // A plain change() - no transition, so there is no session for
      // `_abortInFlightNavigation()` to abort, yet the navigation lock IS
      // held while GameScene.load() hangs.
      const navigation = app.scenes.change(GameScene);
      const navigationOutcome = navigation.then(
        () => 'resolved',
        (error: unknown) => error,
      );

      await settle(2);
      expect(releaseLoad).not.toBeNull();

      app.stop();
      await settle();

      // The stop contract: the scene that was active is gone.
      expect(app.scenes.currentScene).toBeNull();
      expect(errors.some(error => error instanceof ConcurrentSceneNavigationError)).toBe(false);

      // The interrupted navigation neither commits nor resurrects a scene
      // once its own load() finally settles.
      releaseLoad!();
      await settle();

      expect(app.scenes.currentScene).toBeNull();
      expect(await navigationOutcome).not.toBe('resolved');
    } finally {
      void app.destroy();
    }
  });

  // `SceneScope.destroy()` funnels every teardown-stage failure into the app
  // error pipeline itself rather than rejecting, so what this pins is the
  // end-to-end guarantee: dropping `ConcurrentSceneNavigationError` from the
  // stop path did not also swallow genuine teardown failures. The director-level
  // "a rejecting disposal rejects _stopAndClearActiveScene()" case - the one
  // `Application.stop()`'s own catch handles - lives in scene-director.test.ts.
  test("a scene's own throwing unload() still surfaces through onError — only the concurrent-navigation rejection stopped being an error", async () => {
    const teardownError = new Error('unload blew up');

    class TitleScene extends Scene {
      public override unload(): void {
        throw teardownError;
      }
    }

    const app = new Application({ backend: { type: 'webgl2' }, scenes: { title: TitleScene } });
    const errors: Error[] = [];
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    app.onError.add(error => errors.push(error));

    try {
      await app.start(TitleScene);

      app.stop();
      await settle();

      expect(errors).toContain(teardownError);
    } finally {
      consoleErrorSpy.mockRestore();
      void app.destroy();
    }
  });

  test('destroy() right after a fire-and-forget stop() does not tear down dependencies before the scene unload() settles', async () => {
    let releaseUnload: (() => void) | null = null;

    class TitleScene extends Scene {
      public override unload(): Promise<void> {
        return new Promise<void>(resolve => {
          releaseUnload = resolve;
        });
      }
    }

    const app = new Application({ backend: { type: 'webgl2' }, scenes: { title: TitleScene } });

    await app.start(TitleScene);

    // The backend stands in for every dependency destroy() releases after
    // scenes (loader, rendering context, audio system, backend): none of them
    // may run while the scene's unload() is still touching them.
    const backendDestroy = vi.spyOn(app.backend, 'destroy');

    app.stop(); // fire-and-forget scene clear
    void app.destroy();
    await settle();

    expect(releaseUnload).not.toBeNull();
    expect(backendDestroy).not.toHaveBeenCalled();

    releaseUnload!();
    await settle();

    expect(backendDestroy).toHaveBeenCalledTimes(1);
  });

  test('a navigation landing between stop() and destroy() does not cancel the wait for the stopped scene unload()', async () => {
    let releaseUnload: (() => void) | null = null;

    class SlowUnloadScene extends Scene {
      public override unload(): Promise<void> {
        return new Promise<void>(resolve => {
          releaseUnload = resolve;
        });
      }
    }
    class OtherScene extends Scene {}

    const app = new Application({ backend: { type: 'webgl2' }, scenes: { slow: SlowUnloadScene, other: OtherScene } });

    await app.start(SlowUnloadScene);

    const backendDestroy = vi.spyOn(app.backend, 'destroy');

    app.stop();

    // The intervening navigation has no outgoing scope of its own, so its
    // commit publishes an already-resolved teardown handle. That must not
    // become the thing destroy() waits on.
    await app.scenes.change(OtherScene);

    void app.destroy();
    await settle();

    expect(releaseUnload).not.toBeNull();
    expect(backendDestroy).not.toHaveBeenCalled();

    releaseUnload!();
    await settle();

    expect(backendDestroy).toHaveBeenCalledTimes(1);
  });

  test('stop() during a transitioned, committed navigation unloads the freshly committed scene', async () => {
    class TitleScene extends Scene {}
    class GameScene extends Scene {}

    const app = new Application({ backend: { type: 'webgl2' }, scenes: { title: TitleScene, game: GameScene } });
    const errors: Error[] = [];

    app.onError.add(error => errors.push(error));

    try {
      await app.start(TitleScene);

      const transition = new ManualTransition();
      const navigation = app.scenes.change(GameScene, { transition });
      const navigationOutcome = navigation.then(
        () => 'resolved',
        (error: unknown) => error,
      );

      await settle(2);
      transition.environment?.commit();
      // `_checkCommitRequested` runs the commit off the session's own
      // update()/render() ticks; drive one by hand.
      app.scenes._updateTransition(Time.toSeconds(Time.milliseconds(16)));
      await settle();

      expect(app.scenes.currentScene).toBeInstanceOf(GameScene);

      app.stop();
      await settle();

      expect(app.scenes.currentScene).toBeNull();
      expect(errors.some(error => error instanceof ConcurrentSceneNavigationError)).toBe(false);
      expect(await navigationOutcome).not.toBe('resolved');
    } finally {
      void app.destroy();
    }
  });
});
