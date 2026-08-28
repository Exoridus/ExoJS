/**
 * KTX2 container parsing.
 *
 * The containers are synthesized here rather than committed as fixtures: the
 * interesting cases are header shapes (a rejected supercompression scheme, a
 * cube map, a truncated level index), and a real file cannot be edited into those
 * shapes without a toolchain. Every level's byte length is derived from the
 * engine's own block table, so a wrong table would fail these rather than hide in
 * them.
 */

import { describe, expect, test } from 'vitest';

import { inflateKtx2Levels, isKtx2, parseKtx2 } from '#assets/factories/ktx2';
import { compressedLevelByteLength, CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';

const HEADER_BYTES = 80;
const LEVEL_ENTRY_BYTES = 24;
const IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

interface Ktx2Spec {
  readonly vkFormat: number;
  readonly width: number;
  readonly height: number;
  /** Byte length of each level, mip 0 first. */
  readonly levelLengths: readonly number[];
  readonly supercompressionScheme?: number;
  readonly pixelDepth?: number;
  readonly layerCount?: number;
  readonly faceCount?: number;
  /** Overrides the level count written into the header, without changing the index. */
  readonly declaredLevelCount?: number;
  /** Fills every level with this byte, so a mis-sliced level is visible. */
  readonly fillFrom?: number;
}

const buildKtx2 = ({
  vkFormat,
  width,
  height,
  levelLengths,
  supercompressionScheme = 0,
  pixelDepth = 0,
  layerCount = 0,
  faceCount = 1,
  declaredLevelCount,
  fillFrom = 1,
}: Ktx2Spec): ArrayBuffer => {
  const dataBytes = levelLengths.reduce((total, length) => total + length, 0);
  const indexBytes = levelLengths.length * LEVEL_ENTRY_BYTES;
  const buffer = new ArrayBuffer(HEADER_BYTES + indexBytes + dataBytes);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  bytes.set(IDENTIFIER, 0);
  view.setUint32(12, vkFormat, true);
  view.setUint32(16, 1, true);
  view.setUint32(20, width, true);
  view.setUint32(24, height, true);
  view.setUint32(28, pixelDepth, true);
  view.setUint32(32, layerCount, true);
  view.setUint32(36, faceCount, true);
  view.setUint32(40, declaredLevelCount ?? levelLengths.length, true);
  view.setUint32(44, supercompressionScheme, true);

  // KTX2 stores the image data smallest level first, so the offsets are laid out
  // in reverse mip order while the index entries stay in mip order.
  let offset = HEADER_BYTES + indexBytes + dataBytes;

  for (let index = levelLengths.length - 1; index >= 0; index--) {
    const length = levelLengths[index]!;

    offset -= length;
    view.setUint32(HEADER_BYTES + index * LEVEL_ENTRY_BYTES, offset, true);
    view.setUint32(HEADER_BYTES + index * LEVEL_ENTRY_BYTES + 8, length, true);
    view.setUint32(HEADER_BYTES + index * LEVEL_ENTRY_BYTES + 16, length, true);
    bytes.fill(fillFrom + index, offset, offset + length);
  }

  return buffer;
};

const levelLengthsFor = (format: CompressedTextureFormat, width: number, height: number, count: number): number[] =>
  Array.from({ length: count }, (_unused, index) => compressedLevelByteLength(format, Math.max(width >> index, 1), Math.max(height >> index, 1)));

describe('isKtx2', () => {
  test('recognizes the identifier', () => {
    expect(isKtx2(new Uint8Array(IDENTIFIER))).toBe(true);
  });

  test('rejects image bytes and anything shorter than the identifier', () => {
    expect(isKtx2(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(false);
    expect(isKtx2(new Uint8Array(IDENTIFIER.slice(0, 6)))).toBe(false);
  });
});

describe('parseKtx2', () => {
  test('reads a single-level BC7 payload', () => {
    const format = CompressedTextureFormat.Bc7RgbaUnorm;
    const payload = parseKtx2(buildKtx2({ vkFormat: 145, width: 16, height: 8, levelLengths: levelLengthsFor(format, 16, 8, 1) }), 'hero.ktx2');

    expect(payload).toMatchObject({ kind: 'compressed', format });
    expect(payload.kind === 'compressed' && payload.levels).toHaveLength(1);
    expect(payload.kind === 'compressed' && payload.levels[0]).toMatchObject({ width: 16, height: 8 });
  });

  test('reads a mip chain in mip order, not in storage order', () => {
    const format = CompressedTextureFormat.Bc7RgbaUnorm;
    const payload = parseKtx2(buildKtx2({ vkFormat: 145, width: 16, height: 16, levelLengths: levelLengthsFor(format, 16, 16, 3) }), 'hero.ktx2');

    expect(payload.kind).toBe('compressed');

    if (payload.kind !== 'compressed') return;

    expect(payload.levels.map(({ width, height }) => [width, height])).toEqual([
      [16, 16],
      [8, 8],
      [4, 4],
    ]);
    // Level n was filled with the byte `1 + n`, so the slices are in mip order
    // even though the file stores them the other way round.
    expect(payload.levels.map(({ data }) => data[0])).toEqual([1, 2, 3]);
  });

  test('maps the sRGB and UNORM variants of one block format to the same engine format', () => {
    const format = CompressedTextureFormat.Bc7RgbaUnorm;
    const lengths = levelLengthsFor(format, 8, 8, 1);

    for (const vkFormat of [145, 146]) {
      expect(parseKtx2(buildKtx2({ vkFormat, width: 8, height: 8, levelLengths: lengths }), 'hero.ktx2')).toMatchObject({ format });
    }
  });

  test('reads ETC2 and ASTC payloads', () => {
    const etc2 = CompressedTextureFormat.Etc2Rgba8Unorm;
    const astc = CompressedTextureFormat.Astc6x6Unorm;

    expect(parseKtx2(buildKtx2({ vkFormat: 151, width: 8, height: 8, levelLengths: levelLengthsFor(etc2, 8, 8, 1) }), 'a.ktx2')).toMatchObject({
      format: etc2,
    });
    expect(parseKtx2(buildKtx2({ vkFormat: 165, width: 12, height: 12, levelLengths: levelLengthsFor(astc, 12, 12, 1) }), 'b.ktx2')).toMatchObject({
      format: astc,
    });
  });

  test('reads every ASTC block size the engine exposes, at both its vkFormat values', () => {
    // VK_FORMAT_ASTC_4x4_UNORM_BLOCK is 157 and the LDR sizes run in pairs from
    // there, UNORM then SRGB, in the same order as the engine's block table.
    const sizes = [
      [4, 4],
      [5, 4],
      [5, 5],
      [6, 5],
      [6, 6],
      [8, 5],
      [8, 6],
      [8, 8],
      [10, 5],
      [10, 6],
      [10, 8],
      [10, 10],
      [12, 10],
      [12, 12],
    ] as const;

    sizes.forEach(([blockWidth, blockHeight], index) => {
      const format = `astc-${blockWidth}x${blockHeight}-unorm` as CompressedTextureFormat;
      const width = blockWidth * 2;
      const height = blockHeight * 2;
      const lengths = levelLengthsFor(format, width, height, 1);

      for (const vkFormat of [157 + index * 2, 158 + index * 2]) {
        expect(parseKtx2(buildKtx2({ vkFormat, width, height, levelLengths: lengths }), 'a.ktx2')).toMatchObject({ format });
      }
    });
  });

  test('reads the signed BC variants as their own formats', () => {
    const signed = [
      [140, CompressedTextureFormat.Bc4RSnorm],
      [142, CompressedTextureFormat.Bc5RgSnorm],
      [144, CompressedTextureFormat.Bc6hRgbFloat],
    ] as const;

    for (const [vkFormat, format] of signed) {
      expect(parseKtx2(buildKtx2({ vkFormat, width: 8, height: 8, levelLengths: levelLengthsFor(format, 8, 8, 1) }), 'a.ktx2')).toMatchObject({ format });
    }
  });

  test('reads an uncompressed RGBA8 payload as pixels', () => {
    const payload = parseKtx2(buildKtx2({ vkFormat: 37, width: 4, height: 2, levelLengths: [4 * 2 * 4] }), 'hero.ktx2');

    expect(payload).toMatchObject({ kind: 'rgba8', width: 4, height: 2 });
    expect(payload.kind === 'rgba8' && payload.data.byteLength).toBe(32);
  });

  test('treats a declared level count of zero as the one level present', () => {
    const format = CompressedTextureFormat.Bc1RgbaUnorm;
    const payload = parseKtx2(
      buildKtx2({ vkFormat: 133, width: 8, height: 8, levelLengths: levelLengthsFor(format, 8, 8, 1), declaredLevelCount: 0 }),
      'hero.ktx2',
    );

    expect(payload.kind === 'compressed' && payload.levels).toHaveLength(1);
  });

  test.each([
    [1, /BasisLZ/],
    [2, /Zstandard/],
    [3, /still ZLIB-supercompressed/],
    [9, /scheme 9/],
  ])('rejects supercompression scheme %i', (scheme, expected) => {
    const format = CompressedTextureFormat.Bc7RgbaUnorm;

    expect(() =>
      parseKtx2(buildKtx2({ vkFormat: 145, width: 8, height: 8, levelLengths: levelLengthsFor(format, 8, 8, 1), supercompressionScheme: scheme }), 'hero.ktx2'),
    ).toThrow(expected);
  });

  test('rejects a payload that is not a KTX2 file', () => {
    expect(() => parseKtx2(new Uint8Array(HEADER_BYTES).buffer, 'hero.ktx2')).toThrow(/does not start with the KTX2 identifier/);
  });

  test('rejects a file too short to hold a header', () => {
    expect(() => parseKtx2(new Uint8Array(16).buffer, 'hero.ktx2')).toThrow(/too short to hold a header/);
  });

  test('rejects a cube map, an array texture and a 3D texture', () => {
    const format = CompressedTextureFormat.Bc7RgbaUnorm;
    const lengths = levelLengthsFor(format, 8, 8, 1);

    for (const override of [{ faceCount: 6 }, { layerCount: 4 }, { pixelDepth: 4 }]) {
      expect(() => parseKtx2(buildKtx2({ vkFormat: 145, width: 8, height: 8, levelLengths: lengths, ...override }), 'hero.ktx2')).toThrow(
        /only 2D single-layer textures/,
      );
    }
  });

  test('rejects a vkFormat outside the supported set', () => {
    expect(() => parseKtx2(buildKtx2({ vkFormat: 999, width: 8, height: 8, levelLengths: [64] }), 'hero.ktx2')).toThrow(/vkFormat 999/);
  });

  test('rejects a level whose declared length does not match its extent', () => {
    // A BC7 8x8 level is 64 bytes; the file claims 32.
    expect(() => parseKtx2(buildKtx2({ vkFormat: 145, width: 8, height: 8, levelLengths: [32] }), 'hero.ktx2')).toThrow(
      /declares 32 bytes but its extent needs exactly 64/,
    );
  });

  test('rejects a level index the file is too short to hold', () => {
    const format = CompressedTextureFormat.Bc7RgbaUnorm;
    const full = buildKtx2({ vkFormat: 145, width: 8, height: 8, levelLengths: levelLengthsFor(format, 8, 8, 1) });

    expect(() => parseKtx2(full.slice(0, HEADER_BYTES + 8), 'hero.ktx2')).toThrow(/too short to hold their index/);
  });

  test('names the file in every message', () => {
    expect(() => parseKtx2(new Uint8Array(16).buffer, 'levels/terrain.ktx2')).toThrow(/levels\/terrain\.ktx2/);
  });
});

/** Deflates every level of an uncompressed container into a scheme-3 one. */
const deflateKtx2 = async (buffer: ArrayBuffer, levelCount: number): Promise<ArrayBuffer> => {
  const source = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const indexBytes = levelCount * LEVEL_ENTRY_BYTES;
  const entries = Array.from({ length: levelCount }, (_unused, index) => ({
    index,
    offset: view.getUint32(HEADER_BYTES + index * LEVEL_ENTRY_BYTES, true),
    length: view.getUint32(HEADER_BYTES + index * LEVEL_ENTRY_BYTES + 8, true),
  }));
  const deflated = await Promise.all(
    entries.map(async ({ offset, length }) => {
      const compressor = new CompressionStream('deflate');
      const pump = (async (): Promise<void> => {
        const writer = compressor.writable.getWriter();

        await writer.write(source.subarray(offset, offset + length));
        await writer.close();
      })();
      const reader = compressor.readable.getReader();
      const chunks: Uint8Array[] = [];

      for (;;) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
      }

      await pump;

      const deflatedBytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
      let cursor = 0;

      for (const chunk of chunks) {
        deflatedBytes.set(chunk, cursor);
        cursor += chunk.byteLength;
      }

      return deflatedBytes;
    }),
  );
  const result = new Uint8Array(HEADER_BYTES + indexBytes + deflated.reduce((total, level) => total + level.byteLength, 0));
  const resultView = new DataView(result.buffer);

  result.set(source.subarray(0, HEADER_BYTES + indexBytes));
  resultView.setUint32(44, 3, true);

  // Kept in the container's own storage order - smallest level last in mip order,
  // so the offsets are written back to front like the uncompressed builder does.
  let cursor = result.byteLength;

  for (let index = levelCount - 1; index >= 0; index--) {
    const data = deflated[index]!;
    const entry = HEADER_BYTES + index * LEVEL_ENTRY_BYTES;

    cursor -= data.byteLength;
    result.set(data, cursor);
    resultView.setUint32(entry, cursor, true);
    resultView.setUint32(entry + 8, data.byteLength, true);
    resultView.setUint32(entry + 16, entries[index]!.length, true);
  }

  return result.buffer;
};

describe('inflateKtx2Levels', () => {
  const format = CompressedTextureFormat.Bc7RgbaUnorm;

  test('a ZLIB container reads exactly like the uncompressed one it was made from', async () => {
    const plain = buildKtx2({ vkFormat: 145, width: 16, height: 16, levelLengths: levelLengthsFor(format, 16, 16, 3) });
    const compressed = await deflateKtx2(plain, 3);

    expect(new DataView(compressed).getUint32(44, true)).toBe(3);
    expect(compressed.byteLength).not.toBe(plain.byteLength);

    const expected = parseKtx2(plain, 'plain.ktx2');
    const actual = parseKtx2(await inflateKtx2Levels(compressed, 'zlib.ktx2'), 'zlib.ktx2');

    expect(actual).toEqual(expected);
  });

  test('hands back a container that needs no inflating, untouched', async () => {
    const plain = buildKtx2({ vkFormat: 145, width: 8, height: 8, levelLengths: levelLengthsFor(format, 8, 8, 1) });

    expect(await inflateKtx2Levels(plain, 'plain.ktx2')).toBe(plain);
    // Not a KTX2 file at all: the caller's own error belongs to the parser.
    const foreign = new Uint8Array(HEADER_BYTES).buffer;

    expect(await inflateKtx2Levels(foreign, 'foreign.ktx2')).toBe(foreign);
  });

  test.each([1, 2])('leaves scheme %i alone for the parser to refuse', async scheme => {
    const buffer = buildKtx2({ vkFormat: 145, width: 8, height: 8, levelLengths: levelLengthsFor(format, 8, 8, 1), supercompressionScheme: scheme });

    expect(await inflateKtx2Levels(buffer, 'hero.ktx2')).toBe(buffer);
  });

  test('rejects a level whose inflated size is not the one declared', async () => {
    const plain = buildKtx2({ vkFormat: 145, width: 8, height: 8, levelLengths: levelLengthsFor(format, 8, 8, 1) });
    const compressed = await deflateKtx2(plain, 1);

    // The level really inflates to 64 bytes (one 8x8 BC7 level); claim 48.
    new DataView(compressed).setUint32(HEADER_BYTES + 16, 48, true);

    await expect(inflateKtx2Levels(compressed, 'zlib.ktx2')).rejects.toThrow(/inflates to 64 bytes but declares 48/);
  });
});
