import { type Texture, TextureRegion, View } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { ChunkStreamer } from '../src/ChunkStreamer';
import { buildTileCollisionGeometry } from '../src/tileCollision';
import { TileLayer } from '../src/TileLayer';
import { TileLayerNode } from '../src/TileLayerNode';
import { TileMap } from '../src/TileMap';
import { TileMapNode } from '../src/TileMapNode';
import { TileProjection, type TileProjectionOptions } from '../src/TileProjection';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

const tileset = (name: string, width = 64, height = 32): TileSet =>
  new TileSet({
    name,
    texture: new TextureRegion({ width, height } as Texture, { x: 0, y: 0, width, height }),
    tileWidth: width,
    tileHeight: height,
    tileCount: 1,
  });

const layerWith = (options: TileProjectionOptions, tilesets: TileSet[], bounded = false): TileLayer =>
  new TileLayer({
    id: 1,
    name: 'stagger',
    tileWidth: options.tileWidth,
    tileHeight: options.tileHeight,
    chunkWidth: 2,
    chunkHeight: 2,
    ...(bounded && { width: 4, height: 4 }),
    tilesets,
    projection: new TileProjection(options),
  });

/** Every drawn quad in draw order, as [left, top, tileset]. */
const drawOrder = (node: TileLayerNode): Array<[number, number, string]> =>
  node.children.flatMap(child => {
    const chunk = node.chunkNodes.find(candidate => candidate === child)!;

    return chunk.pages.flatMap(page =>
      page.quads.map(q => [q.x0 + chunk.x, q.y0 + chunk.y, page.tileset.name] as [number, number, string]),
    );
  });

