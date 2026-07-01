import { describe, expect, it } from 'vitest';

import type {
  TileMapObject,
  TilePropertyObjectRef,
  TilePropertyPoint,
  TilePropertyTileRef,
  TilePropertyValue,
} from '../src/index';
import { ObjectKind, ObjectLayer, TileMap, TilePropertyKind } from '../src/index';

const rectangle = (id: number, name: string, type: string, properties: Record<string, TilePropertyValue> = {}): TileMapObject => ({
  kind: 'rectangle',
  id,
  name,
  type,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  rotation: 0,
  visible: true,
  properties,
});

const point = (id: number, name: string, type: string): TileMapObject => ({
  kind: 'point',
  id,
  name,
  type,
  x: id,
  y: id,
  width: 0,
  height: 0,
  rotation: 0,
  visible: true,
  properties: {},
});

describe('ObjectLayer', () => {
  it('applies defaults and freezes its objects/properties', () => {
    const layer = new ObjectLayer({ id: 1, objects: [rectangle(1, 'a', 'spawn')] });

    expect(layer.kind).toBe('object');
    expect(layer.name).toBe('');
    expect(layer.visible).toBe(true);
    expect(layer.opacity).toBe(1);
    expect(layer.objects).toHaveLength(1);
    expect(Object.isFrozen(layer.objects)).toBe(true);
    expect(Object.isFrozen(layer.properties)).toBe(true);
  });

  it('query filters by name / type / kind / property (+ value), all combinable', () => {
    const layer = new ObjectLayer({
      id: 1,
      objects: [
        rectangle(1, 'spawn1', 'spawn', { team: 'red' }),
        rectangle(2, 'spawn2', 'spawn', { team: 'blue' }),
        {
          kind: 'point',
          id: 3,
          name: 'marker',
          type: 'waypoint',
          x: 5,
          y: 5,
          width: 0,
          height: 0,
          rotation: 0,
          visible: true,
          properties: {},
        },
      ],
    });

    expect(layer.query()).toHaveLength(3);
    expect(layer.query({ type: 'spawn' })).toHaveLength(2);
    expect(layer.query({ name: 'spawn1' })).toHaveLength(1);
    expect(layer.query({ kind: 'point' })).toHaveLength(1);
    expect(layer.query({ property: 'team' })).toHaveLength(2);
    expect(layer.query({ property: 'team', value: 'red' })).toHaveLength(1);
    expect(layer.query({ type: 'spawn', property: 'team', value: 'blue' })).toHaveLength(1);
    expect(layer.query({ type: 'nope' })).toHaveLength(0);
  });

  it('getObjectById / getObjectByName resolve the first match or undefined', () => {
    const layer = new ObjectLayer({ id: 1, objects: [rectangle(7, 'hero', 'spawn')] });

    expect(layer.getObjectById(7)?.name).toBe('hero');
    expect(layer.getObjectByName('hero')?.id).toBe(7);
    expect(layer.getObjectById(99)).toBeUndefined();
    expect(layer.getObjectByName('missing')).toBeUndefined();
  });
});

