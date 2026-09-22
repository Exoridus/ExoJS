import { describe, expect, test, vi } from 'vitest';

import { type Coroutine, CoroutineSystem } from '#core/CoroutineSystem';
import { DestroyScope } from '#core/DestroyScope';
import type { FrameBudget } from '#core/FrameBudget';
import { type Seconds, seconds } from '#core/units';

/**
 * A stand-in for the frame's remaining time. The system derives its slice from
 * this once per phase, so a stub here is all a spec needs to pin the slice -
 * no injected clock, and nothing timing-dependent.
 */
const frameBudget = (remaining: number): FrameBudget => ({ timeRemaining: () => seconds(remaining) });

const delta = seconds(0.016);

/** A slice large enough that every runnable coroutine is stepped. */
const roomy = frameBudget(1);

/** One frame of the driver's phase. */
const frame = (system: CoroutineSystem, budget: FrameBudget = roomy): void => {
  system.postFrame(delta, budget);
};

/**
 * A system whose slice is zero: the first step of a frame still happens
 * (the progress guarantee), and nothing after it does.
 */
const zeroSliceSystem = (): CoroutineSystem => new CoroutineSystem({ budget: seconds(0), minSlice: seconds(0) });

const countTo = function* (limit: number, log?: number[]): Generator<void, number> {
  let i = 0;

  while (i < limit) {
    i++;
    log?.push(i);
    yield;
  }

  return i;
};

