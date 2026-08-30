/**
 * Per-device variant selection.
 *
 * The selection rules are asserted directly on {@link AssetVariantSet}, and the
 * two places the loader consults it are asserted through the loader: identity has
 * to be keyed on the chosen file, and the asset type has to be inferred from it -
 * a rule that swaps a `.png` for a `.ktx2` would otherwise hand container bytes
 * to the image decoder.
 */

import { describe, expect, test } from 'vitest';

import { Asset } from '#assets/Asset';
import { AssetVariantSet } from '#assets/AssetVariantSet';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';
import { CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';

const createCoreLoader = (): Loader => {
  const loader = new Loader();

  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

const terrainVariants = [
  { source: 'terrain.bc7.ktx2', textureFormat: CompressedTextureFormat.Bc7RgbaUnorm },
  { source: 'terrain.astc.ktx2', textureFormat: CompressedTextureFormat.Astc4x4Unorm },
  { source: 'terrain@2x.png', resolution: 2 },
  { source: 'terrain.png' },
];

describe('AssetVariantSet', () => {
  test('a source with no rule resolves to itself', () => {
    expect(new AssetVariantSet().resolve('hero.png')).toBe('hero.png');
  });

  test('falls back to the unconditional candidate on the conservative default profile', () => {
    const set = new AssetVariantSet().define('terrain.png', terrainVariants);

    expect(set.resolve('terrain.png')).toBe('terrain.png');
  });

  test('picks the candidate whose format the profile lists', () => {
    const set = new AssetVariantSet().define('terrain.png', terrainVariants);

    set.profile = { textureFormats: [CompressedTextureFormat.Astc4x4Unorm], resolution: 1 };

    expect(set.resolve('terrain.png')).toBe('terrain.astc.ktx2');
  });

  test('the profile order decides between two supported formats', () => {
    const set = new AssetVariantSet().define('terrain.png', terrainVariants);

    set.profile = { textureFormats: [CompressedTextureFormat.Astc4x4Unorm, CompressedTextureFormat.Bc7RgbaUnorm], resolution: 1 };
    expect(set.resolve('terrain.png')).toBe('terrain.astc.ktx2');

    set.profile = { textureFormats: [CompressedTextureFormat.Bc7RgbaUnorm, CompressedTextureFormat.Astc4x4Unorm], resolution: 1 };
    expect(set.resolve('terrain.png')).toBe('terrain.bc7.ktx2');
  });

  test('a density candidate is eligible only up to the profile resolution', () => {
    const set = new AssetVariantSet().define('terrain.png', terrainVariants);

    set.profile = { textureFormats: [], resolution: 1 };
    expect(set.resolve('terrain.png')).toBe('terrain.png');

    set.profile = { textureFormats: [], resolution: 2 };
    expect(set.resolve('terrain.png')).toBe('terrain@2x.png');

    set.profile = { textureFormats: [], resolution: 3 };
    expect(set.resolve('terrain.png')).toBe('terrain@2x.png');
  });

  test('a supported format outranks a higher density', () => {
    const set = new AssetVariantSet().define('terrain.png', terrainVariants);

    set.profile = { textureFormats: [CompressedTextureFormat.Bc7RgbaUnorm], resolution: 2 };

    expect(set.resolve('terrain.png')).toBe('terrain.bc7.ktx2');
  });

  test('the highest eligible density wins within one format rank', () => {
    const set = new AssetVariantSet().define('ui.png', [{ source: 'ui.png' }, { source: 'ui@2x.png', resolution: 2 }, { source: 'ui@3x.png', resolution: 3 }]);

    set.profile = { textureFormats: [], resolution: 3 };

    expect(set.resolve('ui.png')).toBe('ui@3x.png');
  });

  test('a rule whose candidates are all ineligible falls back to the logical source', () => {
    const set = new AssetVariantSet().define('terrain.png', [
      { source: 'terrain.bc7.ktx2', textureFormat: CompressedTextureFormat.Bc7RgbaUnorm },
      { source: 'terrain@2x.png', resolution: 2 },
    ]);

    set.profile = { textureFormats: [CompressedTextureFormat.Etc2Rgba8Unorm], resolution: 1 };

    expect(set.resolve('terrain.png')).toBe('terrain.png');
  });

  test('resolving a chosen candidate again is a no-op', () => {
    // The loader consults the set twice per request - once for the type, once for
    // identity - so a second pass must not move the answer.
    const set = new AssetVariantSet().define('terrain.png', terrainVariants);

    set.profile = { textureFormats: [CompressedTextureFormat.Bc7RgbaUnorm], resolution: 1 };

    const first = set.resolve('terrain.png');

    expect(set.resolve(first)).toBe(first);
  });

  test('define replaces a rule, undefine and clear remove them', () => {
    const set = new AssetVariantSet().define('a.png', [{ source: 'one.png' }]);

    set.define('a.png', [{ source: 'two.png' }]);
    expect(set.resolve('a.png')).toBe('two.png');
    expect(set.candidates('a.png')).toEqual([{ source: 'two.png' }]);

    set.undefine('a.png');
    expect(set.resolve('a.png')).toBe('a.png');
    expect(set.candidates('a.png')).toBeUndefined();

    set.define('b.png', [{ source: 'three.png' }]).clear();
    expect(set.resolve('b.png')).toBe('b.png');
  });
});

describe('Loader variant wiring', () => {
  test('identity is keyed on the chosen variant, not the logical source', () => {
    const loader = createCoreLoader();

    loader.variants.define('terrain.png', terrainVariants);

    const logical = loader.identify(Asset.type('texture', 'terrain.png'));

    loader.variants.profile = { textureFormats: [CompressedTextureFormat.Bc7RgbaUnorm], resolution: 1 };

    const chosen = loader.identify(Asset.type('texture', 'terrain.png'));

    expect(chosen.locator).not.toBe(logical.locator);
    expect(chosen.locator).toContain('terrain.bc7.ktx2');
    expect(chosen.sourceKey).not.toBe(logical.sourceKey);
    expect(chosen.resourceKey).not.toBe(logical.resourceKey);
  });

  test('two profiles never share one cache entry for one logical source', () => {
    const loader = createCoreLoader();

    loader.variants.define('terrain.png', terrainVariants);
    loader.variants.profile = { textureFormats: [CompressedTextureFormat.Bc7RgbaUnorm], resolution: 1 };

    const bc7 = loader.identify(Asset.type('texture', 'terrain.png'));

    loader.variants.profile = { textureFormats: [CompressedTextureFormat.Astc4x4Unorm], resolution: 1 };

    expect(loader.identify(Asset.type('texture', 'terrain.png')).sourceKey).not.toBe(bc7.sourceKey);
  });

  test('a bare path infers its type from the chosen variant', () => {
    const loader = createCoreLoader();

    // `.data` is claimed by no installed type, so the error proves which of the
    // two names the type lookup ran against.
    loader.variants.define('terrain.png', [{ source: 'terrain.data' }]);

    expect(() => loader.peek('terrain.png' as never)).toThrow(/terrain\.data.*selected as a variant of.*terrain\.png/s);
  });

  test('an unresolved bare path still reports its own name', () => {
    const loader = createCoreLoader();

    expect(() => loader.peek('terrain.data' as never)).toThrow(/no installed asset type claims any extension of "terrain\.data"/);
  });

  test('a ktx2 variant of a png resolves to the texture type', () => {
    const loader = createCoreLoader();

    loader.variants.define('terrain.png', terrainVariants);
    loader.variants.profile = { textureFormats: [CompressedTextureFormat.Bc7RgbaUnorm], resolution: 1 };

    // No throw: `ktx2` is claimed by the `texture` type, so the swap keeps the
    // caller-visible shape of the asset.
    expect(loader.peek('terrain.png' as never)).toBeUndefined();
  });
});
