import { logger, LogSeverity } from '#core/Logger';
import type { System } from '#core/System';
import { SystemRegistry } from '#core/SystemRegistry';
import { Time } from '#core/units';

// Direct SystemRegistry tests - order/before/after ordering in isolation,
// without going through Scene/Application wiring (see scene-systems.test.ts
// for the Scene-level integration).

const makeSystem = (log: string[], name: string, order?: number): System => ({
  ...(order !== undefined && { order }),
  update: (): void => {
    log.push(name);
  },
});

const tick = (registry: SystemRegistry): void => {
  registry._beginFrame();
  registry._update(Time.toSeconds(Time.milliseconds(16)));
  registry._endFrame();
};

describe('SystemRegistry ordering — order/sequence baseline (regression)', () => {
  test('systems tick in ascending order; equal order keeps registration order', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];

    registry.add(makeSystem(log, 'c', 30));
    registry.add(makeSystem(log, 'a', 10));
    registry.add(makeSystem(log, 'b', 20));

    tick(registry);

    expect(log).toEqual(['a', 'b', 'c']);
  });
});

describe('SystemRegistry ordering — before/after', () => {
  test('before pulls a system ahead of its target regardless of order', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];

    const c = registry.add(makeSystem(log, 'c', 10));

    registry.add(makeSystem(log, 'a', 999), { before: [c] });

    tick(registry);

    expect(log).toEqual(['a', 'c']);
  });

  test('after pushes a system behind its target regardless of order', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];

    const a = registry.add(makeSystem(log, 'a', 999));

    registry.add(makeSystem(log, 'c', 10), { after: [a] });

    tick(registry);

    expect(log).toEqual(['a', 'c']);
  });

  test('two systems both declaring before the same target, all tied on order, keep registration order', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];

    const c = registry.add(makeSystem(log, 'c', 100));

    registry.add(makeSystem(log, 'a', 100), { before: [c] });
    registry.add(makeSystem(log, 'b', 100), { before: [c] });

    tick(registry);

    expect(log).toEqual(['a', 'b', 'c']);
  });

  test('a before/after constraint referencing a system outside this phase list is a silent no-op', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];
    const drawOnlySystem: System = { draw: (): void => {} };

    registry.add(makeSystem(log, 'c', 10));
    // 'a' declares before:[drawOnlySystem], but drawOnlySystem never enters the
    // update list - the constraint must not affect update-phase ordering.
    registry.add(makeSystem(log, 'a', 20), { before: [drawOnlySystem] });

    tick(registry);

    expect(log).toEqual(['c', 'a']);
  });

  test('a cycle throws a clear error naming the participating systems', () => {
    const registry = new SystemRegistry();

    class CycleSystemA {
      public update(): void {
        /* no-op */
      }
    }
    class CycleSystemB {
      public update(): void {
        /* no-op */
      }
    }

    const a = new CycleSystemA();
    const b = new CycleSystemB();

    registry.add(a, { before: [b] });
    registry.add(b, { before: [a] });

    expect(() => tick(registry)).toThrow(/CycleSystemA/);
    expect(() => tick(registry)).toThrow(/CycleSystemB/);
  });
});

describe('SystemRegistry.destroy() — a throwing system cannot strand the rest', () => {
  test('every remaining system is destroyed even when an earlier one throws', () => {
    const registry = new SystemRegistry();
    const destroyed: string[] = [];

    // Reverse registration order, so the thrower sits between two survivors.
    registry.add({ update: (): void => {}, destroy: (): void => void destroyed.push('first') });
    registry.add({
      update: (): void => {},
      destroy: (): never => {
        throw new Error('extension system blew up');
      },
    });
    registry.add({ update: (): void => {}, destroy: (): void => void destroyed.push('last') });

    registry.destroy();

    expect(destroyed).toEqual(['last', 'first']);
  });

  test('the clear-and-reset tail still runs, so the registry does not stay live', () => {
    const registry = new SystemRegistry();
    const survivor = { update: (): void => {} };

    registry.add({
      update: (): void => {},
      destroy: (): never => {
        throw new Error('extension system blew up');
      },
    });
    registry.add(survivor);
    registry.onRemove.add(() => {});

    registry.destroy();

    expect(registry.size).toBe(0);
    expect(registry.has(survivor)).toBe(false);
    expect(registry.onRemove.count).toBe(0);
  });

  test('destroy() does not propagate a system failure to its caller', () => {
    const registry = new SystemRegistry();

    registry.add({
      update: (): void => {},
      destroy: (): never => {
        throw new Error('extension system blew up');
      },
    });

    expect(() => registry.destroy()).not.toThrow();
  });
  test('the swallowed failure is reported through the logger, not lost', () => {
    const registry = new SystemRegistry();
    const reported: string[] = [];
    const removeSink = logger.addSink(entry => {
      if (entry.severity === LogSeverity.Error) reported.push(entry.message);
    });

    registry.add({
      update: (): void => {},
      destroy: (): never => {
        throw new Error('extension system blew up');
      },
    });

    try {
      registry.destroy();
    } finally {
      removeSink();
      logger._resetOnce();
    }

    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatch(/SystemRegistry\.destroy\(\)/);
  });
});

describe('SystemRegistry frame-scoped mutations', () => {
  test('re-adding a system removed earlier in the same frame keeps it registered', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];
    const system = makeSystem(log, 'a');

    registry.add(system);
    tick(registry);

    registry._beginFrame();
    expect(registry.remove(system)).toBe(true);
    registry.add(system);
    registry._endFrame();

    // The queued removal drains at the frame boundary, so a re-add that
    // resolved to add()'s duplicate no-op left nothing behind at all.
    expect(registry.has(system)).toBe(true);

    tick(registry);

    expect(log).toEqual(['a', 'a']);
  });

  test('a re-add inside the same frame takes the order the new call asks for', () => {
    const registry = new SystemRegistry();
    const log: string[] = [];
    const first = makeSystem(log, 'first', 10);
    const second = makeSystem(log, 'second', 20);

    registry.add(first);
    registry.add(second);
    tick(registry);

    registry._beginFrame();
    registry.remove(first);
    registry.add(first, { order: 30 });
    registry._endFrame();

    log.length = 0;
    tick(registry);

    expect(log).toEqual(['second', 'first']);
  });
});
