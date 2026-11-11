import type { MockedFunction } from 'vitest';

import { Asset } from '#assets/Asset';
import { MemoryCacheStore } from '#assets/cache/MemoryCacheStore';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { bmFontType } from '#assets/types/font';
import { materializeAssetTypes } from '#extensions/materialize';
import type { BmFontDistanceField } from '#rendering/text/BmFont';

const BASE = 'https://assets.test/';
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const loaders: Loader[] = [];
const descriptors = new Map<string, string>();
const fetchCounts = new Map<string, number>();

class DecodedBitmap {
  public width = 4;
  public height = 4;

  public close(): void {
    this.width = 0;
    this.height = 0;
  }
}

let decode: MockedFunction<(source: ImageBitmapSource, options?: ImageBitmapOptions) => Promise<ImageBitmap>>;

const createLoader = (): Loader => {
  const loader = new Loader({ basePath: BASE, cache: new MemoryCacheStore() });

  materializeAssetTypes(loader, coreAssetTypes);
  loaders.push(loader);

  return loader;
};

const serveFont = (source: string, distanceField = '', pages: readonly string[] = ['page.png']): void => {
  descriptors.set(
    `${BASE}${source}`,
    `common lineHeight=32 base=26
${pages.map((page, index) => `page id=${index} file="${page}"`).join('\n')}
chars count=0
${distanceField}
`,
  );
};

const captureFallbackImages = (): HTMLImageElement[] => {
  const images: HTMLImageElement[] = [];
  const BrowserImage = globalThis.Image;

  class CapturingImage extends BrowserImage {
    public constructor(...args: ConstructorParameters<typeof BrowserImage>) {
      super(...args);
      images.push(this);
    }
  }

  vi.stubGlobal('createImageBitmap', undefined);
  vi.stubGlobal('Image', CapturingImage);

  return images;
};

beforeEach(() => {
  descriptors.clear();
  fetchCounts.clear();
  decode = vi.fn(async () => new DecodedBitmap() as unknown as ImageBitmap);
  vi.stubGlobal('ImageBitmap', DecodedBitmap);
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);

      fetchCounts.set(url, (fetchCounts.get(url) ?? 0) + 1);

      const descriptor = descriptors.get(url);

      if (descriptor !== undefined) {
        return new Response(descriptor);
      }

      return new Response(PNG_HEADER);
    }),
  );
});

afterEach(() => {
  for (const loader of loaders) {
    loader.destroy();
  }

  loaders.length = 0;
  vi.unstubAllGlobals();
});

