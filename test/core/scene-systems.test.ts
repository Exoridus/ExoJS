import { Scene } from '#core/Scene';
import type { System } from '#core/System';
import { Time } from '#core/Time';

// Scene-bound system registry: `scene.systems` is an ordinary SystemRegistry
// (see system-registry.test.ts for its full ordering/mutation-buffering/
// destruction contract), scoped to the scene and destroyed with it. This file
// exercises the Scene-level wiring: `scene.systems` returns a working
// registry, its update phase runs once per simulated frame, and
// `Scene.destroy()` destroys every remaining registered system.

// `System` is a union (via `RequireAtLeastOne`), so a class cannot
// `implements` it directly — structural assignability (e.g. passing an
// instance to `scene.systems.add()`) is what the contract actually relies on.
class MockSystem {
  public updates = 0;
  public destroyed = false;

  public constructor(
    public readonly order: number,
    private readonly _log?: string[],
    private readonly _name?: string,
  ) {}

  public update(_delta: Time): void {
    this.updates++;

    if (this._log && this._name !== undefined) {
      this._log.push(this._name);
    }
  }

  public destroy(): void {
    this.destroyed = true;
  }
}

// A "frame" against a bare registry: open the mutation-buffering window,
// dispatch the update phase, then close it — mirroring how Application
// drives `scene.systems` in practice.
const tick = (scene: Scene): void => {
  scene.systems._beginFrame();
  scene.systems._update(Time.temp.set(16));
  scene.systems._endFrame();
};

describe('Scene.systems', () => {
  test('add returns the system and registers it', () => {
    const scene = new Scene();
    const system = new MockSystem(0);

    expect(scene.systems.add(system)).toBe(system);
    expect(scene.systems.has(system)).toBe(true);
    expect(scene.systems.size).toBe(1);

    scene.destroy();
  });

  test('systems tick after update in ascending order', () => {
    const scene = new Scene();
    const log: string[] = [];

    scene.systems.add(new MockSystem(30, log, 'c'));
    scene.systems.add(new MockSystem(10, log, 'a'));
    scene.systems.add(new MockSystem(20, log, 'b'));

    tick(scene);

    expect(log).toEqual(['a', 'b', 'c']);

    scene.destroy();
  });

  test('each tick advances every system once', () => {
    const scene = new Scene();
    const system = scene.systems.add(new MockSystem(0));

    tick(scene);
    tick(scene);

    expect(system.updates).toBe(2);

    scene.destroy();
  });

  test('removed systems stop ticking', () => {
    const scene = new Scene();
    const system = scene.systems.add(new MockSystem(0));

    expect(scene.systems.remove(system)).toBe(true);
    tick(scene);

    expect(system.updates).toBe(0);

    scene.destroy();
  });

  test('Scene.destroy() destroys registered systems', () => {
    const scene = new Scene();
    const a = scene.systems.add(new MockSystem(0));
    const b = scene.systems.add(new MockSystem(1));

    scene.destroy();

    expect(a.destroyed).toBe(true);
    expect(b.destroyed).toBe(true);
  });

  test('a system added during a tick is deferred to the next frame', () => {
    const scene = new Scene();
    const late = new MockSystem(0);

    // A system that registers `late` the first time it updates.
    let added = false;
    const adder: System = {
      order: 0,
      update: (): void => {
        if (!added) {
          added = true;
          scene.systems.add(late);
        }
      },
    };
    scene.systems.add(adder);

    tick(scene); // adder runs, schedules `late`; `late` must NOT run this frame
    expect(late.updates).toBe(0);
    expect(scene.systems.has(late)).toBe(true); // eligible now that the frame boundary closed

    tick(scene); // now `late` runs
    expect(late.updates).toBe(1);

    scene.destroy();
  });

  test('_peekSystems() reflects the materialized registry without forcing allocation', () => {
    const scene = new Scene();

    expect(scene._peekSystems()).toBeNull();

    const registry = scene.systems;

    expect(scene._peekSystems()).toBe(registry);

    scene.destroy();
  });
});
