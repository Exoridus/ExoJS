import type { MockInstance } from 'vitest';

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
      // Stand-in for the backend's live clear colour — identity is all the
      // auto-clear specs below compare, so a plain object is enough.
      clearColor: { red: 100, green: 149, blue: 237, alpha: 1 },
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
      // Stand-in for the backend's live clear colour — identity is all the
      // auto-clear specs below compare, so a plain object is enough.
      clearColor: { red: 100, green: 149, blue: 237, alpha: 1 },
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
  const record = app as unknown as Record<string, unknown>;

  record['_status'] = ApplicationStatus.Running;
  record['_frameLoopActive'] = true;
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
    vi.spyOn(app.input, 'preUpdate').mockReturnValue(app.input);
    vi.spyOn(app.interaction, 'preUpdate').mockImplementation(() => undefined);
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
      const tweensUpdateSpy = vi.spyOn(app.tweens, 'preUpdate');

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

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'preUpdate');

      app.update();

      expect(tweensUpdateSpy).toHaveBeenCalledTimes(1);
      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Time;

      // MAX_DELTA_MS = 100 → 0.1 seconds
      expect(receivedDelta.seconds).toBeLessThanOrEqual(0.1);
    });

    test('a very large raw delta is clamped before sceneDirector.update receives it', () => {
      mockFrameElapsed(app, 30_000);

      const sceneUpdateSpy = vi.spyOn(app.scenes, 'update');

      app.update();

      expect(sceneUpdateSpy).toHaveBeenCalledTimes(1);
      const receivedDelta = sceneUpdateSpy.mock.calls[0][0] as Time;

      expect(receivedDelta.milliseconds).toBeLessThanOrEqual(100);
    });

    test('a normal frame delta (16ms) passes through unchanged', () => {
      mockFrameElapsed(app, 16);

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'preUpdate');

      app.update();

      expect(tweensUpdateSpy).toHaveBeenCalledTimes(1);
      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Time;

      expect(receivedDelta.seconds).toBeCloseTo(0.016, 4);
    });

    test('a delta exactly at the cap boundary (100ms) passes through unchanged', () => {
      mockFrameElapsed(app, 100);

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'preUpdate');

      app.update();

      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Time;

      expect(receivedDelta.seconds).toBeCloseTo(0.1, 4);
    });

    test('a delta one millisecond above the cap is clamped to exactly the cap', () => {
      mockFrameElapsed(app, 101);

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'preUpdate');

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

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'preUpdate');

      app.update();

      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Time;

      // Simulation delta is clamped to 100ms = 0.1s
      expect(receivedDelta.seconds).toBeLessThanOrEqual(0.1);
      // Raw stat records the actual 200ms
      expect(app.backend.stats.rawFrameDeltaMs).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Frame delta measures the wall-clock gap between frames
  // -------------------------------------------------------------------------

  describe('frame delta spans the full gap between frames', () => {
    /**
     * Replace `_frameClock` with a clock driven by an explicit virtual
     * timeline, so a frame's own processing cost can be injected at a chosen
     * point without depending on real wall-clock timing. Returns a handle that
     * advances the timeline.
     */
    function installVirtualFrameClock(target: Application): { advance: (ms: number) => void } {
      let nowMs = 0;
      let startedAtMs = 0;

      const virtualClock = {
        get elapsedTime(): Time {
          return new Time(nowMs - startedAtMs);
        },
        restart(): void {
          startedAtMs = nowMs;
        },
        start(): void {
          startedAtMs = nowMs;
        },
        stop(): void {
          /* the virtual timeline only moves when a test advances it */
        },
        destroy(): void {
          /* nothing to release */
        },
      };

      (target as unknown as Record<string, unknown>)['_frameClock'] = virtualClock;

      return {
        advance: (ms: number): void => {
          nowMs += ms;
        },
      };
    }

    test('a frame that spends CPU time still reports the full frame-to-frame gap on the next frame', () => {
      const timeline = installVirtualFrameClock(app);
      const frameProcessingMs = 12;
      const framePeriodMs = 16;
      const observedDeltas: number[] = [];

      vi.spyOn(app.tweens, 'preUpdate').mockImplementation((delta: Time) => {
        observedDeltas.push(delta.milliseconds);
      });

      // Charge the frame's own processing cost to the timeline from inside the
      // frame body, after the delta has been read — this is the cost that must
      // not be subtracted from the next frame's delta.
      app.onFrame.add(() => {
        timeline.advance(frameProcessingMs);
      });

      app.update();

      // The next frame callback lands one frame period after the previous one
      // began, so the remaining wait is the period minus the work already done.
      timeline.advance(framePeriodMs - frameProcessingMs);

      app.update();

      expect(observedDeltas).toHaveLength(2);
      expect(observedDeltas[1]).toBe(framePeriodMs);
    });

    test('rawFrameDeltaMs reports elapsed wall time, not wall time minus the previous frame cost', () => {
      const timeline = installVirtualFrameClock(app);

      app.onFrame.add(() => {
        timeline.advance(12);
      });

      app.update();
      timeline.advance(4);
      app.update();

      expect(app.backend.stats.rawFrameDeltaMs).toBe(16);
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

    test('the frame is cleared to clearColor, once, before the scene draws', () => {
      mockFrameElapsed(app, 16);

      const draw = vi.spyOn(app.scenes, 'draw');

      app.update();

      expect(app.backend.clear).toHaveBeenCalledTimes(1);
      expect(app.backend.clear).toHaveBeenCalledWith(app.clearColor);
      // Clearing after the draw would wipe the frame that was just rendered.
      const clearOrder = (app.backend.clear as unknown as MockInstance).mock.invocationCallOrder[0]!;

      expect(clearOrder).toBeLessThan(draw.mock.invocationCallOrder[0]!);
    });

    test('autoClear: false leaves the frame untouched, so the previous one survives', () => {
      const uncleared = new Application({ backend: { type: 'webgl2' }, autoClear: false });

      try {
        forceRunning(uncleared);
        vi.spyOn(uncleared.input, 'preUpdate').mockImplementation(() => undefined);
        vi.spyOn(uncleared.interaction, 'preUpdate').mockImplementation(() => undefined);
        mockFrameElapsed(uncleared, 16);

        uncleared.update();

        expect(uncleared.backend.clear).not.toHaveBeenCalled();
        // The colour is still resolved and available for a manual clear.
        expect(uncleared.clearColor).toBeDefined();
      } finally {
        (uncleared as unknown as Record<string, unknown>)['_status'] = ApplicationStatus.Stopped;
        uncleared.destroy();
      }
    });

    test('update() is a no-op when status is not Running', () => {
      const record = app as unknown as Record<string, unknown>;

      record['_status'] = ApplicationStatus.Stopped;
      record['_frameLoopActive'] = false;
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

    // Regression: the same Time instance is handed to every fixed step for
    // the whole Application's lifetime (unlike frameDelta, which is
    // re-set() every frame), so a mutation from user code used to corrupt
    // the fixed step permanently, not just for the current frame.
    test('the Time instance handed to onFixedFrame/scenes.fixedUpdate is frozen — mutating it throws instead of corrupting future fixed steps', () => {
      const fixedSpy = vi.spyOn(app.scenes, 'fixedUpdate');
      let receivedViaOnFixedFrame: Time | undefined;

      app.onFixedFrame.add(step => {
        receivedViaOnFixedFrame = step;
      });

      mockFrameElapsed(app, STEP_MS);
      app.update();

      const stepFromScenes = fixedSpy.mock.calls[0]?.[0];

      expect(stepFromScenes).toBeDefined();
      expect(receivedViaOnFixedFrame).toBe(stepFromScenes); // same shared instance, both routes
      expect(Object.isFrozen(stepFromScenes)).toBe(true);
      expect(() => stepFromScenes!.set(999)).toThrow(TypeError);
      expect(() => receivedViaOnFixedFrame!.add(1)).toThrow(TypeError);

      // The value itself is provably unchanged by the attempted mutations.
      expect(stepFromScenes!.milliseconds).toBeCloseTo(STEP_MS, 4);
    });
  });
});
