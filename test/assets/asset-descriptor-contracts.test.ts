import { AssetRef } from '#assets/AssetRef';
import { Assets } from '#assets/Assets';
import { AssetType } from '#assets/AssetType';
import { builtinTypeForPath, coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { fontType } from '#assets/types/font';
import { textureType } from '#assets/types/image';
import { musicType } from '#assets/types/media';
import { materializeAssetTypes } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';

const createCoreLoader = (): Loader => {
  const loader = new Loader({ basePath: '/' });
  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

class CustomType extends AssetType<unknown, { hp: number }, { mode?: string }> {
  public readonly id = 'com.example.custom';

  public createFactory() {
    return { create: async () => ({ hp: 1 }) };
  }
}

const originalFetch = global.fetch;

const mockFetch = (): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: async () => '{"hp":3}',
        json: async () => ({ hp: 3 }),
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  );

  global.fetch = fetchMock as unknown as typeof fetch;

  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  global.fetch = originalFetch;
});

describe('descriptor type references', () => {
  test('an id, the produced class and the type instance name the same installed type', () => {
    const loader = createCoreLoader();
    const custom = new CustomType();

    loader._installAssetTypes([custom]);

    const byInstance = loader.identify({ type: custom, source: 'a.dat', mode: 'fast' });
    const byId = loader.identify({ type: 'com.example.custom', source: 'a.dat', mode: 'fast' });
    const textureById = loader.identify({ type: 'texture', source: 'hero.png' });
    const textureByClass = loader.identify({ type: Texture, source: 'hero.png' });
    const textureByType = loader.identify({ type: textureType, source: 'hero.png' });

    expect(byInstance).toEqual(byId);
    expect(textureByClass).toEqual(textureById);
    expect(textureByType).toEqual(textureById);
  });
});

describe('required options', () => {
  test('a font descriptor without a family rejects its load', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const untyped = { type: fontType, source: 'Inter.woff2' } as never;

    await expect(loader.load(untyped)).rejects.toThrow(/requires a "family" option/);
  });

  test('an untyped bare font path keeps its file-name family default', () => {
    const loader = createCoreLoader();
    const canonicalize = vi.spyOn(loader as unknown as { _canonicalize: (...args: unknown[]) => unknown }, '_canonicalize');

    mockFetch();
    vi.stubGlobal(
      'FontFace',
      vi.fn(function (this: { load: () => Promise<unknown> }) {
        this.load = async () => this;
      }),
    );

    const queue = (loader.load as (path: string) => PromiseLike<unknown>)('fonts/Inter.woff2');
    void Promise.resolve(queue).catch(() => {});

    expect(canonicalize).toHaveBeenCalledWith(expect.anything(), 'fonts/Inter.woff2', { family: 'Inter' });
  });
});

describe('catalog leaf policy', () => {
  test('a custom object payload of the default leaf policy is held as an AssetRef', () => {
    const catalog = Assets.from({ metadata: { type: new CustomType(), source: 'game.meta' } });

    expect(catalog.metadata).toBeInstanceOf(AssetRef);
    expect((catalog.metadata as unknown as { hp?: number }).hp).toBeUndefined();
  });

  test.each([
    ['music', () => ({ type: 'music', source: 'audio/theme.ogg' }) as const],
    ['music (type instance)', () => ({ type: musicType, source: 'audio/theme.ogg' })],
    ['video', () => ({ type: 'video', source: 'video/intro.mp4' }) as const],
    ['font', () => ({ type: 'font', source: 'fonts/ui.woff2', family: 'UI' }) as const],
    ['bmFont', () => ({ type: 'bmFont', source: 'fonts/ui.fnt' }) as const],
    ['svg', () => ({ type: 'svg', source: 'icon.svg' }) as const],
    ['image', () => ({ type: 'image', source: 'a.png' }) as const],
  ])('a leafless %s descriptor keeps its precise runtime error in a catalog', (_name, make) => {
    const fromUntyped = Assets.from as unknown as (definition: object) => unknown;

    expect(() => fromUntyped({ entry: make() })).toThrow(/has no catalog leaf/);
  });
});

describe('decoded image', () => {
  test('the image type resolves to the createImageBitmap result where it exists', async () => {
    mockFetch();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4, close() {}, kind: 'ImageBitmap' })),
    );
    const loader = createCoreLoader();

    const image = await loader.load({ type: 'image', source: 'a.png' });

    expect(image).not.toBeInstanceOf(HTMLImageElement);
    expect((image as unknown as { kind: string }).kind).toBe('ImageBitmap');
  });
});

describe('fragment before query', () => {
  test.each([
    ['data.json#preview.png?ignored', 'json'],
    ['hero.png?v=2#frame.json', 'texture'],
    ['level.json?v=3', 'json'],
    ['blob:https://example.com/uuid', undefined],
  ])('%s resolves to %s', (path, expected) => {
    expect(builtinTypeForPath(path)).toBe(expected);
  });
});
