import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { type AssetLoaderContext,Texture } from '@codexo/exojs';
import { TileMap } from '@codexo/exojs-tilemap';
import { beforeEach, describe, expect, it,vi } from 'vitest';

import { loadTiledMap } from '../src/loadTiledMap';
import { TiledMap } from '../src/TiledMap';
import { tiledRuntimeMapBinding } from '../src/tiledRuntimeMapBinding';

// ── Fixture loading ──────────────────────────────────────────────────────────

const PKG_DIR = basename(process.cwd()) === 'exojs-tiled'
  ? process.cwd()
  : join(process.cwd(), 'packages', 'exojs-tiled');
const FIXTURES_DIR = join(PKG_DIR, 'test', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

// ── Mock context factory ─────────────────────────────────────────────────────
//
// The runtime binding's handler calls ctx.loader.load(TiledMap.of(source, opts))
// as a sub-load to share the Loader cache with the source binding. The mock
// below handles both Texture and TiledMap sub-loads, both arriving as `.of(...)`
// asset descriptors (single-argument form).

function makeContext(fixtures: Record<string, unknown>) {
  const loaderLoad = vi.fn();

  const context: AssetLoaderContext = {
    loader: { load: loaderLoad } as unknown as AssetLoaderContext['loader'],
    identityKey: 'test',
    fetchText: vi.fn(),
    fetchArrayBuffer: vi.fn(),
    fetchJson: vi.fn(async (source: string): Promise<unknown> => {
      if (Object.hasOwn(fixtures, source)) return fixtures[source];
      throw new Error(`tiledRuntimeMapBinding.test: no fixture for "${source}"`);
    }),
  };

  // Configure loaderLoad after context is defined so the closure captures it.
  loaderLoad.mockImplementation(async (token: unknown): Promise<unknown> => {
    // Both Texture and TiledMap sub-loads now arrive as `X.of(src)` descriptors
    // (asset form) rather than a `(constructor, url, opts)` token call.
    const asset = token as { type?: unknown; source?: unknown } | null;
    if (asset?.type === 'texture') {
      const tex = new Texture();
      tex.width = 32;
      tex.height = 32;
      return tex;
    }
    if (asset?.type === 'tiledMap') {
      return loadTiledMap(asset.source as string, context);
    }
    throw new Error(`tiledRuntimeMapBinding.test: unexpected loader.load token: ${String(token)}`);
  });

  return { context, loaderLoad };
}

// ── Descriptor tests ─────────────────────────────────────────────────────────

describe('tiledRuntimeMapBinding descriptor', () => {
  it('targets TileMap constructor', () => {
    expect(tiledRuntimeMapBinding.type).toBe(TileMap);
  });

  it('has typeNames ["tileMap"]', () => {
    expect(tiledRuntimeMapBinding.typeNames).toEqual(['tileMap']);
  });

  it('claims the .tmj file extension', () => {
    expect((tiledRuntimeMapBinding as { extensions?: string[] }).extensions).toEqual(['tmj']);
  });

  it('create() returns an object with a load function', () => {
    expect(typeof tiledRuntimeMapBinding.create().load).toBe('function');
  });

  it('create() returns an object with a getIdentityKey function', () => {
    expect(typeof tiledRuntimeMapBinding.create().getIdentityKey).toBe('function');
  });
});

// ── getIdentityKey tests ─────────────────────────────────────────────────────

describe('tiledRuntimeMapBinding.getIdentityKey', () => {
  const handler = tiledRuntimeMapBinding.create();

  it('includes source and format in the key', () => {
    const key = handler.getIdentityKey!({ source: 'world.tmj' });
    expect(key).toBe('world.tmj|tiled');
  });

  it('uses explicit format when provided', () => {
    const key = handler.getIdentityKey!({ source: 'world.tmj', options: { format: 'tiled' } });
    expect(key).toBe('world.tmj|tiled');
  });

  it('different sources produce different keys', () => {
    const key1 = handler.getIdentityKey!({ source: 'a.tmj' });
    const key2 = handler.getIdentityKey!({ source: 'b.tmj' });
    expect(key1).not.toBe(key2);
  });
});

// ── Integration tests — minimal map ─────────────────────────────────────────

describe('tiledRuntimeMapBinding.load — minimal map', () => {
  const { context } = makeContext({ 'minimal.tmj': loadFixture('minimal.tmj') });

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns a TileMap instance', async () => {
    const handler = tiledRuntimeMapBinding.create();
    const result = await handler.load({ source: 'minimal.tmj' }, context);
    expect(result).toBeInstanceOf(TileMap);
  });

  it('preserves map dimensions', async () => {
    const handler = tiledRuntimeMapBinding.create();
    const result = await handler.load({ source: 'minimal.tmj' }, context);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.tileWidth).toBe(16);
    expect(result.tileHeight).toBe(16);
  });

  it('delegates to ctx.loader.load(TiledMap.of(source)) internally', async () => {
    const handler = tiledRuntimeMapBinding.create();
    await handler.load({ source: 'minimal.tmj' }, context);
    expect(context.loader.load).toHaveBeenCalledWith(TiledMap.of('minimal.tmj'));
  });
});

// ── Integration tests — tileset image ───────────────────────────────────────

describe('tiledRuntimeMapBinding.load — with atlas tileset image', () => {
  const { context, loaderLoad } = makeContext({ 'with-tileset-image.tmj': loadFixture('with-tileset-image.tmj') });

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns a TileMap instance', async () => {
    const handler = tiledRuntimeMapBinding.create();
    const result = await handler.load({ source: 'with-tileset-image.tmj' }, context);
    expect(result).toBeInstanceOf(TileMap);
  });

  it('the runtime TileMap has a TileSet with the loaded texture', async () => {
    const handler = tiledRuntimeMapBinding.create();
    const result = await handler.load({ source: 'with-tileset-image.tmj' }, context);
    expect(result.tilesets).toHaveLength(1);
    // Texture is loaded transitively via the TiledMap sub-load
    expect(loaderLoad).toHaveBeenCalledWith(Texture.of('tiles.png'));
  });
});

// ── Integration tests — external tileset ────────────────────────────────────

describe('tiledRuntimeMapBinding.load — external tileset (.tsj)', () => {
  const fixtures = {
    'external-tileset.tmj': loadFixture('external-tileset.tmj'),
    'external-tileset.tsj': loadFixture('external-tileset.tsj'),
  };
  const { context, loaderLoad } = makeContext(fixtures);

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns a TileMap instance', async () => {
    const handler = tiledRuntimeMapBinding.create();
    const result = await handler.load({ source: 'external-tileset.tmj' }, context);
    expect(result).toBeInstanceOf(TileMap);
  });

  it('loads the external tileset texture', async () => {
    const handler = tiledRuntimeMapBinding.create();
    await handler.load({ source: 'external-tileset.tmj' }, context);
    expect(loaderLoad).toHaveBeenCalledWith(Texture.of('external-tileset.png'));
  });
});

// ── Options passthrough ──────────────────────────────────────────────────────

describe('tiledRuntimeMapBinding.load — options passthrough', () => {
  const { context, loaderLoad } = makeContext({ 'world.tmj': loadFixture('minimal.tmj') });

  beforeEach(() => { vi.clearAllMocks(); });

  it('passes options to the TiledMap sub-load', async () => {
    const handler = tiledRuntimeMapBinding.create();
    const opts = { format: 'tiled' as const };
    await handler.load({ source: 'world.tmj', options: opts }, context);
    expect(loaderLoad).toHaveBeenCalledWith(TiledMap.of('world.tmj', opts));
  });
});
