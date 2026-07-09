import '#resources/seamless';

import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

// Mirrors test/resources/catalog-adopt.test.ts's texture harness (createImageBitmap
// stub + fetch mock) combined with test/core/scene-loader.test.ts's fake-Application
// pattern (a real Loader wrapped in `{ loader } as unknown as Application`).
const originalFetch = global.fetch;

function mockFetchImage(): void {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  );
}

function makeSceneWithTextureLoader(): { scene: Scene; loader: Loader } {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  const app = { loader } as unknown as Application;
  const scene = new Scene();
  scene.app = app;

  return { scene, loader };
}

describe('SceneLoader catalog adopt', () => {
  beforeEach(() => {
    mockFetchImage();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('claims catalog leaves under the scene scope and releases on destroy', async () => {
    const { scene, loader } = makeSceneWithTextureLoader();
    const assets = new Assets({ ship: { type: 'texture', source: 'ship.png' } });

    scene.loader.load(assets);
    await assets.ship.loaded;
    expect(assets.ship.loadState).toBe('ready');

    const key = loader['_key'](Texture, 'ship.png');
    expect(loader['_claims'].get(key)?.scopes.size).toBe(1);

    scene.destroy();
    // last claim gone → evicted (payload dropped, identity kept, back to 'loading')
    expect(assets.ship.loadState).toBe('loading');
  });

  test('get(catalog) through this.loader adopts every leaf under the scene scope', async () => {
    const { scene, loader } = makeSceneWithTextureLoader();
    const assets = new Assets({ ship: { type: 'texture', source: 'ship.png' } });

    const got = scene.loader.get(assets);
    expect(got.ship).toBe(assets.ship);

    await assets.ship.loaded;
    expect(assets.ship.loadState).toBe('ready');
    expect(assets.ship).toBeInstanceOf(Texture);

    const key = loader['_key'](Texture, 'ship.png');
    expect(loader['_claims'].get(key)?.scopes.size).toBe(1);

    scene.destroy();
    expect(assets.ship.loadState).toBe('loading');
  });
});
