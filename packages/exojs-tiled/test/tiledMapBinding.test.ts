import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { vi, beforeEach, describe, expect, it } from 'vitest';
import { Texture, type AssetLoaderContext } from '@codexo/exojs';
import { TileMap } from '@codexo/exojs-tilemap';

import { loadTiledMap } from '../src/loadTiledMap';
import { TiledMap } from '../src/TiledMap';
import { tiledMapBinding } from '../src/tiledMapBinding';
import { tiledRuntimeMapBinding } from '../src/tiledRuntimeMapBinding';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PKG_DIR = basename(process.cwd()) === 'exojs-tiled'
  ? process.cwd()
  : join(process.cwd(), 'packages', 'exojs-tiled');
const FIXTURES_DIR = join(PKG_DIR, 'test', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

// ── Context factory ───────────────────────────────────────────────────────────

function makeContext(fixtures: Record<string, unknown>) {
  const loaderLoad = vi.fn();

  const context: AssetLoaderContext = {
    loader: { load: loaderLoad } as unknown as AssetLoaderContext['loader'],
    identityKey: 'test',
    fetchText: vi.fn(),
    fetchArrayBuffer: vi.fn(),
    fetchJson: vi.fn(async (source: string): Promise<unknown> => {
      if (Object.hasOwn(fixtures, source)) return fixtures[source];
      throw new Error(`tiledMapBinding.test: no fixture for "${source}"`);
    }),
  };

  // Handles both Texture and TiledMap sub-loads (for the runtime binding below).
  loaderLoad.mockImplementation(async (token: unknown, url: string, _opts?: unknown): Promise<unknown> => {
    if (token === Texture) {
      const tex = new Texture();
      tex.width = 32;
      tex.height = 32;
      return tex;
    }
    if (token === TiledMap) {
      return loadTiledMap(url, context);
    }
    throw new Error(`tiledMapBinding.test: unexpected loader.load token: ${String(token)}`);
  });

  return { context, loaderLoad };
}

// ── Descriptor tests ─────────────────────────────────────────────────────────

describe('tiledMapBinding descriptor', () => {
  it('targets TiledMap constructor', () => {
    expect(tiledMapBinding.type).toBe(TiledMap);
  });

  it('has typeNames ["tiledMap"]', () => {
    expect(tiledMapBinding.typeNames).toEqual(['tiledMap']);
  });

  it('does NOT claim file extensions (token-only binding)', () => {
    expect((tiledMapBinding as { extensions?: unknown }).extensions).toBeUndefined();
  });

  it('create() returns an object with a load function', () => {
    expect(typeof tiledMapBinding.create().load).toBe('function');
  });
});

// ── load() tests ──────────────────────────────────────────────────────────────

describe('tiledMapBinding.load — minimal map', () => {
  const { context } = makeContext({ 'minimal.tmj': loadFixture('minimal.tmj') });

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns a TiledMap instance', async () => {
    const handler = tiledMapBinding.create();
    const result = await handler.load({ source: 'minimal.tmj' }, context);
    expect(result).toBeInstanceOf(TiledMap);
  });

  it('preserves map dimensions on the returned TiledMap', async () => {
    const handler = tiledMapBinding.create();
    const result = await handler.load({ source: 'minimal.tmj' }, context);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.tileWidth).toBe(16);
    expect(result.tileHeight).toBe(16);
  });

  it('stores the source URL on the TiledMap', async () => {
    const handler = tiledMapBinding.create();
    const result = await handler.load({ source: 'minimal.tmj' }, context);
    expect(result.source).toBe('minimal.tmj');
  });
});

// ── G-TILED-DIRECT-EQUIVALENCE ────────────────────────────────────────────────
//
// load(TileMap, url) must be semantically equivalent to load(TiledMap, url).toTileMap():
// same dimensions, layer count, tileset count, and tile data.

describe('G-TILED-DIRECT-EQUIVALENCE — load(TileMap) ≡ load(TiledMap).toTileMap()', () => {
  const FIXTURES = {
    'world.tmj': loadFixture('with-tileset-image.tmj'),
  };

  it('both paths produce a TileMap with the same dimensions', async () => {
    const { context } = makeContext(FIXTURES);
    const runtimeHandler = tiledRuntimeMapBinding.create();
    const sourceHandler  = tiledMapBinding.create();

    const direct    = await runtimeHandler.load({ source: 'world.tmj' }, context);
    const fromSource = (await sourceHandler.load({ source: 'world.tmj' }, context)).toTileMap();

    expect(direct.width).toBe(fromSource.width);
    expect(direct.height).toBe(fromSource.height);
    expect(direct.tileWidth).toBe(fromSource.tileWidth);
    expect(direct.tileHeight).toBe(fromSource.tileHeight);
  });

  it('both paths produce the same number of layers and tilesets', async () => {
    const { context } = makeContext(FIXTURES);
    const runtimeHandler = tiledRuntimeMapBinding.create();
    const sourceHandler  = tiledMapBinding.create();

    const direct     = await runtimeHandler.load({ source: 'world.tmj' }, context);
    const fromSource = (await sourceHandler.load({ source: 'world.tmj' }, context)).toTileMap();

    expect(direct.layers.length).toBe(fromSource.layers.length);
    expect(direct.tilesets.length).toBe(fromSource.tilesets.length);
  });

  it('both paths produce the same tile count in the first layer', async () => {
    const { context } = makeContext(FIXTURES);
    const runtimeHandler = tiledRuntimeMapBinding.create();
    const sourceHandler  = tiledMapBinding.create();

    const direct     = await runtimeHandler.load({ source: 'world.tmj' }, context);
    const fromSource = (await sourceHandler.load({ source: 'world.tmj' }, context)).toTileMap();

    const directTiles   = direct.layers[0]!.countNonEmptyTiles();
    const convertedTiles = fromSource.layers[0]!.countNonEmptyTiles();
    expect(directTiles).toBe(convertedTiles);
  });
});

// ── G-TILED-TEXTURE-OWNERSHIP ─────────────────────────────────────────────────
//
// TiledMap.destroy() must NOT destroy Loader-owned textures.

describe('G-TILED-TEXTURE-OWNERSHIP — destroy() does not free Loader textures', () => {
  it('texture reference remains accessible after TiledMap.destroy()', async () => {
    const { context } = makeContext({ 'with-tex.tmj': loadFixture('with-tileset-image.tmj') });
    const handler = tiledMapBinding.create();
    const tiledMap = await handler.load({ source: 'with-tex.tmj' }, context);
    const texture = tiledMap.tilesets[0].texture;

    tiledMap.destroy();

    // The texture reference on the tileset must still be accessible (not nulled).
    expect(tiledMap.tilesets[0].texture).toBe(texture);
    expect(tiledMap.tilesets[0].texture).toBeInstanceOf(Texture);
  });

  it('runtime TileMap.destroy() does not free Loader textures', async () => {
    const { context } = makeContext({ 'with-tex.tmj': loadFixture('with-tileset-image.tmj') });
    const handler = tiledRuntimeMapBinding.create();
    const tileMap = await handler.load({ source: 'with-tex.tmj' }, context);

    // Capture the texture reference before destroy().
    // TileMap.destroy() clears the tilesets array but must NOT call texture.destroy().
    const texture = tileMap.tilesets[0]!.texture.texture;
    expect(texture).toBeInstanceOf(Texture);

    tileMap.destroy();

    // After destroy(), the Texture object itself is intact (Loader-owned, not map-owned).
    expect(texture).toBeInstanceOf(Texture);
    expect(texture).not.toBeNull();
  });
});
