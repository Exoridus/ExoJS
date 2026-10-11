import { describe, expect, test } from 'vitest';

import { compressedLevelByteLength, CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import { Texture } from '#rendering/texture/Texture';

const pixels = (width: number, height: number) => new Uint8Array(width * height * 4);

describe('Texture.fromPixels', () => {
  test('keeps a validated RGBA8 mip payload and its source metadata', () => {
    const texture = Texture.fromPixels({
      colorSpace: 'srgb',
      alphaMode: 'straight',
      levels: [
        { data: pixels(4, 2), width: 4, height: 2 },
        { data: pixels(2, 1), width: 2, height: 1 },
        { data: pixels(1, 1), width: 1, height: 1 },
      ],
    });

    expect(texture.source).toBeNull();
    expect(texture.pixels?.levels).toHaveLength(3);
    expect(texture.width).toBe(4);
    expect(texture.height).toBe(2);
    expect(texture.colorSpace).toBe('srgb');
    expect(texture.alphaMode).toBe('straight');
    expect(texture.mipLevelCount).toBe(3);
    expect(texture.premultiplyAlpha).toBe(true);
    expect(Object.isFrozen(texture.resolvedMetadata)).toBe(true);
  });

  test('allows a prefix of the full mip chain but rejects invalid level extents and byte lengths', () => {
    expect(() =>
      Texture.fromPixels({
        colorSpace: 'linear-srgb',
        alphaMode: 'premultiplied',
        levels: [
          { data: pixels(4, 4), width: 4, height: 4 },
          { data: pixels(3, 2), width: 3, height: 2 },
        ],
      }),
    ).toThrow(/mip level 1.*2x2/i);

    expect(() =>
      Texture.fromPixels({
        colorSpace: 'linear-srgb',
        alphaMode: 'premultiplied',
        levels: [{ data: pixels(2, 2).subarray(0, 15), width: 2, height: 2 }],
      }),
    ).toThrow(/16 bytes/i);
  });

  test('uses normalization defaults from the payload role and rejects it for numeric samples', () => {
    const numeric = Texture.fromPixels({
      colorSpace: 'none',
      alphaMode: 'straight',
      levels: [{ data: pixels(1, 1), width: 1, height: 1 }],
    });
    const color = Texture.fromPixels({
      colorSpace: 'linear-srgb',
      alphaMode: 'straight',
      levels: [{ data: pixels(1, 1), width: 1, height: 1 }],
    });

    expect(numeric.premultiplyAlpha).toBe(false);
    expect(color.premultiplyAlpha).toBe(true);
    expect(() =>
      Texture.fromPixels(
        { colorSpace: 'none', alphaMode: 'straight', levels: [{ data: pixels(1, 1), width: 1, height: 1 }] },
        { premultiplyAlpha: true },
      ),
    ).toThrow(/numeric/i);
    expect(() =>
      Texture.fromPixels(
        { colorSpace: 'srgb', alphaMode: 'straight', levels: [{ data: pixels(1, 1), width: 1, height: 1 }] },
        { colorSpace: 'none' },
      ),
    ).toThrow(/contradicts the payload/i);
  });

  test('releases an obsolete realization before replacing its payload kind', () => {
    const texture = new Texture(Texture.missing.source);
    let releases = 0;
    texture.addReleaseListener(() => releases++);

    texture.setPixels({ colorSpace: 'none', alphaMode: 'straight', levels: [{ data: pixels(2, 1), width: 2, height: 1 }] });
    expect(texture.source).toBeNull();
    expect(texture.pixels).not.toBeNull();
    expect(texture.compressed).toBeNull();
    expect(texture.colorSpace).toBe('none');
    expect(texture.premultiplyAlpha).toBe(false);

    const format = CompressedTextureFormat.Bc3RgbaUnorm;
    texture.setCompressed({
      format,
      colorSpace: 'linear-srgb',
      alphaMode: 'premultiplied',
      levels: [{ data: new Uint8Array(compressedLevelByteLength(format, 4, 4)), width: 4, height: 4 }],
    });
    expect(texture.pixels).toBeNull();
    expect(texture.width).toBe(4);
    expect(texture.colorSpace).toBe('linear-srgb');
    expect(texture.alphaMode).toBe('premultiplied');

    texture.setSource(null);
    expect(texture.compressed).toBeNull();
    expect(texture.width).toBe(0);
    expect(texture.height).toBe(0);
    expect(releases).toBe(3);
  });
});
