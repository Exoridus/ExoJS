import '#resources/seamless';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { AssetRef } from '#resources/AssetRef';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';
import { Json } from '#resources/tokens';

/** Loader with all core asset bindings (mirrors createCoreLoader in the sibling loader tests). */
function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

/** One fetch mock serving both a decodable image payload and a JSON payload. */
const mockFetchMixed = (jsonPayload: unknown): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => jsonPayload,
        text: async () => JSON.stringify(jsonPayload),
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  );
};

// End-to-end acceptance gate for the S2 asset-access surface: bare-string
// inference + X.of() descriptors in Assets.from, loader-free usable leaves, the
// status channel, heal-in-place on adopt+load, and bare-path get() for a value
// kind — all together on one loader.
describe('S2 asset-access surface (integration)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('Assets.from mixes a bare path + a bare value path + an X.of() descriptor, all usable loader-free', () => {
    const assets = Assets.from({
      ship: 'sprites/ship.png', // bare → Texture (resource leaf)
      config: 'data/config.json', // bare → AssetRef (value leaf)
      level: Json.of<{ hp: number }>('levels/1.json'), // .of → AssetRef
    });

    // Constructed in a field-initializer position — NO loader involved yet.
    expect(assets.ship).toBeInstanceOf(Texture);
    expect(assets.config).toBeInstanceOf(AssetRef);
    expect(assets.level).toBeInstanceOf(AssetRef);

    // Status channel present on every leaf, all pending.
    expect(assets.ship.state).toBe('loading');
    expect(assets.ship.ready).toBe(false);
    expect(assets.ship.error).toBeNull();
    expect(assets.level.state).toBe('loading');
    expect(assets.level.ready).toBe(false);
  });

  test('loader.load(catalog) heals resource + value leaves in place and flips the status channel', async () => {
    mockFetchMixed({ hp: 7 });
    const loader = createCoreLoader();

    const assets = Assets.from({
      ship: 'sprites/ship.png',
      level: Json.of<{ hp: number }>('levels/1.json'),
    });
    const ship = assets.ship; // capture identity to prove in-place heal

    loader.load(assets);

    await assets.ship.loaded;
    await assets.level.loaded;

    // Same object, now ready — healed in place, not replaced.
    expect(assets.ship).toBe(ship);
    expect(assets.ship.state).toBe('ready');
    expect(assets.ship.ready).toBe(true);
    expect(assets.ship.error).toBeNull();

    expect(assets.level.ready).toBe(true);
    expect(assets.level.value).toEqual({ hp: 7 });
  });

  test('bare-path get() returns a stable AssetRef for a value kind', () => {
    mockFetchMixed({});
    const loader = createCoreLoader();

    expect(loader.get('data/config.json')).toBeInstanceOf(AssetRef);
  });
});
