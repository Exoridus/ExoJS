import { AssetDecodeError } from '#assets/AssetDecodeError';

const headerBytes = 80;
const levelIndexEntryBytes = 24;
const requiredDfdBytes = 28;
const dfdBasicFormatVersion = 2;
const dfdModelRgbSda = 1;
const dfdPrimariesBt709 = 1;
const dfdTransferLinear = 1;
const dfdTransferSrgb = 2;
const dfdAlphaStraight = 1;
const dfdAlphaPremultiplied = 2;

export interface Ktx2DataRange {
  readonly offset: number;
  readonly length: number;
}

export interface Ktx2LevelRange extends Ktx2DataRange {
  readonly uncompressedByteLength: number;
}

export interface Ktx2DfdDescriptor {
  readonly colorPrimaries: number;
  readonly transferFunction: number;
  readonly flags: number;
}

export interface Ktx2Descriptor {
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

const validateDfdColorFields = (view: DataView, range: Ktx2DataRange, source: string): Ktx2DfdDescriptor => {
  const colorModel = view.getUint8(range.offset + 12);
  const colorPrimaries = view.getUint8(range.offset + 13);
  const transferFunction = view.getUint8(range.offset + 14);
  const flags = view.getUint8(range.offset + 15);

  if (colorModel !== dfdModelRgbSda) {
    return fail(source, `DFD uses unsupported color model ${colorModel}.`);
  }

  if (colorPrimaries !== 0 && colorPrimaries !== dfdPrimariesBt709) {
    return fail(source, `DFD uses unsupported color primaries ${colorPrimaries}.`);
  }

  if (transferFunction !== 0 && transferFunction !== dfdTransferLinear && transferFunction !== dfdTransferSrgb) {
    return fail(source, `DFD uses unsupported DFD transfer ${transferFunction}.`);
  }

  if (flags !== 0 && flags !== dfdAlphaStraight && flags !== dfdAlphaPremultiplied) {
    return fail(source, `DFD uses unsupported alpha flags ${flags}.`);
  }

  return { colorPrimaries, transferFunction, flags };
};

const validateDfdSinglePlane = (view: DataView, range: Ktx2DataRange, source: string): void => {
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
};

const validateDfdSamples = (view: DataView, range: Ktx2DataRange, source: string, descriptorBlockSize: number): void => {
  const sampleCount = (descriptorBlockSize - 24) / 16;

  if (sampleCount === 0) {
    fail(source, 'DFD has no samples.');
  }

  for (let index = 0; index < sampleCount; index++) {
    const channelType = view.getUint8(range.offset + 28 + index * 16 + 3);

    if ((channelType & 0xf0) !== 0 || ![0, 1, 2, 3, 15].includes(channelType)) {
      fail(source, `DFD sample ${index} uses unsupported channel flags ${channelType}.`);
    }
  }
};

const validateDfd = (view: DataView, range: Ktx2DataRange, source: string): Ktx2DfdDescriptor => {
  if (range.length < requiredDfdBytes) {
    return fail(source, `required DFD is ${range.length} bytes, shorter than its ${requiredDfdBytes}-byte basic descriptor.`);
  }

  const totalSize = view.getUint32(range.offset, true);

  if (totalSize !== range.length) {
    return fail(source, `required DFD declares ${totalSize} bytes but its index names ${range.length}.`);
  }

  const descriptorBlockSize = validateDfdBlockSize(view, range, source, totalSize);
  const descriptor = validateDfdColorFields(view, range, source);

  validateDfdSinglePlane(view, range, source);
  validateDfdSamples(view, range, source, descriptorBlockSize);

  return descriptor;
};

const decodeUtf8 = (bytes: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

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
    let value: string;

    try {
      key = decodeUtf8(entry.subarray(0, keyEnd));
      value = decodeUtf8(entry.subarray(keyEnd + 1));
    } catch {
      return fail(source, 'KVD entry is not valid UTF-8.');
    }

    if (key === 'KTXorientation') {
      if (orientation !== undefined) {
        return fail(source, 'KVD contains KTXorientation more than once.');
      }

      orientation = value;
    } else if (key === 'KTXswizzle') {
      if (swizzle !== undefined) {
        return fail(source, 'KVD contains KTXswizzle more than once.');
      }

      swizzle = value;
    }

    cursor += entryLength;
    cursor = Math.ceil(cursor / 4) * 4;

    if (cursor > end) {
      return fail(source, 'KVD padding runs outside its indexed range.');
    }
  }

  if (orientation !== undefined && orientation !== 'S=r,T=d' && orientation !== 'S=r,T=u') {
    return fail(source, `KVD uses unsupported orientation "${orientation}".`);
  }

  if (swizzle !== undefined && swizzle !== 'rgba') {
    return fail(source, `KVD uses unsupported swizzle "${swizzle}".`);
  }
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

  const ranges: NamedRange[] = [];
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

    addRange(ranges, range, buffer.byteLength, source, 8);
    levels.push({
      offset: range.offset,
      length: range.length,
      uncompressedByteLength: readUint64(view, entry + 16, source, `level ${index} uncompressed byte length`),
    });
  }

  const dfdDescriptor = validateDfd(view, dfd, source);
  const bytes = new Uint8Array(buffer);
  validateKeyValueData(bytes, kvd, source);

  if (view.getUint32(44, true) === 0 && sgd.length > 0) {
    return fail(source, 'non-supercompressed payload has unexpected SGD data.');
  }

  if (view.getUint32(16, true) !== 1) {
    return fail(source, `declares typeSize ${view.getUint32(16, true)}, but this 8-bit native profile requires 1.`);
  }

  return {
    vkFormat: view.getUint32(12, true),
    typeSize: view.getUint32(16, true),
    pixelWidth,
    pixelHeight,
    levelCount,
    declaredLevelCount,
    supercompressionScheme: view.getUint32(44, true),
    levels,
    dfd: dfdDescriptor,
  };
};
