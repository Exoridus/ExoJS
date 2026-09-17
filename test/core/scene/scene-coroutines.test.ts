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
 * allowed to step.
 */
const createHarness = (state: () => SceneState): { app: Application; system: CoroutineSystem; coroutines: SceneCoroutines; frame: () => void } => {
  const system = new CoroutineSystem({ budget: seconds(1) });
  const app = { coroutines: system } as unknown as Application;
  const budget: FrameBudget = { timeRemaining: () => seconds(1) };

  return {
    app,
    system,
    coroutines: new SceneCoroutines(app, state),
    frame: (): void => {
      system.postFrame(seconds(0.016), budget);
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
    const { system, coroutines, frame } = createHarness(() => SceneState.Active);

    const coroutine = coroutines.queue(countTo(3, log));

    expect(system.pending).toBe(1);
    expect(coroutines.pending).toBe(1);

    frame();

    expect(log).toEqual([1]);
    expect(coroutine.status).toBe('running');
  });

  test('a coroutine queued while the scope is dormant waits for activation', () => {
    const log: number[] = [];
    let state = SceneState.Ready;
    const { coroutines, frame } = createHarness(() => state);

    coroutines.queue(countTo(3, log));

    frame();
    frame();

    expect(log).toEqual([]);

    state = SceneState.Active;
    coroutines.activate();
    frame();

    expect(log).toEqual([1]);
  });

  test('suspend() holds the body and restore() resumes it where it left off', () => {
    const log: number[] = [];
    const { coroutines, frame } = createHarness(() => SceneState.Active);

    coroutines.queue(countTo(4, log));

    frame();
    expect(log).toEqual([1]);

    coroutines.suspend();
    frame();
    frame();
    expect(log).toEqual([1]);

    coroutines.restore();
    frame();
    expect(log).toEqual([1, 2]);
  });

  test('restore() releases only what suspend() held', () => {
    const log: number[] = [];
    const { coroutines, frame } = createHarness(() => SceneState.Active);

    const cancelled = coroutines.queue(countTo(4, log));

    frame();
    coroutines.suspend();
    cancelled.cancel();

    expect(() => coroutines.restore()).not.toThrow();
    expect(cancelled.status).toBe('cancelled');

    frame();
    expect(log).toEqual([1]);
  });

  describe('pause policy', () => {
    test("'always' keeps advancing across a pause", () => {
      const log: number[] = [];
      const { coroutines, frame } = createHarness(() => SceneState.Active);

      coroutines.queue(countTo(4, log));

      coroutines.pause();
      frame();

      expect(log).toEqual([1]);
    });

    test("'active' freezes on pause and resumes on resume", () => {
      const log: number[] = [];
      const { coroutines, frame } = createHarness(() => SceneState.Active);

      coroutines.queue(countTo(4, log), { when: SceneAvailability.Active });

      frame();
      expect(log).toEqual([1]);

      coroutines.pause();
      frame();
      expect(log).toEqual([1]);

      coroutines.resume();
      frame();
      expect(log).toEqual([1, 2]);
    });

    test("'paused' runs only while the scene is paused", () => {
      const log: number[] = [];
      let state = SceneState.Ready;
      const { coroutines, frame } = createHarness(() => state);

      // Queued while dormant, so it is held until the pause wakes it early.
      coroutines.queue(countTo(4, log), { when: SceneAvailability.Paused });

      frame();
      expect(log).toEqual([]);

      state = SceneState.Active;
      coroutines.pause();
      frame();
      expect(log).toEqual([1]);

      coroutines.resume();
      frame();
      expect(log).toEqual([1]);
    });
  });

  test('destroy() cancels everything the scene owns', async () => {
    const log: number[] = [];
    const { system, coroutines, frame } = createHarness(() => SceneState.Active);

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
    const { app, coroutines, frame } = createHarness(() => SceneState.Active);

    const coroutine = app.coroutines.queue(countTo(4, log));

    coroutines.add(coroutine);

    expect(coroutines.pending).toBe(1);

    frame();
    coroutines.suspend();
    frame();

    expect(log).toEqual([1]);
  });
});
