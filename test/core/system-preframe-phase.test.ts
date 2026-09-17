import type { System } from '#core/System';
import { SystemRegistry } from '#core/SystemRegistry';
import { type Seconds, Time } from '#core/units';

// The `preFrame` phase - the frame slot ahead of the fixed steps, where the
// engine's own per-frame state is brought in sync before any simulation runs.
// Ordering semantics (order/before/after) are shared with the other phases and
// covered in system-registry.test.ts; these specs cover the phase itself.

const delta = (): Seconds => Time.toSeconds(Time.milliseconds(16));

describe('SystemRegistry preFrame phase', () => {
  test('dispatches a system that only implements preFrame', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];

    registry.add({
      preFrame: () => {
        log.push('pre');
      },
    });

    registry._beginFrame();
    registry._preFrame(delta());
    registry._endFrame();

    expect(log).toEqual(['pre']);
  });

  test('runs the whole preFrame phase before any fixed step', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];

    registry.add({
      order: 10,
      preFrame: () => {
        log.push('pre:b');
      },
    });
    registry.add({
      order: -10,
      preFrame: () => {
        log.push('pre:a');
      },
    });
    registry.add({
      fixedUpdate: () => {
        log.push('fixed');
      },
    });
    registry.add({
      update: () => {
        log.push('update');
      },
    });

    registry._beginFrame();
    registry._preFrame(delta());
    registry._fixedUpdate(delta());
    registry._update(delta());
    registry._endFrame();

    expect(log).toEqual(['pre:a', 'pre:b', 'fixed', 'update']);
  });

  test('lets a system take part in preFrame and update independently', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];

    const both: System = {
      preFrame: () => {
        log.push('pre');
      },
      update: () => {
        log.push('update');
      },
    };

    registry.add(both);

    registry._beginFrame();
    registry._preFrame(delta());
    registry._update(delta());
    registry._endFrame();

    expect(log).toEqual(['pre', 'update']);
  });

  test('drops a removed system from the preFrame phase', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];
    const system: System = {
      preFrame: () => {
        log.push('pre');
      },
    };

    registry.add(system);
    registry.remove(system);

    registry._beginFrame();
    registry._preFrame(delta());
    registry._endFrame();

    expect(log).toEqual([]);
  });

  test('rejects an async preFrame the way the other phases do', () => {
    const registry = new SystemRegistry();

    registry.add({ preFrame: () => Promise.resolve() as never });

    registry._beginFrame();
    expect(() => registry._preFrame(delta())).toThrow(/preFrame/);
    registry._endFrame();
  });
});
