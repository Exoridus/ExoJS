import type { Destroyable, LoaderScope } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import { MapObjectSpawner } from '../src/MapObjectSpawner';
import type { MapLevel } from '../src/MapWorld';
import { MapWorld } from '../src/MapWorld';
import { MapWorldRuntime } from '../src/MapWorldRuntime';
import { ObjectLayer } from '../src/ObjectLayer';
import { TileMap } from '../src/TileMap';

// ── Fake loader scope ────────────────────────────────────────────────────────

interface FakeScope {
  readonly name: string;
  readonly children: FakeScope[];
  destroyed: boolean;
  createScope(options?: { name?: string }): LoaderScope;
  destroy(): void;
}

function fakeScope(name: string, log: string[] = []): FakeScope & LoaderScope {
  const scope: FakeScope = {
    name,
    children: [],
    destroyed: false,
    createScope(options) {
      const child = fakeScope(options?.name ?? '', log);
      scope.children.push(child);
      return child;
    },
    destroy() {
      if (scope.destroyed) return;
      scope.destroyed = true;
      log.push(name);
      for (const child of scope.children) child.destroy();
    },
  };

  return scope as unknown as FakeScope & LoaderScope;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function level(id: string): MapLevel {
  return {
    id,
    name: id,
    index: 0,
    bounds: { x: 0, y: 0, width: 64, height: 64 },
    external: false,
    neighbours: [],
    properties: {},
  };
}

const world = new MapWorld({ name: 'overworld', levels: [level('forest'), level('cave')] });

function levelMap(id: string, objectType?: string): TileMap {
  return new TileMap({
    name: id,
    width: 4,
    height: 4,
    tileWidth: 16,
    tileHeight: 16,
    objectLayers:
      objectType === undefined
        ? []
        : [
            new ObjectLayer({
              id: 1,
              name: 'entities',
              objects: [
                {
                  kind: 'rectangle',
                  id: 1,
                  name: '',
                  type: objectType,
                  x: 0,
                  y: 0,
                  width: 8,
                  height: 8,
                  rotation: 0,
                  visible: true,
                  properties: {},
                },
              ],
            }),
          ],
  });
}

class Thing implements Destroyable {
  public destroyed = false;

  public constructor(private readonly _log: string[]) {}

  public destroy(): void {
    this.destroyed = true;
    this._log.push('spawn');
  }
}

const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MapWorldRuntime loading', () => {
  it('gives each level its own scope under the runtime scope', async () => {
    const root = fakeScope('root');
    const runtime = new MapWorldRuntime({ world, scope: root, load: ({ level: l }) => levelMap(l.id) });

    const forest = await runtime.loadLevel('forest');

    expect(root.children).toHaveLength(1);
    expect((root.children[0] as unknown as FakeScope).name).toBe('overworld');
    expect((forest.scope as unknown as FakeScope).name).toBe('level:forest');
    expect(runtime.isLoaded('forest')).toBe(true);
    expect(runtime.levels.map(l => l.id)).toEqual(['forest']);
  });

  it('destroys spawns, map and scope in that order on unload', async () => {
    const log: string[] = [];
    const root = fakeScope('root', log);
    const spawner = new MapObjectSpawner<void, Thing>({ Enemy: () => new Thing(log) });
    const runtime = new MapWorldRuntime({ world, scope: root, load: ({ level: l }) => levelMap(l.id, 'Enemy') });

    const forest = await runtime.loadLevel('forest', { spawner, context: undefined });
    const map = forest.map;

    forest.destroy();
    forest.destroy();

    expect(log).toEqual(['spawn', 'level:forest']);
    expect(map.destroyed).toBe(true);
    expect(forest.destroyed).toBe(true);
    expect(runtime.isLoaded('forest')).toBe(false);
  });

  it('leaves a sibling level untouched when one unloads', async () => {
    const root = fakeScope('root');
    const runtime = new MapWorldRuntime({ world, scope: root, load: ({ level: l }) => levelMap(l.id) });

    const forest = await runtime.loadLevel('forest');
    const cave = await runtime.loadLevel('cave');

    runtime.unloadLevel('forest');

    expect((forest.scope as unknown as FakeScope).destroyed).toBe(true);
    expect((cave.scope as unknown as FakeScope).destroyed).toBe(false);
    expect(cave.map.destroyed).toBe(false);
  });

  it('reloads a level after it was unloaded', async () => {
    const root = fakeScope('root');
    const load = vi.fn(({ level: l }: { level: MapLevel }) => levelMap(l.id));
    const runtime = new MapWorldRuntime({ world, scope: root, load });

    const first = await runtime.loadLevel('forest');
    runtime.unloadLevel('forest');
    const second = await runtime.loadLevel('forest');

    expect(load).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
    expect(second.map.destroyed).toBe(false);
  });

  it('rejects an unknown level id', async () => {
    const runtime = new MapWorldRuntime({ world, scope: fakeScope('root'), load: ({ level: l }) => levelMap(l.id) });

    await expect(runtime.loadLevel('atlantis')).rejects.toThrow(/no level with id "atlantis"/);
  });

  it('makes the level scope and signal available to the provider', async () => {
    const runtime = new MapWorldRuntime({
      world,
      scope: fakeScope('root'),
      load: context => {
        expect((context.scope as unknown as FakeScope).name).toBe('level:cave');
        expect(context.signal.aborted).toBe(false);
        expect(context.level.id).toBe('cave');
        return levelMap(context.level.id);
      },
    });

    await runtime.loadLevel('cave');
  });
});

