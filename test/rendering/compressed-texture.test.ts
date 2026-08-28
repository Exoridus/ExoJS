/**
 * Compressed texture payloads: the block-geometry table every upload path sizes
 * itself from, the validation that rejects a malformed payload where it enters,
 * and the mutual exclusion between a compressed payload and a pixel source that
 * lets one loader handle become either.
 */

import { describe, expect, test } from 'vitest';

import { compressedPayloadOf } from '#rendering/texture/compressedPayload';
import { CompressedTexture } from '#rendering/texture/CompressedTexture';
import {
  compressedBlockLayout,
  compressedBlocksAcross,
  compressedBlocksDown,
  compressedFormatPreference,
  compressedLevelByteLength,
  CompressedTextureFormat,
  isCompressedTextureFormat,
  orderCompressedFormats,
} from '#rendering/texture/CompressedTextureFormat';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, WrapModes } from '#rendering/types';

const level = (format: CompressedTextureFormat, width: number, height: number) => ({
  data: new Uint8Array(compressedLevelByteLength(format, width, height)),
  width,
  height,
});

describe('compressed texture formats', () => {
  test('block geometry matches the hardware layout of each family', () => {
    expect(compressedBlockLayout(CompressedTextureFormat.Bc1RgbaUnorm)).toEqual({ blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 });
    expect(compressedBlockLayout(CompressedTextureFormat.Bc7RgbaUnorm)).toEqual({ blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 });
    expect(compressedBlockLayout(CompressedTextureFormat.Astc8x8Unorm)).toEqual({ blockWidth: 8, blockHeight: 8, bytesPerBlock: 16 });
  });

  test('a level is padded out to whole blocks', () => {
    // 5x5 in 4x4 blocks is a 2x2 block grid - four blocks, not one and a half.
    expect(compressedBlocksAcross(CompressedTextureFormat.Bc7RgbaUnorm, 5)).toBe(2);
    expect(compressedBlocksDown(CompressedTextureFormat.Bc7RgbaUnorm, 5)).toBe(2);
    expect(compressedLevelByteLength(CompressedTextureFormat.Bc7RgbaUnorm, 5, 5)).toBe(64);
    expect(compressedLevelByteLength(CompressedTextureFormat.Bc1RgbaUnorm, 8, 8)).toBe(32);
    expect(compressedLevelByteLength(CompressedTextureFormat.Astc8x8Unorm, 16, 8)).toBe(32);
  });

  test('a level below one block still costs one block', () => {
    expect(compressedLevelByteLength(CompressedTextureFormat.Bc3RgbaUnorm, 1, 1)).toBe(16);
  });

  test('isCompressedTextureFormat only accepts formats with a layout', () => {
    expect(isCompressedTextureFormat(CompressedTextureFormat.Bc5RgUnorm)).toBe(true);
    expect(isCompressedTextureFormat('pvrtc-4bpp')).toBe(false);
  });

  test('orderCompressedFormats puts a device set on the engine preference order', () => {
    const ordered = orderCompressedFormats([CompressedTextureFormat.Bc1RgbaUnorm, CompressedTextureFormat.Bc7RgbaUnorm, CompressedTextureFormat.Bc3RgbaUnorm]);

    expect(ordered).toEqual([CompressedTextureFormat.Bc7RgbaUnorm, CompressedTextureFormat.Bc3RgbaUnorm, CompressedTextureFormat.Bc1RgbaUnorm]);
  });

  test('every ASTC entry carries the block geometry its name states', () => {
    for (const format of Object.values(CompressedTextureFormat)) {
      const match = /^astc-(\d+)x(\d+)-unorm$/.exec(format);

      if (match === null) continue;

      expect(compressedBlockLayout(format)).toEqual({ blockWidth: Number(match[1]), blockHeight: Number(match[2]), bytesPerBlock: 16 });
    }
  });

  test('non-square ASTC block sizes pad each axis on its own', () => {
    // Hand-computed: 32x18 in 8x6 blocks is 4 columns by 3 rows, 12 blocks of 16 bytes.
    expect(compressedLevelByteLength(CompressedTextureFormat.Astc8x6Unorm, 32, 18)).toBe(192);
    // 30x24 in 10x8 blocks is 3 by 3.
    expect(compressedLevelByteLength(CompressedTextureFormat.Astc10x8Unorm, 30, 24)).toBe(144);
    // 24x25 in 12x10 blocks is 2 by 3 - the height rounds up to a third row.
    expect(compressedLevelByteLength(CompressedTextureFormat.Astc12x10Unorm, 24, 25)).toBe(96);
    // 11x9 in 5x4 blocks is 3 by 3.
    expect(compressedLevelByteLength(CompressedTextureFormat.Astc5x4Unorm, 11, 9)).toBe(144);
    expect(compressedLevelByteLength(CompressedTextureFormat.Astc12x12Unorm, 1, 1)).toBe(16);
  });

  test('a SNORM format has the block geometry of its UNORM sibling', () => {
    expect(compressedBlockLayout(CompressedTextureFormat.Bc4RSnorm)).toEqual(compressedBlockLayout(CompressedTextureFormat.Bc4RUnorm));
    expect(compressedBlockLayout(CompressedTextureFormat.Bc5RgSnorm)).toEqual(compressedBlockLayout(CompressedTextureFormat.Bc5RgUnorm));
    expect(compressedBlockLayout(CompressedTextureFormat.Bc6hRgbFloat)).toEqual(compressedBlockLayout(CompressedTextureFormat.Bc6hRgbUfloat));
  });

  test('the preference order covers every format exactly once', () => {
    const formats = Object.values(CompressedTextureFormat);

    expect([...compressedFormatPreference].sort()).toEqual([...formats].sort());
  });
});

