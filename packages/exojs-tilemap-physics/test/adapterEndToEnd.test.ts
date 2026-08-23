import { type Texture, TextureRegion } from '@codexo/exojs';
import type { LdtkData } from '@codexo/exojs-ldtk';
import { ldtkIntGridCells, ldtkToTileMap } from '@codexo/exojs-ldtk';
import { ChainShape, PhysicsWorld, PolygonShape } from '@codexo/exojs-physics';
import { TiledMap, TiledTileset } from '@codexo/exojs-tiled';
import type { TileLayer } from '@codexo/exojs-tilemap';
import { describe, expect, it } from 'vitest';

import { TileColliderStreamer } from '../src/TileColliderStreamer';

// Both adapters are exercised through their own public conversion, so the
// bridge is fed exactly what an application would feed it. The bridge itself
// keeps no dependency on either package (see formatAgnostic.test.ts).

const TILE = 16;

const fakeTexture = (): Texture =>
  ({ destroyed: false, destroy: () => {}, height: 64, label: 'test', uid: 0, width: 64 }) as unknown as Texture;

const world = (): PhysicsWorld => new PhysicsWorld({ gravity: { x: 0, y: 0 } });

/** A one-tile Tiled map whose single tile carries `objects` as its collision group. */
const tiledLayer = (objects: readonly Record<string, unknown>[]): TileLayer => {
  const tileset = new TiledTileset(
    {
      name: 'atlas',
      tilewidth: TILE,
      tileheight: TILE,
      tilecount: 4,
      columns: 2,
      imagewidth: 64,
      imageheight: 64,
      tiles: [{ id: 0, objectgroup: { objects } }],
    } as never,
    1,
    { texture: new TextureRegion(fakeTexture(), { x: 0, y: 0, width: 64, height: 64 }) as never },
  );
  const map = new TiledMap(
    'test.tmj',
    {
      orientation: 'orthogonal',
      infinite: false,
      width: 1,
      height: 1,
      tilewidth: TILE,
      tileheight: TILE,
      layers: [
        { id: 1, name: 'ground', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: 1, height: 1, data: [1] },
      ],
      tilesets: [{ firstgid: 1, source: 'atlas.tsj' }],
    } as never,
    [tileset],
  );

  return map.toTileMap().layers[0]!;
};

/** An LDtk level whose only layer is an IntGrid with no auto-layer rules. */
const ldtkIntGridLayer = (csv: readonly number[], width: number, height: number): TileLayer => {
  const data: LdtkData = {
    jsonVersion: '1.5.3',
    defaultGridSize: TILE,
    defs: {
      tilesets: [],
      layers: [
        {
          uid: 120,
          identifier: 'Collision',
          type: 'IntGrid',
          gridSize: TILE,
          intGridValues: [
            { value: 1, identifier: 'Solid', color: '#ff0000' },
            { value: 2, identifier: 'Water', color: '#0000ff' },
          ],
        },
      ],
    },
    levels: [
      {
        identifier: 'L',
        uid: 1,
        iid: 'iid-1',
        worldX: 0,
        worldY: 0,
        pxWid: width * TILE,
        pxHei: height * TILE,
        layerInstances: [
          {
            __identifier: 'Collision',
            __type: 'IntGrid',
            __cWid: width,
            __cHei: height,
            __gridSize: TILE,
            layerDefUid: 120,
            levelId: 1,
            visible: true,
            iid: 'int-1',
            intGridCsv: csv,
          },
        ],
      },
    ],
  };

  return ldtkToTileMap(data).levels[0]!.layers[0]!;
};

describe('Tiled end to end', () => {
  it('carries a tile collision polygon through to a PolygonShape', () => {
    const layer = tiledLayer([
      {
        id: 1,
        name: '',
        type: 'solid',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        visible: true,
        polygon: [
          { x: 0, y: 0 },
          { x: 16, y: 0 },
          { x: 16, y: 16 },
        ],
      },
    ]);
    const streamer = new TileColliderStreamer(world(), layer);

    streamer.sync();

    const [body] = [...streamer.bodies()];

    expect(body?.colliders).toHaveLength(1);
    expect(body?.colliders[0]?.shape).toBeInstanceOf(PolygonShape);
  });

  it('carries a tile collision polyline through to a ChainShape', () => {
    const layer = tiledLayer([
      {
        id: 1,
        name: '',
        type: 'solid',
        x: 0,
        y: 8,
        width: 0,
        height: 0,
        rotation: 0,
        visible: true,
        polyline: [
          { x: 0, y: 0 },
          { x: 8, y: -4 },
          { x: 16, y: 0 },
        ],
      },
    ]);
    const streamer = new TileColliderStreamer(world(), layer);

    streamer.sync();

    const [body] = [...streamer.bodies()];

    expect(body?.colliders).toHaveLength(1);
    expect(body?.colliders[0]?.shape).toBeInstanceOf(ChainShape);
  });
});

describe('LDtk end to end', () => {
  it('turns an IntGrid region into box colliders on a layer that renders nothing', () => {
    const layer = ldtkIntGridLayer([1, 1, 0, 0, 1, 1, 0, 0], 4, 2);

    expect(layer.countNonEmptyTiles()).toBe(0);

    const streamer = new TileColliderStreamer(world(), layer, { cells: ldtkIntGridCells(layer) });

    streamer.sync();

    const [body] = [...streamer.bodies()];

    expect(body?.colliders).toHaveLength(1);
    expect(body?.colliders[0]?.shape).toMatchObject({ width: 2 * TILE, height: 2 * TILE });
  });

  it('traces an IntGrid region into a chain in outline mode', () => {
    const layer = ldtkIntGridLayer([1, 1, 1, 1], 2, 2);
    const streamer = new TileColliderStreamer(world(), layer, {
      regionMode: 'outline',
      cells: ldtkIntGridCells(layer),
    });

    streamer.sync();

    const [body] = [...streamer.bodies()];

    expect(body?.colliders).toHaveLength(1);
    expect(body?.colliders[0]?.shape).toBeInstanceOf(ChainShape);
  });

  it('keeps distinct IntGrid values distinguishable at the resolver boundary', () => {
    const layer = ldtkIntGridLayer([1, 2], 2, 1);
    const seen: string[] = [];
    const streamer = new TileColliderStreamer(world(), layer, {
      cells: ldtkIntGridCells(layer),
      material: context => {
        seen.push(context.type);

        return context.type === 'Water' ? { isSensor: true } : null;
      },
    });

    streamer.sync();

    const [body] = [...streamer.bodies()];

    expect(seen).toEqual(['Solid', 'Water']);
    expect(body?.colliders.map(collider => collider.isSensor)).toEqual([false, true]);
  });
});