describe('staggered and hexagonal rendering', () => {
  it('places every tile on its staggered cell, bottom-aligned like Tiled', () => {
    const tall = tileset('tall', 64, 64);
    const layer = layerWith({ orientation: 'staggered', tileWidth: 64, tileHeight: 32 }, [tall]);

    layer.setTileAt(0, 1, { tileset: tall, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(3, 3, { tileset: tall, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer);

    // Cell (0, 1) has its box at (32, 16); (3, 3) at (224, 48). A 64x64 image rises 32 above the box.
    expect(drawOrder(node)).toEqual([
      [32, 16 - 32, 'tall'],
      [224, 48 - 32, 'tall'],
    ]);
    node.destroy();
  });

  it('draws rows top to bottom across chunks, so taller artwork overlaps the row above', () => {
    const a = tileset('a');
    const b = tileset('b');
    const layer = layerWith({ orientation: 'staggered', tileWidth: 64, tileHeight: 32 }, [a, b]);

    // Row 1 of chunk (1, 0), then row 2 of chunk (0, 1): chunk order alone would draw them reversed.
    layer.setTileAt(2, 1, { tileset: a, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(0, 2, { tileset: b, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(1, 0, { tileset: b, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer);

    expect(drawOrder(node).map(([, , name]) => name)).toEqual(['b', 'a', 'b']);
    expect(drawOrder(node).map(([, top]) => top)).toEqual([0, 16, 32]);
    node.destroy();
  });

  it('draws the unshifted columns of a row before its shifted ones when columns are staggered', () => {
    const a = tileset('a', 32, 28);
    const layer = layerWith({ orientation: 'hexagonal', tileWidth: 32, tileHeight: 28, hexSideLength: 16, staggerAxis: 'x' }, [a]);

    for (let tx = 0; tx < 4; tx++) {
      layer.setTileAt(tx, 0, { tileset: a, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    }

    const node = new TileLayerNode(layer);

    // Columns 0 and 2 sit at y 0, the shifted columns 1 and 3 half a row lower.
    expect(drawOrder(node).map(([left, top]) => [left, top])).toEqual([
      [0, 0],
      [48, 0],
      [24, 14],
      [72, 14],
    ]);
    node.destroy();
  });

  it('bounds a bounded staggered layer by its cells and artwork', () => {
    const a = tileset('a');
    const layer = layerWith({ orientation: 'staggered', tileWidth: 64, tileHeight: 32 }, [a], true);

    layer.setTileAt(3, 3, { tileset: a, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(0, 0, { tileset: a, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const map = new TileMap({ width: 4, height: 4, tileWidth: 64, tileHeight: 32, layers: [layer], projection: layer.projection });
    const node = new TileMapNode(map);
    const bounds = node.getLocalBounds();

    expect(map.pixelWidth).toBe(4 * 64 + 32);
    expect(map.pixelHeight).toBe(4 * 16 + 16);
    expect(bounds.left).toBeLessThanOrEqual(0);
    expect(bounds.right).toBeGreaterThanOrEqual(3 * 64 + 32 + 64);
    expect(bounds.bottom).toBeGreaterThanOrEqual(3 * 16 + 32);
    node.destroy();
  });

  it('streams the chunks a view over a shifted row needs', () => {
    const layer = layerWith({ orientation: 'staggered', tileWidth: 64, tileHeight: 32 }, [tileset('a')]);
    const requested = new Set<string>();
    const streamer = new ChunkStreamer(
      layer,
      {
        getChunk: (cx, cy) => {
          requested.add(`${cx},${cy}`);

          return null;
        },
      },
      new View(160, 48, 64, 32),
      { loadRadius: 0 },
    );

    streamer.update();

    // The view covers cells around (2..3, 2..3); a chunk is 2x2 cells.
    expect(requested.has('1,1')).toBe(true);
    streamer.destroy();
  });

  it('refuses rectangular tile collision on staggered and hexagonal layers', () => {
    const layer = layerWith({ orientation: 'hexagonal', tileWidth: 28, tileHeight: 32, hexSideLength: 16 }, [tileset('a', 28, 32)]);

    expect(() => buildTileCollisionGeometry(layer)).toThrow(/hexagonal.*rectangular logical cells/);
  });

  for (const [name, options] of [
    ['staggered y odd', { orientation: 'staggered', tileWidth: 65, tileHeight: 33 }],
    ['staggered y even', { orientation: 'staggered', tileWidth: 65, tileHeight: 33, staggerIndex: 'even' }],
    ['staggered x odd', { orientation: 'staggered', tileWidth: 65, tileHeight: 33, staggerAxis: 'x' }],
    ['staggered x even', { orientation: 'staggered', tileWidth: 65, tileHeight: 33, staggerAxis: 'x', staggerIndex: 'even' }],
    ['hexagonal y', { orientation: 'hexagonal', tileWidth: 29, tileHeight: 33, hexSideLength: 16 }],
    ['hexagonal x', { orientation: 'hexagonal', tileWidth: 33, tileHeight: 29, hexSideLength: 16, staggerAxis: 'x' }],
  ] as const) {
    it(`${name}: sits odd-sized artwork on the even cell Tiled draws, inside the node bounds`, () => {
      const art = tileset('art', options.tileWidth, options.tileHeight);
      const layer = layerWith(options, [art]);
      const projection = layer.projection;

      for (let ty = -1; ty < 3; ty++) {
        for (let tx = -1; tx < 3; tx++) {
          layer.setTileAt(tx, ty, { tileset: art, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
        }
      }

      const node = new TileLayerNode(layer);

      for (const chunk of node.chunkNodes) {
        const bounds = chunk.getLocalBounds();

        for (const quad of chunk.pages.flatMap(page => page.quads)) {
          // Tiled rounds the cell to even pixels and bottom-aligns artwork on that cell.
          const cell = projection.pixelToTile(quad.x0 + (options.tileWidth & ~1) / 2, quad.y1 - (options.tileHeight & ~1) / 2);
          const corner = projection.tileToPixel(cell.tx, cell.ty);

          expect([quad.x0, quad.y1]).toEqual([corner.x, corner.y + (options.tileHeight & ~1)]);
          expect(bounds.left).toBeLessThanOrEqual(quad.x0);
          expect(bounds.top).toBeLessThanOrEqual(quad.y0);
          expect(bounds.right).toBeGreaterThanOrEqual(quad.x1);
          expect(bounds.bottom).toBeGreaterThanOrEqual(quad.y1);
        }
      }

      node.destroy();
    });
  }
});
