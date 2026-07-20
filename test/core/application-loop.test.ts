/**
 * Tests for Application.update() loop timing fixes:
 *   - pauseOnHidden resume delta-spike fix (_frameClock.restart in hidden path)
 *   - internal MAX_DELTA_MS clamp applied to simulation delta
 */

import { Application, ApplicationStatus } from '#core/Application';
import { Time } from '#core/Time';

// ---------------------------------------------------------------------------
// Backend stubs — keep WebGL2 / WebGPU out of jsdom.
// The factory functions must be inline because vi.mock() is hoisted before
// any variable declarations in the file.
// ---------------------------------------------------------------------------

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
      view: {},
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

vi.mock('#rendering/webgpu/WebGpuBackend', () => ({
  WebGpuBackend: vi.fn().mockImplementation(function () {
    return {
      onDeviceLost: { add: vi.fn() },
      onDeviceRestored: { add: vi.fn() },
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
      view: {},
      renderTarget: {},
      backendType: 'webgpu',
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Force the Application into Running state without calling start(). */
function forceRunning(app: Application): void {
  (app as unknown as Record<string, unknown>)['_status'] = ApplicationStatus.Running;
}

/** Access the private _frameClock. */
function frameClock(app: Application): import('#core/Clock').Clock {
  return (app as unknown as Record<string, unknown>)['_frameClock'] as import('#core/Clock').Clock;
}

/** Mock _frameClock.elapsedTime getter to return a fixed Time value. */
function mockFrameElapsed(app: Application, ms: number): MockInstance {
  const fixed = new Time(ms);
  return vi.spyOn(frameClock(app), 'elapsedTime', 'get').mockReturnValue(fixed);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Application.update() — loop timing', () => {
  let app: Application;
  let rafSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as ReturnType<typeof requestAnimationFrame>);

    app = new Application({ backend: { type: 'webgl2' } });
    forceRunning(app);

    // Stub out input/interaction so jsdom's missing gamepad API doesn't error.
    // These tests exercise loop timing logic, not the input subsystem.
    vi.spyOn(app.input, 'update').mockReturnValue(app.input);
    vi.spyOn(app.interaction, 'update').mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Stop before destroy so destroy() doesn't try to unload a scene
    (app as unknown as Record<string, unknown>)['_status'] = ApplicationStatus.Stopped;
    app.destroy();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // pauseOnHidden resume delta-spike prevention
  // -------------------------------------------------------------------------

  describe('pauseOnHidden: clock restart in hidden path', () => {
    test('when pauseOnHidden=true and document is hidden, _frameClock.restart() is called', () => {
      app.pauseOnHidden = true;
      (app as unknown as Record<string, unknown>)['_documentVisible'] = false;

      const restartSpy = vi.spyOn(frameClock(app), 'restart');

      app.update();

      expect(restartSpy).toHaveBeenCalledTimes(1);
    });

    test('when pauseOnHidden=true and document is hidden, RAF is rescheduled', () => {
      app.pauseOnHidden = true;
      (app as unknown as Record<string, unknown>)['_documentVisible'] = false;

      app.update();

      expect(rafSpy).toHaveBeenCalledTimes(1);
    });

    test('when pauseOnHidden=true and document is hidden, backend.resetStats is NOT called', () => {
      app.pauseOnHidden = true;
      (app as unknown as Record<string, unknown>)['_documentVisible'] = false;

      app.update();

      expect(app.backend.resetStats).not.toHaveBeenCalled();
    });

    test('when pauseOnHidden=false and document is hidden, normal frame runs (no early return)', () => {
      app.pauseOnHidden = false;
      (app as unknown as Record<string, unknown>)['_documentVisible'] = false;

      mockFrameElapsed(app, 16);
      app.update();

      // Normal path always calls resetStats
      expect(app.backend.resetStats).toHaveBeenCalledTimes(1);
    });

    test('when pauseOnHidden=true and document IS visible, normal frame runs', () => {
      app.pauseOnHidden = true;
      (app as unknown as Record<string, unknown>)['_documentVisible'] = true;

      mockFrameElapsed(app, 16);
      app.update();

      expect(app.backend.resetStats).toHaveBeenCalledTimes(1);
    });

    test('clock restart in hidden path prevents delta accumulation on resume', () => {
      // Simulate: app hidden, update() called once (accumulates no delta due to restart)
      app.pauseOnHidden = true;
      (app as unknown as Record<string, unknown>)['_documentVisible'] = false;

      const restartSpy = vi.spyOn(frameClock(app), 'restart');

      app.update();

      // The key invariant: restart was called while hidden, so the clock
      // does not accumulate the hidden duration.
      expect(restartSpy).toHaveBeenCalled();

      // Simulate resume: document becomes visible
      (app as unknown as Record<string, unknown>)['_documentVisible'] = true;

      // On the visible frame, capture what delta tweens receive
      const tweensUpdateSpy = vi.spyOn(app.tweens, 'update');

      // Control the clock to return a small post-resume delta
      mockFrameElapsed(app, 16);

      app.update();

      // Should receive 16ms (≈0.016s), not a huge accumulated spike
      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Time;
      expect(receivedDelta.seconds).toBeCloseTo(0.016, 4);
    });
  });

  // -------------------------------------------------------------------------
  // Internal MAX_DELTA_MS clamp
  // -------------------------------------------------------------------------

  describe('simulation delta clamped to MAX_DELTA_MS (100ms)', () => {
    test('a very large raw delta is clamped before tweens.update receives it', () => {
      mockFrameElapsed(app, 30_000); // 30 seconds — simulates device sleep

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'update');

      app.update();

      expect(tweensUpdateSpy).toHaveBeenCalledTimes(1);
      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Time;

      // MAX_DELTA_MS = 100 → 0.1 seconds
      expect(receivedDelta.seconds).toBeLessThanOrEqual(0.1);
    });

    test('a very large raw delta is clamped before sceneManager.update receives it', () => {
      mockFrameElapsed(app, 30_000);

      const sceneUpdateSpy = vi.spyOn(app.scenes, 'update');

      app.update();

      expect(sceneUpdateSpy).toHaveBeenCalledTimes(1);
      const receivedDelta = sceneUpdateSpy.mock.calls[0][0] as Time;

      expect(receivedDelta.milliseconds).toBeLessThanOrEqual(100);
    });

    test('a normal frame delta (16ms) passes through unchanged', () => {
      mockFrameElapsed(app, 16);

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'update');

      app.update();

      expect(tweensUpdateSpy).toHaveBeenCalledTimes(1);
      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Time;

      expect(receivedDelta.seconds).toBeCloseTo(0.016, 4);
    });

    test('a delta exactly at the cap boundary (100ms) passes through unchanged', () => {
      mockFrameElapsed(app, 100);

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'update');

      app.update();

      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Time;

      expect(receivedDelta.seconds).toBeCloseTo(0.1, 4);
    });

    test('a delta one millisecond above the cap is clamped to exactly the cap', () => {
      mockFrameElapsed(app, 101);

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'update');

      app.update();

      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Time;

      // Must be <= 0.1, not 0.101
      expect(receivedDelta.seconds).toBeLessThanOrEqual(0.1);
    });

    test('raw delta beyond cap is still recorded in backend.stats.rawFrameDeltaMs', () => {
      mockFrameElapsed(app, 5000);

      app.update();

      expect(app.backend.stats.rawFrameDeltaMs).toBe(5000);
    });

    test('rawFrameDeltaMs equals the unclamped value even when clamped', () => {
      mockFrameElapsed(app, 200);

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'update');

      app.update();

      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Time;

      // Simulation delta is clamped to 100ms = 0.1s
      expect(receivedDelta.seconds).toBeLessThanOrEqual(0.1);
      // Raw stat records the actual 200ms
      expect(app.backend.stats.rawFrameDeltaMs).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Regression — existing behavior unaffected
  // -------------------------------------------------------------------------

  describe('Regression — normal frame flow', () => {
    test('update() returns this (fluent)', () => {
      mockFrameElapsed(app, 16);

      expect(app.update()).toBe(app);
    });

    test('backend.flush() is called each normal frame', () => {
      mockFrameElapsed(app, 16);

      app.update();

      expect(app.backend.flush).toHaveBeenCalledTimes(1);
    });

    test('backend.resetStats() is called each normal frame', () => {
      mockFrameElapsed(app, 16);

      app.update();

      expect(app.backend.resetStats).toHaveBeenCalledTimes(1);
    });

    test('onFrame signal is dispatched each normal frame', () => {
      mockFrameElapsed(app, 16);

      const frameHandler = vi.fn();
      app.onFrame.add(frameHandler);

      app.update();

      expect(frameHandler).toHaveBeenCalledTimes(1);
      const dispatchedDelta = frameHandler.mock.calls[0][0] as Time;

      expect(dispatchedDelta.milliseconds).toBeCloseTo(16, 4);
    });

    test('update() is a no-op when status is not Running', () => {
      (app as unknown as Record<string, unknown>)['_status'] = ApplicationStatus.Stopped;
      mockFrameElapsed(app, 16);

      app.update();

      expect(app.backend.resetStats).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Fixed timestep — accumulator-driven fixedUpdate / onFixedFrame / frameAlpha
  // -------------------------------------------------------------------------

  describe('Fixed timestep', () => {
    const STEP_MS = 1000 / 60;

    test('runs one fixed step per single-step frame', () => {
      const fixedSpy = vi.spyOn(app.scenes, 'fixedUpdate');

      mockFrameElapsed(app, STEP_MS);
      app.update();

      expect(fixedSpy).toHaveBeenCalledTimes(1);
    });

    test('runs multiple fixed steps for a multi-step frame', () => {
      const fixedSpy = vi.spyOn(app.scenes, 'fixedUpdate');

      mockFrameElapsed(app, STEP_MS * 3);
      app.update();

      expect(fixedSpy).toHaveBeenCalledTimes(3);
    });

    test('dispatches onFixedFrame once per fixed step', () => {
      let count = 0;
      app.onFixedFrame.add(() => {
        count++;
      });

      mockFrameElapsed(app, STEP_MS * 2);
      app.update();

      expect(count).toBe(2);
    });

    test('frameAlpha reports the leftover sub-step fraction', () => {
      mockFrameElapsed(app, STEP_MS * 1.5);
      app.update();

      expect(app.frameAlpha).toBeCloseTo(0.5, 4);
    });

    test('caps fixed steps per frame (spiral-of-death guard)', () => {
      const fixedSpy = vi.spyOn(app.scenes, 'fixedUpdate');

      // The frame delta is clamped to 100 ms first → 6 steps wanted, capped at 5.
      mockFrameElapsed(app, 1000);
      app.update();

      expect(fixedSpy).toHaveBeenCalledTimes(5);
    });
  });
});
