/**
 * Descriptor and key/value rules of the KTX2 container that a conforming file exercises and a
 * hand-shaped one tends to miss: the colour model and samples of each format family, the qualifier
 * bits, NUL-terminated and binary key/value data, level alignment and the ranges that must not alias
 * the header. Every container carries the descriptor a real writer emits for its format (see
 * `ktx2-dfd.ts`), so a parser that only understands an RGBSDA layout fails here.
 */
import { describe, expect, test } from 'vitest';

import { parseKtx2 } from '#assets/factories/ktx2';
import { compressedLevelByteLength, CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';

import { ktx2BlockBytes, ktx2Dfd } from './ktx2-dfd';

const HEADER_BYTES = 80;
const LEVEL_ENTRY_BYTES = 24;
const IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

const RGBA8_SRGB = 43;
const BC1_RGB_UNORM = 131;
const BC7_UNORM = 145;

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

/** One key/value entry: length word, `key \0 value`, padding to four bytes outside the declared length. */
const entry = (key: string, value: Uint8Array): Uint8Array => {
  const body = new Uint8Array(key.length + 1 + value.length);

  body.set(text(key));
  body.set(value, key.length + 1);

  const result = new Uint8Array(Math.ceil((4 + body.length) / 4) * 4);

  new DataView(result.buffer).setUint32(0, body.length, true);
  result.set(body, 4);

  return result;
};

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
};

interface Spec {
  readonly vkFormat: number;
  readonly width: number;
  readonly height: number;
  readonly transfer?: number;
  readonly dfd?: Uint8Array;
  readonly kvd?: Uint8Array;
  /** Byte length of the single level; the format's own length by default. */
  readonly levelLength?: number;
  /** Where the level starts; the first offset after the descriptor regions on the format's alignment by default. */
  readonly levelOffset?: number;
  readonly uncompressedByteLength?: number;
}

const alignment = (vkFormat: number): number => {
  const bytes = ktx2BlockBytes(vkFormat);

  return Math.max(8, bytes === 4 ? 4 : bytes);
};

const build = ({
  vkFormat,
  width,
  height,
  transfer = 1,
  dfd = ktx2Dfd(vkFormat, { transfer }),
  kvd = new Uint8Array(0),
  levelLength,
  levelOffset,
  uncompressedByteLength,
}: Spec): ArrayBuffer => {
  const length = levelLength ?? (vkFormat === RGBA8_SRGB ? width * height * 4 : compressedLevelByteLength(CompressedTextureFormat.Bc7RgbaUnorm, width, height));
  const dfdOffset = HEADER_BYTES + LEVEL_ENTRY_BYTES;
  const kvdOffset = dfdOffset + dfd.length;
  const step = alignment(vkFormat);
  const dataOffset = levelOffset ?? Math.ceil((kvdOffset + kvd.length) / step) * step;
  const buffer = new ArrayBuffer(Math.max(dataOffset + length, HEADER_BYTES + LEVEL_ENTRY_BYTES + dfd.length + kvd.length));
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Written first so a level that aliases the header keeps the header's own bytes.
  bytes.fill(7, Math.min(dataOffset, buffer.byteLength), Math.min(dataOffset + length, buffer.byteLength));
  bytes.set(IDENTIFIER);
  view.setUint32(12, vkFormat, true);
  view.setUint32(16, 1, true);
  view.setUint32(20, width, true);
  view.setUint32(24, height, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, 1, true);
  view.setUint32(48, dfdOffset, true);
  view.setUint32(52, dfd.length, true);

  if (kvd.length > 0) {
    view.setUint32(56, kvdOffset, true);
    view.setUint32(60, kvd.length, true);
  }

  view.setUint32(HEADER_BYTES, dataOffset, true);
  view.setUint32(HEADER_BYTES + 8, length, true);
  view.setUint32(HEADER_BYTES + 16, uncompressedByteLength ?? length, true);
  bytes.set(dfd, dfdOffset);
  bytes.set(kvd, kvdOffset);

  return buffer;
};

const parse = (spec: Spec) => parseKtx2(build(spec), 'case.ktx2');

