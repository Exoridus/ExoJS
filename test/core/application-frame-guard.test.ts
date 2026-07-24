/**
 * Render-fail surface (S3 diagnostics, minimal slice) — contracts 3, 4 and 5:
 *
 *  3. A throwing frame: app.onError dispatched once with the error; RAF
 *     continues (frame N+1 runs); recentErrors grows.
 *  4. Three consecutive throwing frames → loop halts (no 4th tick), status
 *     Stopped, last banner call has fatal: true.
 *  5. A successful frame resets the consecutive counter.
 */

import { Application, ApplicationStatus } from '#core/Application';
import { logger } from '#core/logging';
import { Time } from '#core/Time';

const overlaySpies = vi.hoisted(() => ({
  show: vi.fn(),
  hide: vi.fn(),
}));

vi.mock('#core/devErrorOverlay', () => ({
  showDevErrorOverlay: overlaySpies.show,
  hideDevErrorOverlay: overlaySpies.hide,
}));

// ---------------------------------------------------------------------------
// Backend stubs — keep WebGL2 / WebGPU out of jsdom.
// ---------------------------------------------------------------------------

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
  WebGl2Backend: vi.fn().mockImplementation(function () {
    return {
      onContextLost: { add: vi.fn(), destroy: vi.fn() },
      onContextRestored: { add: vi.fn(), destroy: vi.fn() },
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
      onDeviceLost: { add: vi.fn(), destroy: vi.fn() },
      onDeviceRestored: { add: vi.fn(), destroy: vi.fn() },
      onRenderError: { add: vi.fn(), destroy: vi.fn() },
      stats: { frameTimeMs: 0, rawFrameDeltaMs: 0 },
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
      clear: vi.fn().mockReturnThis(),
    };
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function forceRunning(app: Application): void {
  const record = app as unknown as Record<string, unknown>;

  record['_status'] = ApplicationStatus.Running;
  record['_frameLoopActive'] = true;
}

function frameClock(app: Application): import('#core/Clock').Clock {
  return (app as unknown as Record<string, unknown>)['_frameClock'] as import('#core/Clock').Clock;
}

function mockFrameElapsed(app: Application, ms: number): void {
  vi.spyOn(frameClock(app), 'elapsedTime', 'get').mockReturnValue(new Time(ms));
}

describe('Application frame guard', () => {
  let app: Application;
  let rafSpy: MockInstance;
  let cafSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as ReturnType<typeof requestAnimationFrame>);
    cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);

    app = new Application({ backend: { type: 'webgl2' } });
    forceRunning(app);
    mockFrameElapsed(app, 16);

    vi.spyOn(app.input, 'update').mockReturnValue(app.input);
    vi.spyOn(app.interaction, 'update').mockImplementation(() => undefined);
  });

  afterEach(() => {
    (app as unknown as Record<string, unknown>)['_status'] = ApplicationStatus.Stopped;
    app.destroy();
    vi.restoreAllMocks();
  });

  function makeFlushThrow(error: Error): void {
    (app.backend.flush as unknown as MockInstance).mockImplementation(() => {
      throw error;
    });
  }

  function makeFlushSucceed(): void {
    (app.backend.flush as unknown as MockInstance).mockImplementation(function (this: unknown) {
      return this;
    });
  }

  // -------------------------------------------------------------------------
  // Contract 3 — one throwing frame is reported and the loop survives
  // -------------------------------------------------------------------------

  describe('a throwing frame (contract 3)', () => {
    test('dispatches app.onError exactly once with the thrown error', () => {
      const failure = new Error('boom in flush');
      const onError = vi.fn();

      app.onError.add(onError);
      makeFlushThrow(failure);

      app.update();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(failure);
    });

    test('does not propagate the error out of update()', () => {
      makeFlushThrow(new Error('boom'));

      expect(() => app.update()).not.toThrow();
    });

    test('reschedules RAF so frame N+1 runs', () => {
      makeFlushThrow(new Error('boom'));

      app.update();

      expect(rafSpy).toHaveBeenCalledTimes(1);
      expect(app.status).toBe(ApplicationStatus.Running);
    });

    test('the next (successful) frame actually runs its body', () => {
      makeFlushThrow(new Error('boom'));
      app.update();

      makeFlushSucceed();
      const onFrame = vi.fn();

      app.onFrame.add(onFrame);
      app.update();

      expect(onFrame).toHaveBeenCalledTimes(1);
    });

    test('grows recentErrors with a structured entry', () => {
      makeFlushThrow(new Error('boom in flush'));

      expect(app.recentErrors).toHaveLength(0);

      app.update();

      expect(app.recentErrors).toHaveLength(1);
      expect(app.recentErrors[0]!.message).toContain('boom in flush');
      expect(typeof app.recentErrors[0]!.time).toBe('number');
    });

    test('caps recentErrors at 20 entries, keeping the newest', () => {
      for (let i = 0; i < 25; i++) {
        makeFlushThrow(new Error(`error ${i}`));
        app.update();
        // Reset the consecutive counter so the loop never halts.
        makeFlushSucceed();
        app.update();
      }

      expect(app.recentErrors).toHaveLength(20);
      expect(app.recentErrors[app.recentErrors.length - 1]!.message).toContain('error 24');
    });

    test('shows the dev error banner (non-fatal)', () => {
      makeFlushThrow(new Error('boom'));

      app.update();

      expect(overlaySpies.show).toHaveBeenCalledTimes(1);
      expect(overlaySpies.show.mock.calls[0]![0]).toBe(app.canvas);
      expect((overlaySpies.show.mock.calls[0]![2] as { fatal?: boolean } | undefined)?.fatal).not.toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Contract 4 — three consecutive throwing frames halt the loop
  // -------------------------------------------------------------------------

  describe('three consecutive throwing frames (contract 4)', () => {
    test('halts the loop: status Stopped, RAF canceled, no further reschedule', () => {
      makeFlushThrow(new Error('persistent'));

      app.update();
      app.update();
      app.update();

      expect(app.status).toBe(ApplicationStatus.Stopped);
      expect(cafSpy).toHaveBeenCalled();
      // Two reschedules (after frames 1 and 2); the halting frame must not reschedule.
      expect(rafSpy).toHaveBeenCalledTimes(2);
    });

    test('a 4th tick is a no-op after the halt', () => {
      makeFlushThrow(new Error('persistent'));

      app.update();
      app.update();
      app.update();

      (app.backend.resetStats as unknown as MockInstance).mockClear();
      app.update();

      expect(app.backend.resetStats).not.toHaveBeenCalled();
    });

    test('marks the final banner fatal', () => {
      makeFlushThrow(new Error('persistent'));

      app.update();
      app.update();
      app.update();

      const lastCall = overlaySpies.show.mock.calls[overlaySpies.show.mock.calls.length - 1]!;

      expect((lastCall[2] as { fatal?: boolean } | undefined)?.fatal).toBe(true);
    });

    test('dispatches onError on every failing frame (3 times)', () => {
      const onError = vi.fn();

      app.onError.add(onError);
      makeFlushThrow(new Error('persistent'));

      app.update();
      app.update();
      app.update();

      expect(onError).toHaveBeenCalledTimes(3);
    });
  });

  // -------------------------------------------------------------------------
  // Contract 5 — a successful frame resets the consecutive counter
  // -------------------------------------------------------------------------

  describe('a successful frame resets the consecutive counter (contract 5)', () => {
    test('error, error, success, error, error keeps the loop alive', () => {
      makeFlushThrow(new Error('a'));
      app.update();
      app.update();

      makeFlushSucceed();
      app.update();

      makeFlushThrow(new Error('b'));
      app.update();
      app.update();

      expect(app.status).toBe(ApplicationStatus.Running);
      expect(rafSpy).toHaveBeenCalledTimes(5);
    });
  });

  // -------------------------------------------------------------------------
  // Backend wiring — onRenderError → Application error pipeline
  // -------------------------------------------------------------------------

  describe('async render-error wiring', () => {
    test('subscribes to backend.onRenderError at construction', () => {
      expect(app.backend.onRenderError.add).toHaveBeenCalledTimes(1);
    });

    test('an async render error reaches onError and recentErrors without breaking the loop', () => {
      const handler = (app.backend.onRenderError.add as unknown as MockInstance).mock.calls[0]![0] as (error: Error) => void;
      const onError = vi.fn();

      app.onError.add(onError);

      const asyncError = new Error('uncaptured validation error');

      handler(asyncError);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(asyncError);
      expect(app.recentErrors).toHaveLength(1);
      expect(app.status).toBe(ApplicationStatus.Running);

      // Async errors never count toward the consecutive-frame-halt threshold.
      handler(new Error('another'));
      handler(new Error('yet another'));
      expect(app.status).toBe(ApplicationStatus.Running);
    });

    test('does NOT log an async render error a second time — the backend already logged it at source (#306)', () => {
      const handler = (app.backend.onRenderError.add as unknown as MockInstance).mock.calls[0]![0] as (error: Error) => void;
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

      try {
        handler(new Error('uncaptured validation error'));

        // The pipeline still records + dispatches, but must not re-log.
        expect(errorSpy).not.toHaveBeenCalled();
        expect(app.recentErrors).toHaveLength(1);
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
});