describe('CompressedTexture', () => {
  test('is a Texture sized from its base level', () => {
    const texture = new CompressedTexture({
      format: CompressedTextureFormat.Bc7RgbaUnorm,
      levels: [level(CompressedTextureFormat.Bc7RgbaUnorm, 16, 8)],
    });

    expect(texture).toBeInstanceOf(Texture);
    expect(texture.width).toBe(16);
    expect(texture.height).toBe(8);
    expect(texture.source).toBeNull();
    expect(texture.compressed?.format).toBe(CompressedTextureFormat.Bc7RgbaUnorm);
  });

  test('forces the upload state a compressed payload cannot honour', () => {
    const texture = new CompressedTexture({
      format: CompressedTextureFormat.Etc2Rgba8Unorm,
      levels: [level(CompressedTextureFormat.Etc2Rgba8Unorm, 8, 8)],
    });

    expect(texture.premultiplyAlpha).toBe(false);
    expect(texture.generateMipMap).toBe(false);
  });

  test('keeps the sampler state it was given', () => {
    const texture = new CompressedTexture({
      format: CompressedTextureFormat.Bc1RgbaUnorm,
      levels: [level(CompressedTextureFormat.Bc1RgbaUnorm, 4, 4)],
      samplerOptions: { scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.Repeat },
    });

    expect(texture.scaleMode).toBe(ScaleModes.Nearest);
    expect(texture.wrapMode).toBe(WrapModes.Repeat);
  });

  test('carries the full mip chain the payload declares', () => {
    const format = CompressedTextureFormat.Bc7RgbaUnorm;
    const texture = new CompressedTexture({ format, levels: [level(format, 16, 16), level(format, 8, 8), level(format, 4, 4)] });

    expect(texture.compressed?.levels).toHaveLength(3);
  });

  test('rejects an empty level list', () => {
    expect(() => new CompressedTexture({ format: CompressedTextureFormat.Bc7RgbaUnorm, levels: [] })).toThrow(/at least one mip level/);
  });

  test('rejects a level whose byte length does not match its extent', () => {
    expect(
      () =>
        new CompressedTexture({
          format: CompressedTextureFormat.Bc7RgbaUnorm,
          levels: [{ data: new Uint8Array(8), width: 4, height: 4 }],
        }),
    ).toThrow(/occupies 16 bytes, but carries 8/);
  });

  test('rejects a base level that is not a whole number of blocks', () => {
    // WebGPU refuses to create such a texture at all, so accepting it on WebGL2
    // would make the same file work on one backend and fail on the other.
    expect(
      () =>
        new CompressedTexture({
          format: CompressedTextureFormat.Astc8x8Unorm,
          levels: [level(CompressedTextureFormat.Astc8x8Unorm, 12, 8)],
        }),
    ).toThrow(/must be a multiple of that on both axes/);
  });
});

describe('Texture payload exclusivity', () => {
  const format = CompressedTextureFormat.Bc3RgbaUnorm;

  test('setCompressed clears a pixel source and bumps the version', () => {
    const texture = new Texture(null);
    const before = texture.version;

    texture.setCompressed({ format, levels: [level(format, 8, 8)] });

    expect(texture.compressed).not.toBeNull();
    expect(texture.source).toBeNull();
    expect(texture.version).toBeGreaterThan(before);
    expect(texture.width).toBe(8);
  });

  test('setSource clears a compressed payload', () => {
    const texture = new Texture(null);

    texture.setCompressed({ format, levels: [level(format, 8, 8)] });
    texture.setSource(Texture.missing.source);

    expect(texture.compressed).toBeNull();
  });

  test('setCompressed(null) drops the payload and bumps the version', () => {
    const texture = new Texture(null);

    texture.setCompressed({ format, levels: [level(format, 8, 8)] });

    const before = texture.version;

    texture.setCompressed(null);

    expect(texture.compressed).toBeNull();
    expect(texture.version).toBeGreaterThan(before);
  });

  test('setCompressed(null) on a texture without one changes nothing', () => {
    const texture = new Texture(null);
    const before = texture.version;

    texture.setCompressed(null);

    expect(texture.version).toBe(before);
  });

  test('compressedPayloadOf reads a texture without the property as uncompressed', () => {
    expect(compressedPayloadOf(new Texture(null))).toBeNull();
    expect(compressedPayloadOf({})).toBeNull();
  });
});
