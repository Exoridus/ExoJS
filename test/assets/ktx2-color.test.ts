import { describe, expect, test } from 'vitest';

import { parseKtx2 } from '#assets/factories/ktx2';
import { TextureFactory } from '#assets/factories/TextureFactory';
import { CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';

import { factoryContext } from './factory-context';
import { ktx2BlockBytes, ktx2Dfd } from './ktx2-dfd';

const headerBytes = 80;
const levelIndexEntryBytes = 24;
const identifier = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

interface Ktx2Spec {
  readonly vkFormat: number;
  readonly levelLengths: readonly number[];
  readonly transfer: number;
  /** DFD flags byte: 0 straight, 1 for `KHR_DF_FLAG_ALPHA_PREMULTIPLIED`. */
  readonly alpha?: number;
  readonly fill?: number;
}

const buildKtx2 = ({ vkFormat, levelLengths, transfer, alpha = 0, fill = 1 }: Ktx2Spec): ArrayBuffer => {
  const dataBytes = levelLengths.reduce((total, length) => total + length, 0);
  const dfd = ktx2Dfd(vkFormat, { transfer, alpha });
  const dfdOffset = headerBytes + levelLengths.length * levelIndexEntryBytes;
  const blockBytes = ktx2BlockBytes(vkFormat);
  const levelAlignment = Math.max(8, blockBytes === 4 ? 4 : blockBytes);
  const dataOffset = Math.ceil((dfdOffset + dfd.length) / levelAlignment) * levelAlignment;
  const bytes = new Uint8Array(dataOffset + dataBytes);
  const view = new DataView(bytes.buffer);

  bytes.set(identifier);
  view.setUint32(12, vkFormat, true);
  view.setUint32(16, 1, true);
  view.setUint32(20, 4, true);
  view.setUint32(24, 4, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, levelLengths.length, true);
  view.setUint32(48, dfdOffset, true);
  view.setUint32(52, dfd.length, true);
  bytes.set(dfd, dfdOffset);

  let offset = dataOffset + dataBytes;

  for (let index = levelLengths.length - 1; index >= 0; index--) {
    const length = levelLengths[index]!;

    offset -= length;
    view.setUint32(headerBytes + index * levelIndexEntryBytes, offset, true);
    view.setUint32(headerBytes + index * levelIndexEntryBytes + 8, length, true);
    view.setUint32(headerBytes + index * levelIndexEntryBytes + 16, length, true);
    bytes.fill(fill + index, offset, offset + length);
  }

  return bytes.buffer;
};

describe('KTX2 typed color metadata', () => {
  test('preserves every raw sRGB RGBA8 mip and premultiplied-alpha metadata through TextureFactory', async () => {
    const source = buildKtx2({ vkFormat: 43, levelLengths: [64, 16, 4], transfer: 2, alpha: 1, fill: 41 });
    const texture = await new TextureFactory().create(source, factoryContext());

    expect(texture.source).toBeNull();
    expect(texture.colorSpace).toBe('srgb');
    expect(texture.alphaMode).toBe('premultiplied');
    expect(texture.pixels?.levels.map(({ width, height, data }) => [width, height, [...data]])).toEqual([
      [4, 4, Array(64).fill(41)],
      [2, 2, Array(16).fill(42)],
      [1, 1, Array(4).fill(43)],
    ]);
  });

  test('retains sRGB compressed storage and BC1 RGB opaque semantics independently', () => {
    expect(parseKtx2(buildKtx2({ vkFormat: 146, levelLengths: [16], transfer: 2 }), 'albedo.ktx2')).toMatchObject({
      kind: 'compressed',
      format: CompressedTextureFormat.Bc7RgbaUnormSrgb,
      colorSpace: 'srgb',
      alphaMode: 'straight',
    });
    expect(parseKtx2(buildKtx2({ vkFormat: 131, levelLengths: [8], transfer: 1, alpha: 0 }), 'mask.ktx2')).toMatchObject({
      kind: 'compressed',
      format: CompressedTextureFormat.Bc1RgbUnorm,
      colorSpace: 'linear-srgb',
      alphaMode: 'straight',
    });
  });

  test('rejects DFD transfer that contradicts the Vulkan storage format', () => {
    expect(() => parseKtx2(buildKtx2({ vkFormat: 43, levelLengths: [64], transfer: 1 }), 'mismatch.ktx2')).toThrow(
      /contradicts.*vkFormat/i,
    );
  });
});
