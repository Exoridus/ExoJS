import { Asset, Texture } from '@codexo/exojs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TiledMap } from '../src/TiledMap';
import { TiledFormatError } from '../src/validate';
import { loadFixture, makeTiledContext } from './type-context';

function makeContext(fixtures: Record<string, unknown>) {
  const { loadSource, load, textureLoad } = makeTiledContext(fixtures);

  return { loadMap: loadSource, load, loaderLoad: textureLoad };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('loadTiledMap — minimal map (no images)', () => {
  // minimal.tmj: embedded tileset with no "image" field
  const { loadMap, loaderLoad } = makeContext({
    'minimal.tmj': loadFixture('minimal.tmj'),
  });

  it('returns a TiledMap instance', async () => {
    const map = await loadMap('minimal.tmj');
    expect(map).toBeInstanceOf(TiledMap);
  });

  it('resolves the correct map dimensions', async () => {
    const map = await loadMap('minimal.tmj');
    expect(map.width).toBe(4);
    expect(map.height).toBe(4);
    expect(map.tileWidth).toBe(16);
    expect(map.tileHeight).toBe(16);
  });

  it('does not call loader.load (no images to load)', async () => {
    await loadMap('minimal.tmj');
    expect(loaderLoad).not.toHaveBeenCalled();
  });

  it('stores the source URL on the returned map', async () => {
    const map = await loadMap('minimal.tmj');
    expect(map.source).toBe('minimal.tmj');
  });
});

describe('loadTiledMap — embedded tileset with atlas image', () => {
  // with-tileset-image.tmj: embedded tileset with image: "tiles.png"
  const { loadMap, loaderLoad } = makeContext({
    'with-tileset-image.tmj': loadFixture('with-tileset-image.tmj'),
  });

  it('calls loader.load(Asset.type(texture, imageUrl)) for the atlas image', async () => {
    await loadMap('with-tileset-image.tmj');
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'tiles.png'));
  });

  it('stores the loaded texture on the tileset', async () => {
    const map = await loadMap('with-tileset-image.tmj');
    expect(map.tilesets[0].texture).toBeInstanceOf(Texture);
  });

  it('stores the resolved imageUrl on the tileset', async () => {
    const map = await loadMap('with-tileset-image.tmj');
    expect(map.tilesets[0].imageUrl).toBe('tiles.png');
  });
});

describe('loadTiledMap — external .tsj tileset', () => {
  // external-tileset.tmj references external-tileset.tsj, which has image: "external-tileset.png"
  const { loadMap, loaderLoad, load } = makeContext({
    'external-tileset.tmj': loadFixture('external-tileset.tmj'),
    'external-tileset.tsj': loadFixture('external-tileset.tsj'),
  });

  it('fetches the .tsj file', async () => {
    await loadMap('external-tileset.tmj');
    expect(load).toHaveBeenCalledWith(Asset.type('json', 'external-tileset.tsj'));
  });

  it('loads the tileset image relative to the .tsj location', async () => {
    await loadMap('external-tileset.tmj');
    // resolveTiledUrl('external-tileset.png', 'external-tileset.tsj') → 'external-tileset.png'
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'external-tileset.png'));
  });

  it('stores the tsj source URL on the tileset', async () => {
    const map = await loadMap('external-tileset.tmj');
    expect(map.tilesets[0].source).toBe('external-tileset.tsj');
  });

  it('stores the loaded texture on the tileset', async () => {
    const map = await loadMap('external-tileset.tmj');
    expect(map.tilesets[0].texture).toBeInstanceOf(Texture);
  });
});

describe('loadTiledMap — collection-of-images tileset', () => {
  // collection-tileset.tmj: embedded tileset with tiles[].image (no top-level image)
  const { loadMap, loaderLoad } = makeContext({
    'collection-tileset.tmj': loadFixture('collection-tileset.tmj'),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls loader.load for each per-tile image', async () => {
    await loadMap('collection-tileset.tmj');
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'tile0.png'));
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'tile1.png'));
  });

  it('does NOT call loader.load for the atlas image — exactly 2 per-tile calls', async () => {
    await loadMap('collection-tileset.tmj');
    expect(loaderLoad).toHaveBeenCalledTimes(2);
  });

  it('stores per-tile textures on the tileset keyed by local tile id', async () => {
    const map = await loadMap('collection-tileset.tmj');
    const tileset = map.tilesets[0];
    expect(tileset.tileTextures.size).toBe(2);
    expect(tileset.tileTextures.get(0)).toBeInstanceOf(Texture);
    expect(tileset.tileTextures.get(1)).toBeInstanceOf(Texture);
  });

  it('does not set imageUrl on the tileset (no atlas)', async () => {
    const map = await loadMap('collection-tileset.tmj');
    expect(map.tilesets[0].imageUrl).toBeUndefined();
  });
});

describe('loadTiledMap — image layer nested inside a group layer', () => {
  const { loadMap, loaderLoad } = makeContext({
    'nested-image.tmj': {
      type: 'map',
      version: '1.10',
      orientation: 'orthogonal',
      renderorder: 'right-down',
      width: 1,
      height: 1,
      tilewidth: 16,
      tileheight: 16,
      infinite: false,
      layers: [
        {
          id: 1,
          name: 'Group',
          type: 'group',
          visible: true,
          x: 0,
          y: 0,
          opacity: 1,
          layers: [{ id: 2, name: 'Bg', type: 'imagelayer', visible: true, x: 0, y: 0, opacity: 1, image: 'bg.png' }],
        },
      ],
      tilesets: [],
    },
  });

  it('loads the texture for an image layer nested inside a group layer', async () => {
    await loadMap('nested-image.tmj');
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'bg.png'));
  });

  it('attaches the preloaded texture to the nested image layer via toTileMap()', async () => {
    const map = await loadMap('nested-image.tmj');
    const runtime = map.toTileMap();
    expect(runtime.imageLayers[0]!.texture).toBeInstanceOf(Texture);
  });
});

describe('loadTiledMap — error propagation', () => {
  it('propagates TiledFormatError for invalid TMJ', async () => {
    const { loadMap } = makeContext({
      'bad.tmj': { type: 'tileset' }, // wrong type
    });
    await expect(loadMap('bad.tmj')).rejects.toThrow(TiledFormatError);
    await expect(loadMap('bad.tmj')).rejects.toThrow(/expected "map"/);
  });

  it('propagates TiledFormatError when a GID is not covered by any tileset', async () => {
    // Minimal map with GIDs 1-2 but a tileset covering only GID 1
    const { loadMap } = makeContext({
      'narrow.tmj': {
        type: 'map',
        version: '1.10',
        orientation: 'orthogonal',
        renderorder: 'right-down',
        width: 2,
        height: 1,
        tilewidth: 16,
        tileheight: 16,
        infinite: false,
        layers: [{ id: 1, name: 'Base', type: 'tilelayer', visible: true, x: 0, y: 0, width: 2, height: 1, opacity: 1, data: [1, 2] }],
        tilesets: [{ firstgid: 1, name: 'narrow', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1 }],
      },
    });
    await expect(loadMap('narrow.tmj')).rejects.toThrow(TiledFormatError);
    await expect(loadMap('narrow.tmj')).rejects.toThrow(/gid 2.*is not covered/);
  });
});
