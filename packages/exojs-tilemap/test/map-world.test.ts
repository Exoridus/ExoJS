import { describe, expect, it } from 'vitest';

import type { MapLevel } from '../src/MapWorld';
import { MapLevelSide, MapWorld } from '../src/MapWorld';

function level(id: string, x: number, y: number, overrides: Partial<MapLevel> = {}): MapLevel {
  return {
    id,
    name: id.toUpperCase(),
    index: 0,
    bounds: { x, y, width: 100, height: 100 },
    external: false,
    neighbours: [],
    properties: {},
    ...overrides,
  };
}

describe('MapWorld', () => {
  it('rejects duplicate level ids', () => {
    expect(() => new MapWorld({ levels: [level('a', 0, 0), level('a', 100, 0)] })).toThrow(/duplicate level id "a"/);
  });

  it('looks levels up by id and by name', () => {
    const world = new MapWorld({ name: 'overworld', levels: [level('a', 0, 0), level('b', 100, 0)] });

    expect(world.getLevel('b')?.id).toBe('b');
    expect(world.getLevelByName('B')?.id).toBe('b');
    expect(world.getLevel('missing')).toBeUndefined();
    expect(world.getLevelByName('missing')).toBeUndefined();
    expect(world.name).toBe('overworld');
  });

  it('resolves a name collision to the first level in document order', () => {
    const world = new MapWorld({
      levels: [level('a', 0, 0, { name: 'Cave' }), level('b', 100, 0, { name: 'Cave' })],
    });

    expect(world.getLevelByName('Cave')?.id).toBe('a');
  });

  it('unions every level into the world bounds', () => {
    const world = new MapWorld({ levels: [level('a', 0, 0), level('b', 300, -50)] });

    expect(world.bounds).toEqual({ x: 0, y: -50, width: 400, height: 150 });
  });

  it('reports a zero rectangle for an empty world', () => {
    expect(new MapWorld({ levels: [] }).bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('resolves neighbours in declaration order and skips unknown targets', () => {
    const world = new MapWorld({
      levels: [
        level('a', 0, 0, {
          neighbours: [
            { id: 'c', side: MapLevelSide.East },
            { id: 'elsewhere', side: MapLevelSide.North },
            { id: 'b', side: MapLevelSide.South },
          ],
        }),
        level('b', 0, 100),
        level('c', 100, 0),
      ],
    });

    expect(world.getNeighbours('a').map(neighbour => neighbour.id)).toEqual(['c', 'b']);
    expect(world.getNeighbours('missing')).toEqual([]);
  });

  it('reports levels whose bounds intersect a query, excluding edge contact', () => {
    const world = new MapWorld({ levels: [level('a', 0, 0), level('b', 100, 0), level('c', 200, 0)] });

    expect(world.getLevelsInBounds({ x: 50, y: 50, width: 100, height: 10 }).map(l => l.id)).toEqual(['a', 'b']);
    // The query touches the a|b seam at x = 100 without crossing it.
    expect(world.getLevelsInBounds({ x: 100, y: 0, width: 0, height: 100 })).toEqual([]);
  });
});
