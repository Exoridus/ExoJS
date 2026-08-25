import type { MockInstance } from 'vitest';

/**
 * Tests for Application.update() loop timing fixes:
 *   - pauseOnHidden resume delta-spike fix (_frameClock.restart in hidden path)
 *   - internal MAX_DELTA_MS clamp applied to simulation delta
 */
import { Application, ApplicationState } from '#core/Application';
import { type Seconds, Time } from '#core/units';

// ---------------------------------------------------------------------------
// Backend stubs - keep WebGL2 / WebGPU out of jsdom.
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
      // Core renderer bindings key their factory map on backendType, so a stub
      // naming a real backend also has to accept the renderers bound to it.
      rendererRegistry: { bindRenderer: vi.fn() },
      backendType: 'webgl2',
      setView: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      execute: vi.fn().mockReturnThis(),
      // Stand-in for the backend's live clear colour - identity is all the
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
      // Core renderer bindings key their factory map on backendType, so a stub
      // naming a real backend also has to accept the renderers bound to it.
      rendererRegistry: { bindRenderer: vi.fn() },
      backendType: 'webgpu',
      setView: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      execute: vi.fn().mockReturnThis(),
      // Stand-in for the backend's live clear colour - identity is all the
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
const forceRunning = (app: Application): void => {
  const record = app as unknown as Record<string, unknown>;

  record['_state'] = ApplicationState.Running;
  record['_frameLoopActive'] = true;
};

/** Access the private _frameClock. */
const frameClock = (app: Application): import('#core/Clock').Clock => {
  return (app as unknown as Record<string, unknown>)['_frameClock'] as import('#core/Clock').Clock;
};

/**
 * Make the next `app.update()` see exactly `ms` of frame-to-frame time: the
 * loop derives its delta from the host frame timestamp, so pinning the host
 * clock one gap ahead of the last frame is all a fixed delta needs.
 */
