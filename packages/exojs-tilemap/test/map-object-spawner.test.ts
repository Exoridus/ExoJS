import type { Destroyable } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import type { MapObjectDescriptor } from '../src/MapObject';
import { MapObjectSpawner, MapSpawnError } from '../src/MapObjectSpawner';
import type { TileMapObject } from '../src/ObjectLayer';
import { ObjectLayer } from '../src/ObjectLayer';
import { TileMap } from '../src/TileMap';

// ── Fixtures ─────────────────────────────────────────────────────────────────

interface LayerSpec {
  readonly id: number;
  readonly name: string;
  readonly objects: readonly ObjectSpec[];
}

interface ObjectSpec {
  readonly id: number;
  readonly type?: string;
  readonly sourceId?: string;
  readonly name?: string;
}

function object(spec: ObjectSpec): TileMapObject {
  return {
    kind: 'rectangle',
    id: spec.id,
    ...(spec.sourceId !== undefined && { sourceId: spec.sourceId }),
    name: spec.name ?? '',
    type: spec.type ?? '',
    x: spec.id * 10,
    y: 0,
    width: 8,
    height: 8,
    rotation: 0,
    visible: true,
    properties: {},
  };
}

function mapWith(...layers: readonly LayerSpec[]): TileMap {
  return new TileMap({
    name: 'level',
    width: 4,
    height: 4,
    tileWidth: 16,
    tileHeight: 16,
    objectLayers: layers.map(
      layer => new ObjectLayer({ id: layer.id, name: layer.name, objects: layer.objects.map(object) }),
    ),
  });
}

class Thing implements Destroyable {

  public destroyed = false;

  public constructor(
    public readonly label: string,
    private readonly _log: string[] = [],
  ) {}

  public destroy(): void {
    this.destroyed = true;
    this._log.push(this.label);
  }
}

/** A spawn result whose teardown fails, for the guarded-teardown paths. */
class BrittleThing extends Thing {

  public override destroy(): never {
    throw new Error('teardown exploded');
  }
}

const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

// ── Identification ───────────────────────────────────────────────────────────

describe('MapObjectSpawner identification', () => {
  it('dispatches on the object kind by default', async () => {
    const map = mapWith({ id: 1, name: 'entities', objects: [{ id: 1, type: 'Enemy' }, { id: 2, type: 'Chest' }] });
    const spawner = new MapObjectSpawner<void, Thing>({
      Enemy: () => new Thing('enemy'),
      Chest: () => new Thing('chest'),
    });

    const session = await spawner.spawn(map, undefined);

    expect(session.objects.map(thing => thing.label)).toEqual(['enemy', 'chest']);
  });

  it('honours a custom identify strategy over the kind', async () => {
    const map = mapWith({
      id: 1,
      name: 'entities',
      objects: [{ id: 1, type: 'Enemy', name: 'boss' }, { id: 2, type: 'Enemy', name: 'grunt' }],
    });
    const spawner = new MapObjectSpawner<void, Thing>(
      { 'Enemy:boss': () => new Thing('boss'), 'Enemy:grunt': () => new Thing('grunt') },
      { identify: descriptor => `${descriptor.kind}:${descriptor.name}` },
    );

    const session = await spawner.spawn(map, undefined);

    expect(session.objects.map(thing => thing.label)).toEqual(['boss', 'grunt']);
  });

  it('treats a null from identify as unknown', async () => {
    const map = mapWith({ id: 1, name: 'entities', objects: [{ id: 1, type: 'Enemy' }] });
    const spawner = new MapObjectSpawner<void, Thing>(
      { Enemy: () => new Thing('enemy') },
      { identify: () => null, unknown: 'error' },
    );

    await expect(spawner.spawn(map, undefined)).rejects.toMatchObject({ reason: 'unknown-kind', kind: 'Enemy' });
  });

  it('passes the spawn context to identify', async () => {
    const map = mapWith({ id: 1, name: 'entities', objects: [{ id: 1, type: 'Enemy' }] });
    const identify = vi.fn((_object: MapObjectDescriptor, context: { hard: boolean }) =>
      context.hard ? 'Enemy:hard' : 'Enemy',
    );
    const spawner = new MapObjectSpawner<{ hard: boolean }, Thing>(
      { Enemy: () => new Thing('normal'), 'Enemy:hard': () => new Thing('hard') },
      { identify },
    );

    const session = await spawner.spawn(map, { hard: true });

    expect(session.objects.map(thing => thing.label)).toEqual(['hard']);
  });
});

