import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { Asset } from '@codexo/exojs';
import { type AssetLoaderContext,Texture } from '@codexo/exojs';
import { beforeEach, describe, expect, it,vi } from 'vitest';

import { loadTiledMap } from '../src/loadTiledMap';
import { TiledMap } from '../src/TiledMap';
import { TiledFormatError } from '../src/validate';

// ── Fixture loading ───────────────────────────────────────────────────────────

// Support both "pnpm test" (cwd=repo root) and "pnpm --filter ... test" (cwd=package).
const PKG_DIR = basename(process.cwd()) === 'exojs-tiled' ? process.cwd() : join(process.cwd(), 'packages', 'exojs-tiled');
const FIXTURES_DIR = join(PKG_DIR, 'test', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

// ── Mock context factory ───────────────────────────────────────────────────────

function makeContext(fixtures: Record<string, unknown>) {
  const loaderLoad = vi.fn(async (_token: unknown, _url: string): Promise<Texture> => new Texture());

  const context: AssetLoaderContext = {
    loader: { load: loaderLoad } as unknown as AssetLoaderContext['loader'],
    identityKey: 'test',
    fetchText: vi.fn(),
    fetchArrayBuffer: vi.fn(),
    fetchJson: vi.fn(async (source: string): Promise<unknown> => {
      if (Object.hasOwn(fixtures, source)) return fixtures[source];
      throw new Error(`loadTiledMap.test: no fixture registered for source "${source}"`);
    }),
  };

  return { context, loaderLoad };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('loadTiledMap — minimal map (no images)', () => {
  // minimal.tmj: embedded tileset with no "image" field
  const { context, loaderLoad } = makeContext({
    'minimal.tmj': loadFixture('minimal.tmj'),
  });

  it('returns a TiledMap instance', async () => {
    const map = await loadTiledMap('minimal.tmj', context);
    expect(map).toBeInstanceOf(TiledMap);
  });

  it('resolves the correct map dimensions', async () => {
    const map = await loadTiledMap('minimal.tmj', context);
    expect(map.width).toBe(4);
    expect(map.height).toBe(4);
    expect(map.tileWidth).toBe(16);
    expect(map.tileHeight).toBe(16);
  });

  it('does not call loader.load (no images to load)', async () => {
    await loadTiledMap('minimal.tmj', context);
    expect(loaderLoad).not.toHaveBeenCalled();
  });

  it('stores the source URL on the returned map', async () => {
    const map = await loadTiledMap('minimal.tmj', context);
    expect(map.source).toBe('minimal.tmj');
  });
});

describe('loadTiledMap — embedded tileset with atlas image', () => {
  // with-tileset-image.tmj: embedded tileset with image: "tiles.png"
  const { context, loaderLoad } = makeContext({
    'with-tileset-image.tmj': loadFixture('with-tileset-image.tmj'),
  });

  it('calls loader.load(Asset.kind(texture, imageUrl)) for the atlas image', async () => {
    await loadTiledMap('with-tileset-image.tmj', context);
    expect(loaderLoad).toHaveBeenCalledWith(Asset.kind('texture', 'tiles.png'));
  });

  it('stores the loaded texture on the tileset', async () => {
    const map = await loadTiledMap('with-tileset-image.tmj', context);
    expect(map.tilesets[0].texture).toBeInstanceOf(Texture);
  });

  it('stores the resolved imageUrl on the tileset', async () => {
    const map = await loadTiledMap('with-tileset-image.tmj', context);
    expect(map.tilesets[0].imageUrl).toBe('tiles.png');
  });
});

describe('loadTiledMap — external .tsj tileset', () => {
  // external-tileset.tmj references external-tileset.tsj, which has image: "external-tileset.png"
  const { context, loaderLoad } = makeContext({
    'external-tileset.tmj': loadFixture('external-tileset.tmj'),
    'external-tileset.tsj': loadFixture('external-tileset.tsj'),
  });

  it('fetches the .tsj file', async () => {
    await loadTiledMap('external-tileset.tmj', context);
    expect(context.fetchJson).toHaveBeenCalledWith('external-tileset.tsj');
  });

  it('loads the tileset image relative to the .tsj location', async () => {
    await loadTiledMap('external-tileset.tmj', context);
    // resolveTiledUrl('external-tileset.png', 'external-tileset.tsj') → 'external-tileset.png'
    expect(loaderLoad).toHaveBeenCalledWith(Asset.kind('texture', 'external-tileset.png'));
  });

  it('stores the tsj source URL on the tileset', async () => {
    const map = await loadTiledMap('external-tileset.tmj', context);
    expect(map.tilesets[0].source).toBe('external-tileset.tsj');
  });

  it('stores the loaded texture on the tileset', async () => {
    const map = await loadTiledMap('external-tileset.tmj', context);
    expect(map.tilesets[0].texture).toBeInstanceOf(Texture);
  });
});

describe('loadTiledMap — collection-of-images tileset', () => {
  // collection-tileset.tmj: embedded tileset with tiles[].image (no top-level image)
  const { context, loaderLoad } = makeContext({
    'collection-tileset.tmj': loadFixture('collection-tileset.tmj'),
  });

  beforeEach(() => { vi.clearAllMocks(); });

  it('calls loader.load for each per-tile image', async () => {
    await loadTiledMap('collection-tileset.tmj', context);
    expect(loaderLoad).toHaveBeenCalledWith(Asset.kind('texture', 'tile0.png'));
    expect(loaderLoad).toHaveBeenCalledWith(Asset.kind('texture', 'tile1.png'));
  });

  it('does NOT call loader.load for the atlas image — exactly 2 per-tile calls', async () => {
    await loadTiledMap('collection-tileset.tmj', context);
    expect(loaderLoad).toHaveBeenCalledTimes(2);
  });

  it('stores per-tile textures on the tileset keyed by local tile id', async () => {
    const map = await loadTiledMap('collection-tileset.tmj', context);
    const tileset = map.tilesets[0];
    expect(tileset.tileTextures.size).toBe(2);
    expect(tileset.tileTextures.get(0)).toBeInstanceOf(Texture);
    expect(tileset.tileTextures.get(1)).toBeInstanceOf(Texture);
  });

  it('does not set imageUrl on the tileset (no atlas)', async () => {
    const map = await loadTiledMap('collection-tileset.tmj', context);
    expect(map.tilesets[0].imageUrl).toBeUndefined();
  });
});

describe('loadTiledMap — image layer nested inside a group layer', () => {
  const { context, loaderLoad } = makeContext({
    'nested-image.tmj': {
      type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down',
      width: 1, height: 1, tilewidth: 16, tileheight: 16, infinite: false,
      layers: [{
        id: 1, name: 'Group', type: 'group', visible: true, x: 0, y: 0, opacity: 1,
        layers: [{ id: 2, name: 'Bg', type: 'imagelayer', visible: true, x: 0, y: 0, opacity: 1, image: 'bg.png' }],
      }],
      tilesets: [],
    },
  });

  it('loads the texture for an image layer nested inside a group layer', async () => {
    await loadTiledMap('nested-image.tmj', context);
    expect(loaderLoad).toHaveBeenCalledWith(Asset.kind('texture', 'bg.png'));
  });

  it('attaches the preloaded texture to the nested image layer via toTileMap()', async () => {
    const map = await loadTiledMap('nested-image.tmj', context);
    const runtime = map.toTileMap();
    expect(runtime.imageLayers[0]!.texture).toBeInstanceOf(Texture);
  });
});

describe('loadTiledMap — error propagation', () => {
  it('propagates TiledFormatError for invalid TMJ', async () => {
    const { context } = makeContext({
      'bad.tmj': { type: 'tileset' }, // wrong type
    });
    await expect(loadTiledMap('bad.tmj', context)).rejects.toThrow(TiledFormatError);
    await expect(loadTiledMap('bad.tmj', context)).rejects.toThrow(/expected "map"/);
  });

  it('propagates TiledFormatError when a GID is not covered by any tileset', async () => {
    // Minimal map with GIDs 1–2 but a tileset covering only GID 1
    const { context } = makeContext({
      'narrow.tmj': {
        type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down',
        width: 2, height: 1, tilewidth: 16, tileheight: 16, infinite: false,
        layers: [{ id: 1, name: 'Base', type: 'tilelayer', visible: true, x: 0, y: 0, width: 2, height: 1, opacity: 1, data: [1, 2] }],
        tilesets: [{ firstgid: 1, name: 'narrow', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1 }],
      },
    });
    await expect(loadTiledMap('narrow.tmj', context)).rejects.toThrow(TiledFormatError);
    await expect(loadTiledMap('narrow.tmj', context)).rejects.toThrow(/gid 2.*is not covered/);
  });
});
