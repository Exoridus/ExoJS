import { describe, expect, it } from 'vitest';

import type { TileMapObject } from '../src/index';
import { ObjectLayer, TileMap } from '../src/index';

const rectangle = (id: number, name: string, type: string, properties: Record<string, string> = {}): TileMapObject => ({
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