// ── Unknown objects ──────────────────────────────────────────────────────────

describe('MapObjectSpawner unknown objects', () => {
  it('ignores unmatched objects by default', async () => {
    const map = mapWith({
      id: 1,
      name: 'entities',
      objects: [{ id: 1, type: 'Enemy' }, { id: 2, type: 'EditorMarker' }, { id: 3 }],
    });
    const spawner = new MapObjectSpawner<void, Thing>({ Enemy: () => new Thing('enemy') });

    const session = await spawner.spawn(map, undefined);

    expect(session.objects).toHaveLength(1);
    expect(spawner.unknown).toBe('ignore');
  });

  it('rejects an unmatched object under unknown: error', async () => {
    const map = mapWith({ id: 1, name: 'entities', objects: [{ id: 7, type: 'Ghost' }] });
    const spawner = new MapObjectSpawner<void, Thing>({ Enemy: () => new Thing('enemy') }, { unknown: 'error' });

    await expect(spawner.spawn(map, undefined)).rejects.toMatchObject({
      name: 'MapSpawnError',
      reason: 'unknown-kind',
      objectId: '7',
      kind: 'Ghost',
    });
  });

  it('does not resolve a class name that exists on Object.prototype', async () => {
    const map = mapWith({ id: 1, name: 'entities', objects: [{ id: 1, type: 'toString' }] });
    const spawner = new MapObjectSpawner<void, Thing>({ Enemy: () => new Thing('enemy') }, { unknown: 'error' });

    await expect(spawner.spawn(map, undefined)).rejects.toMatchObject({
      reason: 'unknown-kind',
      kind: 'toString',
    });
    expect(spawner.handles('toString')).toBe(false);
  });

  it('treats an object without a class as unknown', async () => {
    const map = mapWith({ id: 1, name: 'entities', objects: [{ id: 4 }] });
    const spawner = new MapObjectSpawner<void, Thing>({ Enemy: () => new Thing('enemy') }, { unknown: 'error' });

    await expect(spawner.spawn(map, undefined)).rejects.toMatchObject({ reason: 'unknown-kind', kind: null });
  });
});

// ── Factories ────────────────────────────────────────────────────────────────

describe('MapObjectSpawner factories', () => {
  it('accepts synchronous and asynchronous factories side by side', async () => {
    const map = mapWith({ id: 1, name: 'entities', objects: [{ id: 1, type: 'Sync' }, { id: 2, type: 'Async' }] });
    const spawner = new MapObjectSpawner<void, Thing>({
      Sync: () => new Thing('sync'),
      Async: async () => {
        await tick();
        return new Thing('async');
      },
    });

    const session = await spawner.spawn(map, undefined);

    expect(session.objects.map(thing => thing.label)).toEqual(['sync', 'async']);
  });

  it('creates nothing for a factory that returns null', async () => {
    const map = mapWith({ id: 1, name: 'entities', objects: [{ id: 1, type: 'Enemy' }, { id: 2, type: 'Enemy' }] });
    const spawner = new MapObjectSpawner<void, Thing>({
      Enemy: descriptor => (descriptor.id === '1' ? new Thing('kept') : null),
    });

    const session = await spawner.spawn(map, undefined);

    expect(session.objects.map(thing => thing.label)).toEqual(['kept']);
    expect(session.has('2')).toBe(false);
  });

  it('spawns in layer order then object order regardless of async resolution order', async () => {
    const map = mapWith(
      { id: 1, name: 'a', objects: [{ id: 1, type: 'Slow' }, { id: 2, type: 'Fast' }] },
      { id: 2, name: 'b', objects: [{ id: 3, type: 'Fast' }] },
    );
    const spawner = new MapObjectSpawner<void, Thing>({
      Fast: descriptor => new Thing(`fast-${descriptor.id}`),
      Slow: async (descriptor) => {
        await tick();
        await tick();
        return new Thing(`slow-${descriptor.id}`);
      },
    });

    const session = await spawner.spawn(map, undefined);

    expect(session.objects.map(thing => thing.label)).toEqual(['slow-1', 'fast-2', 'fast-3']);
  });

  it('hands the descriptor its layer and the parsed object', async () => {
    const map = mapWith({ id: 9, name: 'entities', objects: [{ id: 1, type: 'Enemy', sourceId: 'abc' }] });
    const seen: MapObjectDescriptor[] = [];
    const spawner = new MapObjectSpawner<void, Thing>({
      Enemy: (descriptor) => {
        seen.push(descriptor);
        return new Thing('enemy');
      },
    });

    await spawner.spawn(map, undefined);

    expect(seen[0]?.layer.name).toBe('entities');
    expect(seen[0]?.object.id).toBe(1);
    expect(seen[0]?.id).toBe('abc');
  });
});

