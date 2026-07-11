import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { Asset } from '#resources/Asset';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

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

describe('Loader.load record fallback (A1)', () => {
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

  test('bare-string record values load without a cryptic "asset type undefined" throw', async () => {
    const loader = createCoreLoader();

    const result = await loader.load({ a: 'a.png', b: 'b.png' } as never);

    expect((result as { a: Texture }).a).toBeInstanceOf(Texture);
    expect((result as { b: Texture }).b).toBeInstanceOf(Texture);
  });

  test('full-config record values still load', async () => {
    const loader = createCoreLoader();

    const result = await loader.load({
      a: { kind: 'texture', source: 'a.png' },
      b: { kind: 'texture', source: 'b.png', mimeType: 'image/png' },
    } as never);

    expect((result as { a: Texture }).a).toBeInstanceOf(Texture);
    expect((result as { b: Texture }).b).toBeInstanceOf(Texture);
  });

  test('mixed bare-string and Asset.kind descriptor values load', async () => {
    const loader = createCoreLoader();

    const result = await loader.load({
      a: 'a.png',
      b: Asset.kind('texture', 'b.png'),
    } as never);

    expect((result as { a: Texture }).a).toBeInstanceOf(Texture);
    expect((result as { b: Texture }).b).toBeInstanceOf(Texture);
  });
});