describe('KTX2 descriptor by format family', () => {
  test('a registry RGBA8 sRGB descriptor with a linear alpha sample is read as sRGB colour', () => {
    expect(parse({ vkFormat: RGBA8_SRGB, width: 2, height: 2, transfer: 2 })).toMatchObject({ kind: 'rgba8', colorSpace: 'srgb', alphaMode: 'straight' });
  });

  test('BC1 is described by its own colour model, not RGBSDA', () => {
    expect(parse({ vkFormat: BC1_RGB_UNORM, width: 4, height: 4, levelLength: 8 })).toMatchObject({
      kind: 'compressed',
      format: CompressedTextureFormat.Bc1RgbUnorm,
    });
  });

  test('a compressed format claiming the RGBSDA model is refused', () => {
    expect(() => parse({ vkFormat: BC7_UNORM, width: 4, height: 4, dfd: ktx2Dfd(BC7_UNORM, { model: 1 }) })).toThrow(
      /color model 1, but this vkFormat requires 134/,
    );
  });

  test('a descriptor whose texel block disagrees with the format is refused', () => {
    const dfd = ktx2Dfd(BC7_UNORM);

    dfd[16] = 5;

    expect(() => parse({ vkFormat: BC7_UNORM, width: 4, height: 4, dfd })).toThrow(/declares a 6x4 block/);
  });

  test('the signed and exponent qualifier bits must describe the format', () => {
    const unormWithSigned = ktx2Dfd(BC7_UNORM);

    unormWithSigned[28 + 3] |= 0x40;
    expect(() => parse({ vkFormat: BC7_UNORM, width: 4, height: 4, dfd: unormWithSigned })).toThrow(/qualifier bits 0x40/);

    const exponent = ktx2Dfd(RGBA8_SRGB, { transfer: 2 });

    exponent[28 + 3] |= 0x20;
    expect(() => parse({ vkFormat: RGBA8_SRGB, width: 2, height: 2, transfer: 2, dfd: exponent })).toThrow(/qualifier bits 0x20/);
  });

  test('a signed block format is read as signed and its unsigned twin is not', () => {
    expect(parse({ vkFormat: 140, width: 4, height: 4, levelLength: 8 })).toMatchObject({ format: CompressedTextureFormat.Bc4RSnorm });
    expect(() => parse({ vkFormat: 140, width: 4, height: 4, levelLength: 8, dfd: ktx2Dfd(139) })).toThrow(/qualifier/);
  });
});

describe('KTX2 key/value data', () => {
  const kvd = (...entries: Uint8Array[]): Uint8Array => concat(entries);

  test('accepts the canonical NUL-terminated orientation and swizzle', () => {
    const data = kvd(entry('KTXorientation', text('rd\0')), entry('KTXswizzle', text('rgba\0')));

    expect(() => parse({ vkFormat: RGBA8_SRGB, width: 2, height: 2, transfer: 2, kvd: data })).not.toThrow();
  });

  test('still accepts the unterminated legacy spelling', () => {
    expect(() => parse({ vkFormat: RGBA8_SRGB, width: 2, height: 2, transfer: 2, kvd: kvd(entry('KTXorientation', text('S=r,T=d'))) })).not.toThrow();
  });

  test('carries a vendor entry of arbitrary bytes past without decoding it', () => {
    const data = kvd(entry('Vendor', new Uint8Array([0xff, 0xfe, 0x00, 0x80])), entry('KTXorientation', text('rd\0')));

    expect(() => parse({ vkFormat: RGBA8_SRGB, width: 2, height: 2, transfer: 2, kvd: data })).not.toThrow();
  });

  test('names a bottom-up orientation instead of silently treating it as top-down', () => {
    expect(() => parse({ vkFormat: RGBA8_SRGB, width: 2, height: 2, transfer: 2, kvd: kvd(entry('KTXorientation', text('ru\0'))) })).toThrow(
      /bottom-up orientation "ru"/,
    );
  });

  test('refuses another swizzle and a text value with an embedded NUL', () => {
    expect(() => parse({ vkFormat: RGBA8_SRGB, width: 2, height: 2, transfer: 2, kvd: kvd(entry('KTXswizzle', text('bgra\0'))) })).toThrow(/swizzle "bgra"/);
    expect(() =>
      parse({ vkFormat: RGBA8_SRGB, width: 2, height: 2, transfer: 2, kvd: kvd(entry('KTXorientation', new Uint8Array([0x72, 0x00, 0x64, 0x00]))) }),
    ).toThrow(/embedded NUL/);
  });
});

describe('KTX2 level ranges', () => {
  test('an uncompressed RGBA8 level may start on four bytes, the format alignment', () => {
    expect(() => parse({ vkFormat: RGBA8_SRGB, width: 2, height: 2, transfer: 2, levelOffset: 196 })).not.toThrow();
  });

  test('a level must start on the alignment of its format', () => {
    expect(() => parse({ vkFormat: RGBA8_SRGB, width: 2, height: 2, transfer: 2, levelOffset: 198 })).toThrow(/aligned to 4 bytes/);
    expect(() => parse({ vkFormat: BC7_UNORM, width: 4, height: 4, levelOffset: 200 })).toThrow(/aligned to 16 bytes/);
  });

  test('without supercompression the stored and uncompressed lengths must agree', () => {
    expect(() => parse({ vkFormat: RGBA8_SRGB, width: 2, height: 2, transfer: 2, uncompressedByteLength: 20 })).toThrow(/must agree without supercompression/);
  });

  test('image data may not alias the header', () => {
    expect(() => parse({ vkFormat: RGBA8_SRGB, width: 1, height: 1, transfer: 2, levelOffset: 0, levelLength: 4 })).toThrow(/overlaps header/);
  });
});