// ── Session ──────────────────────────────────────────────────────────────────

describe('MapSpawnSession', () => {
  it('looks results up by their stable source id', async () => {
    const map = mapWith({
      id: 1,
      name: 'entities',
      objects: [{ id: 1, type: 'Enemy', sourceId: 'boss-iid' }, { id: 2, type: 'Enemy' }],
    });
    const spawner = new MapObjectSpawner<void, Thing>({ Enemy: descriptor => new Thing(descriptor.id) });

    const session = await spawner.spawn(map, undefined);

    expect(session.get('boss-iid')?.label).toBe('boss-iid');
    expect(session.get('2')?.label).toBe('2');
    expect(session.has('boss-iid')).toBe(true);
    expect(session.has('nope')).toBe(false);
    expect(session.get('nope')).toBeUndefined();
  });

  it('destroys in reverse spawn order and is idempotent', async () => {
    const log: string[] = [];
    const map = mapWith({
      id: 1,
      name: 'entities',
      objects: [{ id: 1, type: 'Enemy' }, { id: 2, type: 'Enemy' }, { id: 3, type: 'Enemy' }],
    });
    const spawner = new MapObjectSpawner<void, Thing>({ Enemy: descriptor => new Thing(descriptor.id, log) });

    const session = await spawner.spawn(map, undefined);
    session.destroy();
    session.destroy();

    expect(log).toEqual(['3', '2', '1']);
    expect(session.destroyed).toBe(true);
  });

  it('destroys the objects after one whose teardown fails', async () => {
    const log: string[] = [];
    const map = mapWith({
      id: 1,
      name: 'entities',
      objects: [{ id: 1, type: 'Enemy' }, { id: 2, type: 'Brittle' }, { id: 3, type: 'Enemy' }],
    });
    const spawner = new MapObjectSpawner<void, Thing>({
      Enemy: descriptor => new Thing(descriptor.id, log),
      Brittle: () => new BrittleThing('brittle'),
    });

    const session = await spawner.spawn(map, undefined);

    expect(() => session.destroy()).not.toThrow();
    expect(log).toEqual(['3', '1']);
  });

  it('produces an empty session for a map with no objects', async () => {
    const spawner = new MapObjectSpawner<void, Thing>({ Enemy: () => new Thing('enemy') });

    const session = await spawner.spawn(mapWith(), undefined);

    expect(session.objects).toEqual([]);
    session.destroy();
    expect(session.destroyed).toBe(true);
  });

  it('rejects two objects that resolve to the same stable id', async () => {
    const map = mapWith(
      { id: 1, name: 'a', objects: [{ id: 1, type: 'Enemy', sourceId: 'same' }] },
      { id: 2, name: 'b', objects: [{ id: 2, type: 'Enemy', sourceId: 'same' }] },
    );
    const log: string[] = [];
    const spawner = new MapObjectSpawner<void, Thing>({ Enemy: descriptor => new Thing(descriptor.id, log) });

    await expect(spawner.spawn(map, undefined)).rejects.toMatchObject({ reason: 'duplicate-id', objectId: 'same' });
    expect(log).toEqual(['same']);
  });
});

// ── Atomicity ────────────────────────────────────────────────────────────────

