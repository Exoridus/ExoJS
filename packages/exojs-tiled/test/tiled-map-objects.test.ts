import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { Destroyable } from '@codexo/exojs';
import type { TileMap } from '@codexo/exojs-tilemap';
import { mapObjectDescriptors, MapObjectSpawner } from '@codexo/exojs-tilemap';
import { describe, expect, it } from 'vitest';

import { TiledObject } from '../src/TiledObject';
import { validateTiledObjectData } from '../src/validate';
import { makeTiledContext } from './type-context';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PKG_DIR = basename(process.cwd()) === 'exojs-tiled' ? process.cwd() : join(process.cwd(), 'packages', 'exojs-tiled');

const rawObject = (overrides: Record<string, unknown>): Record<string, unknown> => {
  return { id: 1, name: 'thing', x: 0, y: 0, width: 16, height: 16, rotation: 0, visible: true, ...overrides };
};

const loadFixture = (name: string): unknown => {
  return JSON.parse(readFileSync(join(PKG_DIR, 'test', 'fixtures', name), 'utf-8'));
};

const FIXTURES: Record<string, unknown> = {
  'orthogonal-rich.tmj': loadFixture('orthogonal-rich.tmj'),
  'tileset-b.tsj': loadFixture('tileset-b.tsj'),
};

const TEXTURE_SIZES: Record<string, { w: number; h: number }> = {
  'tiles-a.png': { w: 64, h: 32 },
  'tiles-b.png': { w: 80, h: 20 },
};

const tiledMapFrom = async (document: unknown): Promise<TileMap> => {
  const { loadSource } = makeTiledContext({ ...FIXTURES, 'inline.tmj': document }, TEXTURE_SIZES);

  return (await loadSource('inline.tmj')).toTileMap();
};

const documentWith = (object: Record<string, unknown>): Record<string, unknown> => {
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: 2,
    height: 2,
    tilewidth: 16,
    tileheight: 16,
    nextlayerid: 2,
    nextobjectid: 2,
    tilesets: [],
    layers: [
      {
        id: 1,
        name: 'Entities',
        type: 'objectgroup',
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        draworder: 'index',
        objects: [object],
      },
    ],
  };
};

const singleObjectMap = async (objectClass: string, name: string): Promise<TileMap> => {
  return tiledMapFrom(
    documentWith({
      id: 1,
      name,
      type: objectClass,
      x: 0,
      y: 0,
      width: 16,
      height: 16,
      rotation: 0,
      visible: true,
    }),
  );
};

const richMap = async (): Promise<TileMap> => {
  const { loadSource } = makeTiledContext(FIXTURES, TEXTURE_SIZES);

  return (await loadSource('orthogonal-rich.tmj')).toTileMap();
};

class Thing implements Destroyable {
  public destroyed = false;

  public constructor(public readonly id: string) {}

  public destroy(): void {
    this.destroyed = true;
  }
}

// ── Class / type precedence ──────────────────────────────────────────────────

describe('Tiled object class/type normalisation', () => {
  it('reads the class from `type`, as Tiled 1.10 and later write it', () => {
    const data = validateTiledObjectData(rawObject({ type: 'Enemy' }), 'map.tmj', 'objects[0]');

    expect(new TiledObject(data).type).toBe('Enemy');
  });

  it('reads the class from `class`, as Tiled 1.9 wrote it', () => {
    const data = validateTiledObjectData(rawObject({ class: 'Enemy' }), 'map.tmj', 'objects[0]');

    expect(data.type).toBe('');
    expect(new TiledObject(data).type).toBe('Enemy');
  });

  it('prefers `class` when a file carries both', () => {
    const data = validateTiledObjectData(rawObject({ type: 'Old', class: 'New' }), 'map.tmj', 'objects[0]');

    expect(new TiledObject(data).type).toBe('New');
  });

  it('falls back to `type` when `class` is present but empty', () => {
    const data = validateTiledObjectData(rawObject({ type: 'Enemy', class: '' }), 'map.tmj', 'objects[0]');

    expect(new TiledObject(data).type).toBe('Enemy');
  });

  it('reports no class when neither field is set', () => {
    const data = validateTiledObjectData(rawObject({}), 'map.tmj', 'objects[0]');

    expect(new TiledObject(data).type).toBe('');
  });

  it('still rejects a non-string class', () => {
    expect(() => validateTiledObjectData(rawObject({ class: 7 }), 'map.tmj', 'objects[0]')).toThrow(/expected a string/);
  });
});

