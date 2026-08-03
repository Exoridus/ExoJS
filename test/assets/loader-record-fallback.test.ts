import { Asset } from '#assets/Asset';
import { coreAssetBindings } from '#assets/coreAssetBindings';
import { Loader } from '#assets/Loader';
import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';

/** Loader with all core asset bindings (mirrors createCoreLoader in loader-seamless.test.ts). */
function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

const mockFetchImage = (): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  );
};

describe('Loader.load internal record fallback (A1)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 16, height: 16 })),
    );
    mockFetchImage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('bare-string record values normalize without an undefined-type failure', async () => {
    const loader = createCoreLoader();

    const result = await loader.load({ a: 'a.png', b: 'b.png' } as never);

    expect((result as { a: Texture }).a).toBeInstanceOf(Texture);
    expect((result as { b: Texture }).b).toBeInstanceOf(Texture);
  });

  test('full-config record values still normalize', async () => {
    const loader = createCoreLoader();

    const result = await loader.load({
      a: { type: 'texture', source: 'a.png' },
      b: { type: 'texture', source: 'b.png', mimeType: 'image/png' },
    } as never);

    expect((result as { a: Texture }).a).toBeInstanceOf(Texture);
    expect((result as { b: Texture }).b).toBeInstanceOf(Texture);
  });

  test('mixed bare-string and Asset.type descriptor values normalize', async () => {
    const loader = createCoreLoader();

    const result = await loader.load({
      a: 'a.png',
      b: Asset.type('texture', 'b.png'),
    } as never);

    expect((result as { a: Texture }).a).toBeInstanceOf(Texture);
    expect((result as { b: Texture }).b).toBeInstanceOf(Texture);
  });
});
