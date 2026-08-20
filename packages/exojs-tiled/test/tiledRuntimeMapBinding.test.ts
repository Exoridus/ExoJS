import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { Asset } from '@codexo/exojs';
import { type AssetLoaderContext, type Loader,Texture } from '@codexo/exojs';
import { TileMap } from '@codexo/exojs-tilemap';
import { beforeEach, describe, expect, it,vi } from 'vitest';

import { loadTiledMap } from '../src/loadTiledMap';
import { tiledRuntimeMapBinding } from '../src/tiledRuntimeMapBinding';

function fakeLoader(): Loader {
  return { load: vi.fn() } as unknown as Loader;
}

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
// The runtime binding's handler calls ctx.loader.load(Asset.type('tiledSource', source, opts))
// as a sub-load to share the Loader cache with the source binding. The mock
// below handles both Texture and TiledMap sub-loads, both arriving as `Asset.type(...)`
// asset descriptors (single-argument form).

function makeContext(fixtures: Record<string, unknown>) {
  const loaderLoad = vi.fn();

  const fetchJson = vi.fn(async (source: string): Promise<unknown> => {
      if (Object.hasOwn(fixtures, source)) return fixtures[source];
      throw new Error(`tiledRuntimeMapBinding.test: no fixture for "${source}"`);
    });

  const context: AssetLoaderContext = {
    loader: { load: loaderLoad } as unknown as AssetLoaderContext['loader'],
    scope: { load: loaderLoad } as unknown as AssetLoaderContext['scope'],
    identityKey: 'test',
    resolveUrl: (source: string) => source,
    fetchText: vi.fn(),
    fetchArrayBuffer: vi.fn(),
    fetchJson: fetchJson as AssetLoaderContext['fetchJson'],
  };

  // Configure loaderLoad after context is defined so the closure captures it.
  loaderLoad.mockImplementation(async (token: unknown): Promise<unknown> => {
    // Both Texture and TiledMap sub-loads now arrive as `Asset.type(kind, src)` descriptors
    // (asset form) rather than a `(constructor, url, opts)` token call.
    const asset = token as { type?: unknown; source?: unknown } | null;
    if (asset?.type === 'texture') {
      const tex = new Texture();
      tex.width = 32;
      tex.height = 32;
      return tex;
    }
    if (asset?.type === 'tiledSource') {
      return loadTiledMap(asset.source as string, context);
    }
    throw new Error(`tiledRuntimeMapBinding.test: unexpected loader.load token: ${String(token)}`);
  });

  return { context, loaderLoad };
}

// ── Descriptor tests ─────────────────────────────────────────────────────────

describe('tiledRuntimeMapBinding descriptor', () => {
  it('targets TileMap constructor', () => {
    expect(tiledRuntimeMapBinding.ctor).toBe(TileMap);
  });

  it('has typeNames ["tileMap"]', () => {
    expect(tiledRuntimeMapBinding.typeNames).toEqual(['tileMap']);
  });

  it('claims the .tmj file extension', () => {
    expect((tiledRuntimeMapBinding as { extensions?: readonly string[] }).extensions).toEqual(['tmj']);
  });

  it('create() returns an object with a load function', () => {
    expect(typeof tiledRuntimeMapBinding.create(fakeLoader()).load).toBe('function');
  });

  it('create() returns an object with a getIdentityDiscriminator function', () => {
    expect(typeof tiledRuntimeMapBinding.create(fakeLoader()).getIdentityDiscriminator).toBe('function');
  });
});

// ── getIdentityDiscriminator tests ───────────────────────────────────────────

describe('tiledRuntimeMapBinding.getIdentityDiscriminator', () => {
  const handler = tiledRuntimeMapBinding.create(fakeLoader());

  it('contributes the resolved format and nothing else', () => {
    expect(handler.getIdentityDiscriminator!({ source: 'world.tmj' })).toBe('tiled');
  });

  it('uses an explicit format when provided', () => {
    expect(handler.getIdentityDiscriminator!({ source: 'world.tmj', options: { format: 'tiled' } })).toBe('tiled');
  });

  it('does not vary by source — the loader already keys by locator', () => {
    expect(handler.getIdentityDiscriminator!({ source: 'a.tmj' })).toBe(handler.getIdentityDiscriminator!({ source: 'b.tmj' }));
  });
});

