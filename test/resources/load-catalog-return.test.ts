import '#resources/coreAssetBindings';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

function mockFetch(json: unknown): void {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => json,
        text: async () => JSON.stringify(json),
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  ) as typeof fetch;
}

describe('load(catalog) return value', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  it('returns a resolved value map — value leaves unwrapped to their value, resource leaves as the resource', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
    mockFetch({ hp: 3 });
    const loader = createCoreLoader();

    const assets = Assets.from({
      ship: { kind: 'texture', source: 'ship.png' },
      config: { kind: 'json', source: 'cfg.json' },
    });

    const loaded = await loader.load(assets);

    // value leaf unwrapped to its decoded value (NOT an AssetRef)
    expect(loaded.config).toEqual({ hp: 3 });
    // resource leaf resolved to the resource itself
    expect(loaded.ship).toBeInstanceOf(Texture);

    // the catalog property still exposes the ref form for value leaves
    expect(assets.config.value).toEqual({ hp: 3 });
  });
});
