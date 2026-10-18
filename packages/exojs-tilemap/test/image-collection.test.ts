import { type Texture, TextureRegion } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { buildChunkPages } from '../src/chunkGeometry';
import { ObjectKind, type TileMapObject } from '../src/ObjectLayer';
import { buildTileCollisionGeometry } from '../src/tileCollision';
import { TileLayer } from '../src/TileLayer';
import { TileProjection } from '../src/TileProjection';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

const fakeTexture = (width: number, height: number): Texture =>
  ({
    width,
    height,
    flipY: false,
    uid: 0,
    label: 'test',
    destroy: () => {},
    destroyed: false,
  }) as unknown as Texture;

const image = (width: number, height: number): TextureRegion =>
  new TextureRegion(fakeTexture(width, height), { x: 0, y: 0, width, height });

const atlas = (): TileSet => new TileSet({ name: 'atlas', texture: image(64, 32), tileWidth: 32, tileHeight: 32, tileCount: 2 });

const layerOf = (tilesets: TileSet[], width = 4, height = 1): TileLayer =>
  new TileLayer({ id: 1, name: 'ground', width, height, tileWidth: 32, tileHeight: 32, tilesets });

describe('image-collection TileSet', () => {
  it('serves each tile from its own image, with holes for removed ids', () => {
    const rock = image(32, 32);
    const tree = image(48, 96);
    const tileset = new TileSet({ name: 'props', tileWidth: 48, tileHeight: 96, tileImages: [rock, null, tree] });

    expect(tileset.texture).toBeNull();
    expect(tileset.tileCount).toBe(3);
    expect(tileset.getTileTexture(0)).toBe(rock);
    expect(tileset.getTileTexture(1)).toBeNull();
    expect(tileset.getTileTexture(2)).toBe(tree);
    expect(tileset.getTileTexture(3)).toBeNull();
    expect(tileset.getTileRect(2)).toEqual({ x: 0, y: 0, width: 48, height: 96 });
    expect(() => tileset.getTileRect(1)).toThrow(/no image for localTileId 1/);
  });

  it('serves an atlas tile from the atlas', () => {
    const tileset = atlas();

    expect(tileset.tileImages).toBeNull();
    expect(tileset.getTileTexture(1)).toBe(tileset.texture);
    expect(tileset.getTileTexture(2)).toBeNull();
  });

  it('rejects an empty collection', () => {
    expect(() => new TileSet({ name: 'empty', tileWidth: 32, tileHeight: 32, tileImages: [] })).toThrow(/at least one tile image/);
  });
});

