import { describe, expect, test } from 'vitest';

import { parseKtx2 } from '#assets/factories/ktx2';
import { compressedLevelByteLength, CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';

const headerBytes = 80;
const levelIndexEntryBytes = 24;
const dfdBytes = 44;
const identifier = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

interface Ktx2StructureSpec {
  readonly layerCount?: number;
  readonly levelCount?: number;
  readonly dfdOffset?: number;
  readonly dfdLength?: number;
  readonly levelOffset?: number;
  readonly transfer?: number;
  readonly kvd?: Uint8Array;
}

const writeDfd = (view: DataView, offset: number, transfer: number): void => {
  view.setUint32(offset, dfdBytes, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, 2, true);
  view.setUint16(offset + 10, dfdBytes - 4, true);
  view.setUint8(offset + 12, 1);
  view.setUint8(offset + 13, 1);
  view.setUint8(offset + 14, transfer);
  view.setUint8(offset + 15, 0);
  view.setUint8(offset + 16, 3);
  view.setUint8(offset + 17, 3);
  view.setUint8(offset + 20, 16);
  view.setUint8(offset + 30, 127);
  view.setUint8(offset + 31, 0);
};

const align8 = (value: number): number => Math.ceil(value / 8) * 8;

const buildKtx2 = ({ layerCount = 0, levelCount = 1, dfdOffset, dfdLength, levelOffset, transfer = 1, kvd }: Ktx2StructureSpec = {}): ArrayBuffer => {
  const levelLength = compressedLevelByteLength(CompressedTextureFormat.Bc7RgbaUnorm, 8, 8);
  const indexBytes = Math.max(levelCount, 1) * levelIndexEntryBytes;
  const storageDfdOffset = headerBytes + indexBytes;
  const actualDfdOffset = dfdOffset ?? storageDfdOffset;
  const actualDfdLength = dfdLength ?? dfdBytes;
  const actualLevelOffset = levelOffset ?? align8(storageDfdOffset + dfdBytes + (kvd?.byteLength ?? 0));
  const buffer = new ArrayBuffer(actualLevelOffset + levelLength);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  bytes.set(identifier);
  view.setUint32(12, 145, true);
  view.setUint32(16, 1, true);
  view.setUint32(20, 8, true);
  view.setUint32(24, 8, true);
  view.setUint32(32, layerCount, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, levelCount, true);
  view.setUint32(48, actualDfdOffset, true);
  view.setUint32(52, actualDfdLength, true);

  if (kvd !== undefined) {
    view.setUint32(56, actualDfdOffset + actualDfdLength, true);
    view.setUint32(60, kvd.byteLength, true);
    bytes.set(kvd, actualDfdOffset + actualDfdLength);
  }

  view.setUint32(headerBytes, actualLevelOffset, true);
  view.setUint32(headerBytes + 8, levelLength, true);
  view.setUint32(headerBytes + 16, levelLength, true);

  if (storageDfdOffset + dfdBytes <= buffer.byteLength) {
    writeDfd(view, storageDfdOffset, transfer);
  }

  return buffer;
};

describe('KTX2 structure', () => {
  test('requires a complete DFD before reading level data', () => {
    expect(() => parseKtx2(buildKtx2({ dfdOffset: 0, dfdLength: 0 }), 'missing-dfd.ktx2')).toThrow(/required DFD/);
  });

  test('rejects a one-layer array rather than treating it as a 2D texture', () => {
    expect(() => parseKtx2(buildKtx2({ layerCount: 1 }), 'array.ktx2')).toThrow(/non-array 2D/);
  });

  test('rejects compressed textures whose level count requests generated mips', () => {
    expect(() => parseKtx2(buildKtx2({ levelCount: 0 }), 'generated-mips.ktx2')).toThrow(/levelCount 0/);
  });

  test('rejects a level range that overlaps the DFD', () => {
    expect(() => parseKtx2(buildKtx2({ levelOffset: headerBytes + levelIndexEntryBytes }), 'overlap.ktx2')).toThrow(/overlaps DFD/);
  });

  test('rejects unsupported DFD transfer functions as a profile error', () => {
    expect(() => parseKtx2(buildKtx2({ transfer: 16 }), 'pq.ktx2')).toThrow(/unsupported DFD transfer/);
  });

  test('keeps the Vulkan sRGB format identity', () => {
    const buffer = buildKtx2({ transfer: 2 });
    new DataView(buffer).setUint32(12, 146, true);

    expect(parseKtx2(buffer, 'srgb.ktx2')).toMatchObject({ format: CompressedTextureFormat.Bc7RgbaUnormSrgb });
  });
});
