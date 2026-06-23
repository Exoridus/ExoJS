import { AudioManager } from '#audio/AudioManager';
import { Scene } from '#core/Scene';
import type { System } from '#core/System';
import { Time } from '#core/Time';
import { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';

// Scene-bound system registry: systems tick after Scene.update in ascending
// `order`, structural mutations during a tick are deferred, and systems are
// destroyed with the scene. SceneSystems is internal to Scene.ts, so it is
// exercised through `scene.systems` / `scene._tickSystems`.

class MockSystem implements System {
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

const tick = (scene: Scene): void => {
  scene._tickSystems(Time.temp.set(16));
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
      destroy: (): void => {},
    };
    scene.systems.add(adder);

    tick(scene); // adder runs, schedules `late`; `late` must NOT run this frame
    expect(late.updates).toBe(0);
    expect(scene.systems.has(late)).toBe(true);

    tick(scene); // now `late` runs
    expect(late.updates).toBe(1);

    scene.destroy();
  });
});

describe('System.update contract', () => {
  test('InputManager, InteractionManager, AudioManager all satisfy (delta: Time) => void', () => {
    expectTypeOf(InputManager.prototype.update).toEqualTypeOf<(delta: Time) => void>();
    expectTypeOf(InteractionManager.prototype.update).toEqualTypeOf<(delta: Time) => void>();
    expectTypeOf(AudioManager.prototype.update).toEqualTypeOf<(delta: Time) => void>();
  });
});
