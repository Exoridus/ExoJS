import { ObjectKind } from '@codexo/exojs-tilemap';
import { describe, expect, it } from 'vitest';

import { TILED_FLIPPED_HORIZONTALLY_FLAG } from '../src/gid';
import { TiledGroupLayer, type TiledLayer, TiledObjectLayer } from '../src/TiledLayer';
import { TiledMap } from '../src/TiledMap';
import type { TiledObject } from '../src/TiledObject';
import { TiledFormatError, validateTiledMapData, validateTiledObjectData } from '../src/validate';
import { makeTiledContext } from './type-context';

// The map numbers the props tileset from gid 10; the template file numbers the
// same tileset from gid 1, so a template gid of 2 is the map's gid 11.
const props = {
  name: 'props',
  tilewidth: 16,
  tileheight: 16,
  tilecount: 4,
  columns: 2,
  image: 'props.png',
  imagewidth: 32,
  imageheight: 32,
};

const chest = {
  type: 'template',
  tileset: { firstgid: 1, source: '../tiles/props.tsj' },
  object: {
    name: 'chest',
    type: 'Chest',
    width: 16,
    height: 16,
    rotation: 0,
    visible: true,
    gid: (2 + TILED_FLIPPED_HORIZONTALLY_FLAG) >>> 0,
    properties: [
      { name: 'loot', type: 'string', value: 'coins' },
      { name: 'locked', type: 'bool', value: true },
    ],
  },
};

const marker = { type: 'template', object: { name: 'spawn', type: 'Spawn', point: true } };

const objectLayer = (id: number, objects: unknown[]): Record<string, unknown> => ({
  id,
  name: `Objects ${id}`,
  type: 'objectgroup',
  visible: true,
  opacity: 1,
  x: 0,
  y: 0,
  draworder: 'topdown',
  objects,
});

const level = (objects: unknown[], nested: unknown[] = []): Record<string, unknown> => ({
  type: 'map',
  version: '1.10',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: 4,
  height: 4,
  tilewidth: 16,
  tileheight: 16,
  tilesets: [{ firstgid: 10, source: '../tiles/props.tsj' }],
  layers: [
    objectLayer(1, objects),
    { id: 2, name: 'Group', type: 'group', visible: true, opacity: 1, x: 0, y: 0, layers: [objectLayer(3, nested)] },
  ],
});

/** The objects of the object layer named `name`, searching inside groups. */
const objectsIn = (map: TiledMap, name: string): readonly TiledObject[] => {
  const find = (layers: readonly TiledLayer[]): TiledObjectLayer | undefined => {
    for (const layer of layers) {
      const found = layer instanceof TiledGroupLayer ? find(layer.layers) : layer;

      if (found instanceof TiledObjectLayer && found.name === name) {
        return found;
      }
    }

    return undefined;
  };

  return find(map.layers)?.objects ?? [];
};

const loadLevel = (document: unknown, extra: Record<string, unknown> = {}) => {
  const context = makeTiledContext(
    {
      'maps/level.tmj': document,
      'tiles/props.tsj': props,
      'templates/chest.tj': chest,
      'templates/marker.tj': marker,
      ...extra,
    },
    { 'tiles/props.png': { w: 32, h: 32 } },
  );

  return { ...context, map: context.loadSource('maps/level.tmj') };
};

