import type { Application } from '#core/Application';
import { CoroutineSystem } from '#core/CoroutineSystem';
import type { FrameBudget } from '#core/FrameBudget';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { SceneCoroutines } from '#core/scene/SceneCoroutines';
import { SceneState } from '#core/scene/SceneState';
import { seconds } from '#core/units';

/**
 * The facade is a view onto the application-wide system, so a spec needs the
 * real driver behind it - what it asserts is which coroutines that driver is
 * allowed to step. Scope transitions are driven by hand: flip the state or
 * pause flag, then `_sync()`, exactly as SceneScope does.
 */
const createHarness = (
  initial: SceneState = SceneState.Active,
): {
  app: Application;
  system: CoroutineSystem;
  coroutines: SceneCoroutines;
  frame: () => void;
  set: (next: { state?: SceneState; paused?: boolean }) => void;
} => {
  const system = new CoroutineSystem({ budget: seconds(1) });
  const app = { coroutines: system } as unknown as Application;
  const budget: FrameBudget = { timeRemaining: () => seconds(1) };
  let state = initial;
  let paused = false;
  const coroutines = new SceneCoroutines(
    app,
    () => state,
    () => paused,
  );

  return {
    app,
    system,
    coroutines,
    frame: (): void => {
      system.postFrame(seconds(0.016), budget);
    },
    set: next => {
      state = next.state ?? state;
      paused = next.paused ?? paused;
      coroutines._sync();
    },
  };
};

const countTo = function* (limit: number, log: number[]): Generator<void, number> {
  let i = 0;

  while (i < limit) {
    i++;
    log.push(i);
    yield;
  }

  return i;
};

describe('SceneCoroutines', () => {
  test('queue() delegates to the application-wide system and tracks the handle', () => {
    const log: number[] = [];
    const { system, coroutines, frame } = createHarness();

    const coroutine = coroutines.queue(countTo(3, log));

    expect(system.pending).toBe(1);
    expect(coroutines.pending).toBe(1);

    frame();

    expect(log).toEqual([1]);
    expect(coroutine.status).toBe('running');
  });

  test('a coroutine queued while the scope is dormant waits for activation', () => {
    const log: number[] = [];
    const { coroutines, frame, set } = createHarness(SceneState.Ready);

    coroutines.queue(countTo(3, log));

    frame();
    frame();

    expect(log).toEqual([]);

    set({ state: SceneState.Active });
    frame();

    expect(log).toEqual([1]);
  });

  test('suspension holds the body and restore resumes it where it left off', () => {
    const log: number[] = [];
    const { coroutines, frame, set } = createHarness();

    coroutines.queue(countTo(4, log));

    frame();
    expect(log).toEqual([1]);

    set({ state: SceneState.Suspended });
    frame();
    frame();
    expect(log).toEqual([1]);

    set({ state: SceneState.Active });
    frame();
    expect(log).toEqual([1, 2]);
  });

  test('a coroutine cancelled while held stays cancelled and is dropped by the next sync', () => {
    const log: number[] = [];
    const { coroutines, frame, set } = createHarness();

    const cancelled = coroutines.queue(countTo(4, log));

    frame();
    set({ state: SceneState.Suspended });
    cancelled.cancel();
    set({ state: SceneState.Active });

    expect(cancelled.status).toBe('cancelled');
    expect(coroutines.pending).toBe(0);

    frame();
    expect(log).toEqual([1]);
  });

  describe('pause policy', () => {
    test("'always' keeps advancing across a pause", () => {
      const log: number[] = [];
      const { coroutines, frame, set } = createHarness();

      coroutines.queue(countTo(4, log));

      set({ paused: true });
      frame();

      expect(log).toEqual([1]);
    });

    test("'active' freezes on pause and resumes on resume", () => {
      const log: number[] = [];
      const { coroutines, frame, set } = createHarness();

      coroutines.queue(countTo(4, log), { when: SceneAvailability.Active });

      frame();
      expect(log).toEqual([1]);

      set({ paused: true });
      frame();
      expect(log).toEqual([1]);

      set({ paused: false });
      frame();
      expect(log).toEqual([1, 2]);
    });

    test("'paused' runs only while the scene is paused, from the moment it is queued", () => {
      const log: number[] = [];
      const { coroutines, frame, set } = createHarness();

      coroutines.queue(countTo(4, log), { when: SceneAvailability.Paused });

      frame();
      expect(log).toEqual([]);

      set({ paused: true });
      frame();
      expect(log).toEqual([1]);

      set({ paused: false });
      frame();
      expect(log).toEqual([1]);
    });

    test("'active' queued while the scene is already paused waits for resume", () => {
      const log: number[] = [];
      const { coroutines, frame, set } = createHarness();

      set({ paused: true });
      coroutines.queue(countTo(4, log), { when: SceneAvailability.Active });
      frame();

      expect(log).toEqual([]);

      set({ paused: false });
      frame();

      expect(log).toEqual([1]);
    });
  });

  test('destroy() cancels everything the scene owns', async () => {
    const log: number[] = [];
    const { system, coroutines, frame } = createHarness();

    const coroutine = coroutines.queue(countTo(4, log));

    frame();
    coroutines.destroy();

    expect(coroutine.status).toBe('cancelled');
    expect(coroutines.pending).toBe(0);
    await expect(coroutine.done).rejects.toMatchObject({ name: 'AbortError' });

    frame();
    expect(system.pending).toBe(0);
  });

  test('add() takes over a coroutine queued on the application-wide system', () => {
    const log: number[] = [];
    const { app, coroutines, frame, set } = createHarness();

    const coroutine = app.coroutines.queue(countTo(4, log));

    coroutines.add(coroutine);

    expect(coroutines.pending).toBe(1);

    frame();
    set({ state: SceneState.Suspended });
    frame();

    expect(log).toEqual([1]);
  });
});
