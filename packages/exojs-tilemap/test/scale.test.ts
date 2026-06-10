import { describe, expect, it } from 'vitest';

import { TextureRegion } from '@codexo/exojs';
import { Texture } from '@codexo/exojs';

import { TileChunk } from '../src/TileChunk';
import { TileLayer } from '../src/TileLayer';
import { TileMap } from '../src/TileMap';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

function fakeRegion(tw = 2048, th = 2048): TextureRegion {
  return new TextureRegion(
    { width: tw, height: th, uid: 0, label: 'test', destroy: () => {}, destroyed: false } as unknown as Texture,
    { x: 0, y: 0, width: tw, height: th },
  );
}

function makeTileset(name: string, tileCount = 256): TileSet {
  return new TileSet({
    name,
    texture: fakeRegion(),
    tileWidth: 32,
    tileHeight: 32,
    tileCount,
  });
}

describe('scale / storage', () => {
  it('constructs 512×512 tile map without per-tile objects', () => {
    const ts = makeTileset('base', 256);
    const map = new TileMap({
      width: 512,
      height: 512,
      tileWidth: 32,
      tileHeight: 32,
      tilesets: [ts],
      layers: [
        new TileLayer({
          id: 0,
          name: 'large',
          width: 512,
          height: 512,
          tileWidth: 32,
          tileHeight: 32,
          tilesets: [ts],
        }),
      ],
    });

    expect(map.width).toBe(512);
    expect(map.height).toBe(512);

    const layer = map.getLayerById(0)!;
    expect([...layer.loadedChunks()]).toHaveLength(0);

    const ref = { tileset: ts, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY };
    layer.setTileAt(0, 0, ref);
    expect([...layer.loadedChunks()]).toHaveLength(1);
  });

  it('dense fill 32×32 chunk creates exactly one chunk', () => {
    const ts = makeTileset('base', 256);
    const layer = new TileLayer({
      id: 0,
      name: 'chunk-fill',
      width: 32,
      height: 32,
      tileWidth: 16,
      tileHeight: 16,
      tilesets: [ts],
      chunkWidth: 32,
      chunkHeight: 32,
    });

    const ref = { tileset: ts, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY };
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        layer.setTileAt(x, y, ref);
      }
    }

    expect([...layer.loadedChunks()]).toHaveLength(1);
    expect(layer.countNonEmptyTiles()).toBe(1024);
  });

  it('chunk count for 512×512 with default 32×32 chunks is predictable', () => {
    const ts = makeTileset('base', 256);
    const layer = new TileLayer({
      id: 0,
      name: 'large',
      width: 512,
      height: 512,
      tileWidth: 16,
      tileHeight: 16,
      tilesets: [ts],
      chunkWidth: 32,
      chunkHeight: 32,
    });

    const ref = { tileset: ts, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY };
    for (let cy = 0; cy < 16; cy++) {
      for (let cx = 0; cx < 16; cx++) {
        layer.setTileAt(cx * 32, cy * 32, ref);
      }
    }

    expect([...layer.loadedChunks()]).toHaveLength(256);
  });

  it('storage uses Uint32Array internally, not exposed publicly', () => {
    const chunk = new TileChunk(0, 0, 32, 32);
    // The private _tiles is not accessible from outside
    expect((chunk as Record<string, unknown>).tiles).toBeUndefined();
    expect(chunk.cloneTiles()).toBeInstanceOf(Uint32Array);
    expect(chunk.cloneTiles().length).toBe(1024);
  });

  it('empty chunk is identified quickly after creation', () => {
    const chunk = new TileChunk(0, 0, 32, 32);
    expect(chunk.empty).toBe(true);
  });

  it('chunk iteration is bounded and efficient', () => {
    const ts = makeTileset('base', 256);
    const layer = new TileLayer({
      id: 0,
      name: 'iter-test',
      width: 128,
      height: 128,
      tileWidth: 16,
      tileHeight: 16,
      tilesets: [ts],
    });

    const ref = { tileset: ts, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY };
    for (let i = 0; i < 128; i++) {
      layer.setTileAt(i, i, ref);
    }

    const tiles = [...layer.tilesInRect(0, 0, 128, 128)];
    expect(tiles.length).toBe(128);

    const chunkCount = [...layer.loadedChunks()].length;
    expect(chunkCount).toBeGreaterThan(1);
    expect(chunkCount).toBeLessThanOrEqual(32);
  });

  it('clearRect on 128×128 dense fill is efficient', () => {
    const ts = makeTileset('base', 256);
    const layer = new TileLayer({
      id: 0,
      name: 'clear-test',
      width: 128,
      height: 128,
      tileWidth: 16,
      tileHeight: 16,
      tilesets: [ts],
    });

    const ref = { tileset: ts, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY };
    layer.fillRect(0, 0, 128, 128, ref);
    expect(layer.countNonEmptyTiles()).toBe(128 * 128);

    layer.clearRect(0, 0, 128, 128);
    expect(layer.countNonEmptyTiles()).toBe(0);
  });
});
