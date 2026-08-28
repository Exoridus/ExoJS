import { AssetDecodeError } from '#assets/AssetDecodeError';
import type { CompressedTextureLevel } from '#rendering/texture/compressedPayload';
import { compressedLevelByteLength, CompressedTextureFormat as Format } from '#rendering/texture/CompressedTextureFormat';

/** `«KTX 20»\r\n\x1A\n` - the 12-byte KTX2 file identifier. */
const identifier = Object.freeze([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * `VkFormat` values a KTX2 payload may carry, mapped onto this engine's format
 * vocabulary.
 *
 * The sRGB and UNORM variants of one block format map to the same entry: the
 * blocks are bit-identical and the engine's managed textures are linear-sampled
 * `rgba8unorm` throughout, so honouring the distinction here would make
 * compressed textures the only ones on a different transfer function.
 *
 * `BC1_RGB` maps to the RGBA form because that is the only BC1 format WebGPU
 * exposes, and the two differ solely in whether the punch-through alpha bit is
 * honoured.
 */
const formatByVkFormat = new Map<number, Format>([
  [131, Format.Bc1RgbaUnorm],
  [132, Format.Bc1RgbaUnorm],
  [133, Format.Bc1RgbaUnorm],
  [134, Format.Bc1RgbaUnorm],
  [135, Format.Bc2RgbaUnorm],
  [136, Format.Bc2RgbaUnorm],
  [137, Format.Bc3RgbaUnorm],
  [138, Format.Bc3RgbaUnorm],
  [139, Format.Bc4RUnorm],
  [140, Format.Bc4RSnorm],
  [141, Format.Bc5RgUnorm],
  [142, Format.Bc5RgSnorm],
  [143, Format.Bc6hRgbUfloat],
  [144, Format.Bc6hRgbFloat],
  [145, Format.Bc7RgbaUnorm],
  [146, Format.Bc7RgbaUnorm],
  [147, Format.Etc2Rgb8Unorm],
  [148, Format.Etc2Rgb8Unorm],
  [149, Format.Etc2Rgb8A1Unorm],
  [150, Format.Etc2Rgb8A1Unorm],
  [151, Format.Etc2Rgba8Unorm],
  [152, Format.Etc2Rgba8Unorm],
  [153, Format.EacR11Unorm],
  [155, Format.EacRg11Unorm],
  [157, Format.Astc4x4Unorm],
  [158, Format.Astc4x4Unorm],
  [159, Format.Astc5x4Unorm],
  [160, Format.Astc5x4Unorm],
  [161, Format.Astc5x5Unorm],
  [162, Format.Astc5x5Unorm],
  [163, Format.Astc6x5Unorm],
  [164, Format.Astc6x5Unorm],
  [165, Format.Astc6x6Unorm],
  [166, Format.Astc6x6Unorm],
  [167, Format.Astc8x5Unorm],
  [168, Format.Astc8x5Unorm],
  [169, Format.Astc8x6Unorm],
  [170, Format.Astc8x6Unorm],
  [171, Format.Astc8x8Unorm],
  [172, Format.Astc8x8Unorm],
  [173, Format.Astc10x5Unorm],
  [174, Format.Astc10x5Unorm],
  [175, Format.Astc10x6Unorm],
  [176, Format.Astc10x6Unorm],
  [177, Format.Astc10x8Unorm],
  [178, Format.Astc10x8Unorm],
  [179, Format.Astc10x10Unorm],
  [180, Format.Astc10x10Unorm],
  [181, Format.Astc12x10Unorm],
  [182, Format.Astc12x10Unorm],
  [183, Format.Astc12x12Unorm],
  [184, Format.Astc12x12Unorm],
]);

/** `VK_FORMAT_R8G8B8A8_UNORM` and `..._SRGB` - the one uncompressed payload this parser accepts. */
const vkFormatRgba8Unorm = 37;
const vkFormatRgba8Srgb = 43;

/** Supercompression schemes, by their KTX2 numeric id. */
const supercompressionNames = new Map<number, string>([
  [1, 'BasisLZ'],
  [2, 'Zstandard'],
  [3, 'ZLIB'],
]);

/** A KTX2 payload whose levels are already in a hardware format. */
export interface Ktx2CompressedPayload {
  readonly kind: 'compressed';
  readonly format: Format;
  readonly levels: readonly CompressedTextureLevel[];
}

/** A KTX2 payload storing plain 8-bit RGBA texels, level 0 only. */
export interface Ktx2UncompressedPayload {
  readonly kind: 'rgba8';
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** What {@link parseKtx2} produces. */
export type Ktx2Payload = Ktx2CompressedPayload | Ktx2UncompressedPayload;

/**
 * Whether `bytes` begin with the KTX2 identifier.
 *
 * Sniffed from the payload rather than trusted from the file suffix: the
 * `texture` type accepts both container and image bytes under one identity, and
 * a variant rule may hand it either.
 */
export const isKtx2 = (bytes: Uint8Array): boolean => bytes.length >= identifier.length && identifier.every((expected, index) => bytes[index] === expected);

const fail = (source: string, message: string): never => {
  throw new AssetDecodeError({ message: `KTX2 file "${source}": ${message}`, assetType: 'ktx2' });
};

/**
 * Parse a KTX2 container into an uploadable payload.
 *
 * Every level is located through the level index rather than by walking the
 * payload: KTX2 stores the image data smallest level first, so the byte order in
 * the file is the reverse of the mip order.
 *
 * `source` only names the file in error messages.
 *
 * @throws AssetDecodeError - not a KTX2 file, a supercompression scheme this
 *   engine does not carry (BasisLZ, Zstandard, ZLIB), a `vkFormat` outside the
 *   supported set, a non-2D target (array layers, cube faces, depth), or a level
 *   whose declared byte length does not match its extent.
 */
export const parseKtx2 = (buffer: ArrayBuffer, source: string): Ktx2Payload => {
  const headerBytes = 80;

  if (buffer.byteLength < headerBytes) {
    return fail(source, `file is ${buffer.byteLength} bytes, too short to hold a header.`);
  }

  const bytes = new Uint8Array(buffer);

  if (!isKtx2(bytes)) {
    return fail(source, 'file does not start with the KTX2 identifier.');
  }

  const view = new DataView(buffer);
  const vkFormat = view.getUint32(12, true);
  const pixelWidth = view.getUint32(20, true);
  const pixelHeight = view.getUint32(24, true);
  const pixelDepth = view.getUint32(28, true);
  const layerCount = view.getUint32(32, true);
  const faceCount = view.getUint32(36, true);
  // A stored `levelCount` of 0 means "the mip chain is to be generated", which
  // for a compressed payload is not possible - so it is read as the single level
  // the file does contain rather than rejected.
  const levelCount = Math.max(view.getUint32(40, true), 1);
  const supercompressionScheme = view.getUint32(44, true);

  if (supercompressionScheme !== 0) {
    const name = supercompressionNames.get(supercompressionScheme) ?? `scheme ${supercompressionScheme}`;

    return fail(
      source,
      `payload uses ${name} supercompression, which this engine does not decode. Ship the file in a hardware format per target ` +
        `(and select between them with loader.variants) instead of a universal one.`,
    );
  }

  if (pixelDepth > 1 || layerCount > 1 || faceCount > 1) {
    return fail(source, `only 2D single-layer textures are supported, but the file declares depth ${pixelDepth}, ${layerCount} layers and ${faceCount} faces.`);
  }

  if (pixelWidth === 0 || pixelHeight === 0) {
    return fail(source, `declares an empty extent of ${pixelWidth}x${pixelHeight}.`);
  }

  const levelIndexBytes = levelCount * 24;

  if (buffer.byteLength < headerBytes + levelIndexBytes) {
    return fail(source, `declares ${levelCount} levels, but the file is too short to hold their index.`);
  }

  const readLevel = (index: number): { readonly offset: number; readonly length: number } => {
    const entry = headerBytes + index * 24;
    // Both fields are 64-bit. A level beyond 2^53 bytes cannot exist, so reading
    // them as `BigUint64` and narrowing is pointless - but the high word still
    // has to be checked, or a corrupt header would silently truncate to a
    // plausible offset.
    const offsetHigh = view.getUint32(entry + 4, true);
    const lengthHigh = view.getUint32(entry + 12, true);

    if (offsetHigh !== 0 || lengthHigh !== 0) {
      fail(source, `level ${index} declares an offset or length above 4 GiB.`);
    }

    return { offset: view.getUint32(entry, true), length: view.getUint32(entry + 8, true) };
  };

  const sliceLevel = (index: number, expected: number): Uint8Array => {
    const { offset, length } = readLevel(index);

    if (length !== expected) {
      fail(source, `level ${index} declares ${length} bytes but its extent needs exactly ${expected}.`);
    }

    if (offset + length > buffer.byteLength) {
      fail(source, `level ${index} runs past the end of the file.`);
    }

    return bytes.subarray(offset, offset + length);
  };

  if (vkFormat === vkFormatRgba8Unorm || vkFormat === vkFormatRgba8Srgb) {
    if (levelCount > 1) {
      return fail(source, 'an uncompressed RGBA8 payload is only read as a single level, but the file declares a mip chain.');
    }

    return { kind: 'rgba8', width: pixelWidth, height: pixelHeight, data: sliceLevel(0, pixelWidth * pixelHeight * 4) };
  }

  const format = formatByVkFormat.get(vkFormat);

  if (format === undefined) {
    return fail(source, `vkFormat ${vkFormat} is not a texture format this engine can upload.`);
  }

  const levels: CompressedTextureLevel[] = [];

  // The level index runs mip 0 first, so it is read forwards; the mip extents
  // halve and never drop below one texel.
  for (let index = 0; index < levelCount; index++) {
    const width = Math.max(pixelWidth >> index, 1);
    const height = Math.max(pixelHeight >> index, 1);

    levels.push({ data: sliceLevel(index, compressedLevelByteLength(format, width, height)), width, height });
  }

  return { kind: 'compressed', format, levels };
};
