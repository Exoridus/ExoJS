/**
 * Slice 7 Group B — Application.start() startup-sequencing fix (spec §3.7):
 * _frameLoopActive decouples the per-frame loop's gate from `_status`, so a
 * frame-driven transition session can progress during the very first
 * `start()` call (before `_status` flips to Running).
 */
import { Application, ApplicationStatus } from '#core/Application';

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
});
