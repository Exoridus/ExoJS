import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { vi, beforeEach, describe, expect, it } from 'vitest';
import { Texture, type AssetLoaderContext } from '@codexo/exojs';
import { TileMap } from '@codexo/exojs-tilemap';

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

function makeContext(fixtures: Record<string, unknown>) {
  const loaderLoad = vi.fn(async (_token: unknown, _url: string): Promise<Texture> => {
    const tex = new Texture();
    // Provide realistic pixel dimensions so TextureRegion validates correctly.
    tex.width = 32;
    tex.height = 32;
    return tex;
  });

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
});

// ── Integration tests ─────────────────────────────────────────────────────────

describe('tiledRuntimeMapBinding.load — minimal map', () => {
  const { context } = makeContext({ 'minimal.tmj': loadFixture('minimal.tmj') });

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns a TileMap instance', async () => {
    const handler = tiledRuntimeMapBinding.create();
    const result = await handler.load({ source: 'minimal.tmj' } as Parameters<typeof handler.load>[0], context);
    expect(result).toBeInstanceOf(TileMap);
  });

  it('preserves map dimensions', async () => {
    const handler = tiledRuntimeMapBinding.create();
    const result = await handler.load({ source: 'minimal.tmj' } as Parameters<typeof handler.load>[0], context);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.tileWidth).toBe(16);
    expect(result.tileHeight).toBe(16);
  });
});

describe('tiledRuntimeMapBinding.load — with atlas tileset image', () => {
  const { context, loaderLoad } = makeContext({ 'with-tileset-image.tmj': loadFixture('with-tileset-image.tmj') });

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns a TileMap instance', async () => {
    const handler = tiledRuntimeMapBinding.create();
    const result = await handler.load({ source: 'with-tileset-image.tmj' } as Parameters<typeof handler.load>[0], context);
    expect(result).toBeInstanceOf(TileMap);
  });

  it('the runtime TileMap has a TileSet with the loaded texture', async () => {
    const handler = tiledRuntimeMapBinding.create();
    const result = await handler.load({ source: 'with-tileset-image.tmj' } as Parameters<typeof handler.load>[0], context);
    expect(result.tilesets).toHaveLength(1);
    expect(loaderLoad).toHaveBeenCalledWith(Texture, 'tiles.png');
  });
});
