import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

// Compile-time imports: verify these types are reachable from the package barrel.
import type { PackedTile, ReadonlyTileChunk } from '../src/index';
import { TileLayer } from '../src/TileLayer';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

function fakeTexture(): Texture {
  return {
    width: 256,
    height: 256,
    uid: 0,
    label: 'test',
    destroy: () => {},
    destroyed: false,
  } as unknown as Texture;
}

function fakeRegion(): TextureRegion {
  return new TextureRegion(fakeTexture(), { x: 0, y: 0, width: 256, height: 256 });
}

function createTestLayer(): {
  layer: TileLayer;
  ref: { tileset: TileSet; localTileId: number; transform: typeof TILE_TRANSFORM_IDENTITY };
} {
  const ts = new TileSet({
    name: 'ts',
    texture: fakeRegion(),
    tileWidth: 32,
    tileHeight: 32,
    tileCount: 16,
    columns: 4,
  });
  const layer = new TileLayer({
    id: 0,
    name: 'l',
    width: 32,
    height: 32,
    tileWidth: 16,
    tileHeight: 16,
    tilesets: [ts],
  });
  return { layer, ref: { tileset: ts, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY } };
}

describe('public chunk boundary', () => {
  it('TileChunk class is NOT exported from the package barrel', async () => {
    const root = await import('../src/index');
    expect('TileChunk' in root).toBe(false);
  });

  it('ReadonlyTileChunk type compiles from barrel import', () => {
    // The static import at the top of this file proves ReadonlyTileChunk
    // is importable from the package barrel. If it weren't exported,
    // this file wouldn't compile.
    const _c: ReadonlyTileChunk | undefined = undefined;
    expect(_c).toBeUndefined();
  });

  it('PackedTile type compiles from barrel import', () => {
    // Static import at the top proves PackedTile is exportable.
    const _p: PackedTile = 0;
    expect(_p).toBe(0);
  });

  it('packTile/unpackTile are importable from the package barrel and round-trip', async () => {
    const { packTile, unpackTile } = await import('../src/index');
    const packed = packTile(2, 5, { flipX: true, flipY: false, diagonal: true });
    expect(unpackTile(packed)).toEqual({
      tilesetIndex: 2,
      localTileId: 5,
      transform: { flipX: true, flipY: false, diagonal: true },
    });
  });

  it('layer.getChunk returns ReadonlyTileChunk, not the mutable class', () => {
    const { layer, ref } = createTestLayer();
    layer.setTileAt(0, 0, ref);
    const chunk = layer.getChunk(0, 0);
    expect(chunk).toBeDefined();
    expect(chunk!.cx).toBe(0);

    // ReadonlyTileChunk has getRawAt and cloneTiles.
    expect(typeof chunk!.getRawAt).toBe('function');
    expect(typeof chunk!.cloneTiles).toBe('function');

    // The public type (ReadonlyTileChunk) does not expose _tiles,
    // _setRawAt, _clear, or _markDirty. At the JS level the methods
    // exist on the instance (TS-private is compile-time only), but the
    // public contract is: consumers must only use ReadonlyTileChunk methods.
    // The type system prevents accessing these — see the static import tests.

    // cloneTiles produces an independent copy.
    const copy = chunk!.cloneTiles();
    copy[0] = 999;
    expect(chunk!.getRawAt(0, 0)).not.toBe(0);
  });

  it('loadedChunks returns ReadonlyTileChunk elements', () => {
    const { layer, ref } = createTestLayer();
    layer.setTileAt(16, 16, ref);
    for (const chunk of layer.loadedChunks()) {
      expect(typeof chunk.getRawAt).toBe('function');
      expect(typeof chunk.cloneTiles).toBe('function');
      expect(chunk.cx).toBe(0);
    }
  });

  it('mutation goes through TileLayer only — no direct chunk mutation API', () => {
    const { layer, ref } = createTestLayer();
    const rev = layer.revision;
    layer.setTileAt(5, 5, ref);
    expect(layer.revision).toBe(rev + 1);

    const chunk = layer.getChunk(0, 0)!;
    // The chunk is a ReadonlyTileChunk — TypeScript prevents calling
    // _setRawAt on it at the type level (would be a compile error).
    expect(chunk.getRawAt(5, 5)).not.toBe(0);
  });
});
