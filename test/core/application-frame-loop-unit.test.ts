/**
 * `FrameLoop` on its own: the timekeeping and scheduling the per-frame body
 * reads, without an Application around it.
 */
import { FrameLoop } from '#core/application/FrameLoop';
import { seconds } from '#core/units';
import type { PlatformAdapter } from '#platform/PlatformAdapter';

interface HostStub {
  readonly platform: PlatformAdapter;
  /** Frame callbacks the host was handed, in request order. */
  readonly scheduled: Array<(timestamp: number) => void>;
  readonly cancelled: number[];
  setNow: (ms: number) => void;
}

const createHost = (): HostStub => {
  const scheduled: Array<(timestamp: number) => void> = [];
  const cancelled: number[] = [];
  let nowMs = 0;

  const platform = {
    now: (): number => nowMs,
    requestFrame: (callback: (timestamp: number) => void): number => {
      scheduled.push(callback);

      return scheduled.length;
    },
    cancelFrame: (handle: number): void => {
      cancelled.push(handle);
    },
  } as unknown as PlatformAdapter;

  return {
    platform,
    scheduled,
    cancelled,
    setNow: (ms: number): void => {
      nowMs = ms;
    },
  };
};

const stepMs = 1000 / 60;

describe('FrameLoop', () => {
  test('starts inactive and schedules nothing until started', () => {
    const host = createHost();
    const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

    expect(loop.active).toBe(false);
    expect(host.scheduled).toHaveLength(0);

    loop.destroy();
  });

  test('start() goes live and requests the first frame', () => {
    const host = createHost();
    const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

    loop.start();

    expect(loop.active).toBe(true);
    expect(host.scheduled).toHaveLength(1);

    loop.destroy();
  });

  test('stop() reports whether it was the call that halted the loop', () => {
    const host = createHost();
    const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

    loop.start();

    expect(loop.stop()).toBe(true);
    expect(loop.stop()).toBe(false);
    expect(loop.active).toBe(false);
    expect(host.cancelled).toEqual([1]);

    loop.destroy();
  });

  test('the scheduled callback runs the tick and chains the next frame', () => {
    const host = createHost();
    const tick = vi.fn();
    const loop = new FrameLoop(host.platform, tick, stepMs);

    loop.start();
    host.scheduled[0]!(16);

    expect(tick).toHaveBeenCalledWith(16);
    expect(host.scheduled).toHaveLength(2);

    loop.destroy();
  });

  test('a halted loop runs its pending callback but chains no successor', () => {
    const host = createHost();
    const tick = vi.fn();
    const loop = new FrameLoop(host.platform, tick, stepMs);

    loop.start();
    loop.stop();
    host.scheduled[0]!(16);

    expect(tick).toHaveBeenCalledTimes(1);
    expect(host.scheduled).toHaveLength(1);

    loop.destroy();
  });

  test('the frame delta spans two frame timestamps, not two readings inside one frame', () => {
    const host = createHost();
    const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

    loop.start();

    expect(loop.beginFrame(16).rawDeltaMs).toBe(16);
    expect(loop.beginFrame(48).rawDeltaMs).toBe(32);

    loop.destroy();
  });

  test('the simulation delta is capped while the raw delta is reported unclamped', () => {
    const host = createHost();
    const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

    loop.start();

    const timing = loop.beginFrame(5000);

    expect(timing.rawDeltaMs).toBe(5000);
    expect(timing.clampedDeltaMs).toBe(100);
    expect(timing.frameDelta).toBeCloseTo(0.1, 10);

    loop.destroy();
  });

  test('a timestamp behind the previous frame yields a zero delta rather than a negative one', () => {
    const host = createHost();
    const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

    loop.start();
    loop.beginFrame(100);

    expect(loop.beginFrame(40).rawDeltaMs).toBe(0);

    loop.destroy();
  });

  test('fixed steps are owed per accumulated step size', () => {
    const host = createHost();
    const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

    loop.start();

    expect(loop.beginFrame(stepMs).fixedSteps).toBe(1);
    expect(loop.beginFrame(stepMs * 4).fixedSteps).toBe(3);

    loop.destroy();
  });

  test('the step cap follows the configured step size, not a fixed count', () => {
    const host = createHost();
    const fine = new FrameLoop(host.platform, vi.fn(), 1);

    fine.start();

    // 100 ms of budget at a 1 ms step is 100 steps, not the 6 a 60 Hz step allows.
    expect(fine.beginFrame(5000).fixedSteps).toBe(100);

    fine.destroy();
  });

  test('alpha is published only when the caller says its steps have run', () => {
    const host = createHost();
    const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

    loop.start();
    loop.beginFrame(stepMs * 1.5);

    expect(loop.alpha).toBe(0);

    loop.captureAlpha();

    expect(loop.alpha).toBeCloseTo(0.5, 6);

    loop.destroy();
  });

  test('a skipped frame adopts the timestamp and clears the accumulator, so the next frame reports no gap', () => {
    const host = createHost();
    const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

    loop.start();
    loop.beginFrame(16);
    loop.skipFrame(10000);

    const resumed = loop.beginFrame(10016);

    expect(resumed.rawDeltaMs).toBe(16);
    expect(resumed.fixedSteps).toBe(0);

    loop.destroy();
  });

  test('frames are counted only while the loop is live', () => {
    const host = createHost();
    const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

    loop.start();
    loop.endFrame();
    loop.endFrame();

    expect(loop.frameCount).toBe(2);

    loop.stop();
    loop.endFrame();

    expect(loop.frameCount).toBe(2);

    loop.destroy();
  });

  test('the active clock runs only between start and stop, the startup clock only once asked', () => {
    const host = createHost();
    const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

    host.setNow(0);
    loop.startStartupClock();
    loop.start();
    host.setNow(250);

    expect(loop.startupSeconds).toBeCloseTo(0.25, 6);
    expect(loop.activeSeconds).toBeCloseTo(0.25, 6);

    loop.stop();
    host.setNow(1000);

    expect(loop.activeSeconds).toBeCloseTo(0.25, 6);

    loop.destroy();
  });

  describe('displayFrameSeconds', () => {
    /** Run `count` frames whose raw deltas are `deltasMs`, cycling through it. */
    const runFrames = (loop: FrameLoop, host: HostStub, deltasMs: readonly number[], count: number): void => {
      let timestamp = 0;

      for (let i = 0; i < count; i++) {
        timestamp += deltasMs[i % deltasMs.length]!;
        host.setNow(timestamp);
        loop.beginFrame(timestamp);
      }
    };

    test('reports the 1/60 seed until the window has filled', () => {
      const host = createHost();
      const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

      loop.start();

      expect(loop.displayFrameSeconds).toBeCloseTo(1 / 60, 6);

      runFrames(loop, host, [1000 / 144], 59);

      expect(loop.displayFrameSeconds).toBeCloseTo(1 / 60, 6);

      loop.destroy();
    });

    test('tracks the cadence once 60 frames have been seen', () => {
      const host = createHost();
      const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

      loop.start();
      runFrames(loop, host, [1000 / 144], 60);

      expect(loop.displayFrameSeconds).toBeCloseTo(1 / 144, 5);

      loop.destroy();
    });

    test('is unaffected by slow frames, because the minimum cannot be dragged up', () => {
      const host = createHost();
      const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

      loop.start();
      runFrames(loop, host, [1000 / 60], 60);

      expect(loop.displayFrameSeconds).toBeCloseTo(1 / 60, 5);

      // Nine out of every ten frames now take four vsync intervals. The
      // estimate has to stay at the interval the tenth still hits.
      runFrames(loop, host, [4000 / 60, 4000 / 60, 4000 / 60, 4000 / 60, 4000 / 60, 4000 / 60, 4000 / 60, 4000 / 60, 4000 / 60, 1000 / 60], 60);

      expect(loop.displayFrameSeconds).toBeCloseTo(1 / 60, 5);

      loop.destroy();
    });

    test('clamps a cadence faster than 240 Hz and slower than 30 Hz', () => {
      const fast = createHost();
      const fastLoop = new FrameLoop(fast.platform, vi.fn(), stepMs);

      fastLoop.start();
      runFrames(fastLoop, fast, [1], 60);

      expect(fastLoop.displayFrameSeconds).toBeCloseTo(1 / 240, 6);

      fastLoop.destroy();

      const slow = createHost();
      const slowLoop = new FrameLoop(slow.platform, vi.fn(), stepMs);

      slowLoop.start();
      runFrames(slowLoop, slow, [200], 60);

      expect(slowLoop.displayFrameSeconds).toBeCloseTo(1 / 30, 6);

      slowLoop.destroy();
    });

    test('holds an explicitly configured target against any cadence', () => {
      const host = createHost();
      const loop = new FrameLoop(host.platform, vi.fn(), stepMs, seconds(1 / 120));

      expect(loop.displayFrameSeconds).toBeCloseTo(1 / 120, 6);

      loop.start();
      runFrames(loop, host, [1000 / 30], 120);

      expect(loop.displayFrameSeconds).toBeCloseTo(1 / 120, 6);

      loop.destroy();
    });

    test('ignores a zero delta rather than pinning the minimum at the clamp floor', () => {
      const host = createHost();
      const loop = new FrameLoop(host.platform, vi.fn(), stepMs);

      loop.start();

      // A manual tick alongside a live loop repeats the previous timestamp.
      host.setNow(0);
      loop.beginFrame(0);
      runFrames(loop, host, [1000 / 60], 60);

      expect(loop.displayFrameSeconds).toBeCloseTo(1 / 60, 5);

      loop.destroy();
    });
  });
});