describe('object templates', () => {
  it('accepts an instance that stores only its id, position and template', () => {
    const object = validateTiledObjectData({ id: 4, template: 'chest.tj', x: 1, y: 2 }, 'level.tmj', 'objects/0');

    expect(object).toMatchObject({ id: 4, x: 1, y: 2, name: '', width: 0, visible: true, instanceFields: [] });
  });

  it('fills an instance from its template, keeping its own id and position', async () => {
    const map = await loadLevel(level([{ id: 5, template: '../templates/chest.tj', x: 32, y: 64 }])).map;
    const object = objectsIn(map, 'Objects 1')[0]!;

    expect(object).toMatchObject({
      id: 5,
      x: 32,
      y: 64,
      name: 'chest',
      type: 'Chest',
      width: 16,
      height: 16,
      template: '../templates/chest.tj',
    });
    expect(object.templatePending).toBe(false);
    expect(object.properties.map(property => [property.name, property.value])).toEqual([
      ['loot', 'coins'],
      ['locked', true],
    ]);
  });

  it('lets an instance override fields and properties by name', async () => {
    const instance = {
      id: 6,
      template: '../templates/chest.tj',
      x: 0,
      y: 16,
      name: 'big chest',
      width: 32,
      properties: [{ name: 'loot', type: 'string', value: 'gold' }],
    };
    const object = objectsIn(await loadLevel(level([instance])).map, 'Objects 1')[0]!;

    expect(object).toMatchObject({ name: 'big chest', type: 'Chest', width: 32, height: 16 });
    expect(object.properties.map(property => [property.name, property.value])).toEqual([
      ['locked', true],
      ['loot', 'gold'],
    ]);
  });

  it("renumbers a template's tile into the map's gids, keeping its flip flags", async () => {
    const tileMap = (await loadLevel(level([{ id: 5, template: '../templates/chest.tj', x: 32, y: 64 }])).map).toTileMap();
    const object = tileMap.objectLayers[0]!.objects[0]!;

    expect(object.kind).toBe(ObjectKind.Tile);

    if (object.kind === ObjectKind.Tile) {
      expect(object.tile.tileset.name).toBe('props');
      expect(object.tile.localTileId).toBe(1);
      expect(object.tile.transform.flipX).toBe(true);
    }
  });

  it('resolves templates inside group layers and fetches each template once', async () => {
    const { map, load } = loadLevel(
      level(
        [
          { id: 1, template: '../templates/marker.tj', x: 0, y: 0 },
          { id: 2, template: '../templates/marker.tj', x: 8, y: 0 },
        ],
        [{ id: 3, template: '../templates/marker.tj', x: 16, y: 0, name: 'exit' }],
      ),
    );
    const loaded = await map;

    expect(objectsIn(loaded, 'Objects 3')[0]).toMatchObject({ name: 'exit', type: 'Spawn', point: true });
    expect(load.mock.calls.filter(([asset]) => (asset as { _config: { type: string } })._config.type === 'text')).toHaveLength(1);
  });

  it("rejects a template in Tiled's XML format by name", async () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<template>\n <object name="chest"/>\n</template>\n';
    const pending = loadLevel(level([{ id: 1, template: '../templates/chest.tx', x: 0, y: 0 }]), { 'templates/chest.tx': xml }).map;

    await expect(pending).rejects.toThrow(TiledFormatError);
    await expect(pending).rejects.toThrow(/templates\/chest\.tx" is in Tiled's XML format/);
  });

  it('rejects a missing template, a file that is not a template, and a tileset the map lacks', async () => {
    await expect(loadLevel(level([{ id: 1, template: '../templates/gone.tj', x: 0, y: 0 }])).map).rejects.toThrow(
      /object template "templates\/gone\.tj" could not be loaded/,
    );
    await expect(
      loadLevel(level([{ id: 1, template: '../templates/odd.tj', x: 0, y: 0 }]), { 'templates/odd.tj': { type: 'map' } }).map,
    ).rejects.toThrow(/expected "template"/);

    const elsewhere = { ...chest, tileset: { firstgid: 1, source: '../tiles/other.tsj' } };

    await expect(
      loadLevel(level([{ id: 1, template: '../templates/elsewhere.tj', x: 0, y: 0 }]), { 'templates/elsewhere.tj': elsewhere }).map,
    ).rejects.toThrow(/uses tileset "tiles\/other\.tsj", which the map does not reference/);
  });

  it('refuses to convert a map whose templates were never merged in', () => {
    const data = validateTiledMapData({ ...level([{ id: 1, template: 'chest.tj', x: 0, y: 0 }]), tilesets: [] }, 'level.tmj');

    expect(() => new TiledMap('level.tmj', data, []).toTileMap()).toThrow(/merged in only when the map is loaded through the Loader/);
  });
});