describe('MapObjectSpawner atomicity', () => {
  it('destroys everything already created when a factory throws, in reverse order', async () => {
    const log: string[] = [];
    const map = mapWith({
      id: 1,
      name: 'entities',
      objects: [{ id: 1, type: 'Enemy' }, { id: 2, type: 'Enemy' }, { id: 3, type: 'Bomb' }],
    });
    const boom = new Error('factory exploded');
    const spawner = new MapObjectSpawner<void, Thing>({
      Enemy: descriptor => new Thing(descriptor.id, log),
      Bomb: () => {
        throw boom;
      },
    });

    const error = await spawner.spawn(map, undefined).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(MapSpawnError);
    expect((error as MapSpawnError).reason).toBe('factory-failed');
    expect((error as MapSpawnError).cause).toBe(boom);
    expect(log).toEqual(['2', '1']);
  });

  it('keeps the original failure when a rollback step throws, and still rolls the rest back', async () => {
    const log: string[] = [];
    const map = mapWith({
      id: 1,
      name: 'entities',
      objects: [{ id: 1, type: 'Enemy' }, { id: 2, type: 'Brittle' }, { id: 3, type: 'Bomb' }],
    });
    const boom = new Error('factory exploded');
    const spawner = new MapObjectSpawner<void, Thing>({
      Enemy: descriptor => new Thing(descriptor.id, log),
      Brittle: () => new BrittleThing('brittle'),
      Bomb: () => {
        throw boom;
      },
    });

    const error = await spawner.spawn(map, undefined).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(MapSpawnError);
    expect((error as MapSpawnError).cause).toBe(boom);
    // Object 1 sits before the brittle one in reverse order and is still destroyed.
    expect(log).toEqual(['1']);
  });

  it('preserves the cause of an asynchronous factory rejection', async () => {
    const map = mapWith({ id: 1, name: 'entities', objects: [{ id: 1, type: 'Enemy' }] });
    const boom = new Error('load failed');
    const spawner = new MapObjectSpawner<void, Thing>({
      Enemy: async () => {
        await tick();
        throw boom;
      },
    });

    const error = await spawner.spawn(map, undefined).catch((thrown: unknown) => thrown);

    expect((error as MapSpawnError).cause).toBe(boom);
    expect((error as MapSpawnError).objectId).toBe('1');
  });
});

// ── Cancellation ─────────────────────────────────────────────────────────────

describe('MapObjectSpawner cancellation', () => {
  it('refuses to start when the signal is already aborted', async () => {
    const map = mapWith({ id: 1, name: 'entities', objects: [{ id: 1, type: 'Enemy' }] });
    const factory = vi.fn(() => new Thing('enemy'));
    const spawner = new MapObjectSpawner<void, Thing>({ Enemy: factory });
    const controller = new AbortController();
    controller.abort();

    await expect(spawner.spawn(map, undefined, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it('rolls back and leaves no zombie when aborted mid-spawn', async () => {
    const log: string[] = [];
    const controller = new AbortController();
    const map = mapWith({
      id: 1,
      name: 'entities',
      objects: [{ id: 1, type: 'Enemy' }, { id: 2, type: 'Slow' }, { id: 3, type: 'Enemy' }],
    });
    const third = vi.fn(() => new Thing('3', log));
    const spawner = new MapObjectSpawner<void, Thing>({
      Enemy: descriptor => (descriptor.id === '3' ? third() : new Thing(descriptor.id, log)),
      Slow: async (descriptor) => {
        controller.abort();
        await tick();
        return new Thing(descriptor.id, log);
      },
    });

    await expect(spawner.spawn(map, undefined, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });

    // The late-resolving result is owned by the rollback, and nothing after the
    // abort point was ever created.
    expect(log).toEqual(['2', '1']);
    expect(third).not.toHaveBeenCalled();
  });

  it('hands the signal to the factories', async () => {
    const map = mapWith({ id: 1, name: 'entities', objects: [{ id: 1, type: 'Enemy' }] });
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const spawner = new MapObjectSpawner<void, Thing>({
      Enemy: (_object, _context, signal) => {
        seen = signal;
        return new Thing('enemy');
      },
    });

    await spawner.spawn(map, undefined, { signal: controller.signal });

    expect(seen).toBe(controller.signal);
  });
});
