import { AssetDecodeError } from '#assets/AssetDecodeError';

import { dfdSampleFloat, dfdSampleLinear, dfdSampleSigned, type Ktx2FormatProfile, ktx2FormatProfile, ktx2LevelAlignment } from './ktx2Profile';

const headerBytes = 80;
const levelIndexEntryBytes = 24;
const requiredDfdBytes = 28;
const dfdBasicFormatVersion = 2;
const dfdModelRgbSda = 1;
/** Bits of a sample's channel type that carry the channel id; the high nibble holds the qualifiers. */
const dfdChannelIdMask = 0x0f;
const dfdSampleQualifierMask = 0xf0;
const dfdPrimariesBt709 = 1;
const dfdTransferLinear = 1;
const dfdTransferSrgb = 2;
/**
 * `KHR_DF_FLAG_ALPHA_PREMULTIPLIED` is bit 0 of the DFD flags byte, so the
 * descriptor permits only 0 (straight, the default) and 1 (premultiplied). Any
 * other bit belongs to a different registry flag and is rejected rather than
 * guessed at, because guessing turns a malformed descriptor into wrong alpha.
 */
const dfdAlphaPremultiplied = 1;

export interface Ktx2DataRange {
  readonly offset: number;
  readonly length: number;
}

export interface Ktx2LevelRange extends Ktx2DataRange {
  readonly uncompressedByteLength: number;
}

export interface Ktx2DfdDescriptor {
  readonly hasAlpha?: boolean;
  readonly colorPrimaries: number;
  readonly transferFunction: number;
  readonly flags: number;
}

export interface Ktx2Descriptor {
  readonly universal?: 'etc1s' | 'uastc';
  readonly vkFormat: number;
  readonly typeSize: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly levelCount: number;
  readonly declaredLevelCount: number;
  readonly supercompressionScheme: number;
  readonly levels: readonly Ktx2LevelRange[];
  readonly dfd: Ktx2DfdDescriptor;
}

interface NamedRange extends Ktx2DataRange {
  readonly name: string;
}

const fail = (source: string, message: string): never => {
  throw new AssetDecodeError({ message: `KTX2 file "${source}": ${message}`, assetType: 'ktx2' });
};

const readUint64 = (view: DataView, offset: number, source: string, name: string): number => {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  const value = high * 0x1_0000_0000 + low;

  if (!Number.isSafeInteger(value)) {
    return fail(source, `${name} is outside JavaScript's safe integer range.`);
  }

  return value;
};

const addRange = (ranges: NamedRange[], range: NamedRange, byteLength: number, source: string, alignment: number): void => {
  if (range.offset % alignment !== 0) {
    fail(source, `${range.name} offset ${range.offset} is not aligned to ${alignment} bytes.`);
  }

  if (range.length === 0) {
    return;
  }

  const end = range.offset + range.length;

  if (!Number.isSafeInteger(end) || end > byteLength) {
    fail(source, `${range.name} runs outside the file.`);
  }

  for (const other of ranges) {
    const otherEnd = other.offset + other.length;

    if (range.offset < otherEnd && other.offset < end) {
      fail(source, `${range.name} overlaps ${other.name}.`);
    }
  }

  ranges.push(range);
};

const validateDfdBlockSize = (view: DataView, range: Ktx2DataRange, source: string, totalSize: number): number => {
  const vendorId = view.getUint16(range.offset + 4, true);
  const descriptorType = view.getUint16(range.offset + 6, true);
  const versionNumber = view.getUint16(range.offset + 8, true);
  const descriptorBlockSize = view.getUint16(range.offset + 10, true);

  if (vendorId !== 0 || descriptorType !== 0 || versionNumber !== dfdBasicFormatVersion) {
    return fail(source, `DFD uses unsupported vendor ${vendorId}, descriptor type ${descriptorType}, or version ${versionNumber}.`);
  }

  if (descriptorBlockSize + 4 !== totalSize || descriptorBlockSize < 24 || (descriptorBlockSize - 24) % 16 !== 0) {
    return fail(source, 'DFD basic descriptor has an invalid block size.');
  }

  return descriptorBlockSize;
};

