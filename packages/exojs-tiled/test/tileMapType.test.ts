import { Asset, Texture } from '@codexo/exojs';
import { TileMap } from '@codexo/exojs-tilemap';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { tileMapType } from '../src/tileMapType';
import { loadFixture, makeTiledContext } from './type-context';

describe('tileMapType descriptor', () => {
  it('dispatches on the TileMap constructor', () => {
    expect(tileMapType._token).toBe(TileMap);
  });

  it('is named "tileMap"', () => {
    expect(tileMapType.id).toBe('tileMap');
  });

  it('claims the .tmj file extension', () => {
    expect(tileMapType.extensions).toEqual(['tmj']);
  });

  it('acquires nothing itself: the document arrives as a dependency', () => {
    expect(tileMapType.unacquiredSource!()).toEqual({ source: undefined });
  });
});

describe('tileMapType.resourceIdentity', () => {
  it('contributes the resolved format and nothing else', () => {
    expect(tileMapType.resourceIdentity!({ source: 'world.tmj' })).toBe('tiled');
  });

  it('uses an explicit format when provided', () => {
    expect(tileMapType.resourceIdentity!({ source: 'world.tmj', options: { format: 'tiled' } })).toBe('tiled');
  });

  it('does not vary by source - the loader already keys by locator', () => {
    expect(tileMapType.resourceIdentity!({ source: 'a.tmj' })).toBe(tileMapType.resourceIdentity!({ source: 'b.tmj' }));
  });
});

// `minimal.tmj` declares a tileset without an image, which `toTileMap()`
// rejects - these tests convert, so they use the atlas fixture.

describe('tileMapType - minimal map', () => {
  const { loadRuntime, load } = makeTiledContext({ 'minimal.tmj': loadFixture('with-tileset-image.tmj') });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a TileMap instance', async () => {
    await expect(loadRuntime('minimal.tmj')).resolves.toBeInstanceOf(TileMap);
  });

  it('preserves map dimensions', async () => {
    const result = await loadRuntime('minimal.tmj');

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.tileWidth).toBe(16);
    expect(result.tileHeight).toBe(16);
  });

  it('reaches the document through a tiledSource dependency', async () => {
    await loadRuntime('minimal.tmj');

    expect(load).toHaveBeenCalledWith(expect.objectContaining({ _config: { type: 'tiledSource', source: 'minimal.tmj' } }));
  });

  it('rejects a map whose tileset carries no image', async () => {
    const bare = makeTiledContext({ 'no-image.tmj': loadFixture('minimal.tmj') });

    await expect(bare.loadRuntime('no-image.tmj')).rejects.toThrow(/has no image/);
  });
});

describe('tileMapType - with atlas tileset image', () => {
  const { loadRuntime, load } = makeTiledContext({ 'with-tileset-image.tmj': loadFixture('with-tileset-image.tmj') });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a TileMap instance', async () => {
    await expect(loadRuntime('with-tileset-image.tmj')).resolves.toBeInstanceOf(TileMap);
  });

  it('the runtime TileMap has a TileSet with the loaded texture', async () => {
    const result = await loadRuntime('with-tileset-image.tmj');

    expect(result.tilesets).toHaveLength(1);
    // The texture is loaded transitively, through the tiledSource dependency.
    expect(load).toHaveBeenCalledWith(Asset.type('texture', 'tiles.png'));
  });
});

describe('tileMapType - external tileset (.tsj)', () => {
  const { loadRuntime, load } = makeTiledContext({
    'external-tileset.tmj': loadFixture('external-tileset.tmj'),
    'external-tileset.tsj': loadFixture('external-tileset.tsj'),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a TileMap instance', async () => {
    await expect(loadRuntime('external-tileset.tmj')).resolves.toBeInstanceOf(TileMap);
  });

  it('loads the external tileset texture', async () => {
    await loadRuntime('external-tileset.tmj');

    expect(load).toHaveBeenCalledWith(Asset.type('texture', 'external-tileset.png'));
  });
});

describe('tileMapType - options passthrough', () => {
  const { loadRuntime, load } = makeTiledContext({ 'world.tmj': loadFixture('with-tileset-image.tmj') });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes its options on to the tiledSource dependency', async () => {
    const options = { format: 'tiled' as const };

    await loadRuntime('world.tmj', options);

    expect(load).toHaveBeenCalledWith(expect.objectContaining({ _config: { type: 'tiledSource', source: 'world.tmj', format: 'tiled' } }));
  });
});

describe('tileMapType - texture ownership', () => {
  it('TileMap.destroy() does not free loader-owned textures', async () => {
    const { loadRuntime } = makeTiledContext({ 'with-tex.tmj': loadFixture('with-tileset-image.tmj') });
    const tileMap = await loadRuntime('with-tex.tmj');

    // TileMap.destroy() clears the tilesets array but must NOT destroy the
    // texture, which the loader owns and other maps may share.
    const texture = tileMap.tilesets[0]!.texture.texture;

    expect(texture).toBeInstanceOf(Texture);

    tileMap.destroy();

    expect(texture).toBeInstanceOf(Texture);
  });
});