// ── Descriptor normalisation ─────────────────────────────────────────────────

describe('Tiled objects as MapObjectDescriptors', () => {
  it('uses the numeric object id as the stable id and the class as the kind', async () => {
    const descriptors = [...mapObjectDescriptors(await richMap())];

    expect(descriptors.map(descriptor => [descriptor.id, descriptor.kind])).toEqual([
      ['1', 'spawn'],
      ['2', 'prop'],
      ['3', null],
    ]);
  });

  it('carries name, transform and owning layer', async () => {
    const descriptors = [...mapObjectDescriptors(await richMap())];

    expect(descriptors[0]?.name).toBe('hero');
    expect(descriptors[1]).toMatchObject({ name: 'chest', width: 16, height: 16, rotation: 0 });
    expect(descriptors[1]?.layer.name).toBe('Spawns');
  });

  it('carries custom properties onto the descriptor', async () => {
    const map = await tiledMapFrom({
      type: 'map',
      version: '1.10',
      tiledversion: '1.10.2',
      orientation: 'orthogonal',
      renderorder: 'right-down',
      infinite: false,
      width: 2,
      height: 2,
      tilewidth: 16,
      tileheight: 16,
      nextlayerid: 2,
      nextobjectid: 2,
      tilesets: [],
      layers: [
        {
          id: 1,
          name: 'Entities',
          type: 'objectgroup',
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          draworder: 'index',
          objects: [
            {
              id: 1,
              name: 'chest',
              type: 'Chest',
              x: 0,
              y: 0,
              width: 16,
              height: 16,
              rotation: 0,
              visible: true,
              properties: [
                { name: 'loot', type: 'string', value: 'gold' },
                { name: 'amount', type: 'int', value: 12 },
              ],
            },
          ],
        },
      ],
    });

    const [descriptor] = [...mapObjectDescriptors(map)];

    expect(descriptor?.properties).toEqual({ loot: 'gold', amount: 12 });
    expect(descriptor?.kind).toBe('Chest');
  });

  it('passes the parsed Tiled object through as the object source', async () => {
    const descriptors = [...mapObjectDescriptors(await richMap())];

    expect(descriptors[0]?.object.source).toBeInstanceOf(TiledObject);
    expect((descriptors[0]?.object.source as TiledObject).id).toBe(1);
  });

  it('leaves the stable id numeric-derived, since Tiled has no source-stable string id', async () => {
    const descriptors = [...mapObjectDescriptors(await richMap())];

    expect(descriptors.every(descriptor => descriptor.object.sourceId === undefined)).toBe(true);
  });

  it('keeps two maps with the same local object id apart, one session each', async () => {
    const spawner = new MapObjectSpawner<void, Thing>({ Chest: descriptor => new Thing(descriptor.id) });

    const first = await spawner.spawn(await singleObjectMap('Chest', 'in-town'), undefined);
    const second = await spawner.spawn(await singleObjectMap('Chest', 'in-cave'), undefined);

    // Tiled object ids are unique per map only; both objects are id 1 here.
    expect(first.get('1')?.id).toBe('1');
    expect(second.get('1')?.id).toBe('1');
    expect(first.get('1')).not.toBe(second.get('1'));

    first.destroy();

    expect(second.objects[0]?.destroyed).toBe(false);
  });

  it('keeps a field the runtime model drops reachable through `source`', async () => {
    const map = await tiledMapFrom(
      documentWith({
        id: 1,
        name: 'chest',
        type: 'Chest',
        x: 0,
        y: 0,
        width: 16,
        height: 16,
        rotation: 0,
        visible: true,
        template: 'templates/chest.tx',
      }),
    );

    const [descriptor] = [...mapObjectDescriptors(map)];

    // `template` has no place in the format-neutral model; the escape hatch is
    // what keeps it reachable.
    expect((descriptor?.object.source as TiledObject).template).toBe('templates/chest.tx');
  });

  it('dispatches several object kinds through one spawner', async () => {
    const spawner = new MapObjectSpawner<void, Thing>({
      spawn: descriptor => new Thing(descriptor.id),
      prop: descriptor => new Thing(descriptor.id),
    });

    const session = await spawner.spawn(await richMap(), undefined);

    // The classless object matched no factory and was ignored.
    expect(session.objects.map(thing => thing.id)).toEqual(['1', '2']);
    expect(session.get('2')).toBeDefined();
  });
});