const validateDfdColorFields = (view: DataView, range: Ktx2DataRange, source: string, expectedModel: number): Ktx2DfdDescriptor => {
  const colorModel = view.getUint8(range.offset + 12);
  const colorPrimaries = view.getUint8(range.offset + 13);
  const transferFunction = view.getUint8(range.offset + 14);
  const flags = view.getUint8(range.offset + 15);

  if (colorModel !== expectedModel) {
    return fail(source, `DFD describes color model ${colorModel}, but this vkFormat requires ${expectedModel}.`);
  }

  if (colorPrimaries !== 0 && colorPrimaries !== dfdPrimariesBt709) {
    return fail(source, `DFD uses unsupported color primaries ${colorPrimaries}.`);
  }

  if (transferFunction !== 0 && transferFunction !== dfdTransferLinear && transferFunction !== dfdTransferSrgb) {
    return fail(source, `DFD uses unsupported DFD transfer ${transferFunction}.`);
  }

  if (flags !== 0 && flags !== dfdAlphaPremultiplied) {
    return fail(source, `DFD uses unsupported alpha flags ${flags}; the descriptor defines only 0 (straight) and 1 (premultiplied).`);
  }

  return { colorPrimaries, transferFunction, flags };
};

const validateDfdSinglePlane = (view: DataView, range: Ktx2DataRange, source: string, profile: Ktx2FormatProfile | undefined): void => {
  if (view.getUint8(range.offset + 18) !== 0 || view.getUint8(range.offset + 19) !== 0) {
    fail(source, 'DFD declares a depth or array texel block dimension.');
  }

  let planeCount = 0;

  for (let index = 0; index < 8; index++) {
    const bytesPlane = view.getUint8(range.offset + 20 + index);

    if (bytesPlane !== 0) {
      planeCount++;

      if (index !== 0) {
        fail(source, 'DFD declares multiple byte planes.');
      }
    }
  }

  if (planeCount !== 1) {
    fail(source, 'DFD does not declare exactly one byte plane.');
  }

  if (profile === undefined) {
    return;
  }

  // The block dimensions are stored minus one.
  const blockWidth = view.getUint8(range.offset + 16) + 1;
  const blockHeight = view.getUint8(range.offset + 17) + 1;
  const blockBytes = view.getUint8(range.offset + 20);

  if (blockWidth !== profile.blockWidth || blockHeight !== profile.blockHeight || blockBytes !== profile.blockBytes) {
    fail(
      source,
      `DFD declares a ${blockWidth}x${blockHeight} block of ${blockBytes} bytes, but this vkFormat uses ${profile.blockWidth}x${profile.blockHeight} blocks of ${profile.blockBytes} bytes.`,
    );
  }
};

const validateDfdSamples = (
  view: DataView,
  range: Ktx2DataRange,
  source: string,
  descriptorBlockSize: number,
  profile: Ktx2FormatProfile | undefined,
): void => {
  const sampleCount = (descriptorBlockSize - 24) / 16;

  if (sampleCount === 0) {
    fail(source, 'DFD has no samples.');
  }

  for (let index = 0; index < sampleCount; index++) {
    const channelType = view.getUint8(range.offset + 28 + index * 16 + 3);
    const channelId = channelType & dfdChannelIdMask;
    const qualifiers = channelType & dfdSampleQualifierMask;

    if (![0, 1, 2, 3, 15].includes(channelId)) {
      fail(source, `DFD sample ${index} uses unsupported channel ${channelId}.`);
    }

    // The linear bit is legitimate anywhere - a linear alpha channel beside sRGB colour is how
    // the registry describes an sRGB texture. The signed and float bits state the data type, so
    // they must agree with the format; the exponent bit belongs to no supported format.
    const dataType = qualifiers & ~dfdSampleLinear;
    const expected = profile === undefined ? 0 : profile.sampleQualifier & (dfdSampleSigned | dfdSampleFloat);

    if (dataType !== expected) {
      fail(source, `DFD sample ${index} carries qualifier bits 0x${qualifiers.toString(16)}, which do not describe this vkFormat's data type.`);
    }
  }
};