describe('CoroutineSystem', () => {
  test('runs a coroutine to completion across frames and exposes the return value', () => {
    const system = zeroSliceSystem();
    const coroutine = system.queue(countTo(3));

    expect(coroutine.status).toBe('queued');
    expect(system.pending).toBe(1);

    frame(system);
    expect(coroutine.status).toBe('running');

    frame(system);
    frame(system);
    frame(system);

    expect(coroutine.status).toBe('done');
    expect(coroutine.result).toBe(3);
    expect(system.pending).toBe(0);
  });

  test('steps each coroutine at most once per frame, so a body that ignores the budget sequences', () => {
    const system = new CoroutineSystem({ budget: seconds(1) });
    const log: number[] = [];

    system.queue(countTo(5, log));

    frame(system);
    expect(log).toEqual([1]);

    frame(system);
    expect(log).toEqual([1, 2]);
  });

  test('takes the first step of a frame whatever the slice says', () => {
    const system = zeroSliceSystem();
    const log: number[] = [];

    system.queue(countTo(5, log));
    frame(system, frameBudget(0));

    expect(log).toEqual([1]);
  });

  test('stops once the slice is spent, leaving the rest for the next frame', () => {
    const system = zeroSliceSystem();
    const order: string[] = [];
    const tagged = function* (tag: string): Generator<void, void> {
      for (let i = 0; i < 4; i++) {
        order.push(tag);
        yield;
      }
    };

    system.queue(tagged('a'));
    system.queue(tagged('b'));
    system.queue(tagged('c'));

    frame(system);

    expect(order).toEqual(['a']);
  });

  test('rotates the lead across frames, so the budget is shared over time', () => {
    const system = zeroSliceSystem();
    const order: string[] = [];
    const tagged = function* (tag: string): Generator<void, void> {
      for (let i = 0; i < 4; i++) {
        order.push(tag);
        yield;
      }
    };

    system.queue(tagged('a'));
    system.queue(tagged('b'));
    system.queue(tagged('c'));

    frame(system);
    frame(system);
    frame(system);

    expect(order).toEqual(['a', 'b', 'c']);
  });

  test('descends through the priorities within a frame when budget is left', () => {
    const system = new CoroutineSystem({ budget: seconds(1) });
    const order: string[] = [];
    const tagged = function* (tag: string): Generator<void, void> {
      for (let i = 0; i < 4; i++) {
        order.push(tag);
        yield;
      }
    };

    system.queue(tagged('low'), { priority: -1 });
    system.queue(tagged('mid:a'));
    system.queue(tagged('mid:b'));
    system.queue(tagged('high'), { priority: 5 });

    frame(system);

    expect(order).toEqual(['high', 'mid:a', 'mid:b', 'low']);
  });

  test('a spent slice stops the pass before the lower priorities are reached', () => {
    const system = zeroSliceSystem();
    const order: string[] = [];
    const tagged = function* (tag: string): Generator<void, void> {
      for (let i = 0; i < 4; i++) {
        order.push(tag);
        yield;
      }
    };

    system.queue(tagged('low'), { priority: -1 });
    system.queue(tagged('high'), { priority: 5 });

    frame(system);

    expect(order).toEqual(['high']);
  });

  test('a promoted coroutine leads the next frame', () => {
    const system = zeroSliceSystem();
    const order: string[] = [];
    const tagged = function* (tag: string): Generator<void, void> {
      for (let i = 0; i < 4; i++) {
        order.push(tag);
        yield;
      }
    };

    system.queue(tagged('a'));
    const late = system.queue(tagged('late'));

    frame(system);
    expect(order).toEqual(['a']);

    late.priority = 10;
    frame(system);

    expect(order).toEqual(['a', 'late']);
  });

  describe('the budget a body receives', () => {
    test('is positive at the first step, because minSlice is a real grant', () => {
      const system = new CoroutineSystem({ budget: seconds(0), minSlice: seconds(0.001) });
      const seen: number[] = [];

      system.queue(function* (budget): Generator<void, void> {
        seen.push(budget.timeRemaining());
        yield;
      });

      frame(system, frameBudget(0));

      expect(seen).toHaveLength(1);
      expect(seen[0]).toBeGreaterThan(0);
    });

    test('reports the system slice rather than the frame remainder', () => {
      const system = new CoroutineSystem({ budget: { share: 0.25, max: seconds(1) }, minSlice: seconds(0) });
      const seen: number[] = [];

      system.queue(function* (budget): Generator<void, void> {
        seen.push(budget.timeRemaining());
        yield;
      });

      frame(system, frameBudget(0.008));

      expect(seen).toHaveLength(1);
      // A quarter of 8 ms, minus whatever the step itself took to reach the read.
      expect(seen[0]).toBeGreaterThan(0);
      expect(seen[0]).toBeLessThanOrEqual(0.002);
    });

    test('caps the share at `max`', () => {
      const system = new CoroutineSystem({ budget: { share: 0.5, max: seconds(0.001) }, minSlice: seconds(0) });
      const seen: number[] = [];

      system.queue(function* (budget): Generator<void, void> {
        seen.push(budget.timeRemaining());
        yield;
      });

      frame(system, frameBudget(1));

      expect(seen[0]).toBeLessThanOrEqual(0.001);
    });

    test('is zero for a body that declines the grant', () => {
      const system = zeroSliceSystem();
      const seen: number[] = [];

      system.queue(function* (budget): Generator<void, void> {
        seen.push(budget.timeRemaining());
        yield;
      });

      frame(system, frameBudget(0));

      expect(seen).toEqual([0]);
    });
  });

  test('accepts a ready-made iterator as well as a body function', () => {
    const system = new CoroutineSystem({ budget: seconds(1) });
    const fromIterator = system.queue(countTo(1));
    const fromBody = system.queue(() => countTo(1));

    frame(system);
    frame(system);

    expect(fromIterator.status).toBe('done');
    expect(fromBody.status).toBe('done');
  });

  test('publishes each yielded value as progress', () => {
    const system = new CoroutineSystem({ budget: seconds(1) });
    const coroutine = system.queue(function* (): Generator<number, string> {
      yield 0.5;
      yield 1;

      return 'built';
    });

    expect(coroutine.progress).toBeUndefined();

    frame(system);
    expect(coroutine.progress).toBe(0.5);

    frame(system);
    expect(coroutine.progress).toBe(1);

    frame(system);
    expect(coroutine.result).toBe('built');
  });

  test('done resolves with the result after settlement', async () => {
    const system = new CoroutineSystem({ budget: seconds(1) });
    const coroutine = system.queue(countTo(2));
    const done = coroutine.done;

    frame(system);
    frame(system);
    frame(system);

    await expect(done).resolves.toBe(2);
    await expect(coroutine.done).resolves.toBe(2);
  });

  test('a throwing coroutine fails, rejects done, and leaves the others running', async () => {
    const system = new CoroutineSystem({ budget: seconds(1) });
    const failing = system.queue(function* (): Generator<void, void> {
      yield;
      throw new Error('boom');
    });
    const other = system.queue(countTo(3));

    for (let i = 0; i < 4; i++) frame(system);

    expect(failing.status).toBe('failed');
    expect(failing.error).toBeInstanceOf(Error);
    expect(other.status).toBe('done');
    await expect(failing.done).rejects.toThrow('boom');
  });

  test('a body that throws before its first yield fails rather than escaping the phase', async () => {
    const system = new CoroutineSystem({ budget: seconds(1) });
    const coroutine = system.queue((): Iterator<void, void> => {
      throw new Error('never started');
    });

    expect(() => frame(system)).not.toThrow();
    expect(coroutine.status).toBe('failed');
    await expect(coroutine.done).rejects.toThrow('never started');
  });

  test('cancel stops the body at its yield, runs finally, and rejects with AbortError', async () => {
    const system = zeroSliceSystem();
    const cleanup = vi.fn();
    const coroutine = system.queue(function* (): Generator<void, void> {
      try {
        yield;
        yield;
      } finally {
        cleanup();
      }
    });

    frame(system);
    coroutine.cancel();

    expect(coroutine.status).toBe('cancelled');
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(system.pending).toBe(1);

    frame(system);
    expect(system.pending).toBe(0);

    await expect(coroutine.done).rejects.toMatchObject({ name: 'AbortError' });
  });

  describe('signal', () => {
    test('aborting cancels the coroutine', async () => {
      const system = zeroSliceSystem();
      const controller = new AbortController();
      const coroutine = system.queue(countTo(100), { signal: controller.signal });

      frame(system);
      expect(coroutine.status).toBe('running');

      controller.abort();

      expect(coroutine.status).toBe('cancelled');
      await expect(coroutine.done).rejects.toMatchObject({ name: 'AbortError' });
    });

    test('an already-aborted signal settles the coroutine without queueing it', () => {
      const system = zeroSliceSystem();
      const controller = new AbortController();

      controller.abort();

      const coroutine = system.queue(countTo(100), { signal: controller.signal });

      expect(coroutine.status).toBe('cancelled');
      expect(system.pending).toBe(0);
    });

    test('a settled coroutine stops listening to its signal', () => {
      const system = new CoroutineSystem({ budget: seconds(1) });
      const controller = new AbortController();
      const removeListener = vi.spyOn(controller.signal, 'removeEventListener');

      system.queue(countTo(1), { signal: controller.signal });

      frame(system);
      frame(system);

      expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    });
  });

  test('a scope owns the coroutine while it runs and releases it on settlement', () => {
    const system = zeroSliceSystem();
    const scope = new DestroyScope();
    const finished = system.queue(countTo(1), { scope });
    const unfinished = system.queue(countTo(100), { scope });

    expect(scope.size).toBe(2);

    // One step per frame each, rotating: finished, unfinished, finished (done).
    frame(system);
    frame(system);
    frame(system);

    expect(finished.status).toBe('done');
    expect(unfinished.status).toBe('running');
    expect(scope.size).toBe(1);

    scope.destroy();

    expect(unfinished.status).toBe('cancelled');
    expect(scope.size).toBe(0);
  });

  test('cancelling from inside a step does not disturb the pass', () => {
    const system = new CoroutineSystem({ budget: seconds(1) });
    const log: string[] = [];
    let victim: Coroutine<void, void> | null = null;

    system.queue(function* (): Generator<void, void> {
      log.push('killer');
      victim!.cancel();
      yield;
      log.push('killer');
    });
    victim = system.queue(function* (): Generator<void, void> {
      log.push('victim');
      yield;
    });
    system.queue(function* (): Generator<void, void> {
      log.push('third');
      yield;
      log.push('third');
    });

    frame(system);
    frame(system);

    // The second frame opens on `third`: the lead rotates once a pass has
    // stepped everything, and the cancelled coroutine is simply gone.
    expect(log).toEqual(['killer', 'third', 'third', 'killer']);
    expect(system.pending).toBe(0);
  });

  test('a suspended coroutine is stepped past and resumes where it left off', () => {
    const system = new CoroutineSystem({ budget: seconds(1) });
    const log: number[] = [];
    const coroutine = system.queue(countTo(4, log));

    frame(system);
    expect(log).toEqual([1]);

    coroutine._suspended = true;
    frame(system);
    frame(system);
    expect(log).toEqual([1]);

    coroutine._suspended = false;
    frame(system);
    expect(log).toEqual([1, 2]);
  });

  test('reports what the last frame cost', () => {
    const system = new CoroutineSystem({ budget: seconds(1) });

    expect(system.lastFrameMs).toBe(0);

    system.queue(countTo(2));
    frame(system);

    expect(system.lastFrameMs).toBeGreaterThanOrEqual(0);
  });

  test('clear cancels everything and destroy refuses new work', () => {
    const system = new CoroutineSystem();
    const a = system.queue(countTo(5));
    const b = system.queue(countTo(5));

    system.clear();

    expect(a.status).toBe('cancelled');
    expect(b.status).toBe('cancelled');
    expect(system.pending).toBe(0);

    system.destroy();

    expect(system.destroyed).toBe(true);
    expect(() => system.queue(countTo(1))).toThrow(/destroyed/u);
  });

  test('defaults minSlice to a 64th of the bound frame target', () => {
    const system = new CoroutineSystem({ budget: seconds(0) });
    const seen: number[] = [];

    system._bindFrameTarget((): Seconds => seconds(1 / 120));
    system.queue(function* (budget): Generator<void, void> {
      seen.push(budget.timeRemaining());
      yield;
    });

    frame(system, frameBudget(0));

    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThanOrEqual(1 / 120 / 64);
  });
});
