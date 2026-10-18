import { AssetDecodeError } from '#assets/AssetDecodeError';
import type { CompressedTextureLevel } from '#rendering/texture/compressedPayload';
import { compressedLevelByteLength, CompressedTextureFormat as Format } from '#rendering/texture/CompressedTextureFormat';
import type { Rgba8TextureLevel } from '#rendering/texture/pixelPayload';
import type { TextureAlphaMode, TextureColorSpace } from '#rendering/texture/TextureOptions';

import { type Ktx2Descriptor, parseKtx2Descriptor } from './ktx2Descriptor';
import { formatByVkFormat, ktx2LevelAlignment, vkFormatRgba8Srgb, vkFormatRgba8Unorm } from './ktx2Profile';

/** `«KTX 20»\r\n\x1A\n` - the 12-byte KTX2 file identifier. */
const identifier = Object.freeze([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Supercompression schemes, by their KTX2 numeric id. */
const supercompressionNames = new Map<number, string>([
  [1, 'BasisLZ'],
  [2, 'Zstandard'],
]);

/** Scheme 3: every level is a zlib stream, which the browser inflates natively. */
const zlibSupercompression = 3;

const headerBytes = 80;
const levelIndexEntryBytes = 24;
const supercompressionSchemeOffset = 44;
const alignTo = (value: number, alignment: number): number => Math.ceil(value / alignment) * alignment;
const maxInflatedKtx2Bytes = 256 * 1024 * 1024;

/** A KTX2 payload whose levels are already in a hardware format. */
export interface Ktx2CompressedPayload {
  readonly kind: 'compressed';
  readonly format: Format;
  readonly levels: readonly CompressedTextureLevel[];
  readonly colorSpace: TextureColorSpace;
  readonly alphaMode: TextureAlphaMode;
}

/** A KTX2 payload storing plain 8-bit RGBA texels. */
export interface Ktx2UncompressedPayload {
  readonly kind: 'rgba8';
  /** @deprecated Use `levels[0]`. Kept for existing parser consumers. */
  readonly width: number;
  /** @deprecated Use `levels[0]`. Kept for existing parser consumers. */
  readonly height: number;
  /** @deprecated Use `levels[0]`. Kept for existing parser consumers. */
  readonly data: Uint8Array;
  readonly levels: readonly Rgba8TextureLevel[];
  readonly colorSpace: TextureColorSpace;
  readonly alphaMode: TextureAlphaMode;
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
export const isKtx2 = (bytes: Uint8Array): boolean =>
  bytes.length >= identifier.length && identifier.every((expected, index) => bytes[index] === expected);

const fail = (source: string, message: string): never => {
  throw new AssetDecodeError({ message: `KTX2 file "${source}": ${message}`, assetType: 'ktx2' });
};

const isSrgbFormat = (format: Format | number): boolean =>
  format === vkFormatRgba8Srgb || (typeof format === 'string' && format.endsWith('srgb'));

/**
 * `KHR_DF_FLAG_ALPHA_PREMULTIPLIED`, bit 0 of the DFD flags byte.
 *
 * The bit - not a private encoding of it - is what tells a reader that RGB has
 * already been multiplied by alpha. Any other bit belongs to a different
 * registry flag and is rejected by the descriptor rather than treated as a
 * second spelling of premultiplied alpha.
 */
const dfdAlphaPremultiplied = 1;

const resolveColorMetadata = (
  source: string,
  vkFormat: number,
  format: Format | number,
  transferFunction: number,
  alphaFlags: number,
): { colorSpace: TextureColorSpace; alphaMode: TextureAlphaMode } => {
  const srgbStorage = isSrgbFormat(format);

  if ((srgbStorage && transferFunction !== 2) || (!srgbStorage && transferFunction === 2)) {
    return fail(source, `DFD transfer ${transferFunction} contradicts vkFormat ${vkFormat}.`);
  }

  let colorSpace: TextureColorSpace = 'none';

  if (transferFunction === 2) {
    colorSpace = 'srgb';
  } else if (transferFunction === 1) {
    colorSpace = 'linear-srgb';
  }

  return {
    colorSpace,
    alphaMode: alphaFlags === dfdAlphaPremultiplied ? 'premultiplied' : 'straight',
  };
};

const rgba8LevelByteLength = (source: string, width: number, height: number, index: number): number => {
  const length = width * height * 4;

  if (!Number.isSafeInteger(length)) {
    return fail(source, `level ${index} RGBA8 byte length is outside JavaScript's safe integer range.`);
  }

  return length;
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
 *   synchronous parser cannot decode (BasisLZ, Zstandard, ZLIB), a `vkFormat` outside the
 *   supported set, a non-2D target (array layers, cube faces, depth), or a level
 *   whose declared byte length does not match its extent.
 */
export const parseKtx2 = (buffer: ArrayBuffer, source: string): Ktx2Payload => {
  if (buffer.byteLength < headerBytes) {
    return fail(source, `file is ${buffer.byteLength} bytes, too short to hold a header.`);
  }

  const bytes = new Uint8Array(buffer);

  if (!isKtx2(bytes)) {
    return fail(source, 'file does not start with the KTX2 identifier.');
  }

  const descriptor = parseKtx2Descriptor(buffer, source);

  return materializeKtx2(buffer, source, descriptor);
};

/** Materializes native levels after container validation; a reader may supply inflated bytes. */
export const materializeKtx2 = (
  buffer: ArrayBuffer,
  source: string,
  descriptor: Ktx2Descriptor,
  readLevel?: (index: number, expected: number) => Uint8Array,
): Ktx2Payload => {
  const bytes = new Uint8Array(buffer);
  const { vkFormat, pixelWidth, pixelHeight, levelCount, supercompressionScheme } = descriptor;

  if (supercompressionScheme === zlibSupercompression && readLevel === undefined) {
    return fail(source, 'payload is still ZLIB-supercompressed. Run inflateKtx2Levels over the bytes before parsing them.');
  }

  if (supercompressionScheme !== 0 && (supercompressionScheme !== zlibSupercompression || readLevel === undefined)) {
    const name = supercompressionNames.get(supercompressionScheme) ?? `scheme ${supercompressionScheme}`;

    return fail(
      source,
      `payload uses ${name} supercompression, which this synchronous parser does not decode. Use the texture loader for supported universal or ZLIB payloads.`,
    );
  }

  const sliceLevel = (index: number, expected: number): Uint8Array => {
    if (readLevel !== undefined) {
      return readLevel(index, expected);
    }

    const level = descriptor.levels[index];

    if (level === undefined) {
      return fail(source, `level ${index} is missing from the validated index.`);
    }

    const { offset, length } = level;

    if (length !== expected) {
      fail(source, `level ${index} declares ${length} bytes but its extent needs exactly ${expected}.`);
    }

    return bytes.subarray(offset, offset + length);
  };

  if (vkFormat === vkFormatRgba8Unorm || vkFormat === vkFormatRgba8Srgb) {
    const metadata = resolveColorMetadata(source, vkFormat, vkFormat, descriptor.dfd.transferFunction, descriptor.dfd.flags);
    const levels: Rgba8TextureLevel[] = [];

    for (let index = 0; index < levelCount; index++) {
      const width = Math.max(Math.floor(pixelWidth / 2 ** index), 1);
      const height = Math.max(Math.floor(pixelHeight / 2 ** index), 1);

      levels.push({ data: sliceLevel(index, rgba8LevelByteLength(source, width, height, index)), width, height });
    }

    const base = levels[0];

    if (base === undefined) {
      return fail(source, 'has no base RGBA8 level.');
    }

    return { kind: 'rgba8', width: base.width, height: base.height, data: base.data, levels, ...metadata };
  }

  const format = formatByVkFormat.get(vkFormat);

  if (format === undefined) {
    return fail(source, `vkFormat ${vkFormat} is not a texture format this engine can upload.`);
  }

  const metadata = resolveColorMetadata(source, vkFormat, format, descriptor.dfd.transferFunction, descriptor.dfd.flags);

  if ((format === Format.Bc1RgbUnorm || format === Format.Bc1RgbUnormSrgb) && metadata.alphaMode === 'premultiplied') {
    return fail(source, `DFD alpha association contradicts opaque vkFormat ${vkFormat}.`);
  }

  if (descriptor.declaredLevelCount === 0) {
    return fail(
      source,
      'compressed payload declares levelCount 0, which requests generated mips that cannot be represented by compressed data.',
    );
  }

  const levels: CompressedTextureLevel[] = [];

  // The level index runs mip 0 first, so it is read forwards; the mip extents
  // halve and never drop below one texel.
  for (let index = 0; index < levelCount; index++) {
    const width = Math.max(Math.floor(pixelWidth / 2 ** index), 1);
    const height = Math.max(Math.floor(pixelHeight / 2 ** index), 1);

    levels.push({ data: sliceLevel(index, compressedLevelByteLength(format, width, height)), width, height });
  }

  return { kind: 'compressed', format, levels, ...metadata };
};

/** Inflates validated ZLIB levels directly into their final CPU payload. */
export const inflateKtx2Payload = async (
  buffer: ArrayBuffer,
  source: string,
  descriptor: Ktx2Descriptor,
  signal?: AbortSignal,
): Promise<Ktx2Payload> => {
  throwIfAborted(signal);
  let decodedBytes = 0;

  for (const level of descriptor.levels) {
    decodedBytes += level.uncompressedByteLength;

    if (!Number.isSafeInteger(decodedBytes) || decodedBytes > maxInflatedKtx2Bytes) {
      return fail(source, `exceeds the ${maxInflatedKtx2Bytes}-byte ZLIB safety budget.`);
    }
  }

  const payload = materializeKtx2(buffer, source, descriptor, (index, expected) => {
    if (descriptor.levels[index]?.uncompressedByteLength !== expected) {
      return fail(source, `level ${index} inflated byte length must be ${expected}.`);
    }

    return new Uint8Array(expected);
  });

  if (typeof DecompressionStream === 'undefined') {
    return fail(source, 'ZLIB requires DecompressionStream.');
  }

  const bytes = new Uint8Array(buffer);

  for (const [index, level] of descriptor.levels.entries()) {
    const destination = payload.levels[index];

    if (destination === undefined) {
      return fail(source, `level ${index} is missing.`);
    }

    await inflateZlib(bytes.subarray(level.offset, level.offset + level.length), destination.data, source, index, signal);
  }

  return payload;
};

/**
 * Inflate the levels of a ZLIB-supercompressed KTX2 container.
 *
 * Scheme 3 stores every mip level as a zlib stream, which the browser inflates
 * natively through `DecompressionStream` - no decoder ships with the engine, so
 * this supercompression scheme needs no bundled decoder. This helper leaves
 * universal payloads to the asynchronous texture decoder.
 *
 * Returns `buffer` itself when the container is not ZLIB-supercompressed, so it
 * can sit in front of {@link parseKtx2} unconditionally. The result is an
 * equivalent container with scheme 0 and its level index rewritten, while each
 * stream writes directly into its prevalidated destination range.
 *
 * `source` only names the file in error messages.
 *
 * @throws AssetDecodeError - a level whose inflated size exceeds or does not
 *   match the declared range, a decoded payload over the byte budget, or a
 *   runtime without `DecompressionStream`.
 */
export const inflateKtx2Levels = async (buffer: ArrayBuffer, source: string, signal?: AbortSignal): Promise<ArrayBuffer> => {
  if (buffer.byteLength < headerBytes) {
    return buffer;
  }

  const bytes = new Uint8Array(buffer);

  if (!isKtx2(bytes)) {
    return buffer;
  }

  const view = new DataView(buffer);

  if (view.getUint32(supercompressionSchemeOffset, true) !== zlibSupercompression) {
    return buffer;
  }

  const descriptor = parseKtx2Descriptor(buffer, source);

  if (typeof DecompressionStream === 'undefined') {
    return fail(
      source,
      'payload is ZLIB-supercompressed, which needs DecompressionStream. Ship the container uncompressed for this runtime.',
    );
  }

  // Everything the header points at other than level data - the format
  // descriptor, the key/value data, the supercompression global data - lives
  // before the first level and is referenced by absolute offset, so that prefix
  // is copied verbatim and only the levels move.
  const { levels } = descriptor;
  // The rebuilt container is uncompressed, so its levels sit on the native alignment of the format.
  const alignment = ktx2LevelAlignment(descriptor.vkFormat);
  const prefixBytes = Math.min(...levels.map(({ offset }) => offset));
  const alignedPrefixBytes = alignTo(prefixBytes, alignment);
  let decodedBytes = 0;
  let resultBytes = alignedPrefixBytes;

  for (const [index, level] of levels.entries()) {
    if (level.uncompressedByteLength === 0) {
      return fail(source, `level ${index} declares an empty inflated byte range.`);
    }

    decodedBytes += level.uncompressedByteLength;
    resultBytes = alignTo(resultBytes + level.uncompressedByteLength, alignment);

    if (
      !Number.isSafeInteger(decodedBytes) ||
      !Number.isSafeInteger(resultBytes) ||
      decodedBytes > maxInflatedKtx2Bytes ||
      resultBytes > maxInflatedKtx2Bytes
    ) {
      return fail(source, `declares ${decodedBytes} decoded bytes, exceeding the ${maxInflatedKtx2Bytes}-byte ZLIB safety budget.`);
    }
  }

  throwIfAborted(signal);
  const result = new Uint8Array(resultBytes);

  result.set(bytes.subarray(0, prefixBytes));

  const resultView = new DataView(result.buffer);

  resultView.setUint32(supercompressionSchemeOffset, 0, true);

  // Written back in the container's own storage order (smallest level first), so
  // the rewritten offsets stay monotonic with the bytes they name.
  let cursor = alignedPrefixBytes;

  const storageOrder = levels.map((level, index) => ({ index, offset: level.offset })).sort((a, b) => a.offset - b.offset);

  for (const { index } of storageOrder) {
    const level = levels[index];

    if (level === undefined) {
      return fail(source, `level ${index} is missing from the validated index.`);
    }

    const entry = headerBytes + index * levelIndexEntryBytes;

    await inflateZlib(
      bytes.subarray(level.offset, level.offset + level.length),
      result.subarray(cursor, cursor + level.uncompressedByteLength),
      source,
      index,
      signal,
    );
    resultView.setUint32(entry, cursor, true);
    resultView.setUint32(entry + 8, level.uncompressedByteLength, true);
    cursor = alignTo(cursor + level.uncompressedByteLength, alignment);
  }

  return result.buffer;
};

const abortError = (signal: AbortSignal): Error => {
  if (signal.reason instanceof Error && signal.reason.name === 'AbortError') {
    return signal.reason;
  }

  return new DOMException('The operation was aborted.', 'AbortError');
};

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw abortError(signal);
  }
};

// The buffer generic is explicit because DecompressionStream only accepts a view
// over a plain ArrayBuffer, which a Uint8Array is not required to be.
const ignoreRejection = (): void => undefined;

const inflateZlib = async (
  data: Uint8Array<ArrayBuffer>,
  destination: Uint8Array,
  source: string,
  index: number,
  signal?: AbortSignal,
): Promise<void> => {
  throwIfAborted(signal);

  const decompressor = new DecompressionStream('deflate');
  const writer = decompressor.writable.getWriter();
  const reader = decompressor.readable.getReader();
  const pump = (async (): Promise<void> => {
    await writer.write(data);
    await writer.close();
  })();
  void pump.catch(ignoreRejection);

  const cancel = (): void => {
    void reader.cancel().catch(ignoreRejection);
    void writer.abort().catch(ignoreRejection);
  };

  const onAbort = (): void => cancel();
  let cursor = 0;

  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    throwIfAborted(signal);

    for (;;) {
      const { done, value } = await reader.read();

      throwIfAborted(signal);

      if (done) {
        break;
      }

      if (value.byteLength > destination.byteLength - cursor) {
        cancel();

        return fail(source, `level ${index} inflates to ${cursor + value.byteLength} bytes but declares ${destination.byteLength}.`);
      }

      destination.set(value, cursor);
      cursor += value.byteLength;
    }

    await pump;

    if (cursor !== destination.byteLength) {
      return fail(source, `level ${index} inflates to ${cursor} bytes but declares ${destination.byteLength}.`);
    }
  } catch (error) {
    cancel();
    await pump.catch(ignoreRejection);

    if (signal?.aborted === true) {
      throw abortError(signal);
    }

    if (error instanceof AssetDecodeError) {
      throw error;
    }

    return fail(source, `level ${index} cannot be inflated as a complete ZLIB stream.`);
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
    writer.releaseLock();
  }
};