const validateUniversalPlanes = (view: DataView, range: Ktx2DataRange, source: string, etc1s: boolean, hasAlpha: boolean): void => {
  for (let plane = 0; plane < 8; plane++) {
    let expected = 0;
    if (plane === 0) expected = etc1s ? 8 : 16;
    else if (plane === 1 && etc1s && hasAlpha) expected = 8;
    // Supercompressed authors may leave the byte planes unspecified.
    const actual = view.getUint8(range.offset + 20 + plane);
    if (actual !== 0 && actual !== expected) fail(source, 'universal DFD has inconsistent byte planes.');
  }
};

const validateUniversalSamples = (view: DataView, range: Ktx2DataRange, source: string, etc1s: boolean, sampleCount: number, channel: number): void => {
  for (let sample = 0; sample < sampleCount; sample++) {
    const offset = range.offset + 28 + sample * 16;
    const expectedChannel = sample === 0 ? channel : 15;
    const expectedBits = etc1s ? 63 : 127;
    if (
      view.getUint16(offset, true) !== sample * 64 ||
      view.getUint8(offset + 2) !== expectedBits ||
      (view.getUint8(offset + 3) & ~dfdSampleLinear) !== expectedChannel ||
      view.getUint32(offset + 4, true) !== 0 ||
      view.getUint32(offset + 8, true) !== 0 ||
      view.getUint32(offset + 12, true) !== 0xffffffff
    )
      fail(source, 'universal DFD has inconsistent sample fields.');
  }
};

const validateUniversalDfd = (view: DataView, range: Ktx2DataRange, source: string, model: number, blockSize: number): Ktx2DfdDescriptor => {
  const descriptor = validateDfdColorFields(view, range, source, model);
  const etc1s = model === 163;
  const sampleCount = (blockSize - 24) / 16;
  if (sampleCount < 1 || sampleCount > (etc1s ? 2 : 1)) return fail(source, 'universal DFD must describe RGB or RGBA channels.');
  const channel = view.getUint8(range.offset + 31) & ~dfdSampleLinear;
  const hasAlpha = etc1s ? sampleCount === 2 : channel === 3;

  if (sampleCount !== (etc1s && hasAlpha ? 2 : 1) || (etc1s ? channel !== 0 : channel !== 0 && channel !== 3)) {
    return fail(source, 'universal DFD must describe RGB or RGBA channels.');
  }

  if (view.getUint8(range.offset + 16) !== 3 || view.getUint8(range.offset + 17) !== 3 || view.getUint16(range.offset + 18, true) !== 0) {
    return fail(source, 'universal DFD must describe 4x4 2D blocks.');
  }

  validateUniversalPlanes(view, range, source, etc1s, hasAlpha);
  validateUniversalSamples(view, range, source, etc1s, sampleCount, channel);

  if (!hasAlpha && descriptor.flags !== 0) fail(source, 'opaque universal DFD cannot declare premultiplied alpha.');
  return { ...descriptor, hasAlpha };
};

const validateDfd = (view: DataView, range: Ktx2DataRange, source: string, vkFormat: number): Ktx2DfdDescriptor => {
  if (range.length < requiredDfdBytes) {
    return fail(source, `required DFD is ${range.length} bytes, shorter than its ${requiredDfdBytes}-byte basic descriptor.`);
  }

  const totalSize = view.getUint32(range.offset, true);

  if (totalSize !== range.length) {
    return fail(source, `required DFD declares ${totalSize} bytes but its index names ${range.length}.`);
  }

  // A format the engine cannot upload has no profile; it keeps the RGBSDA expectation so the
  // failure that follows names the format rather than its descriptor.
  const profile = ktx2FormatProfile(vkFormat);
  const descriptorBlockSize = validateDfdBlockSize(view, range, source, totalSize);
  const model = view.getUint8(range.offset + 12);
  if (vkFormat === 0 && (model === 163 || model === 166)) {
    return validateUniversalDfd(view, range, source, model, descriptorBlockSize);
  }
  const descriptor = validateDfdColorFields(view, range, source, profile?.dfdModel ?? dfdModelRgbSda);

  validateDfdSinglePlane(view, range, source, profile);
  validateDfdSamples(view, range, source, descriptorBlockSize, profile);

  return descriptor;
};

