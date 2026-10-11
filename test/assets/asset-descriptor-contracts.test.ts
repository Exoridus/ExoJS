import { Asset } from '#assets/Asset';
import { AssetRef } from '#assets/AssetRef';
import { Assets } from '#assets/Assets';
import { AssetType } from '#assets/AssetType';
import { builtinTypeForPath, coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { fontType } from '#assets/types/font';
import { musicType } from '#assets/types/media';
import { materializeAssetTypes } from '#extensions/materialize';

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

describe('reserved request keys', () => {
  test('a type instance rejects an option bag that names the request', () => {
    const custom = new CustomType();
    const untyped = custom.asset.bind(custom) as (source: string, options?: object) => unknown;

    expect(() => untyped('original.dat', { type: 'replaced' })).toThrow(/"type" is reserved/);
    expect(() => untyped('original.dat', { source: 'different.dat' })).toThrow(/"source" is reserved/);
  });

  test('the core facade rejects an object variable and untyped JSON alike', () => {
    const fromVariable: object = { source: 'b.json' };
    const fromJson = JSON.parse('{"type":"text","mode":"x"}') as object;
    const untyped = Asset.type as unknown as (type: string, source: string, options?: object) => unknown;

    expect(() => untyped('json', 'a.json', fromVariable)).toThrow(/"source" is reserved/);
    expect(() => untyped('json', 'a.json', fromJson)).toThrow(/"type" is reserved/);
    expect(() => untyped('json', 'a.json', 'oops' as unknown as object)).toThrow(/options must be an object/);
  });

  test('unrelated options pass through unchanged on both builders', () => {
    const viaType = new CustomType().asset('a.dat', { mode: 'fast' });
    const viaFacade = Asset.type('texture', 'hero.png', { mimeType: 'image/png' });

    expect(viaType._config).toEqual({ type: 'com.example.custom', source: 'a.dat', mode: 'fast' });
    expect(viaType._assetType).toBeInstanceOf(CustomType);
    expect(viaFacade._config).toEqual({ type: 'texture', source: 'hero.png', mimeType: 'image/png' });
  });
});

describe('required options', () => {
  test('a font descriptor without a family rejects its load', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const untyped = fontType.asset.bind(fontType) as (source: string) => ReturnType<typeof fontType.asset>;

    await expect(loader.load(untyped('Inter.woff2'))).rejects.toThrow(/requires a "family" option/);
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
    const catalog = Assets.from({ metadata: new CustomType().asset('game.meta') });

    expect(catalog.metadata).toBeInstanceOf(AssetRef);
    expect((catalog.metadata as unknown as { hp?: number }).hp).toBeUndefined();
  });

  test.each([
    ['music', () => Asset.type('music', 'audio/theme.ogg')],
    ['music (type instance)', () => musicType.asset('audio/theme.ogg')],
    ['video', () => Asset.type('video', 'video/intro.mp4')],
    ['font', () => Asset.type('font', 'fonts/ui.woff2', { family: 'UI' })],
    ['bmFont', () => Asset.type('bmFont', 'fonts/ui.fnt')],
    ['svg', () => Asset.type('svg', 'icon.svg')],
    ['image', () => Asset.type('image', 'a.png')],
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

    const image = await loader.load(Asset.type('image', 'a.png'));

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