describe('image-collection chunk geometry', () => {
  it('draws every image at its own size, bottom-left aligned in its cell', () => {
    const tree = image(48, 96);
    const props = new TileSet({ name: 'props', tileWidth: 48, tileHeight: 96, tileImages: [tree] });
    const layer = layerOf([props]);

    layer.setTileAt(1, 0, { tileset: props, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const pages = buildChunkPages(layer.getChunk(0, 0)!, [props], 32, 32);

    expect(pages).toHaveLength(1);
    expect(pages[0].texture).toBe(tree.texture);
    expect(pages[0].quads[0]).toMatchObject({ x0: 32, y0: 32 - 96, x1: 80, y1: 32, u0: 0, v0: 0, u1: 1, v1: 1 });
  });

  it('keeps cell order across images and atlases so overhanging images stack like the editor draws them', () => {
    const rock = image(32, 32);
    const tree = image(48, 96);
    const props = new TileSet({ name: 'props', tileWidth: 48, tileHeight: 96, tileImages: [rock, tree] });
    const ground = atlas();
    const layer = layerOf([ground, props]);

    layer.setTileAt(0, 0, { tileset: props, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(1, 0, { tileset: ground, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(2, 0, { tileset: props, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(3, 0, { tileset: props, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const pages = buildChunkPages(layer.getChunk(0, 0)!, [ground, props], 32, 32);

    // The tree reaches over the next cell, so it and the ground drawn there keep
    // cell order; the rocks overlap nothing and batch ahead of both.
    expect(pages.map(page => page.texture)).toEqual([rock.texture, tree.texture, ground.texture!.texture]);
    expect(pages.map(page => page.quads.length)).toEqual([2, 1, 1]);
    expect(pages.map(page => page.tileset)).toEqual([props, props, ground]);
  });

  it('batches in-cell tiles by texture ahead of overhanging images that cover nothing drawn after them', () => {
    const rock = image(32, 32);
    const tree = image(32, 96);
    const props = new TileSet({ name: 'props', tileWidth: 32, tileHeight: 96, tileImages: [rock, tree] });
    const ground = atlas();
    const layer = layerOf([ground, props], 4, 2);

    for (let x = 0; x < 4; x++) {
      layer.setTileAt(x, 0, { tileset: ground, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    }

    layer.setTileAt(0, 1, { tileset: props, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(1, 1, { tileset: ground, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(2, 1, { tileset: props, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(3, 1, { tileset: props, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });

    const pages = buildChunkPages(layer.getChunk(0, 0)!, [ground, props], 32, 32);

    // The trees reach only up, over ground drawn before them, so every in-cell
    // tile batches by texture and the trees follow in cell order.
    expect(pages.map(page => page.texture)).toEqual([ground.texture!.texture, rock.texture, tree.texture]);
    expect(pages.map(page => page.quads.length)).toEqual([5, 1, 2]);
  });

  it('keeps an in-cell image under an earlier overhang in cell order after it', () => {
    const rock = image(32, 32);
    const bush = image(64, 32);
    const props = new TileSet({ name: 'props', tileWidth: 64, tileHeight: 32, tileImages: [rock, bush] });
    const layer = layerOf([props], 3, 1);

    layer.setTileAt(0, 0, { tileset: props, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(1, 0, { tileset: props, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(2, 0, { tileset: props, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const pages = buildChunkPages(layer.getChunk(0, 0)!, [props], 32, 32);

    // The bush reaches over cell 1, so the rock there stays after it; the rock on
    // cell 2 overlaps nothing and batches ahead.
    expect(pages.map(page => page.texture)).toEqual([rock.texture, bush.texture, rock.texture]);
    expect(pages.map(page => page.quads.map(quad => quad.x0))).toEqual([[64], [0], [32]]);
  });

  it('skips a cell whose collection id has no image', () => {
    const props = new TileSet({ name: 'props', tileWidth: 32, tileHeight: 32, tileImages: [null, image(32, 32)] });
    const layer = layerOf([props]);

    layer.setTileAt(0, 0, { tileset: props, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(1, 0, { tileset: props, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });

    const pages = buildChunkPages(layer.getChunk(0, 0)!, [props], 32, 32);

    expect(pages.flatMap(page => page.quads)).toHaveLength(1);
  });

  it('places collection images on isometric cells like atlas tiles', () => {
    const tree = image(64, 80);
    const props = new TileSet({ name: 'props', tileWidth: 64, tileHeight: 80, tileImages: [tree] });
    const layer = new TileLayer({ id: 1, name: 'iso', width: 2, height: 2, tileWidth: 64, tileHeight: 32, tilesets: [props] });
    const projection = new TileProjection({ orientation: 'isometric', tileWidth: 64, tileHeight: 32 });

    layer.setTileAt(1, 0, { tileset: props, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const [page] = buildChunkPages(layer.getChunk(0, 0)!, [props], 64, 32, projection);

    // Cell (1, 0) has its top vertex at (32, 16); the image sits on the cell base.
    expect(page!.quads[0]).toMatchObject({ x0: 0, y0: 16 + 32 - 80, x1: 64, y1: 16 + 32 });
  });

  it('leaves atlas-only chunks grouped by tileset as before', () => {
    const a = atlas();
    const b = new TileSet({ name: 'b', texture: image(64, 32), tileWidth: 32, tileHeight: 32, tileCount: 2 });
    const layer = layerOf([a, b]);

    layer.setTileAt(0, 0, { tileset: b, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(1, 0, { tileset: a, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(2, 0, { tileset: b, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });

    const pages = buildChunkPages(layer.getChunk(0, 0)!, [a, b], 32, 32);

    expect(pages.map(page => page.tileset)).toEqual([a, b]);
    expect(pages.map(page => page.quads.length)).toEqual([1, 2]);
  });
});

describe('image-collection tile collision', () => {
  it('anchors the collision shapes of a tile to its own image, not to the largest one in the set', () => {
    const props = new TileSet({ name: 'props', tileWidth: 16, tileHeight: 48, tileImages: [image(16, 16), image(16, 48)] });
    const box = {
      kind: ObjectKind.Rectangle,
      id: 1,
      name: '',
      type: 'solid',
      x: 4,
      y: 8,
      width: 8,
      height: 4,
      rotation: 0,
      visible: true,
      properties: {},
    };

    props.setDefinitions([
      { localTileId: 0, collision: [box as TileMapObject] },
      { localTileId: 1, collision: [box as TileMapObject] },
    ]);

    const layer = new TileLayer({ id: 1, name: 'ground', width: 8, height: 8, tileWidth: 16, tileHeight: 16, tilesets: [props] });

    layer.setTileAt(2, 3, { tileset: props, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(5, 3, { tileset: props, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });

    const shapes = buildTileCollisionGeometry(layer).shapes;

    // The short tile fills its cell; the tall one rises 32 px above its cell.
    expect(shapes.map(shape => [shape.x, shape.y])).toEqual([
      [2 * 16 + 4, 3 * 16 + 8],
      [5 * 16 + 4, 3 * 16 - 32 + 8],
    ]);
  });
});