describe('MapWorldRuntime concurrency', () => {
  it('returns the live runtime for a repeated load', async () => {
    const load = vi.fn(({ level: l }: { level: MapLevel }) => levelMap(l.id));
    const runtime = new MapWorldRuntime({ world, scope: fakeScope('root'), load });

    const first = await runtime.loadLevel('forest');
    const second = await runtime.loadLevel('forest');

    expect(second).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent loads of the same level onto one operation', async () => {
    const load = vi.fn(async ({ level: l }: { level: MapLevel }) => {
      await tick();
      return levelMap(l.id);
    });
    const runtime = new MapWorldRuntime({ world, scope: fakeScope('root'), load });

    const [a, b] = await Promise.all([runtime.loadLevel('forest'), runtime.loadLevel('forest')]);

    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads two different levels independently', async () => {
    const runtime = new MapWorldRuntime({
      world,
      scope: fakeScope('root'),
      load: async ({ level: l }) => {
        await tick();
        return levelMap(l.id);
      },
    });

    const [forest, cave] = await Promise.all([runtime.loadLevel('forest'), runtime.loadLevel('cave')]);

    expect(forest.id).toBe('forest');
    expect(cave.id).toBe('cave');
    expect(runtime.levels).toHaveLength(2);
  });
});

describe('MapWorldRuntime failure and cancellation', () => {
  it('releases the level scope when the provider fails', async () => {
    const root = fakeScope('root');
    const runtime = new MapWorldRuntime({
      world,
      scope: root,
      load: () => {
        throw new Error('bad level payload');
      },
    });

    await expect(runtime.loadLevel('forest')).rejects.toThrow('bad level payload');

    const worldScope = root.children[0] as unknown as FakeScope;
    expect(worldScope.children.every(child => child.destroyed)).toBe(true);
    expect(runtime.isLoaded('forest')).toBe(false);
    expect(runtime.isLoading('forest')).toBe(false);
  });

  it('destroys the map and the scope when spawning fails', async () => {
    const root = fakeScope('root');
    let created: TileMap | undefined;
    const spawner = new MapObjectSpawner<void, Thing>({
      Enemy: () => {
        throw new Error('factory exploded');
      },
    });
    const runtime = new MapWorldRuntime({
      world,
      scope: root,
      load: ({ level: l }) => {
        created = levelMap(l.id, 'Enemy');
        return created;
      },
    });

    await expect(runtime.loadLevel('forest', { spawner, context: undefined })).rejects.toMatchObject({
      name: 'MapSpawnError',
    });

    expect(created?.destroyed).toBe(true);
    expect(runtime.isLoaded('forest')).toBe(false);
  });

  it('refuses a load whose signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const load = vi.fn(({ level: l }: { level: MapLevel }) => levelMap(l.id));
    const runtime = new MapWorldRuntime({ world, scope: fakeScope('root'), load });

    await expect(runtime.loadLevel('forest', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(load).not.toHaveBeenCalled();
  });

  it('cancels an in-flight load through unloadLevel and leaves nothing behind', async () => {
    const root = fakeScope('root');
    let created: TileMap | undefined;
    const runtime = new MapWorldRuntime({
      world,
      scope: root,
      load: async ({ level: l }) => {
        await tick();
        created = levelMap(l.id);
        return created;
      },
    });

    const pending = runtime.loadLevel('forest');
    expect(runtime.unloadLevel('forest')).toBe(true);

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(created?.destroyed).toBe(true);
    expect(runtime.isLoaded('forest')).toBe(false);
    expect(runtime.isLoading('forest')).toBe(false);
  });

  it('starts a fresh load when a level is reloaded in the same turn it was cancelled', async () => {
    const load = vi.fn(async ({ level: l }: { level: MapLevel }) => {
      await tick();
      return levelMap(l.id);
    });
    const runtime = new MapWorldRuntime({ world, scope: fakeScope('root'), load });

    const cancelled = runtime.loadLevel('forest');
    runtime.unloadLevel('forest');
    const reloaded = runtime.loadLevel('forest');

    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    await expect(reloaded).resolves.toMatchObject({ id: 'forest' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reloads a level immediately after a failed load', async () => {
    let attempt = 0;
    const runtime = new MapWorldRuntime({
      world,
      scope: fakeScope('root'),
      load: ({ level: l }) => {
        attempt++;
        if (attempt === 1) throw new Error('first attempt failed');
        return levelMap(l.id);
      },
    });

    await expect(runtime.loadLevel('forest')).rejects.toThrow('first attempt failed');

    await expect(runtime.loadLevel('forest')).resolves.toMatchObject({ id: 'forest' });
  });

  it('leaves a sibling level untouched when another level fails to load', async () => {
    const runtime = new MapWorldRuntime({
      world,
      scope: fakeScope('root'),
      load: async ({ level: l }) => {
        await tick();
        if (l.id === 'cave') throw new Error('cave is broken');
        return levelMap(l.id);
      },
    });

    const [forest, cave] = await Promise.allSettled([runtime.loadLevel('forest'), runtime.loadLevel('cave')]);

    expect(forest.status).toBe('fulfilled');
    expect(cave.status).toBe('rejected');
    expect(runtime.levels.map(level => level.id)).toEqual(['forest']);
    expect(runtime.getLevel('forest')?.map.destroyed).toBe(false);
  });

  it('cleans up a level whose provider resolves after the runtime was destroyed', async () => {
    const root = fakeScope('root');
    let created: TileMap | undefined;
    const runtime = new MapWorldRuntime({
      world,
      scope: root,
      load: async ({ level: l }) => {
        await tick();
        created = levelMap(l.id);
        return created;
      },
    });

    const pending = runtime.loadLevel('forest');
    runtime.destroy();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(created?.destroyed).toBe(true);
    expect(runtime.levels).toEqual([]);
    expect(root.children[0]?.destroyed).toBe(true);
  });

  it('rolls the level back when it is unloaded while its objects are spawning', async () => {
    const log: string[] = [];
    const root = fakeScope('root', log);
    let created: TileMap | undefined;
    const spawner = new MapObjectSpawner<void, Thing>({
      Enemy: async () => {
        runtime.unloadLevel('forest');
        await tick();
        return new Thing(log);
      },
    });
    const runtime = new MapWorldRuntime({
      world,
      scope: root,
      load: ({ level: l }) => {
        created = levelMap(l.id, 'Enemy');
        return created;
      },
    });

    await expect(runtime.loadLevel('forest', { spawner, context: undefined })).rejects.toMatchObject({
      name: 'AbortError',
    });

    // The late-resolving spawn result, the map and the scope are all released.
    expect(log).toEqual(['spawn', 'level:forest']);
    expect(created?.destroyed).toBe(true);
    expect(runtime.isLoaded('forest')).toBe(false);
  });

  it('releases the level scope even when the map fails to destroy', async () => {
    const root = fakeScope('root');
    const runtime = new MapWorldRuntime({
      world,
      scope: root,
      load: ({ level: l }) => {
        const map = levelMap(l.id);
        vi.spyOn(map, 'destroy').mockImplementation(() => {
          throw new Error('map teardown exploded');
        });
        return map;
      },
    });

    const forest = await runtime.loadLevel('forest');
    const levelScope = forest.scope as unknown as FakeScope;

    expect(() => forest.destroy()).not.toThrow();
    expect(levelScope.destroyed).toBe(true);
    expect(runtime.isLoaded('forest')).toBe(false);
  });

  it('unloads the levels after one whose teardown fails', async () => {
    const root = fakeScope('root');
    const runtime = new MapWorldRuntime({
      world,
      scope: root,
      load: ({ level: l }) => {
        const map = levelMap(l.id);
        if (l.id === 'cave') {
          vi.spyOn(map, 'destroy').mockImplementation(() => {
            throw new Error('cave teardown exploded');
          });
        }
        return map;
      },
    });

    await runtime.loadLevel('forest');
    const cave = await runtime.loadLevel('cave');
    const forest = runtime.getLevel('forest');

    expect(() => runtime.destroy()).not.toThrow();

    // Teardown runs in reverse load order, so the broken cave comes first.
    expect(cave.destroyed).toBe(true);
    expect(forest?.destroyed).toBe(true);
    expect((forest?.scope as unknown as FakeScope).destroyed).toBe(true);
  });

  it('reports nothing to unload for a level that is neither loaded nor loading', () => {
    const runtime = new MapWorldRuntime({ world, scope: fakeScope('root'), load: ({ level: l }) => levelMap(l.id) });

    expect(runtime.unloadLevel('forest')).toBe(false);
  });
});

describe('MapWorldRuntime teardown', () => {
  it('unloads every level in reverse load order and releases only its own scope', async () => {
    const log: string[] = [];
    const root = fakeScope('root', log);
    const runtime = new MapWorldRuntime({ world, scope: root, load: ({ level: l }) => levelMap(l.id) });

    await runtime.loadLevel('forest');
    await runtime.loadLevel('cave');

    runtime.destroy();
    runtime.destroy();

    expect(log).toEqual(['level:cave', 'level:forest', 'overworld']);
    expect(root.destroyed).toBe(false);
    expect(runtime.destroyed).toBe(true);
  });

  it('refuses to load after destroy', async () => {
    const runtime = new MapWorldRuntime({ world, scope: fakeScope('root'), load: ({ level: l }) => levelMap(l.id) });
    runtime.destroy();

    await expect(runtime.loadLevel('forest')).rejects.toThrow(/the runtime is destroyed/);
  });
});

describe('MapWorldRuntime load options', () => {
  it('cancels a load that spawns nothing, without a context', async () => {
    const controller = new AbortController();
    const runtime = new MapWorldRuntime({
      world,
      scope: fakeScope('root'),
      load: async ({ level: l }) => {
        controller.abort();
        await tick();
        return levelMap(l.id);
      },
    });

    await expect(runtime.loadLevel('forest', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('narrows the spawn session to the spawner result type', async () => {
    const runtime = new MapWorldRuntime({ world, scope: fakeScope('root'), load: ({ level: l }) => levelMap(l.id, 'Enemy') });
    const spawner = new MapObjectSpawner<void, Thing>({ Enemy: () => new Thing([]) });

    const forest = await runtime.loadLevel('forest', { spawner, context: undefined });
    const spawned: Thing | undefined = forest.spawns?.objects[0];

    expect(spawned).toBeInstanceOf(Thing);
  });
});
