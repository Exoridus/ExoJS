import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import type { ChunkPayload, ChunkSource } from '../src/ChunkSource';
import { TileLayer } from '../src/TileLayer';
import { TileSet } from '../src/TileSet';

function fakeTexture(): Texture {
  return {
    width: 512,
    height: 512,
    uid: 0,
    label: 'test',
    destroy: vi.fn(),
    destroyed: false,
  } as unknown as Texture;
}

function makeTileset(): TileSet {
  return new TileSet({
    name: 'tiles',
    texture: new TextureRegion(fakeTexture(), { x: 0, y: 0, width: 512, height: 512 }),
    tileWidth: 32,
    tileHeight: 32,
    tileCount: 16,
  });
}

describe('ChunkPayload / ChunkSource', () => {
  it('ChunkPayload is structurally compatible with _adoptChunk\'s existing usage', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({
      id: 0, name: 'l',
      tileWidth: 16, tileHeight: 16, tilesets: [tileset],
      chunkWidth: 2, chunkHeight: 2,
    });
    const payload: ChunkPayload = { width: 2, height: 2, tiles: new Uint32Array(4) };

    layer._adoptChunk(0, 0, payload);

    expect(layer.getChunk(0, 0)).toBeDefined();
  });

  it('a ChunkSource implementation can return null for out-of-extent coordinates', () => {
    const source: ChunkSource = {
      getChunk: (cx, cy) => (cx === 0 && cy === 0 ? { width: 2, height: 2, tiles: new Uint32Array(4) } : null),
    };

    expect(source.getChunk(0, 0)).not.toBeNull();
    expect(source.getChunk(5, 5)).toBeNull();
  });

  it('a ChunkSource implementation can return a Promise', async () => {
    const source: ChunkSource = {
      getChunk: async (cx, cy) => ({ width: 1, height: 1, tiles: new Uint32Array([cx + cy]) }),
    };

    const result = await source.getChunk(2, 3);

    expect(result).not.toBeNull();
    expect(result!.tiles[0]).toBe(5);
  });
});
