import { describe, expect, test } from 'vitest';

import { CompressedTexture } from '#rendering/texture/CompressedTexture';
import { compressedLevelByteLength, CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';

describe('compressed texture size', () => {
  test('updateSource keeps the size of a compressed payload', () => {
    const texture = new CompressedTexture({
      format: CompressedTextureFormat.Bc1RgbaUnorm,
      levels: [{ data: new Uint8Array(compressedLevelByteLength(CompressedTextureFormat.Bc1RgbaUnorm, 8, 8)), width: 8, height: 8 }],
    });

    texture.updateSource();

    expect([texture.width, texture.height]).toEqual([8, 8]);
  });
});
