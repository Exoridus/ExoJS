import { TextureRegion, View } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import { ChunkStreamer } from '../src/ChunkStreamer';
import { createSampledChunkSource } from '../src/SampledChunkSource';
import { TileLayer } from '../src/TileLayer';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY, unpackTile } from '../src/types';

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

function makeUnboundedLayer(tileset: TileSet, chunkWidth = 4, chunkHeight = 4): TileLayer {
  return new TileLayer({
    id: 0, name: 'l',
    tileWidth: 16, tileHeight: 16, tilesets: [tileset],
    chunkWidth, chunkHeight,
  });
}

describe('createSampledChunkSource', () => {
  it('composes a full chunk when every cell resolves to a tile', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 2, 2);
    const source = createSampledChunkSource(layer, {
      sample: () => 1,
      mapValueToTile: () => ({ tileset, localTileId: 3, transform: TILE_TRANSFORM_IDENTITY }),
    });

    const payload = source.getChunk(0, 0);

    expect(payload).not.toBeNull();
    expect(payload!.width).toBe(2);
    expect(payload!.height).toBe(2);
    for (let i = 0; i < 4; i++) {
      expect(unpackTile(payload!.tiles[i])).toEqual({
        tilesetIndex: 0,
        localTileId: 3,
        transform: TILE_TRANSFORM_IDENTITY,
      });
    }
  });

  it('returns null when mapValueToTile resolves every cell to null', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 2, 2);
    const source = createSampledChunkSource(layer, {
      sample: () => 0,
      mapValueToTile: () => null,
    });

    expect(source.getChunk(0, 0)).toBeNull();
  });

  it('a mixed chunk leaves unresolved cells at 0 and resolved cells at the correct local index', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 2, 2);
    const source = createSampledChunkSource(layer, {
      // Only the top-left tile of the chunk (tx=0, ty=0) resolves.
      sample: (tx, ty) => (tx === 0 && ty === 0 ? 1 : 0),
      mapValueToTile: value => (value === 1 ? { tileset, localTileId: 5, transform: TILE_TRANSFORM_IDENTITY } : null),
    });

    const payload = source.getChunk(0, 0)!;
    expect(unpackTile(payload.tiles[0])).toEqual({ tilesetIndex: 0, localTileId: 5, transform: TILE_TRANSFORM_IDENTITY });
    expect(payload.tiles[1]).toBe(0);
    expect(payload.tiles[2]).toBe(0);
    expect(payload.tiles[3]).toBe(0);
  });

  it('calls sample/mapValueToTile with correct absolute tile coordinates for a non-origin chunk', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 16, 16);
    const seenCoords: { tx: number; ty: number }[] = [];
    const source = createSampledChunkSource(layer, {
      sample: (tx, ty) => {
        seenCoords.push({ tx, ty });
        return 0;
      },
      mapValueToTile: () => null,
    });

    source.getChunk(2, 3);

    expect(seenCoords).toHaveLength(256);
    expect(seenCoords).toContainEqual({ tx: 32, ty: 48 });
    expect(seenCoords).toContainEqual({ tx: 47, ty: 63 });
    expect(seenCoords.every(({ tx }) => tx >= 32 && tx <= 47)).toBe(true);
    expect(seenCoords.every(({ ty }) => ty >= 48 && ty <= 63)).toBe(true);
  });

  it('calls sample/mapValueToTile with correct negative absolute tile coordinates', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 4, 4);
    const seenCoords: { tx: number; ty: number }[] = [];
    const source = createSampledChunkSource(layer, {
      sample: (tx, ty) => {
        seenCoords.push({ tx, ty });
        return 0;
      },
      mapValueToTile: () => null,
    });

    source.getChunk(-1, -1);

    expect(seenCoords).toContainEqual({ tx: -4, ty: -4 });
    expect(seenCoords).toContainEqual({ tx: -1, ty: -1 });
    expect(seenCoords.every(({ tx }) => tx >= -4 && tx <= -1)).toBe(true);
    expect(seenCoords.every(({ ty }) => ty >= -4 && ty <= -1)).toBe(true);
  });

  it('throws when mapValueToTile returns a tile from a tileset not registered on the layer', () => {
    const registeredTileset = makeTileset();
    const foreignTileset = makeTileset();
    const layer = makeUnboundedLayer(registeredTileset, 2, 2);
    const source = createSampledChunkSource(layer, {
      sample: () => 1,
      mapValueToTile: () => ({ tileset: foreignTileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY }),
    });

    expect(() => source.getChunk(0, 0)).toThrow(/Tileset index -1/);
  });

  it('clamps edge-chunk cells past a bounded layer\'s width/height to empty', () => {
    const tileset = makeTileset();
    // width=5, height=5 is not a multiple of chunkWidth=4/chunkHeight=4, so
    // chunk (1, 0) nominally covers tx in [4, 7] but only tx=4 is in-bounds
    // (valid tx is 0..4).
    const layer = new TileLayer({
      id: 0, name: 'l',
      tileWidth: 16, tileHeight: 16, tilesets: [tileset],
      chunkWidth: 4, chunkHeight: 4,
      width: 5, height: 5,
    });
    const source = createSampledChunkSource(layer, {
      // Resolve unconditionally: if the fix were absent, this would fill
      // the out-of-bounds cells (tx >= 5) with a tile too.
      sample: () => 1,
      mapValueToTile: () => ({ tileset, localTileId: 7, transform: TILE_TRANSFORM_IDENTITY }),
    });

    const payload = source.getChunk(1, 0)!;
    expect(payload).not.toBeNull();
    expect(payload.width).toBe(4);
    expect(payload.height).toBe(4);

    // Local column 0 corresponds to tx=4, which is in-bounds (width=5).
    for (let localTy = 0; localTy < 4; localTy++) {
      expect(unpackTile(payload.tiles[localTy * 4 + 0])).toEqual({
        tilesetIndex: 0,
        localTileId: 7,
        transform: TILE_TRANSFORM_IDENTITY,
      });
    }

    // Local columns 1-3 correspond to tx=5..7, which are out-of-bounds and
    // must stay empty despite mapValueToTile resolving unconditionally.
    for (let localTy = 0; localTy < 4; localTy++) {
      for (let localTx = 1; localTx < 4; localTx++) {
        expect(payload.tiles[localTy * 4 + localTx]).toBe(0);
      }
    }
  });

  it('tiles installed via ChunkStreamer are readable through TileLayer.getTileAt', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 4, 4);
    const source = createSampledChunkSource(layer, {
      sample: (tx, ty) => tx + ty,
      mapValueToTile: value => (value % 2 === 0 ? { tileset, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY } : null),
    });
    const view = new View(0, 0, 32, 32);
    const streamer = new ChunkStreamer(layer, source, view);

    streamer.update();

    // (0,0): sample = 0, even -> resolves to localTileId 1.
    expect(layer.getTileAt(0, 0)).toEqual({ tileset, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });
    // (1,0): sample = 1, odd -> stays empty.
    expect(layer.getTileAt(1, 0)).toBeNull();
    // (2,0): sample = 2, even -> resolves to localTileId 1.
    expect(layer.getTileAt(2, 0)).toEqual({ tileset, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });
  });
});
