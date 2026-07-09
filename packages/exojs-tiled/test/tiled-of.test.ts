import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { type Asset, Loader } from '@codexo/exojs';
import { TileMap } from '@codexo/exojs-tilemap';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { materializeAssetBindings } from '../../../src/extensions/materialize';
import { TiledMap } from '../src/TiledMap';
import { tiledMapBinding } from '../src/tiledMapBinding';
import { tiledRuntimeMapBinding } from '../src/tiledRuntimeMapBinding';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PKG_DIR = basename(process.cwd()) === 'exojs-tiled' ? process.cwd() : join(process.cwd(), 'packages', 'exojs-tiled');
const FIXTURES_DIR = join(PKG_DIR, 'test', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

// ── Descriptor statics ──────────────────────────────────────────────────────

describe('Tiled .of annotation statics', () => {
  it('TiledMap.of carries the tiledMap kind + source', () => {
    const a = TiledMap.of('world.tmj');
    expect(a.kind).toBe('tiledMap');
    expect(a.source).toBe('world.tmj');
    expectTypeOf(a).toEqualTypeOf<Asset<TiledMap>>();
  });

  it('TileMap.of carries the tileMap kind + source', () => {
    const a = TileMap.of('world.tmj');
    expect(a.kind).toBe('tileMap');
    expect(a.source).toBe('world.tmj');
    expectTypeOf(a).toEqualTypeOf<Asset<TileMap>>();
  });
});

// ── End-to-end: loader.load(X.of(...)) routes through the tiled bindings ──────

describe('loader.load(X.of(...)) loads through the tiled bindings', () => {
  const originalFetch = global.fetch;

  // `minimal.tmj` has an embedded tileset with no image, so no Texture sub-load
  // is needed — the load resolves through fetchJson alone.
  function makeLoader(): Loader {
    const payload = loadFixture('minimal.tmj');
    global.fetch = vi.fn(
      async (): Promise<Response> =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => payload,
          text: async () => JSON.stringify(payload),
        }) as unknown as Response,
    );
    const loader = new Loader();
    materializeAssetBindings(loader, [tiledMapBinding, tiledRuntimeMapBinding]);
    return loader;
  }

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('loads a runtime TileMap from TileMap.of(...)', async () => {
    const loader = makeLoader();
    const map = await loader.load(TileMap.of('minimal.tmj'));
    expect(map).toBeInstanceOf(TileMap);
    expect(map.width).toBe(4);
    expect(map.height).toBe(4);
  });

  it('loads the parsed-source TiledMap from TiledMap.of(...)', async () => {
    const loader = makeLoader();
    const map = await loader.load(TiledMap.of('minimal.tmj'));
    expect(map).toBeInstanceOf(TiledMap);
    expect(map.source).toBe('minimal.tmj');
  });
});