describe('ObjectLayer query() value-matching for structured TilePropertyValue kinds', () => {
  const objectRefA: TilePropertyObjectRef = {
    kind: TilePropertyKind.ObjectRef,
    id: 'entity-1',
    layerIid: 'layer-a',
    levelIid: 'level-a',
    worldIid: 'world-a',
  };
  // Same `id`, every nav field differs — must still match by id alone.
  const objectRefASameId: TilePropertyObjectRef = {
    kind: TilePropertyKind.ObjectRef,
    id: 'entity-1',
    layerIid: 'layer-b',
    levelIid: 'level-b',
    worldIid: 'world-b',
  };
  const objectRefB: TilePropertyObjectRef = {
    kind: TilePropertyKind.ObjectRef,
    id: 'entity-2',
  };
  const pointValue: TilePropertyPoint = { kind: TilePropertyKind.Point, cx: 1, cy: 2 };
  const tileRef: TilePropertyTileRef = {
    kind: TilePropertyKind.TileRef,
    tilesetUid: 1,
    x: 0,
    y: 0,
    w: 16,
    h: 16,
  };
  const nested = { a: 1 };
  const array = [1, 2, 3] as const;

  it('scalar value equality is unchanged', () => {
    const layer = new ObjectLayer({
      id: 1,
      objects: [
        rectangle(1, 'a', 'spawn', { team: 'red' }),
        rectangle(2, 'b', 'spawn', { team: 'blue' }),
      ],
    });

    expect(layer.query({ property: 'team', value: 'red' })).toHaveLength(1);
    expect(layer.query({ property: 'team', value: 'red' })[0]!.id).toBe(1);
    expect(layer.query({ property: 'team', value: 'green' })).toHaveLength(0);
  });

  it('matches objectRef values by id, regardless of differing nav fields', () => {
    const layer = new ObjectLayer({
      id: 1,
      objects: [
        rectangle(1, 'a', 'ref', { target: objectRefA }),
        rectangle(2, 'b', 'ref', { target: objectRefASameId }),
        rectangle(3, 'c', 'ref', { target: objectRefB }),
      ],
    });

    const matches = layer.query({ property: 'target', value: objectRefA });
    expect(matches.map(o => o.id)).toEqual([1, 2]);
  });

  it('point values match by reference identity (=== fast path), never structurally', () => {
    const layer = new ObjectLayer({
      id: 1,
      objects: [rectangle(1, 'a', 'p', { at: pointValue })],
    });

    expect(layer.query({ property: 'at' })).toHaveLength(1);
    // Same reference as stored -> hits the === fast path.
    expect(layer.query({ property: 'at', value: pointValue })).toHaveLength(1);
    // Structurally identical but a distinct object -> never matches.
    expect(layer.query({ property: 'at', value: { ...pointValue } })).toHaveLength(0);
  });

  it('tileRef values match by reference identity, never structurally', () => {
    const layer = new ObjectLayer({
      id: 1,
      objects: [rectangle(1, 'a', 't', { region: tileRef })],
    });

    expect(layer.query({ property: 'region' })).toHaveLength(1);
    expect(layer.query({ property: 'region', value: tileRef })).toHaveLength(1);
    expect(layer.query({ property: 'region', value: { ...tileRef } })).toHaveLength(0);
  });

  it('array values match by reference identity, never structurally', () => {
    const layer = new ObjectLayer({
      id: 1,
      objects: [rectangle(1, 'a', 'arr', { list: array })],
    });

    expect(layer.query({ property: 'list' })).toHaveLength(1);
    expect(layer.query({ property: 'list', value: array })).toHaveLength(1);
    expect(layer.query({ property: 'list', value: [1, 2, 3] })).toHaveLength(0);
  });

  it('nested property bags match by reference identity, never structurally', () => {
    const layer = new ObjectLayer({
      id: 1,
      objects: [rectangle(1, 'a', 'n', { meta: nested })],
    });

    expect(layer.query({ property: 'meta' })).toHaveLength(1);
    expect(layer.query({ property: 'meta', value: nested })).toHaveLength(1);
    expect(layer.query({ property: 'meta', value: { ...nested } })).toHaveLength(0);
  });
});

interface LevelObjects {
  spawn: { team: 'red' | 'blue' };
  trigger: { event: string; once?: boolean };
  pickup: { item: 'coin' | 'gem'; amount: number };
}

