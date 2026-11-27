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

  test('expands literal density and format candidates without changing the URL query or fragment', () => {
    const set = new AssetVariantSet();
    const source = 'art/hero@{1,2}x.{webp,png}?v={build}#frame';

    expect(set.candidates(source)?.map(candidate => candidate.source)).toEqual([
      'art/hero@1x.webp?v={build}#frame',
      'art/hero@1x.png?v={build}#frame',
      'art/hero@2x.webp?v={build}#frame',
      'art/hero@2x.png?v={build}#frame',
    ]);
    expect(set.resolve(source)).toBe('art/hero@1x.png?v={build}#frame');

    set.profile = { textureFormats: [], imageFormats: ['webp', 'png'], resolution: 2.5 };

    expect(set.resolve(source)).toBe('art/hero@2x.webp?v={build}#frame');
    expect(set._resolveCandidate(source)?.resolution).toBe(2);
  });

  test('accepts either template axis and leaves other brace-bearing paths alone', () => {
    const set = new AssetVariantSet();
    set.profile = { textureFormats: [], imageFormats: ['png'], resolution: 1.5 };

    expect(set.resolve('hero@{1,1.5,2}x.png')).toBe('hero@1.5x.png');
    expect(set.resolve('hero.{webp,png}')).toBe('hero.png');
    expect(set.resolve('hero.png?q=@{1,2}x.{webp,png}')).toBe('hero.png?q=@{1,2}x.{webp,png}');
    expect(set.resolve('data:image/png;name=hero.{webp,png}')).toBe('data:image/png;name=hero.{webp,png}');
  });

  test('a template with no eligible candidate fails before a literal template URL can be fetched', () => {
    const set = new AssetVariantSet();
    expect(() => set.resolve('hero@{2,3}x.{png,webp}')).toThrow(/no eligible asset variant/i);
    expect(() => set.resolve('hero@{0,2}x.{png,webp}')).toThrow(/positive density/i);
    expect(() => set.resolve('hero@{1,2}x.{png,../other}')).toThrow(/format extension/i);
  });

  test('rejects an oversized expansion before allocating its candidates', () => {
    const set = new AssetVariantSet();
    const values = Array.from({ length: 17 }, (_, index) => index + 1);
    const formats = values.map(value => `f${value}`);

    expect(() => set.candidates(`hero@{${values.join(',')}}x.{${formats.join(',')}}`)).toThrow(/more than 256 candidates/);
  });

  test('an explicit rule takes precedence over an inline template', () => {
    const source = 'hero@{1,2}x.{webp,png}';
    const set = new AssetVariantSet().define(source, [{ source: 'custom.png' }]);

    expect(set.resolve(source)).toBe('custom.png');
    expect(set.undefine(source).resolve(source)).toBe('hero@1x.png');
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
    const set = new AssetVariantSet().define('ui.png', [
      { source: 'ui.png' },
      { source: 'ui@2x.png', resolution: 2 },
      { source: 'ui@3x.png', resolution: 3 },
    ]);

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
  test('an inline variant and its chosen physical file share cache identity', () => {
    const loader = createCoreLoader();
    loader.variants.profile = { textureFormats: [], imageFormats: ['webp', 'png'], resolution: 2 };

    const inline = loader.identify({ type: 'texture', source: 'hero@{1,2}x.{webp,png}' });
    const physical = loader.identify({ type: 'texture', source: 'hero@2x.webp' });

    expect(inline.locator).toBe(physical.locator);
    expect(inline.sourceKey).toBe(physical.sourceKey);
    expect(inline.resourceKey).toBe(physical.resourceKey);
  });

  test('identity is keyed on the chosen variant, not the logical source', () => {
    const loader = createCoreLoader();

    loader.variants.define('terrain.png', terrainVariants);

    const logical = loader.identify({ type: 'texture', source: 'terrain.png' });

    loader.variants.profile = { textureFormats: [CompressedTextureFormat.Bc7RgbaUnorm], resolution: 1 };

    const chosen = loader.identify({ type: 'texture', source: 'terrain.png' });

    expect(chosen.locator).not.toBe(logical.locator);
    expect(chosen.locator).toContain('terrain.bc7.ktx2');
    expect(chosen.sourceKey).not.toBe(logical.sourceKey);
    expect(chosen.resourceKey).not.toBe(logical.resourceKey);
  });

  test('two profiles never share one cache entry for one logical source', () => {
    const loader = createCoreLoader();

    loader.variants.define('terrain.png', terrainVariants);
    loader.variants.profile = { textureFormats: [CompressedTextureFormat.Bc7RgbaUnorm], resolution: 1 };

    const bc7 = loader.identify({ type: 'texture', source: 'terrain.png' });

    loader.variants.profile = { textureFormats: [CompressedTextureFormat.Astc4x4Unorm], resolution: 1 };

    expect(loader.identify({ type: 'texture', source: 'terrain.png' }).sourceKey).not.toBe(bc7.sourceKey);
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
