import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { FontAssetOptions } from '#assets/factories/FontFactory';
import { Loader } from '#assets/Loader';
import { fontType } from '#assets/types/font';
import { materializeAssetTypes } from '#extensions/materialize';

import { createCacheStoreDouble } from './cache-test-doubles';

class MockFontFace {
  public constructor(
    public readonly family: string,
    public readonly source: BufferSource,
    public readonly descriptors?: FontFaceDescriptors,
  ) {}

  public load(): Promise<FontFace> {
    return Promise.resolve(this as unknown as FontFace);
  }
}

const loaders: Loader[] = [];

const createLoader = (): Loader => {
  const loader = new Loader({ basePath: 'https://assets.test/', cache: createCacheStoreDouble() });

  materializeAssetTypes(loader, [fontType]);
  loaders.push(loader);

  return loader;
};

beforeEach(() => {
  vi.stubGlobal('FontFace', MockFontFace);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(new Uint8Array(8)))),
  );
});

afterEach(() => {
  for (const loader of loaders) {
    loader.destroy();
  }

  loaders.length = 0;
  vi.unstubAllGlobals();
});

const options = (descriptors?: FontFaceDescriptors): FontAssetOptions => ({
  family: 'Ui',
  addToDocument: false,
  ...(descriptors !== undefined && { descriptors }),
});

describe('font descriptor resource identity', () => {
  const descriptors = {
    ascentOverride: '80%',
    descentOverride: '20%',
    display: 'swap',
    featureSettings: '"kern" 0',
    lineGapOverride: '10%',
    stretch: 'condensed',
    style: 'italic',
    unicodeRange: 'U+0-7F',
    variant: 'small-caps',
    variationSettings: '"wght" 700',
    weight: '700',
  } satisfies Required<FontFaceDescriptors>;

  for (const [field, value] of Object.entries(descriptors)) {
    test(`${field} changes the resource but preserves the acquisition`, () => {
      const loader = createLoader();
      const ordinary = loader.identify(fontType.asset('ui.woff2', options()));
      const changed = loader.identify(fontType.asset('ui.woff2', options({ [field]: value })));

      expect(changed.resourceKey).not.toBe(ordinary.resourceKey);
      expect(changed.sourceKey).toBe(ordinary.sourceKey);
    });
  }

  for (const order of ['custom-first', 'default-first'] as const) {
    test(`loads distinct faces with the requested descriptors (${order})`, async () => {
      const loader = createLoader();
      const custom = fontType.asset('ui.woff2', options({ weight: '700', style: 'italic' }));
      const ordinary = fontType.asset('ui.woff2', options());
      const requests = order === 'custom-first' ? ([custom, ordinary] as const) : ([ordinary, custom] as const);
      const first = await loader.load(requests[0]);
      const second = await loader.load(requests[1]);

      expect(second).not.toBe(first);

      const loadedCustom = (order === 'custom-first' ? first : second) as unknown as MockFontFace;
      const loadedOrdinary = (order === 'custom-first' ? second : first) as unknown as MockFontFace;

      expect(loadedCustom.descriptors).toEqual({ weight: '700', style: 'italic' });
      expect(loadedOrdinary.descriptors).toBeUndefined();
      expect(await loader.load(custom)).toBe(loadedCustom);
      expect(await loader.load(ordinary)).toBe(loadedOrdinary);
    });
  }

  test('deduplicates reordered descriptors and reuses cached source across interpretations', async () => {
    const loader = createLoader();
    const firstRequest = fontType.asset('ui.woff2', options({ weight: '700', style: 'italic' }));
    const reorderedRequest = fontType.asset('ui.woff2', options({ style: 'italic', weight: '700' }));
    const otherRequest = fontType.asset('ui.woff2', options({ weight: '400', style: 'normal' }));

    expect(loader.identify(firstRequest)).toEqual(loader.identify(reorderedRequest));

    const first = await loader.load(firstRequest);
    const [reordered, other] = await Promise.all([loader.load(reorderedRequest), loader.load(otherRequest)]);

    expect(reordered).toBe(first);
    expect(other).not.toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('keeps an empty descriptor bag equivalent to omission without merging distinct families', () => {
    const loader = createLoader();
    const ordinary = loader.identify(fontType.asset('ui.woff2', options()));
    const empty = loader.identify(fontType.asset('ui.woff2', options({})));
    const otherFamily = loader.identify(fontType.asset('ui.woff2', { ...options(), family: 'Other' }));

    expect(empty).toEqual(ordinary);
    expect(otherFamily.resourceKey).not.toBe(ordinary.resourceKey);
    expect(otherFamily.sourceKey).toBe(ordinary.sourceKey);
  });

  test('does not confuse family text with descriptor delimiters', () => {
    const loader = createLoader();
    const family = loader.identify(fontType.asset('ui.woff2', { ...options(), family: 'Ui&weight=700' }));
    const weighted = loader.identify(fontType.asset('ui.woff2', options({ weight: '700' })));

    expect(family.resourceKey).not.toBe(weighted.resourceKey);
  });
});