const decodeUtf8 = (bytes: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

/** A known text value: UTF-8 with the single terminating NUL the container stores. */
const decodeKtxTextValue = (bytes: Uint8Array, source: string, key: string): string => {
  const end = bytes.length > 0 && bytes[bytes.length - 1] === 0 ? bytes.length - 1 : bytes.length;
  const value = bytes.subarray(0, end);

  if (value.includes(0)) {
    return fail(source, `KVD ${key} contains an embedded NUL.`);
  }

  try {
    return decodeUtf8(value);
  } catch {
    return fail(source, `KVD ${key} is not valid UTF-8.`);
  }
};

/** `KTXorientation` values that name the top-down row order the engine's textures use. */
const topDownOrientations: ReadonlySet<string> = new Set(['rd', 'S=r,T=d']);
const bottomUpOrientations: ReadonlySet<string> = new Set(['ru', 'S=r,T=u']);

const validateKeyValueData = (bytes: Uint8Array, range: Ktx2DataRange, source: string): void => {
  let cursor = range.offset;
  const end = range.offset + range.length;
  let orientation: string | undefined;
  let swizzle: string | undefined;

  while (cursor < end) {
    if (end - cursor < 4) {
      return fail(source, 'KVD ends inside an entry length.');
    }

    const entryLength = new DataView(bytes.buffer, bytes.byteOffset + cursor, 4).getUint32(0, true);
    cursor += 4;

    if (entryLength === 0 || entryLength > end - cursor) {
      return fail(source, 'KVD entry runs outside its indexed range.');
    }

    const entry = bytes.subarray(cursor, cursor + entryLength);
    const keyEnd = entry.indexOf(0);

    if (keyEnd < 1) {
      return fail(source, 'KVD entry has no key terminator.');
    }

    let key: string;

    try {
      key = decodeUtf8(entry.subarray(0, keyEnd));
    } catch {
      return fail(source, 'KVD entry has a key that is not valid UTF-8.');
    }

    // Values are arbitrary bytes for every key this reader does not own; only the two it acts on are read as text.
    const value = entry.subarray(keyEnd + 1);

    if (key === 'KTXorientation') {
      if (orientation !== undefined) {
        return fail(source, 'KVD contains KTXorientation more than once.');
      }

      orientation = decodeKtxTextValue(value, source, key);
    } else if (key === 'KTXswizzle') {
      if (swizzle !== undefined) {
        return fail(source, 'KVD contains KTXswizzle more than once.');
      }

      swizzle = decodeKtxTextValue(value, source, key);
    }

    cursor += entryLength;
    cursor = Math.ceil(cursor / 4) * 4;

    if (cursor > end) {
      return fail(source, 'KVD padding runs outside its indexed range.');
    }
  }

  if (orientation !== undefined && !topDownOrientations.has(orientation)) {
    return fail(
      source,
      bottomUpOrientations.has(orientation)
        ? `KVD declares the bottom-up orientation "${orientation}", which this engine does not flip; author the texture top-down ("rd").`
        : `KVD uses unsupported orientation "${orientation}".`,
    );
  }

  if (swizzle !== undefined && swizzle !== 'rgba') {
    return fail(source, `KVD uses unsupported swizzle "${swizzle}".`);
  }
};

const validateEtc1sPayload = (view: DataView, sgd: Ktx2DataRange, source: string, descriptor: Ktx2Descriptor): void => {
  const { supercompressionScheme, levelCount, levels, dfd } = descriptor;
  if (supercompressionScheme !== 1 || sgd.length < 20 + levelCount * 20) fail(source, 'ETC1S requires BasisLZ and complete SGD data.');
  let globalBytes = 20 + levelCount * 20;
  for (const offset of [4, 8, 12, 16]) globalBytes += view.getUint32(sgd.offset + offset, true);
  if (globalBytes !== sgd.length) fail(source, 'ETC1S SGD tables do not match the indexed range.');
  for (const [index, level] of levels.entries()) {
    if (level.uncompressedByteLength !== 0) fail(source, 'BasisLZ level uncompressed byte length must be zero.');
    const entry = sgd.offset + 20 + index * 20;
    if (view.getUint32(entry, true) !== 0) fail(source, 'ETC1S video frames are unsupported.');
    const rgbOffset = view.getUint32(entry + 4, true),
      rgbLength = view.getUint32(entry + 8, true);
    const alphaOffset = view.getUint32(entry + 12, true),
      alphaLength = view.getUint32(entry + 16, true);
    if (
      rgbLength === 0 ||
      rgbOffset + rgbLength > level.length ||
      (dfd.hasAlpha === true
        ? alphaLength === 0 || alphaOffset + alphaLength > level.length || alphaOffset < rgbOffset + rgbLength
        : alphaOffset !== 0 || alphaLength !== 0)
    ) {
      fail(source, `ETC1S level ${index} has invalid RGB/alpha slices.`);
    }
  }
};

const validateUniversalPayload = (view: DataView, sgd: Ktx2DataRange, source: string, descriptor: Ktx2Descriptor): void => {
  const { universal, declaredLevelCount, supercompressionScheme, levels, pixelWidth, pixelHeight } = descriptor;
  if (universal === undefined) return;
  if (declaredLevelCount === 0) fail(source, 'universal payload must carry authored mips.');
  if (universal === 'etc1s') {
    validateEtc1sPayload(view, sgd, source, descriptor);
    return;
  }
  if ((supercompressionScheme !== 0 && supercompressionScheme !== 2) || sgd.length > 0) fail(source, 'UASTC requires scheme 0 or Zstandard and no SGD.');
  for (const [index, level] of levels.entries()) {
    const width = Math.max(Math.floor(pixelWidth / 2 ** index), 1),
      height = Math.max(Math.floor(pixelHeight / 2 ** index), 1);
    const expected = Math.ceil(width / 4) * Math.ceil(height / 4) * 16;
    if (!Number.isSafeInteger(expected) || level.uncompressedByteLength !== expected)
      fail(source, `UASTC level ${index} has inconsistent uncompressed byte length.`);
  }
};

const universalFormat = (vkFormat: number, model: number): Ktx2Descriptor['universal'] => {
  if (vkFormat !== 0) return undefined;
  if (model === 163) return 'etc1s';
  if (model === 166) return 'uastc';
  return undefined;
};

const levelAlignmentFor = (vkFormat: number, scheme: number): number => {
  if (scheme !== 0) return 1;
  return vkFormat === 0 ? 16 : ktx2LevelAlignment(vkFormat);
};

/**
 * Validates the KTX2 index and source profile before callers inspect level data.
 *
 * The returned ranges alias the input buffer. Callers must finish format-specific
 * size checks before exposing the bytes to an upload path.
 */
export const parseKtx2Descriptor = (buffer: ArrayBuffer, source: string): Ktx2Descriptor => {
  if (buffer.byteLength < headerBytes) {
    return fail(source, `file is ${buffer.byteLength} bytes, too short to hold a header.`);
  }

  const view = new DataView(buffer);
  const declaredLevelCount = view.getUint32(40, true);
  const levelCount = Math.max(declaredLevelCount, 1);
  const pixelWidth = view.getUint32(20, true);
  const pixelHeight = view.getUint32(24, true);
  const pixelDepth = view.getUint32(28, true);
  const layerCount = view.getUint32(32, true);
  const faceCount = view.getUint32(36, true);

  if (pixelWidth === 0 || pixelHeight === 0) {
    return fail(source, `declares an empty extent of ${pixelWidth}x${pixelHeight}.`);
  }

  if (pixelDepth !== 0 || layerCount !== 0 || faceCount !== 1) {
    return fail(
      source,
      `only 2D single-layer textures are supported; the file must be a non-array 2D texture but declares depth ${pixelDepth}, ${layerCount} layers and ${faceCount} faces.`,
    );
  }

  const maximumLevels = Math.floor(Math.log2(Math.max(pixelWidth, pixelHeight))) + 1;

  if (levelCount > maximumLevels) {
    return fail(source, `declares ${levelCount} levels for a ${pixelWidth}x${pixelHeight} texture, but at most ${maximumLevels} are possible.`);
  }

  const levelIndexBytes = levelCount * levelIndexEntryBytes;

  if (!Number.isSafeInteger(levelIndexBytes) || headerBytes + levelIndexBytes > buffer.byteLength) {
    return fail(source, `declares ${levelCount} levels, but the file is too short to hold their index.`);
  }

  const ranges: NamedRange[] = [{ name: 'header', offset: 0, length: headerBytes }];
  addRange(ranges, { name: 'level index', offset: headerBytes, length: levelIndexBytes }, buffer.byteLength, source, 4);

  const dfd: NamedRange = {
    name: 'DFD',
    offset: view.getUint32(48, true),
    length: view.getUint32(52, true),
  };

  if (dfd.length === 0) {
    return fail(source, 'required DFD is missing.');
  }

  addRange(ranges, dfd, buffer.byteLength, source, 4);

  const kvd: NamedRange = {
    name: 'KVD',
    offset: view.getUint32(56, true),
    length: view.getUint32(60, true),
  };
  addRange(ranges, kvd, buffer.byteLength, source, 4);

  const sgd: NamedRange = {
    name: 'SGD',
    offset: readUint64(view, 64, source, 'SGD offset'),
    length: readUint64(view, 72, source, 'SGD length'),
  };
  addRange(ranges, sgd, buffer.byteLength, source, 8);

  const vkFormat = view.getUint32(12, true);
  const supercompressionScheme = view.getUint32(44, true);
  // A supercompressed level is an opaque stream; only an uncompressed one has native texel data to align.
  const levelAlignment = levelAlignmentFor(vkFormat, supercompressionScheme);
  const levels: Ktx2LevelRange[] = [];

  for (let index = 0; index < levelCount; index++) {
    const entry = headerBytes + index * levelIndexEntryBytes;
    const range: NamedRange = {
      name: `level ${index}`,
      offset: readUint64(view, entry, source, `level ${index} offset`),
      length: readUint64(view, entry + 8, source, `level ${index} length`),
    };

    if (range.length === 0) {
      return fail(source, `level ${index} has an empty byte range.`);
    }

    addRange(ranges, range, buffer.byteLength, source, levelAlignment);

    const uncompressedByteLength = readUint64(view, entry + 16, source, `level ${index} uncompressed byte length`);

    if (supercompressionScheme === 0 && uncompressedByteLength !== range.length) {
      return fail(
        source,
        `level ${index} declares ${range.length} stored bytes but ${uncompressedByteLength} uncompressed bytes, which must agree without supercompression.`,
      );
    }

    levels.push({ offset: range.offset, length: range.length, uncompressedByteLength });
  }

  const dfdDescriptor = validateDfd(view, dfd, source, vkFormat);
  const model = view.getUint8(dfd.offset + 12);
  const universal = universalFormat(vkFormat, model);
  const bytes = new Uint8Array(buffer);
  validateKeyValueData(bytes, kvd, source);

  if (supercompressionScheme === 0 && sgd.length > 0) {
    return fail(source, 'non-supercompressed payload has unexpected SGD data.');
  }

  if (view.getUint32(16, true) !== 1) {
    return fail(source, `declares typeSize ${view.getUint32(16, true)}, but this 8-bit native profile requires 1.`);
  }

  const descriptor: Ktx2Descriptor = {
    ...(universal !== undefined && { universal }),
    vkFormat,
    typeSize: view.getUint32(16, true),
    pixelWidth,
    pixelHeight,
    levelCount,
    declaredLevelCount,
    supercompressionScheme,
    levels,
    dfd: dfdDescriptor,
  };
  validateUniversalPayload(view, sgd, source, descriptor);
  return descriptor;
};