describe('distance-font page loading', () => {
  test.each([
    { fieldType: 'sdf', distanceRange: 4 },
    { fieldType: 'msdf', distanceRange: 4 },
    { fieldType: 'msdf', distanceRange: 16 },
    { fieldType: 'mtsdf', distanceRange: 4 },
  ] as const)('loads declared $fieldType range $distanceRange as numeric page data', async ({ fieldType, distanceRange }) => {
    serveFont('fonts/ui.fnt', `distanceField fieldType=${fieldType} distanceRange=${distanceRange}`);
    const loader = createLoader();
    const font = await loader.load(Asset.type('bmFont', 'fonts/ui.fnt'));
    const page = font.textures[0]!;

    expect(font.fontData.distanceField).toEqual({ fieldType, distanceRange, zeroDistanceValue: 0.5 });
    expect(page.colorSpace).toBe('none');
    expect(page.alphaMode).toBe('straight');
    expect(page.premultiplyAlpha).toBe(false);
    expect(page.resolvedMetadata.storageFormat).toBe('rgba8');
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  });

  test('keeps a declared field numeric when its distance encoding is unknown', async () => {
    serveFont('fonts/ui.fnt');
    const loader = createLoader();
    const font = await loader.load(
      Asset.type('bmFont', 'fonts/ui.fnt', {
        distanceField: { fieldType: 'mtsdf', distanceRange: null, zeroDistanceValue: null },
      }),
    );

    expect(font.fontData.distanceField).toEqual({ fieldType: 'mtsdf', distanceRange: null, zeroDistanceValue: null });
    expect(font.textures[0]!.colorSpace).toBe('none');
    expect(font.textures[0]!.premultiplyAlpha).toBe(false);
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  });

  test('loads ordinary bitmap-font pages through the image-element fallback', async () => {
    serveFont('fonts/bitmap.fnt');
    const images = captureFallbackImages();
    const loader = createLoader();
    const pending = loader.load(Asset.type('bmFont', 'fonts/bitmap.fnt'));

    await vi.waitFor(() => expect(images).toHaveLength(1));

    const image = images[0]!;

    Object.defineProperties(image, {
      naturalWidth: { value: 4 },
      naturalHeight: { value: 4 },
    });
    image.dispatchEvent(new Event('load'));

    const font = await pending;
    const page = font.textures[0]!;

    expect(font.fontData.distanceField).toBeUndefined();
    expect(page.source).toBe(image);
    expect(page.width).toBe(4);
    expect(page.height).toBe(4);
    expect(page.colorSpace).toBe('srgb');
    expect(page.premultiplyAlpha).toBe(true);
  });

  test('rejects the image-element fallback for declared distance-font pages', async () => {
    serveFont('fonts/distance.fnt', 'distanceField fieldType=mtsdf distanceRange=4');
    const images = captureFallbackImages();
    const loader = createLoader();

    await expect(loader.load(Asset.type('bmFont', 'fonts/distance.fnt'))).rejects.toThrow(
      /Numeric image decoding requires createImageBitmap/,
    );
    expect(images).toHaveLength(0);
  });

  test.each(['bitmap-first', 'distance-first'] as const)('separates shared color and numeric pages (%s)', async order => {
    serveFont('fonts/bitmap.fnt');
    serveFont('fonts/distance.fnt', 'distanceField fieldType=msdf distanceRange=4');
    const loader = createLoader();
    const bitmapAsset = Asset.type('bmFont', 'fonts/bitmap.fnt');
    const distanceAsset = Asset.type('bmFont', 'fonts/distance.fnt');

    if (order === 'bitmap-first') {
      await loader.load(bitmapAsset);
    } else {
      await loader.load(distanceAsset);
    }

    const bitmapFont = await loader.load(bitmapAsset);
    const distanceFont = await loader.load(distanceAsset);
    const color = bitmapFont.textures[0]!;
    const numeric = distanceFont.textures[0]!;

    expect(bitmapFont.fontData.distanceField).toBeUndefined();
    expect(color.colorSpace).toBe('srgb');
    expect(color.premultiplyAlpha).toBe(true);
    expect(numeric.colorSpace).toBe('none');
    expect(numeric.premultiplyAlpha).toBe(false);
    expect(numeric).not.toBe(color);
    expect(numeric.source).not.toBe(color.source);
    expect(fetchCounts.get(`${BASE}fonts/page.png`)).toBe(1);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), { colorSpaceConversion: 'default', premultiplyAlpha: 'none' });
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  });

  test('keeps explicit field interpretations distinct over one cached descriptor', async () => {
    serveFont('fonts/ui.fnt', 'distanceField fieldType=msdf distanceRange=4');
    const loader = createLoader();
    const fields: BmFontDistanceField[] = [
      { fieldType: 'mtsdf', distanceRange: 8, zeroDistanceValue: 0.25 },
      { fieldType: 'mtsdf', distanceRange: 16, zeroDistanceValue: 0.25 },
      { fieldType: 'mtsdf', distanceRange: 8, zeroDistanceValue: 0.75 },
      { fieldType: 'msdf', distanceRange: 8, zeroDistanceValue: 0.25 },
    ];
    const assets = fields.map(distanceField => Asset.type('bmFont', 'fonts/ui.fnt', { distanceField }));
    const fonts = [];

    for (const asset of assets) {
      fonts.push(await loader.load(asset));
    }

    const descriptorAsset = bmFontType.asset('fonts/ui.fnt');
    const descriptorFont = await loader.load(descriptorAsset);
    const reorderedAsset = bmFontType.asset('fonts/ui.fnt', {
      distanceField: { zeroDistanceValue: 0.25, distanceRange: 8, fieldType: 'mtsdf' },
    });

    expect(fonts.map(font => font.fontData.distanceField)).toEqual(fields);
    expect(new Set(fonts).size).toBe(4);
    expect(descriptorFont.fontData.distanceField).toEqual({ fieldType: 'msdf', distanceRange: 4, zeroDistanceValue: 0.5 });
    expect(fonts).not.toContain(descriptorFont);
    expect(await loader.load(reorderedAsset)).toBe(fonts[0]);
    expect(loader.identify(reorderedAsset)).toEqual(loader.identify(assets[0]!));
    expect(loader.identify(bmFontType.asset('fonts/ui.fnt', {}))).toEqual(loader.identify(descriptorAsset));

    for (const asset of assets) {
      expect(loader.identify(asset).sourceKey).toBe(loader.identify(descriptorAsset).sourceKey);
    }

    for (const font of fonts) {
      expect(font.textures[0]).toBe(descriptorFont.textures[0]);
    }

    expect(fetchCounts.get(`${BASE}fonts/ui.fnt`)).toBe(1);
    expect(fetchCounts.get(`${BASE}fonts/page.png`)).toBe(1);
  });

  test('keeps numeric pages until their last font or independent numeric owner releases', async () => {
    serveFont('fonts/ui.fnt', 'distanceField fieldType=mtsdf distanceRange=16');
    const loader = createLoader();
    const first = loader.createScope({ name: 'first-font' });
    const second = loader.createScope({ name: 'second-font' });
    const pageOwner = loader.createScope({ name: 'numeric-page' });
    const colorOwner = loader.createScope({ name: 'color-page' });
    const asset = Asset.type('bmFont', 'fonts/ui.fnt');
    const [font, shared] = await Promise.all([first.load(asset), second.load(asset)]);
    const page = font.textures[0]!;
    const bitmap = page.source as ImageBitmap;
    const independent = await pageOwner.load(Asset.type('texture', 'fonts/page.png', { textureOptions: { colorSpace: 'none' } }));
    const color = await colorOwner.load(Asset.type('texture', 'fonts/page.png'));
    const colorBitmap = color.source as ImageBitmap;

    expect(shared).toBe(font);
    expect(page.colorSpace).toBe('none');
    expect(independent).toBe(page);
    expect(color).not.toBe(page);

    first.destroy();

    expect(page.loadState).toBe('ready');
    expect(bitmap.width).toBe(4);

    second.destroy();

    expect(page.loadState).toBe('ready');
    expect(bitmap.width).toBe(4);

    pageOwner.destroy();

    expect(page.source).toBeNull();
    expect(bitmap.width).toBe(0);
    expect(color.loadState).toBe('ready');
    expect(colorBitmap.width).toBe(4);

    colorOwner.destroy();

    expect(colorBitmap.width).toBe(0);
    expect(loader.inspect()).toHaveLength(0);
  });

  test('releases already-decoded numeric pages when another font page fails', async () => {
    serveFont('fonts/ui.fnt', 'distanceField fieldType=msdf distanceRange=4', ['page0.png', 'page1.png']);
    const loader = createLoader();
    const scope = loader.createScope();
    const bitmap = new DecodedBitmap();

    decode.mockResolvedValueOnce(bitmap as unknown as ImageBitmap).mockRejectedValueOnce(new Error('page decode failed'));

    await expect(scope.load(Asset.type('bmFont', 'fonts/ui.fnt'))).rejects.toThrow('page decode failed');

    expect(decode).toHaveBeenCalledTimes(2);
    expect(decode).toHaveBeenNthCalledWith(1, expect.any(Blob), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    expect(bitmap.width).toBe(0);
    expect(loader.inspect().filter(row => row.locator.endsWith('.png'))).toHaveLength(0);

    scope.destroy();

    expect(loader.inspect()).toHaveLength(0);
  });
});
