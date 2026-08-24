import { Texture } from '@codexo/exojs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TiledMap } from '../src/TiledMap';
import { tiledSourceType } from '../src/tiledSourceType';
import { loadFixture, makeTiledContext } from './type-context';

describe('tiledSourceType descriptor', () => {
  it('dispatches on the TiledMap constructor', () => {
    expect(tiledSourceType._token).toBe(TiledMap);
  });

  it('is named "tiledSource"', () => {
    expect(tiledSourceType.id).toBe('tiledSource');
  });

  it('claims no file extension, so a bare .tmj path stays with the runtime type', () => {
    expect(tiledSourceType.extensions).toEqual([]);
  });

  it('reads its representation as the text that arrived', async () => {
    const response = { text: async () => '{"a":1}' } as unknown as Response;

    await expect(tiledSourceType.codec!.fromResponse(response, { locator: 'url:x.tmj' })).resolves.toBe('{"a":1}');
  });
});

describe('tiledSourceType - minimal map', () => {
  const { loadSource } = makeTiledContext({ 'minimal.tmj': loadFixture('minimal.tmj') });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a TiledMap instance', async () => {
    await expect(loadSource('minimal.tmj')).resolves.toBeInstanceOf(TiledMap);
  });

  it('preserves map dimensions on the returned TiledMap', async () => {
    const result = await loadSource('minimal.tmj');

    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.tileWidth).toBe(16);
    expect(result.tileHeight).toBe(16);
  });

  it('stores the source URL on the TiledMap', async () => {
    const result = await loadSource('minimal.tmj');

    expect(result.source).toBe('minimal.tmj');
  });
});

// load(tileMapType) must be semantically equivalent to
// load(tiledSourceType).toTileMap(): same dimensions, layer count, tileset
// count, and tile data.

describe('the runtime map equals the converted source model', () => {
  const FIXTURES = { 'world.tmj': loadFixture('with-tileset-image.tmj') };

  it('both paths produce a TileMap with the same dimensions', async () => {
    const { loadRuntime, loadSource } = makeTiledContext(FIXTURES);

    const direct = await loadRuntime('world.tmj');
    const fromSource = (await loadSource('world.tmj')).toTileMap();

    expect(direct.width).toBe(fromSource.width);
    expect(direct.height).toBe(fromSource.height);
    expect(direct.tileWidth).toBe(fromSource.tileWidth);
    expect(direct.tileHeight).toBe(fromSource.tileHeight);
  });

  it('both paths produce the same number of layers and tilesets', async () => {
    const { loadRuntime, loadSource } = makeTiledContext(FIXTURES);

    const direct = await loadRuntime('world.tmj');
    const fromSource = (await loadSource('world.tmj')).toTileMap();

    expect(direct.layers.length).toBe(fromSource.layers.length);
    expect(direct.tilesets.length).toBe(fromSource.tilesets.length);
  });

  it('both paths produce the same tile count in the first layer', async () => {
    const { loadRuntime, loadSource } = makeTiledContext(FIXTURES);

    const direct = await loadRuntime('world.tmj');
    const fromSource = (await loadSource('world.tmj')).toTileMap();

    expect(direct.layers[0]!.countNonEmptyTiles()).toBe(fromSource.layers[0]!.countNonEmptyTiles());
  });
});

describe('tiledSourceType - texture ownership', () => {
  it('TiledMap.destroy() does not free loader-owned textures', async () => {
    const { loadSource } = makeTiledContext({ 'with-tex.tmj': loadFixture('with-tileset-image.tmj') });
    const tiledMap = await loadSource('with-tex.tmj');
    const texture = tiledMap.tilesets[0].texture;

    tiledMap.destroy();

    // The texture reference on the tileset must still be accessible (not nulled).
    expect(tiledMap.tilesets[0].texture).toBe(texture);
    expect(tiledMap.tilesets[0].texture).toBeInstanceOf(Texture);
  });
});
