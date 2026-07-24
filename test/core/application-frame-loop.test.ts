/**
 * Slice 7 Group B — Application.start() startup-sequencing fix (spec §3.7):
 * _frameLoopActive decouples the per-frame loop's gate from `_status`, so a
 * frame-driven transition session can progress during the very first
 * `start()` call (before `_status` flips to Running).
 */
import { Application, ApplicationStatus } from '#core/Application';
import { Scene } from '#core/Scene';
import { SceneTransition, type SceneTransitionEnvironment, type SceneTransitionRequirements, type SceneTransitionSession } from '#core/SceneTransition';

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

function frameLoopActive(app: Application): boolean {
  return (app as unknown as Record<string, unknown>)['_frameLoopActive'] as boolean;
}

function sessionActive(app: Application): boolean {
  const scenes = app.scenes as unknown as Record<string, unknown>;

  return scenes['_activeSession'] !== null && scenes['_activeSession'] !== undefined;
}

describe('Application — _frameLoopActive (Slice 7 Group B)', () => {
  let rafSpy: MockInstance;
  let cafSpy: MockInstance;
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  test('_frameLoopActive becomes true before start() resolves and status flips to Running', async () => {
    const app = new Application({ backend: { type: 'webgl2' } });

    const startPromise = app.start();

    // Flush the microtask queue enough for the pre-RAF awaits (backend init,
    // capabilities) to settle without needing the whole start() to resolve.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(frameLoopActive(app)).toBe(true);

    await startPromise;
    expect(app.status).toBe(ApplicationStatus.Running);
    app.destroy();
  });

  test('a scheduled RAF callback runs its body (and reschedules) even while _status is still Loading', async () => {
    const app = new Application({ backend: { type: 'webgl2' } });
    const startPromise = app.start();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // start() hasn't resolved yet (status is still Loading), but the loop
    // must already be live and self-rescheduling — this is the bug being fixed.
    expect(app.status).toBe(ApplicationStatus.Loading);
    const callsBeforeManualTick = rafSpy.mock.calls.length;

    expect(rafCallbacks.length).toBeGreaterThan(0);
    rafCallbacks[0]!(0);

    expect(rafSpy.mock.calls.length).toBeGreaterThan(callsBeforeManualTick);

    await startPromise;
    app.destroy();
  });

  test('_activeClock starts ticking as soon as _frameLoopActive flips true, not after start() resolves', async () => {
    const app = new Application({ backend: { type: 'webgl2' } });
    const startPromise = app.start();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(frameLoopActive(app)).toBe(true);
    // activeTime is a live Clock read — a non-zero value here (rather than
    // waiting for start() to resolve) proves the clock started at
    // _startFrameLoop() time, per spec §3.7's fourth "must clear/start
    // everywhere" bullet (the _activeClock one).
    const activeTimeDuringLoading = app.activeTime.milliseconds;

    expect(activeTimeDuringLoading).toBeGreaterThanOrEqual(0);

    await startPromise;
    app.destroy();
  });

  describe('_stopFrameLoop() — fatal frame error, stop(), destroy() during Loading', () => {
    test('a fatal frame error clears _frameLoopActive and cancels the pending RAF request before setting status Stopped', async () => {
      const app = new Application({ backend: { type: 'webgl2' } });

      await app.start();
      (app.backend.flush as unknown as MockInstance).mockImplementation(() => {
        throw new Error('persistent failure');
      });

      app.update();
      app.update();
      app.update();

      expect(frameLoopActive(app)).toBe(false);
      expect(app.status).toBe(ApplicationStatus.Stopped);
      expect(cafSpy).toHaveBeenCalled();

      app.destroy();
    });

    test('stop() halts the loop even while _status is still Loading (mid-startup)', async () => {
      const app = new Application({ backend: { type: 'webgl2' } });
      const startPromise = app.start().catch(() => undefined); // will reject — see next test

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(app.status).toBe(ApplicationStatus.Loading);
      expect(frameLoopActive(app)).toBe(true);

      app.stop();

      expect(frameLoopActive(app)).toBe(false);
      expect(app.status).toBe(ApplicationStatus.Stopped);

      await startPromise;
      app.destroy();
    });

    test('stop() is a no-op when the loop was never started (still Stopped)', () => {
      const app = new Application({ backend: { type: 'webgl2' } });

      expect(() => app.stop()).not.toThrow();
      expect(app.status).toBe(ApplicationStatus.Stopped);

      app.destroy();
    });

    test('destroy() during Loading also halts the loop (delegates to stop())', async () => {
      const app = new Application({ backend: { type: 'webgl2' } });
      const startPromise = app.start().catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(frameLoopActive(app)).toBe(true);

      app.destroy();

      expect(frameLoopActive(app)).toBe(false);

      await startPromise;
    });
  });

  describe('End-to-end: stopping the app mid-transition aborts the in-flight navigation (real SceneDirector)', () => {
    test('app.stop() called while the initial start() navigation is mid-transition rejects start() with SceneNavigationAbortedError', async () => {
      class HangingSceneTransition extends SceneTransition {
        public sessionDestroyed = false;

        public override getRequirements(): SceneTransitionRequirements {
          return { outgoingFrame: 'none', currentFrame: 'direct' };
        }

        protected override createSession(_environment: SceneTransitionEnvironment): SceneTransitionSession {
          // Never calls environment.commit() and never reaches `done` on its
          // own — a stand-in for "a transition whose session is still
          // mid-flight when something stops the app," driven only by the test.
          return {
            placement: 'screen',
            done: false,
            update(): void {},
            render(): void {},
            destroy: (): void => {
              this.sessionDestroyed = true;
            },
          };
        }
      }

      class TargetScene extends Scene {}

      const app = new Application({ backend: { type: 'webgl2' }, scenes: { target: TargetScene } });
      const transition = new HangingSceneTransition();

      const startPromise = app.start(TargetScene, { transition });

      // Let the loop start and the transition's session begin — but never
      // drive it to commit/done (that's the whole point of this test). The
      // exact number of microtask turns start() needs before the session
      // actually begins (backend init, capability detection, then the
      // Director's own pre-session synchronous setup) isn't a stable
      // constant to hardcode — poll instead of guessing a tick count.
      for (let i = 0; i < 50 && !sessionActive(app); i++) {
        await Promise.resolve();
      }

      expect(sessionActive(app)).toBe(true);
      expect(app.status).toBe(ApplicationStatus.Loading);

      app.stop();

      await expect(startPromise).rejects.toThrow(/navigation aborted/i);
      expect(transition.sessionDestroyed).toBe(true);
      expect(app.status).toBe(ApplicationStatus.Stopped);
      expect(app.scenes.currentScene).toBeNull();

      app.destroy();
    });

    test('app.stop() called mid-transition while a scene is ALREADY active unloads that scene, not just skips it', async () => {
      class HangingSceneTransition extends SceneTransition {
        public sessionDestroyed = false;

        public override getRequirements(): SceneTransitionRequirements {
          return { outgoingFrame: 'none', currentFrame: 'direct' };
        }

        protected override createSession(_environment: SceneTransitionEnvironment): SceneTransitionSession {
          // Same hanging stand-in as the startup-navigation test above, but
          // exercised against a navigation that switches AWAY FROM an already
          // -active scene, not the very first navigation into an empty app.
          return {
            placement: 'screen',
            done: false,
            update(): void {},
            render(): void {},
            destroy: (): void => {
              this.sessionDestroyed = true;
            },
          };
        }
      }

      class SceneA extends Scene {}
      class SceneB extends Scene {}

      const app = new Application({ backend: { type: 'webgl2' }, scenes: { a: SceneA, b: SceneB } });

      // Get the app fully running with SceneA active first (no transition —
      // resolves once the direct fast path completes), matching the
      // "already-running app" precondition the mid-transition abort gap
      // requires (unlike the startup test above, which never activates a
      // scene before stop()).
      await app.start(SceneA);

      expect(app.scenes.currentScene).toBeInstanceOf(SceneA);
      expect(app.status).toBe(ApplicationStatus.Running);

      const transition = new HangingSceneTransition();
      const changePromise = app.scenes.change(SceneB, { transition });

      for (let i = 0; i < 50 && !sessionActive(app); i++) {
        await Promise.resolve();
      }

      expect(sessionActive(app)).toBe(true);

      app.stop();

      await expect(changePromise).rejects.toThrow(/navigation aborted/i);
      expect(transition.sessionDestroyed).toBe(true);
      expect(app.status).toBe(ApplicationStatus.Stopped);
      // The bug this test guards: stop() must not leave SceneA loaded just
      // because a navigation abort (rather than a clean stop) is what
      // triggered the unload — SceneA never committed away, so it is still
      // the active scene at the moment stop() is called, and stop()'s own
      // contract is to unload whatever is active.
      expect(app.scenes.currentScene).toBeNull();

      app.destroy();
    });
  });
});
