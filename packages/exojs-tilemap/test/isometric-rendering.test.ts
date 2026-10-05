import { type Texture, TextureRegion, View } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { ChunkStreamer } from '../src/ChunkStreamer';
import { TileLayer } from '../src/TileLayer';
import { TileLayerNode } from '../src/TileLayerNode';
import { TileMap } from '../src/TileMap';
import { TileMapNode } from '../src/TileMapNode';
import { TileProjection } from '../src/TileProjection';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

const tileset = (name: string) =>
  new TileSet({
    name,
    texture: new TextureRegion({ width: 64, height: 96 } as Texture, { x: 0, y: 0, width: 64, height: 96 }),
    tileWidth: 64,
    tileHeight: 96,
    tileCount: 1,
  });
const makeLayer = () =>
  new TileLayer({
    id: 1,
    name: 'iso',
    tileWidth: 64,
    tileHeight: 32,
    chunkWidth: 2,
    chunkHeight: 2,
    tilesets: [tileset('a'), tileset('b')],
    projection: new TileProjection({ orientation: 'isometric', tileWidth: 64, tileHeight: 32 }),
  });

describe('isometric rendering', () => {
  it('includes the projection origin in bounded orthogonal local bounds', () => {
    const projection = new TileProjection({ tileWidth: 32, tileHeight: 32, originX: 1000, originY: -20 });
    const layer = new TileLayer({ id: 1, name: 'offset', width: 1, height: 1, tileWidth: 32, tileHeight: 32, tilesets: [], projection });
    const map = new TileMap({ width: 1, height: 1, tileWidth: 32, tileHeight: 32, layers: [layer], projection });
    const node = new TileMapNode(map);
    expect(node.getLocalBounds()).toMatchObject({ x: 1000, y: -20, width: 32, height: 32 });
    expect(node.children[0]!.getLocalBounds()).toMatchObject({ x: 1000, y: -20, width: 32, height: 32 });
    node.destroy();
  });

  it('streams a tile when only its upper artwork corner is visible', () => {
    const layer = new TileLayer({
      id: 1,
      name: 'corner',
      tileWidth: 64,
      tileHeight: 32,
      chunkWidth: 1,
      chunkHeight: 1,
      tilesets: [tileset('corner')],
      projection: new TileProjection({ orientation: 'isometric', tileWidth: 64, tileHeight: 32 }),
    });
    const requested: string[] = [];
    const streamer = new ChunkStreamer(
      layer,
      {
        getChunk: (cx, cy) => {
          requested.push(`${cx},${cy}`);
          return null;
        },
      },
      new View(30, -62, 2, 2),
      { loadRadius: 0, unloadRadius: 0 },
    );
    streamer.update();
    expect(requested).toContain('0,0');
    streamer.destroy();
  });

  it('shares the snap origin across odd-sized projected chunks', () => {
    const p = new TileProjection({ orientation: 'isometric', tileWidth: 63, tileHeight: 31 });
    const ts = tileset('odd');
    const layer = new TileLayer({ id: 1, name: 'odd', tileWidth: 63, tileHeight: 31, chunkWidth: 1, chunkHeight: 1, tilesets: [ts], projection: p });
    for (let x = 0; x < 3; x++) layer.setTileAt(x, 0, { tileset: ts, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    const node = new TileLayerNode(layer);
    expect(node.chunkNodes.map(chunk => [chunk.x, chunk.y])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(node.chunkNodes[1]!.pages[0]!.quads[0]!.x0).toBe(0);
    node.destroy();
  });

  it('orders overlapping artwork across storage chunks and texture switches', () => {
    const layer = makeLayer();
    const cells = [
      [2, 0, 0],
      [0, 2, 1],
      [1, 1, 0],
      [1, 0, 1],
      [0, 1, 0],
      [0, 0, 0],
    ];
    for (const [tx, ty, index] of cells) layer.setTileAt(tx!, ty!, { tileset: layer.tilesets[index!]!, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    const node = new TileLayerNode(layer);
    const drawn = node.children.flatMap(child => {
      const chunk = node.chunkNodes.find(candidate => candidate === child)!;
      return chunk.pages.flatMap(page => page.quads.map(q => [q.x0 + chunk.x, q.y0 + chunk.y, page.tileset.name]));
    });
    expect(drawn).toEqual([
      [-32, -64, 'a'],
      [-64, -48, 'a'],
      [0, -48, 'b'],
      [-96, -32, 'b'],
      [-32, -32, 'a'],
      [32, -32, 'a'],
    ]);
    const bounds = node.getLocalBounds();
    expect(bounds.top).toBeLessThanOrEqual(-64);
    expect(bounds.left).toBeLessThanOrEqual(-96);
    for (const chunk of node.chunkNodes) {
      const bounds = chunk.getLocalBounds();
      for (const page of chunk.pages)
        for (const q of page.quads) {
          expect(bounds.left).toBeLessThanOrEqual(q.x0);
          expect(bounds.top).toBeLessThanOrEqual(q.y0);
          expect(bounds.right).toBeGreaterThanOrEqual(q.x1);
          expect(bounds.bottom).toBeGreaterThanOrEqual(q.y1);
        }
    }
    node.destroy();
  });

  it('inverts all view corners when streaming a diamond grid', () => {
    const layer = makeLayer();
    const requested: string[] = [];
    const view = new View(0, 0, 256, 64);
    const streamer = new ChunkStreamer(
      layer,
      {
        getChunk: (cx, cy) => {
          requested.push(`${cx},${cy}`);
          return null;
        },
      },
      view,
      { loadRadius: 0, unloadRadius: 0 },
    );
    streamer.update();
    const bounds = view.getBounds();
    for (const x of [bounds.left, bounds.right])
      for (const y of [bounds.top, bounds.bottom]) {
        const tile = layer.pixelToTile(x, y);
        expect(requested).toContain(`${Math.floor(tile.tx / 2)},${Math.floor(tile.ty / 2)}`);
      }
    streamer.destroy();
  });

  it('requests chunks whose tall artwork enters the view from below', () => {
    const ts = tileset('tall');
    const layer = new TileLayer({
      id: 1,
      name: 'tall',
      tileWidth: 64,
      tileHeight: 32,
      chunkWidth: 1,
      chunkHeight: 1,
      tilesets: [ts],
      projection: new TileProjection({ orientation: 'isometric', tileWidth: 64, tileHeight: 32 }),
    });
    const requested: string[] = [];
    const streamer = new ChunkStreamer(
      layer,
      {
        getChunk: (cx, cy) => {
          requested.push(`${cx},${cy}`);
          return null;
        },
      },
      new View(0, 0, 4, 4),
      { loadRadius: 0, unloadRadius: 0 },
    );
    streamer.update();
    expect(requested).toContain('1,1');
    streamer.destroy();
  });
});
