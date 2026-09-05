import { describe, expect, test, vi } from 'vitest';

import { DestroyScope } from '#core/DestroyScope';
import { JobScheduler } from '#core/JobScheduler';
import { seconds } from '#core/units';

/** A clock the test advances by hand; every step costs `stepCost` ms. */
const manualClock = (stepCost = 0) => {
  let now = 0;

  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    stepCost,
  };
};

const countTo = function* (limit: number, log?: number[]): Generator<void, number> {
  let i = 0;

  while (i < limit) {
    i++;
    log?.push(i);
    yield;
  }

  return i;
};

describe('JobScheduler', () => {
  test('runs a job to completion across updates and exposes the return value', () => {
    const scheduler = new JobScheduler({ timeSource: manualClock() });
    const job = scheduler.run(countTo(3));

    expect(job.status).toBe('pending');
    expect(scheduler.size).toBe(1);

    scheduler.budget = seconds(0);
    scheduler.update();
    expect(job.status).toBe('running');

    scheduler.update();
    scheduler.update();
    scheduler.update();
    expect(job.status).toBe('done');
    expect(job.result).toBe(3);
    expect(scheduler.size).toBe(0);
  });

  test('a zero budget still takes exactly one step per update', () => {
    const clock = manualClock();
    const scheduler = new JobScheduler({ timeSource: clock, budget: seconds(0) });
    const log: number[] = [];

    scheduler.run(countTo(5, log));
    scheduler.update();
    expect(log).toEqual([1]);
    scheduler.update();
    expect(log).toEqual([1, 2]);
  });

  test('stops stepping once the budget is spent', () => {
    let now = 0;
    const scheduler = new JobScheduler({
      timeSource: { now: () => now },
      budget: seconds(0.002),
    });
    const log: number[] = [];

    scheduler.run(
      (function* () {
        for (let i = 1; i <= 10; i++) {
          now += 1;
          log.push(i);
          yield;
        }
      })(),
    );

    scheduler.update();
    expect(log).toEqual([1, 2]);
    scheduler.update();
    expect(log).toEqual([1, 2, 3, 4]);
  });

  test('higher priority runs first and equal priorities take turns', () => {
    const scheduler = new JobScheduler({ timeSource: manualClock(), budget: seconds(1) });
    const order: string[] = [];
    const tagged = function* (tag: string, steps: number): Generator<void, void> {
      for (let i = 0; i < steps; i++) {
        order.push(tag);
        yield;
      }
    };

    scheduler.run(tagged('low', 2), { priority: -1 });
    scheduler.run(tagged('a', 2));
    scheduler.run(tagged('b', 2));
    scheduler.run(tagged('high', 2), { priority: 5 });
    scheduler.update();

    expect(order).toEqual(['high', 'high', 'a', 'b', 'a', 'b', 'low', 'low']);
  });

  test('done resolves with the result after settlement', async () => {
    const scheduler = new JobScheduler({ timeSource: manualClock(), budget: seconds(1) });
    const job = scheduler.run(countTo(2));
    const done = job.done;

    scheduler.update();

    await expect(done).resolves.toBe(2);
    await expect(job.done).resolves.toBe(2);
  });

  test('a throwing job fails, rejects done, and leaves the others running', async () => {
    const scheduler = new JobScheduler({ timeSource: manualClock(), budget: seconds(1) });
    const failing = scheduler.run(
      (function* (): Generator<void, void> {
        yield;
        throw new Error('boom');
      })(),
    );
    const other = scheduler.run(countTo(3));

    scheduler.update();

    expect(failing.status).toBe('failed');
    expect(failing.error).toBeInstanceOf(Error);
    expect(other.status).toBe('done');
    await expect(failing.done).rejects.toThrow('boom');
  });

  test('cancel stops the generator at its yield, runs finally, and rejects with AbortError', async () => {
    const scheduler = new JobScheduler({ timeSource: manualClock(), budget: seconds(0) });
    const cleanup = vi.fn();
    const job = scheduler.run(
      (function* (): Generator<void, void> {
        try {
          yield;
          yield;
        } finally {
          cleanup();
        }
      })(),
    );

    scheduler.update();
    job.cancel();

    expect(job.status).toBe('cancelled');
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(scheduler.size).toBe(1);
    scheduler.update();
    expect(scheduler.size).toBe(0);
    await expect(job.done).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('a scope owns the job while it runs and releases it on settlement', () => {
    const scheduler = new JobScheduler({ timeSource: manualClock(), budget: seconds(0) });
    const scope = new DestroyScope();
    const finished = scheduler.run(countTo(1), { scope });
    const pending = scheduler.run(countTo(100), { scope });

    expect(scope.size).toBe(2);
    // Round-robin at one step per update: finished, pending, finished (done).
    scheduler.update();
    scheduler.update();
    scheduler.update();
    expect(finished.status).toBe('done');
    expect(pending.status).toBe('running');
    expect(scope.size).toBe(1);

    scope.destroy();
    expect(pending.status).toBe('cancelled');
    expect(scope.size).toBe(0);
  });

  test('cancelling from inside a step does not disturb the round', () => {
    const scheduler = new JobScheduler({ timeSource: manualClock(), budget: seconds(1) });
    const log: string[] = [];
    let victim: { cancel(): void } | null = null;
    const killer = (function* (): Generator<void, void> {
      log.push('killer');
      victim!.cancel();
      yield;
      log.push('killer');
    })();

    scheduler.run(killer);
    victim = scheduler.run(
      (function* (): Generator<void, void> {
        log.push('victim');
        yield;
      })(),
    );
    scheduler.run(
      (function* (): Generator<void, void> {
        log.push('third');
        yield;
        log.push('third');
      })(),
    );

    scheduler.update();

    expect(log).toEqual(['killer', 'third', 'killer', 'third']);
    expect(scheduler.size).toBe(0);
  });

  test('clear cancels everything and destroy refuses new work', () => {
    const scheduler = new JobScheduler({ timeSource: manualClock() });
    const a = scheduler.run(countTo(5));
    const b = scheduler.run(countTo(5));

    scheduler.clear();
    expect(a.status).toBe('cancelled');
    expect(b.status).toBe('cancelled');
    expect(scheduler.size).toBe(0);

    scheduler.destroy();
    expect(scheduler.destroyed).toBe(true);
    expect(() => scheduler.run(countTo(1))).toThrow(/destroyed/u);
  });
});
