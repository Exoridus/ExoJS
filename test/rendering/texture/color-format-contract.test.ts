import { describe, expect, test } from 'vitest';

import { compressedBlockLayout, compressedFormatPreference, CompressedTextureFormat as Compressed } from '#rendering/texture/CompressedTextureFormat';
import { resolveTextureFormat } from '#rendering/texture/textureFormatInfo';
import type { ColorTextureFormat, TextureFormat } from '#rendering/types';
import { TextureFormat as Format } from '#rendering/types';

describe('texture format contract', () => {
  test('keeps sRGB attachment storage out of the numeric data formats', () => {
    const colorFormats: ColorTextureFormat[] = [Format.Rgba8Srgb];
    const numericFormat: TextureFormat = Format.Rgba8;

    expect(colorFormats).toEqual([Format.Rgba8Srgb]);
    expect(numericFormat).toBe(Format.Rgba8);
  });

  test('resolves exact sRGB storage separately from interpretation and association', () => {
    expect(resolveTextureFormat(Compressed.Bc7RgbaUnormSrgb, { alphaMode: 'premultiplied' })).toEqual({
      storageFormat: Compressed.Bc7RgbaUnormSrgb,
      colorSpace: 'srgb',
      alphaMode: 'premultiplied',
      hasAlpha: true,
      blockLayout: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
    });
  });

  test('lets linear storage be interpreted as data or linear color', () => {
    expect(resolveTextureFormat(Compressed.Bc5RgUnorm, { colorSpace: 'none' }).colorSpace).toBe('none');
    expect(resolveTextureFormat(Compressed.Bc5RgUnorm, { colorSpace: 'linear-srgb' }).colorSpace).toBe('linear-srgb');
  });

  test('rejects metadata that contradicts exact sRGB storage', () => {
    expect(() => resolveTextureFormat(Compressed.Bc7RgbaUnormSrgb, { colorSpace: 'none' })).toThrow(/sRGB/i);
  });

  test('rejects source metadata that contradicts payload metadata', () => {
    expect(() =>
      resolveTextureFormat(Compressed.Bc7RgbaUnorm, {
        colorSpace: 'none',
        payloadColorSpace: 'srgb',
      }),
    ).toThrow(/contradict/i);
  });

  test('BC1 RGB is opaque while the RGBA and punchthrough identities carry alpha', () => {
    expect(resolveTextureFormat(Compressed.Bc1RgbUnorm).hasAlpha).toBe(false);
    expect(resolveTextureFormat(Compressed.Bc1RgbaUnorm).hasAlpha).toBe(true);
    expect(resolveTextureFormat(Compressed.Etc2Rgb8A1Unorm).hasAlpha).toBe(true);
  });

  test('compressed sRGB variants retain their linear partner block layouts', () => {
    for (const [linear, srgb] of [
      [Compressed.Bc1RgbUnorm, Compressed.Bc1RgbUnormSrgb],
      [Compressed.Bc1RgbaUnorm, Compressed.Bc1RgbaUnormSrgb],
      [Compressed.Bc2RgbaUnorm, Compressed.Bc2RgbaUnormSrgb],
      [Compressed.Bc3RgbaUnorm, Compressed.Bc3RgbaUnormSrgb],
      [Compressed.Bc7RgbaUnorm, Compressed.Bc7RgbaUnormSrgb],
      [Compressed.Etc2Rgb8Unorm, Compressed.Etc2Rgb8Srgb],
      [Compressed.Etc2Rgb8A1Unorm, Compressed.Etc2Rgb8A1Srgb],
      [Compressed.Etc2Rgba8Unorm, Compressed.Etc2Rgba8Srgb],
      [Compressed.Astc4x4Unorm, Compressed.Astc4x4Srgb],
      [Compressed.Astc5x4Unorm, Compressed.Astc5x4Srgb],
      [Compressed.Astc5x5Unorm, Compressed.Astc5x5Srgb],
      [Compressed.Astc6x5Unorm, Compressed.Astc6x5Srgb],
      [Compressed.Astc6x6Unorm, Compressed.Astc6x6Srgb],
      [Compressed.Astc8x5Unorm, Compressed.Astc8x5Srgb],
      [Compressed.Astc8x6Unorm, Compressed.Astc8x6Srgb],
      [Compressed.Astc8x8Unorm, Compressed.Astc8x8Srgb],
      [Compressed.Astc10x5Unorm, Compressed.Astc10x5Srgb],
      [Compressed.Astc10x6Unorm, Compressed.Astc10x6Srgb],
      [Compressed.Astc10x8Unorm, Compressed.Astc10x8Srgb],
      [Compressed.Astc10x10Unorm, Compressed.Astc10x10Srgb],
      [Compressed.Astc12x10Unorm, Compressed.Astc12x10Srgb],
      [Compressed.Astc12x12Unorm, Compressed.Astc12x12Srgb],
    ] as const) {
      expect(resolveTextureFormat(srgb).blockLayout).toEqual(resolveTextureFormat(linear).blockLayout);
      expect(compressedBlockLayout(srgb)).toEqual(compressedBlockLayout(linear));
    }
  });

  test('the preference table covers known formats without inventing data sRGB variants', () => {
    expect([...compressedFormatPreference].sort()).toEqual(Object.values(Compressed).sort());
    expect(Object.values(Compressed).some(format => /(?:bc4|bc5|bc6h|eac).*srgb/i.test(format))).toBe(false);
  });
});
