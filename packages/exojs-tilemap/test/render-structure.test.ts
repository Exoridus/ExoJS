import { type Texture, TextureRegion } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { getTileGeometryRebuildCount, resetTileGeometryRebuildCount } from '../src/chunkGeometry';
import { TileLayer } from '../src/TileLayer';
import { TileLayerNode } from '../src/TileLayerNode';
import { TileProjection, type TileProjectionOptions } from '../src/TileProjection';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

// Structural cost of the tile render paths: how many texture pages (one draw
// each) a layer produces, and that unchanged chunks never rebuild their
// geometry. Counts, not timings, so the result does not depend on machine load.

const region = (width: number, height: number): TextureRegion =>
  new TextureRegion({ width, height } as Texture, { x: 0, y: 0, width, height });

const atlas = (): TileSet => new TileSet({ name: 'atlas', texture: region(64, 32), tileWidth: 32, tileHeight: 32, tileCount: 2 });

const collection = (): TileSet =>
  new TileSet({ name: 'props', tileWidth: 32, tileHeight: 32, tileImages: [region(32, 32), region(32, 32)] });

const SIZE = 8;
const CHUNK = 4;

/** An 8x8 layer in 4x4 chunks, every cell filled, alternating two local ids in a checkerboard. */
const filledLayer = (tileset: TileSet, projection?: TileProjectionOptions): TileLayer => {
  const layer = new TileLayer({
    id: 1,
    name: 'ground',
    tileWidth: 32,
    tileHeight: 32,
    chunkWidth: CHUNK,
    chunkHeight: CHUNK,
    tilesets: [tileset],
    ...(projection !== undefined && { projection: new TileProjection(projection) }),
  });

  for (let ty = 0; ty < SIZE; ty++) {
    for (let tx = 0; tx < SIZE; tx++) {
      layer.setTileAt(tx, ty, { tileset, localTileId: (tx + ty) % 2, transform: TILE_TRANSFORM_IDENTITY });
    }
  }

  return layer;
};

const pageCount = (node: TileLayerNode): number => node.chunkNodes.reduce((sum, chunk) => sum + chunk.pages.length, 0);

const CHUNKS = (SIZE / CHUNK) ** 2;

describe('tile render structure', () => {
  it('draws an atlas layer with one page per chunk, whatever the tile mix', () => {
    const node = new TileLayerNode(filledLayer(atlas()));

    expect(node.chunkNodes).toHaveLength(CHUNKS);
    expect(pageCount(node)).toBe(CHUNKS);
    node.destroy();
  });

  it('draws an image collection with one page per change of image in draw order', () => {
    const checkerboard = new TileLayerNode(filledLayer(collection()));

    // Every neighbouring cell switches image, except across a row break: with an
    // even chunk width the last cell of a row matches the first of the next, so
    // a chunk draws CHUNK * CHUNK - (CHUNK - 1) pages.
    expect(pageCount(checkerboard)).toBe(CHUNKS * (CHUNK * CHUNK - (CHUNK - 1)));
    checkerboard.destroy();

    const props = collection();
    const uniform = new TileLayer({
      id: 1,
      name: 'ground',
      tileWidth: 32,
      tileHeight: 32,
      chunkWidth: CHUNK,
      chunkHeight: CHUNK,
      tilesets: [props],
    });

    for (let ty = 0; ty < SIZE; ty++) {
      for (let tx = 0; tx < SIZE; tx++) {
        uniform.setTileAt(tx, ty, { tileset: props, localTileId: ty < SIZE / 2 ? 0 : 1, transform: TILE_TRANSFORM_IDENTITY });
      }
    }

    const runs = new TileLayerNode(uniform);

    // One image per chunk: consecutive equal images merge into a single page.
    expect(pageCount(runs)).toBe(CHUNKS);
    runs.destroy();
  });

  it('draws staggered and hexagonal layers in one node per band, with atlas tiles batched per band', () => {
    const rows = new TileLayerNode(filledLayer(atlas(), { orientation: 'staggered', tileWidth: 32, tileHeight: 32 }));

    expect(rows.chunkNodes).toHaveLength(CHUNKS * CHUNK);
    expect(pageCount(rows)).toBe(CHUNKS * CHUNK);
    rows.destroy();

    const columns = new TileLayerNode(
      filledLayer(atlas(), { orientation: 'hexagonal', tileWidth: 32, tileHeight: 32, hexSideLength: 16, staggerAxis: 'x' }),
    );

    // Column stagger splits each row into its unshifted and its shifted columns.
    expect(columns.chunkNodes).toHaveLength(CHUNKS * CHUNK * 2);
    expect(pageCount(columns)).toBe(CHUNKS * CHUNK * 2);
    columns.destroy();
  });

  for (const [name, tileset, projection] of [
    ['atlas', atlas, undefined],
    ['image collection', collection, undefined],
    ['staggered', atlas, { orientation: 'staggered', tileWidth: 32, tileHeight: 32 }],
    ['hexagonal', collection, { orientation: 'hexagonal', tileWidth: 32, tileHeight: 32, hexSideLength: 16 }],
  ] as const) {
    it(`${name}: rebuilds only the nodes of a changed chunk, and nothing on a repeated read`, () => {
      const tiles = tileset();
      const layer = filledLayer(tiles, projection);
      const node = new TileLayerNode(layer);

      resetTileGeometryRebuildCount();
      pageCount(node);
      expect(getTileGeometryRebuildCount()).toBe(node.chunkNodes.length);

      pageCount(node);
      expect(getTileGeometryRebuildCount()).toBe(node.chunkNodes.length);

      resetTileGeometryRebuildCount();
      layer.setTileAt(1, 1, { tileset: tiles, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });
      pageCount(node);

      // Only chunk (0, 0) changed; every node drawing part of it rebuilds, no other.
      expect(getTileGeometryRebuildCount()).toBe(node.chunkNodes.length / CHUNKS);
      node.destroy();
    });
  }
});
