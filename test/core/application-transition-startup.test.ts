/**
 * Slice 7 capstone: a real FadeSceneTransition (Group A, Task 1) drives the
 * very first Application.start() call end-to-end, proving the
 * _frameLoopActive startup-sequencing fix (Group B) actually lets a
 * frame-driven transition session progress before _status flips to Running —
 * the exact deadlock scenario spec §3.7 describes.
 */
import { Application, ApplicationStatus } from '#core/Application';
import { Scene } from '#core/Scene';
import { FadeSceneTransition } from '#core/transitions/FadeSceneTransition';

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

describe('Application.start() with a real FadeSceneTransition (Slice 7 capstone)', () => {
  test('the very first start() call, transitioned, resolves once the fade completes and the scene is active', async () => {
    class TitleScene extends Scene {}

    const app = new Application({ backend: { type: 'webgl2' }, scenes: { title: TitleScene } });

    // jsdom has no Gamepad API (`window.navigator.getGamepads` is undefined),
    // which InputManager.update() calls unconditionally every frame — the
    // same pre-existing test-environment gap application-loop.test.ts's
    // beforeEach works around identically. This test drives many real
    // frames, so without this stub every frame throws, and 3 consecutive
    // frame errors abort the in-flight transition instead of letting it
    // complete (masking the thing this test actually verifies).
    vi.spyOn(app.input, 'update').mockReturnValue(app.input);
    vi.spyOn(app.interaction, 'update').mockImplementation(() => undefined);

    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    // Application.update() times each frame's delta from a real Clock
    // (`performance.now()` via `getPreciseTime()`), NOT from the timestamp
    // argument RAF hands its callback — so driving frames in a tight
    // microtask loop (real wall-clock deltas of a fraction of a millisecond
    // each) would need many thousands of iterations to accumulate the
    // transition's 40ms-per-phase duration. Control the clock directly
    // instead: advance a fake `performance.now()` by one simulated 16ms
    // frame tick immediately before invoking each callback.
    let now = 0;
    const perfSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);

    try {
      const startPromise = app.start(TitleScene, { transition: new FadeSceneTransition(undefined, { duration: 40 }) });

      let settled = false;
      void startPromise.then(() => {
        settled = true;
      });

      // Drive frames until the transition's session reaches `done` and
      // start() resolves — bounded so a real deadlock (the bug this slice
      // fixes) fails the test instead of hanging it. The first RAF request
      // isn't registered synchronously (start() awaits backend init first),
      // so each iteration flushes a microtask turn *before* checking for a
      // pending callback, and a missing callback keeps polling rather than
      // aborting the loop outright.
      for (let tick = 0; tick < 200 && !settled; tick++) {
        await Promise.resolve();

        const callback = rafCallbacks[rafCallbacks.length - 1];

        if (callback === undefined) {
          continue;
        }

        now += 16;
        callback(now);
      }

      await startPromise;

      expect(app.scenes.currentScene).toBeInstanceOf(TitleScene);
      expect(app.status).toBe(ApplicationStatus.Running);
    } finally {
      perfSpy.mockRestore();
      rafSpy.mockRestore();
      app.destroy();
    }
  });
});
