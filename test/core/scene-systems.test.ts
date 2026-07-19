import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { SceneScope } from '#core/SceneScope';
import { Signal } from '#core/Signal';
import type { System } from '#core/System';
import { Time } from '#core/Time';

// Scene-bound system registry: `scene.systems` is an ordinary SystemRegistry
// owned by the scene's SceneScope (see system-registry.test.ts for its full
// ordering/mutation-buffering/destruction contract). This file exercises the
// Scene-level wiring: `scene.systems` returns the scope's working registry,
// its update phase runs once per simulated frame, and permanent teardown
// destroys every remaining registered system.

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

// Minimal Application stand-in covering everything a permanent-teardown
// SceneScope.destroy() call reaches (loader claim release, error reporting)
// even though this file never exercises loader claims, input bindings,
// tweens, audio, or interaction directly.
const fakeApp = {
  id: 'app',
  loader: { _releaseScope: vi.fn() },
  onError: new Signal<[Error]>(),
} as unknown as Application;

/** A scene attached to a real SceneScope (facilities materialized), without running the full load()/init() activation sequence. */
const makeAttachedScene = (): { scene: Scene; scope: SceneScope<void> } => {
  const scene = new Scene();
  const scope = new SceneScope(fakeApp, scene);

  return { scene, scope };
};

// A "frame" against a bare registry: open the mutation-buffering window,
// dispatch the update phase, then close it — mirroring how Application
// drives `scene.systems` in practice.
const tick = (scene: Scene): void => {
  scene.systems._beginFrame();
  scene.systems._update(Time.temp.set(16));
  scene.systems._endFrame();
};

describe('Scene.systems', () => {
  test('throws before the scene is attached', () => {
    const scene = new Scene();

    expect(() => scene.systems).toThrow(/unavailable/);
  });

  test('add returns the system and registers it', () => {
    const { scene } = makeAttachedScene();
    const system = new MockSystem(0);

    expect(scene.systems.add(system)).toBe(system);
    expect(scene.systems.has(system)).toBe(true);
    expect(scene.systems.size).toBe(1);
  });

  test('systems tick after update in ascending order', () => {
    const { scene } = makeAttachedScene();
    const log: string[] = [];

    scene.systems.add(new MockSystem(30, log, 'c'));
    scene.systems.add(new MockSystem(10, log, 'a'));
    scene.systems.add(new MockSystem(20, log, 'b'));

    tick(scene);

    expect(log).toEqual(['a', 'b', 'c']);
  });

  test('each tick advances every system once', () => {
    const { scene } = makeAttachedScene();
    const system = scene.systems.add(new MockSystem(0));

    tick(scene);
    tick(scene);

    expect(system.updates).toBe(2);
  });

  test('removed systems stop ticking', () => {
    const { scene } = makeAttachedScene();
    const system = scene.systems.add(new MockSystem(0));

    expect(scene.systems.remove(system)).toBe(true);
    tick(scene);

    expect(system.updates).toBe(0);
  });

  test('permanent teardown destroys registered systems', async () => {
    const { scene, scope } = makeAttachedScene();
    const a = scene.systems.add(new MockSystem(0));
    const b = scene.systems.add(new MockSystem(1));

    await scope.destroy();

    expect(a.destroyed).toBe(true);
    expect(b.destroyed).toBe(true);
  });

  test('a system added during a tick is deferred to the next frame', () => {
    const { scene } = makeAttachedScene();
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
  });
});