const mockFrameElapsed = (app: Application, ms: number): MockInstance => {
  const previous = (app as unknown as Record<string, unknown>)['_lastFrameTimestamp'] as number;
  return vi.spyOn(app.platform, 'now').mockReturnValue(previous + ms);
};

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
    (app as unknown as Record<string, unknown>)['_state'] = ApplicationState.Stopped;
    void app.destroy();
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
      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Seconds;
      expect(receivedDelta).toBeCloseTo(0.016, 4);
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
      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Seconds;

      // MAX_DELTA_MS = 100 → 0.1 seconds
      expect(receivedDelta).toBeLessThanOrEqual(0.1);
    });

    test('a very large raw delta is clamped before sceneDirector.update receives it', () => {
      mockFrameElapsed(app, 30_000);

      const sceneUpdateSpy = vi.spyOn(app.scenes, 'update');

      app.update();

      expect(sceneUpdateSpy).toHaveBeenCalledTimes(1);
      const receivedDelta = sceneUpdateSpy.mock.calls[0][0] as Seconds;

      expect(receivedDelta * 1000).toBeLessThanOrEqual(100);
    });

    test('a normal frame delta (16ms) passes through unchanged', () => {
      mockFrameElapsed(app, 16);

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'preUpdate');

      app.update();

      expect(tweensUpdateSpy).toHaveBeenCalledTimes(1);
      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Seconds;

      expect(receivedDelta).toBeCloseTo(0.016, 4);
    });

    test('a delta exactly at the cap boundary (100ms) passes through unchanged', () => {
      mockFrameElapsed(app, 100);

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'preUpdate');

      app.update();

      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Seconds;

      expect(receivedDelta).toBeCloseTo(0.1, 4);
    });

    test('a delta one millisecond above the cap is clamped to exactly the cap', () => {
      mockFrameElapsed(app, 101);

      const tweensUpdateSpy = vi.spyOn(app.tweens, 'preUpdate');

      app.update();

      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Seconds;

      // Must be <= 0.1, not 0.101
      expect(receivedDelta).toBeLessThanOrEqual(0.1);
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

      const receivedDelta = tweensUpdateSpy.mock.calls[0][0] as Seconds;

      // Simulation delta is clamped to 100ms = 0.1s
      expect(receivedDelta).toBeLessThanOrEqual(0.1);
      // Raw stat records the actual 200ms
      expect(app.backend.stats.rawFrameDeltaMs).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Frame delta measures the wall-clock gap between frames
  // -------------------------------------------------------------------------

  describe('frame delta spans the full gap between frames', () => {
    /**
     * Put the application's host clock on a timeline the test moves by hand,
     * so a frame's own processing cost and the wait that follows it can be
     * charged separately.
     */
    const installVirtualHostClock = (target: Application): { advance: (ms: number) => void } => {
      let nowMs = 0;

      vi.spyOn(target.platform, 'now').mockImplementation(() => nowMs);
      (target as unknown as Record<string, unknown>)['_lastFrameTimestamp'] = 0;

      return {
        advance: (ms: number): void => {
          nowMs += ms;
        },
      };
    };

    test('a frame that spends CPU time still reports the full frame-to-frame gap on the next frame', () => {
      const timeline = installVirtualHostClock(app);
      const frameProcessingMs = 12;
      const framePeriodMs = 16;
      const observedDeltas: number[] = [];

      vi.spyOn(app.tweens, 'preUpdate').mockImplementation((delta: Seconds) => {
        observedDeltas.push(delta * 1000);
      });

      // Charge the frame's own processing cost to the timeline from inside the
      // frame body, after the delta has been read - this is the cost that must
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

    test('the frame delta is the distance between two frame timestamps', () => {
      const observedDeltas: number[] = [];

      vi.spyOn(app.tweens, 'preUpdate').mockImplementation((delta: Seconds) => {
        observedDeltas.push(delta * 1000);
      });

      (app as unknown as Record<string, unknown>)['_lastFrameTimestamp'] = 0;

      app.update(16);
      app.update(48);

      expect(observedDeltas).toEqual([16, 32]);
    });

    test('a frame with no timestamp reads the host clock through the platform adapter', () => {
      const observedDeltas: number[] = [];
      const globalNow = vi.spyOn(performance, 'now');

      vi.spyOn(app.platform, 'now').mockReturnValue(25);
      vi.spyOn(app.tweens, 'preUpdate').mockImplementation((delta: Seconds) => {
        observedDeltas.push(delta * 1000);
      });

      (app as unknown as Record<string, unknown>)['_lastFrameTimestamp'] = 0;

      app.update();

      expect(observedDeltas).toEqual([25]);
      expect(globalNow).not.toHaveBeenCalled();
    });

    test('the loop runs on the timestamp the adapter hands its frame callback', () => {
      const observedDeltas: number[] = [];
      let scheduled: ((timestamp: number) => void) | null = null;

      vi.spyOn(app.platform, 'now').mockReturnValue(0);
      vi.spyOn(app.platform, 'requestFrame').mockImplementation((callback: (timestamp: number) => void) => {
        scheduled = callback;

        return 1;
      });
      vi.spyOn(app.tweens, 'preUpdate').mockImplementation((delta: Seconds) => {
        observedDeltas.push(delta * 1000);
      });

      (app as unknown as { _startFrameLoop: () => void })._startFrameLoop();

      const runFrame = (timestamp: number): void => {
        const callback = scheduled;

        scheduled = null;
        callback?.(timestamp);
      };

      runFrame(16);
      runFrame(33);

      expect(observedDeltas).toEqual([16, 17]);
    });

    test('rawFrameDeltaMs reports elapsed wall time, not wall time minus the previous frame cost', () => {
      const timeline = installVirtualHostClock(app);

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
  // Regression - existing behavior unaffected
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
      const dispatchedDelta = frameHandler.mock.calls[0][0] as Seconds;

      expect(dispatchedDelta * 1000).toBeCloseTo(16, 4);
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
        (uncleared as unknown as Record<string, unknown>)['_state'] = ApplicationState.Stopped;
        void uncleared.destroy();
      }
    });

    test('update() is a no-op when status is not Running', () => {
      const record = app as unknown as Record<string, unknown>;

      record['_state'] = ApplicationState.Stopped;
      record['_frameLoopActive'] = false;
      mockFrameElapsed(app, 16);

      app.update();

      expect(app.backend.resetStats).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Fixed timestep - accumulator-driven fixedUpdate / onFixedFrame / frameAlpha
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

    // Regression: the fixed step used to be one shared `Time` instance handed
    // to every step for the Application's whole lifetime, so a write from user
    // code corrupted it permanently rather than for the current frame only. It
    // is a number now - a handler receives a copy and has nothing to write to.
    test('every route receives the same fixed-step value, and a handler cannot change it', () => {
      const fixedSpy = vi.spyOn(app.scenes, 'fixedUpdate');
      let receivedViaOnFixedFrame: Seconds | undefined;

      app.onFixedFrame.add(step => {
        receivedViaOnFixedFrame = step;
        // Writing to the parameter cannot reach the engine's own value.
        step = Time.seconds(999);
        void step;
      });

      mockFrameElapsed(app, STEP_MS);
      app.update();

      const stepFromScenes = fixedSpy.mock.calls[0]?.[0];

      expect(stepFromScenes).toBeDefined();
      expect(receivedViaOnFixedFrame).toBe(stepFromScenes);
      expect(stepFromScenes! * 1000).toBeCloseTo(STEP_MS, 4);

      // A second frame still reports the unchanged step.
      mockFrameElapsed(app, STEP_MS);
      app.update();

      expect(receivedViaOnFixedFrame! * 1000).toBeCloseTo(STEP_MS, 4);
    });
  });
});
