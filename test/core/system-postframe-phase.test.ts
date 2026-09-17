import type { FrameBudget } from '#core/FrameBudget';
import type { System } from '#core/System';
import { SystemRegistry } from '#core/SystemRegistry';
import { type Seconds, seconds, Time } from '#core/units';

// The `postFrame` phase - the frame slot after the backend flush, the only one
// handed a frame budget. Ordering semantics (order/before/after) are shared
// with the other phases and covered in system-registry.test.ts; these specs
// cover the phase itself.

const delta = (): Seconds => Time.toSeconds(Time.milliseconds(16));

const budgetOf = (remaining: number): FrameBudget => ({ timeRemaining: () => seconds(remaining) });

describe('SystemRegistry postFrame phase', () => {
  test('dispatches a system that only implements postFrame', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];

    registry.add({
      postFrame: () => {
        log.push('post');
      },
    });

    registry._beginFrame();
    registry._postFrame(delta(), budgetOf(0.004));
    registry._endFrame();

    expect(log).toEqual(['post']);
  });

  test('hands the phase its delta and the frame budget', () => {
    const registry = new SystemRegistry();
    const budget = budgetOf(0.003);
    const seen: Array<[Seconds, FrameBudget]> = [];

    registry.add({
      postFrame: (frameDelta: Seconds, frameBudget: FrameBudget) => {
        seen.push([frameDelta, frameBudget]);
      },
    });

    registry._beginFrame();
    registry._postFrame(delta(), budget);
    registry._endFrame();

    expect(seen).toHaveLength(1);
    expect(seen[0]![0]).toBeCloseTo(0.016, 6);
    expect(seen[0]![1]).toBe(budget);
    expect(seen[0]![1].timeRemaining()).toBeCloseTo(0.003, 6);
  });

  test('runs in ascending order, insertion order breaking a tie', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];

    registry.add({
      order: 10,
      postFrame: () => {
        log.push('late');
      },
    });
    registry.add({
      order: -10,
      postFrame: () => {
        log.push('early');
      },
    });
    registry.add({
      postFrame: () => {
        log.push('default:first');
      },
    });
    registry.add({
      postFrame: () => {
        log.push('default:second');
      },
    });

    registry._beginFrame();
    registry._postFrame(delta(), budgetOf(0.004));
    registry._endFrame();

    expect(log).toEqual(['early', 'default:first', 'default:second', 'late']);
  });

  test('runs after every other phase of the same frame', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];

    registry.add({
      preFrame: () => {
        log.push('pre');
      },
      update: () => {
        log.push('update');
      },
      postFrame: () => {
        log.push('post');
      },
    });

    registry._beginFrame();
    registry._preFrame(delta());
    registry._update(delta());
    registry._postFrame(delta(), budgetOf(0.004));
    registry._endFrame();

    expect(log).toEqual(['pre', 'update', 'post']);
  });

  test('honours a `phases` restriction that leaves postFrame out', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];

    registry.add(
      {
        update: () => {
          log.push('update');
        },
        postFrame: () => {
          log.push('post');
        },
      },
      { phases: ['update'] },
    );

    registry._beginFrame();
    registry._update(delta());
    registry._postFrame(delta(), budgetOf(0.004));
    registry._endFrame();

    expect(log).toEqual(['update']);
  });

  test('honours a `phases` restriction that names postFrame alone', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];

    registry.add(
      {
        update: () => {
          log.push('update');
        },
        postFrame: () => {
          log.push('post');
        },
      },
      { phases: ['postFrame'] },
    );

    registry._beginFrame();
    registry._update(delta());
    registry._postFrame(delta(), budgetOf(0.004));
    registry._endFrame();

    expect(log).toEqual(['post']);
  });

  test('drops a removed system from the postFrame phase', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];
    const system: System = {
      postFrame: () => {
        log.push('post');
      },
    };

    registry.add(system);
    registry.remove(system);

    registry._beginFrame();
    registry._postFrame(delta(), budgetOf(0.004));
    registry._endFrame();

    expect(log).toEqual([]);
  });

  test('rejects an async postFrame the way the other phases do', () => {
    const registry = new SystemRegistry();

    registry.add({ postFrame: () => Promise.resolve() as never });

    registry._beginFrame();
    expect(() => registry._postFrame(delta(), budgetOf(0.004))).toThrow(/postFrame/);
    registry._endFrame();
  });
});
