import type { System } from '#core/System';
import { SystemRegistry } from '#core/SystemRegistry';
import { Time } from '#core/Time';

// Direct SystemRegistry tests — order/before/after ordering in isolation,
// without going through Scene/Application wiring (see scene-systems.test.ts
// for the Scene-level integration).

const makeSystem = (log: string[], name: string, order?: number): System => ({
  order,
  update: (): void => {
    log.push(name);
  },
});

const tick = (registry: SystemRegistry): void => {
  registry._beginFrame();
  registry._update(new Time(16));
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
    // update list — the constraint must not affect update-phase ordering.
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