describe('ObjectLayer typed accessors (byType / byKind / where)', () => {
  const layer = new ObjectLayer<LevelObjects>({
    id: 1,
    objects: [
      rectangle(1, 'spawn-a', 'spawn', { team: 'red' }),
      rectangle(2, 'spawn-b', 'spawn', { team: 'blue' }),
      rectangle(3, 'gate', 'trigger', { event: 'open' }),
      rectangle(4, 'coin', 'pickup', { item: 'coin', amount: '3' }),
      rectangle(5, 'gem', 'pickup', { item: 'gem', amount: '10' }),
      point(6, 'marker', 'waypoint'),
    ],
  });

  it('byType returns only objects of the given type, with their properties', () => {
    const spawns = layer.byType('spawn');
    expect(spawns.map(o => o.id)).toEqual([1, 2]);
    expect(spawns.map(o => o.properties.team)).toEqual(['red', 'blue']);

    expect(layer.byType('pickup')).toHaveLength(2);
    // A type with no matches yields an empty array.
    expect(layer.byType('trigger')).toHaveLength(1);
  });

  it('byType returns a fresh array each call', () => {
    expect(layer.byType('spawn')).not.toBe(layer.byType('spawn'));
  });

  it('byKind narrows by geometry discriminant', () => {
    const rects = layer.byKind(ObjectKind.Rectangle);
    expect(rects).toHaveLength(5);
    expect(rects.every(o => o.kind === 'rectangle')).toBe(true);

    const points = layer.byKind(ObjectKind.Point);
    expect(points.map(o => o.id)).toEqual([6]);

    // A kind that no object uses yields an empty array.
    expect(layer.byKind(ObjectKind.Tile)).toHaveLength(0);
  });

  it('byKind accepts the raw wire string as well as the ObjectKind member', () => {
    expect(layer.byKind('point')).toHaveLength(1);
    expect(layer.byKind(ObjectKind.Point)).toHaveLength(1);
  });

  it('where combines byType with a predicate over the narrowed properties', () => {
    const gems = layer.where('pickup', o => o.properties.item === 'gem');
    expect(gems.map(o => o.id)).toEqual([5]);

    const reds = layer.where('spawn', o => o.properties.team === 'red');
    expect(reds.map(o => o.id)).toEqual([1]);

    const none = layer.where('pickup', () => false);
    expect(none).toHaveLength(0);
  });

  it('untyped layers still expose byType/byKind/where with loose properties', () => {
    const untyped = new ObjectLayer({
      id: 2,
      objects: [rectangle(1, 'a', 'spawn', { team: 'red' }), point(2, 'b', 'marker')],
    });

    expect(untyped.byType('spawn')).toHaveLength(1);
    expect(untyped.byKind(ObjectKind.Point)).toHaveLength(1);
    expect(untyped.where('spawn', o => o.properties.team === 'red')).toHaveLength(1);
    // query() is unchanged.
    expect(untyped.query({ type: 'spawn' })).toHaveLength(1);
  });
});

describe('TileMap object layers', () => {
  const makeMap = (objectLayers?: ObjectLayer[]): TileMap =>
    new TileMap({ width: 4, height: 4, tileWidth: 16, tileHeight: 16, objectLayers });

  it('stores object layers from the constructor and addObjectLayer, by name', () => {
    const spawns = new ObjectLayer({ id: 1, name: 'spawns' });
    const map = makeMap([spawns]);

    expect(map.objectLayers).toHaveLength(1);
    expect(map.getObjectLayer('spawns')).toBe(spawns);

    const triggers = new ObjectLayer({ id: 2, name: 'triggers' });
    map.addObjectLayer(triggers);

    expect(map.objectLayers).toHaveLength(2);
    expect(map.getObjectLayer('triggers')).toBe(triggers);
    expect(map.getObjectLayer('missing')).toBeUndefined();
  });

  it('keeps tile layers and object layers separate', () => {
    const map = makeMap([new ObjectLayer({ id: 1, name: 'objs' })]);

    expect(map.layers).toHaveLength(0);
    expect(map.objectLayers).toHaveLength(1);
  });

  it('destroy clears object layers and addObjectLayer then throws', () => {
    const map = makeMap([new ObjectLayer({ id: 1, name: 'x' })]);

    map.destroy();
    expect(map.objectLayers).toHaveLength(0);
    expect(() => map.addObjectLayer(new ObjectLayer({ id: 2 }))).toThrow();
  });
});