// ── Integration tests - minimal map ─────────────────────────────────────────
//
// `minimal.tmj` declares a tileset without an image, which `toTileMap()`
// rejects - these runtime-binding tests convert, so they use the atlas fixture.

describe('tiledRuntimeMapBinding.load — minimal map', () => {
  const { context } = makeContext({ 'minimal.tmj': loadFixture('with-tileset-image.tmj') });

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns a TileMap instance', async () => {
    const handler = tiledRuntimeMapBinding.create(context.loader);
    const result = await handler.load({ source: 'minimal.tmj' }, context);
    expect(result).toBeInstanceOf(TileMap);
  });

  it('preserves map dimensions', async () => {
    const handler = tiledRuntimeMapBinding.create(context.loader);
    const result = await handler.load({ source: 'minimal.tmj' }, context);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.tileWidth).toBe(16);
    expect(result.tileHeight).toBe(16);
  });

  it('delegates to ctx.loader.load(Asset.type(tiledSource, source)) internally', async () => {
    const handler = tiledRuntimeMapBinding.create(context.loader);
    await handler.load({ source: 'minimal.tmj' }, context);
    expect(context.loader.load).toHaveBeenCalledWith(Asset.type('tiledSource', 'minimal.tmj'));
  });

  it('rejects a map whose tileset carries no image', async () => {
    const { context: bare } = makeContext({ 'no-image.tmj': loadFixture('minimal.tmj') });
    const handler = tiledRuntimeMapBinding.create(bare.loader);
    await expect(handler.load({ source: 'no-image.tmj' }, bare)).rejects.toThrow(/has no image/);
  });
});

// ── Integration tests - tileset image ───────────────────────────────────────

describe('tiledRuntimeMapBinding.load — with atlas tileset image', () => {
  const { context, loaderLoad } = makeContext({ 'with-tileset-image.tmj': loadFixture('with-tileset-image.tmj') });

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns a TileMap instance', async () => {
    const handler = tiledRuntimeMapBinding.create(context.loader);
    const result = await handler.load({ source: 'with-tileset-image.tmj' }, context);
    expect(result).toBeInstanceOf(TileMap);
  });

  it('the runtime TileMap has a TileSet with the loaded texture', async () => {
    const handler = tiledRuntimeMapBinding.create(context.loader);
    const result = await handler.load({ source: 'with-tileset-image.tmj' }, context);
    expect(result.tilesets).toHaveLength(1);
    // Texture is loaded transitively via the TiledMap sub-load
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'tiles.png'));
  });
});

// ── Integration tests - external tileset ────────────────────────────────────

describe('tiledRuntimeMapBinding.load — external tileset (.tsj)', () => {
  const fixtures = {
    'external-tileset.tmj': loadFixture('external-tileset.tmj'),
    'external-tileset.tsj': loadFixture('external-tileset.tsj'),
  };
  const { context, loaderLoad } = makeContext(fixtures);

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns a TileMap instance', async () => {
    const handler = tiledRuntimeMapBinding.create(context.loader);
    const result = await handler.load({ source: 'external-tileset.tmj' }, context);
    expect(result).toBeInstanceOf(TileMap);
  });

  it('loads the external tileset texture', async () => {
    const handler = tiledRuntimeMapBinding.create(context.loader);
    await handler.load({ source: 'external-tileset.tmj' }, context);
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'external-tileset.png'));
  });
});

// ── Options passthrough ──────────────────────────────────────────────────────

describe('tiledRuntimeMapBinding.load — options passthrough', () => {
  const { context, loaderLoad } = makeContext({ 'world.tmj': loadFixture('with-tileset-image.tmj') });

  beforeEach(() => { vi.clearAllMocks(); });

  it('passes options to the TiledMap sub-load', async () => {
    const handler = tiledRuntimeMapBinding.create(context.loader);
    const opts = { format: 'tiled' as const };
    await handler.load({ source: 'world.tmj', options: opts }, context);
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('tiledSource', 'world.tmj', opts));
  });
});
