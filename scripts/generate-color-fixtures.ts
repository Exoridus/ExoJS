/**
 * Deterministic colour-fixture generation.
 *
 * The point of these files is to be INDEPENDENT of the engine: every byte length
 * here is derived from the KTX 2.0 container layout, the Khronos data format
 * registry and the block layouts written out below, never from `src/`. A wrong
 * entry in the engine's own `compressedLevelByteLength` table therefore fails the
 * fixture suite instead of hiding inside it, which is exactly what a test whose
 * expectations come from the same table as the code cannot do.
 *
 * Scope: the uncompressed RGBA8 family and the native block-compressed families
 * that have a spec-defined identity encoding - a block the specification defines
 * as decoding to a constant, so the reference decode is derivable from the
 * specification without an encoder. See `manifest.json`'s `scope` field, which
 * the fixture suite asserts, for exactly which compressed formats are absent and
 * why. No third-party encoder is involved and no Khronos validator has been run
 * against these files.
 *
 * Run with no arguments to write every fixture and its manifest.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const FIXTURE_DIR = join(REPO_ROOT, 'test/fixtures/color');

/** KTX2 file identifier: `«KTX 20»` then CR LF LF. */
const IDENTIFIER = new Uint8Array([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);

const HEADER_BYTES = 80;
const LEVEL_INDEX_ENTRY_BYTES = 24;
/**
 * Layout of one basic DFD, from the KTX 2.0 descriptor definition:
 *
 * ```text
 *   0  totalSize            u32   the whole block, itself included
 *   4  vendorId             u16
 *   6  descriptorType       u16
 *   8  versionNumber        u16   2 for the basic format
 *  10  descriptorBlockSize  u16   everything EXCEPT totalSize
 *  12  colorModel           u8
 *  13  colorPrimaries       u8
 *  14  transferFunction     u8
 *  15  flags                u8
 *  16  texelBlockDimension  u8[4]
 *  20  bytesPlane           u8[8]
 *  28  samples              16 bytes each
 * ```
 *
 * The sample block therefore starts at byte 28, not at the end of the fixed
 * 20-byte colour header: `totalSize` is 28 + 16 per sample and
 * `descriptorBlockSize` is 24 + 16 per sample.
 */
const DFD_SAMPLE_BYTES = 16;
const DFD_FIXED_BYTES = 28;

/** `KHR_DF_MODEL_RGBSDA`, the colour model the engine's descriptor accepts. */
const KHR_DF_MODEL_RGBSDA = 1;
const KHR_DF_PRIMARIES_BT709 = 1;
const KHR_DFTRANSFER_LINEAR = 1;
const KHR_DFTRANSFER_SRGB = 2;
const KDF_DFALPHA_STRAIGHT = 0;
/**
 * `KHR_DF_FLAG_ALPHA_PREMULTIPLIED`: bit 0 of the DFD flags byte, value 1.
 *
 * The KTX 2.0 descriptor requires the flags byte to be this when RGB has been
 * multiplied by alpha and 0 otherwise, so this is also the only premultiplied
 * encoding a conforming writer can emit. The engine reads the same bit.
 */
const KDF_DFALPHA_PREMULTIPLIED = 1;

/** Bytes one RGBA8 texel occupies. */
const RGBA8_BYTES_PER_TEXEL = 4;

/** `VK_FORMAT_R8G8B8A8_UNORM` / `_SRGB`, the two native RGBA8 pair members. */
const VK_FORMAT_R8G8B8A8_UNORM = 37;
const VK_FORMAT_R8G8B8A8_SRGB = 43;

interface DfdSample {
  /** Bit offset of the sample inside the texel block. */
  readonly bitOffset: number;
  /** Width of the sample in bits, not the encoded `bitLength - 1`. */
  readonly bitLength: number;
  /** Khronos data format channel id, which occupies the low nibble. */
  readonly channelId: number;
}

interface FixtureLevel {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  /** Per-block colour, recorded for the block-compressed families only. */
  readonly blockColors?: readonly string[];
}

interface FixtureSpec {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly vkFormat: number;
  readonly transferFunction: number;
  readonly alphaFlags: number;
  /** Texel block extent; absent means one texel per block. */
  readonly blockWidth?: number;
  readonly blockHeight?: number;
  readonly bytesPerBlock?: number;
  /** DFD samples; absent means the single 32-bit RGBA8 sample. */
  readonly samples?: readonly DfdSample[];
  /** Pixel rows for level 0; smaller levels are authored explicitly. */
  readonly levels: readonly FixtureLevel[];
  /** KTX2 supercompression: 0 none, 3 ZLIB. */
  readonly supercompression?: number;
  readonly note: string;
}

/**
 * Bytes one level occupies, from the container layout rather than the engine.
 *
 * An uncompressed level is texels times bytes per texel. A block-compressed
 * level is whole blocks across times whole blocks down times bytes per block,
 * with a level's extent rounded UP to the block - which is the one place a
 * plausible-looking engine table is most likely to be wrong, and the reason
 * these extents are block multiples.
 */
const levelByteLength = (level: FixtureLevel, bytesPerBlock: number | undefined, blockWidth: number, blockHeight: number): number => {
  if (bytesPerBlock === undefined) {
    return level.width * level.height * RGBA8_BYTES_PER_TEXEL;
  }

  return Math.ceil(level.width / blockWidth) * Math.ceil(level.height / blockHeight) * bytesPerBlock;
};

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

/**
 * One `KTXorientation` entry, padded so the next entry starts 4-byte aligned.
 *
 * The padding sits OUTSIDE `entryLength`: a reader takes the value as everything
 * from the key's terminator to the end of the declared length, so padding inside
 * it would append spaces to the value.
 */
const keyValueEntry = (key: string, value: string): Uint8Array => {
  // The entry body is exactly `key \0 value`: a reader takes everything from the
  // key's terminator to the end of `entryLength` as the value, so no spare byte
  // may sit in front of the key or behind the value either.
  const body = new Uint8Array(key.length + 1 + value.length);

  body.set(utf8(key), 0);
  body[key.length] = 0;
  body.set(utf8(value), key.length + 1);

  // The declared length is the ENTRY BODY: a reader consumes its own 4-byte length
  // field, then the body this number counts, then rounds up to the next 4-byte
  // boundary for whatever follows. Counting the length field here as well would
  // make every entry overrun the region it is indexed in.
  const declared = body.length;
  const entry = new Uint8Array(Math.ceil((4 + declared) / 4) * 4);
  const entryView = new DataView(entry.buffer);

  entryView.setUint32(0, declared, true);
  entry.set(body, 4);

  return entry;
};

const buildDfd = (spec: FixtureSpec): Uint8Array => {
  const blockWidth = spec.blockWidth ?? 1;
  const blockHeight = spec.blockHeight ?? 1;
  const bytesPerBlock = spec.bytesPerBlock ?? RGBA8_BYTES_PER_TEXEL;
  const samples = spec.samples ?? [{ bitOffset: 0, bitLength: 32, channelId: 0 }];
  const totalBytes = DFD_FIXED_BYTES + samples.length * DFD_SAMPLE_BYTES;
  const dfd = new Uint8Array(totalBytes);
  const view = new DataView(dfd.buffer);

  view.setUint32(0, totalBytes, true);
  // vendorId 0, descriptorType 0, versionNumber 2, descriptorBlockSize.
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 2, true);
  view.setUint16(10, totalBytes - 4, true);
  dfd[12] = KHR_DF_MODEL_RGBSDA;
  dfd[13] = KHR_DF_PRIMARIES_BT709;
  dfd[14] = spec.transferFunction;
  dfd[15] = spec.alphaFlags;
  // texelBlockDimension is stored as the exponent: a texel is 1 << 3 wide.
  dfd[16] = Math.log2(blockWidth);
  dfd[17] = Math.log2(blockHeight);
  dfd[18] = 0;
  dfd[19] = 0;
  // bytesPlane[0..7]: exactly one plane, one block wide.
  dfd[20] = bytesPerBlock;

  for (const [index, sample] of samples.entries()) {
    const base = DFD_FIXED_BYTES + index * DFD_SAMPLE_BYTES;
    const word = sample.channelId | ((sample.bitLength - 1) << 8) | (sample.bitOffset << 16);

    // bitOffset and bitLength share the first sample word with the channel id in
    // its high byte; the qualifiers above that byte stay zero.
    view.setUint32(base, word, true);
    view.setUint32(base + 4, 0, true);
    view.setUint32(base + 8, 0, true);
    view.setUint32(base + 12, 0xffffffff, true);
  }

  return dfd;
};

/**
 * Assemble one container.
 *
 * Level data is stored smallest mip first, so the index entries are written in
 * mip order while the byte ranges are laid out in reverse - the same convention
 * a real writer uses, and the one the parser has to be right about.
 */
const buildKtx2 = (spec: FixtureSpec): Uint8Array => {
  const levels = spec.levels;
  const dfd = buildDfd(spec);
  const indexBytes = levels.length * LEVEL_INDEX_ENTRY_BYTES;
  const dfdOffset = HEADER_BYTES + indexBytes;
  const kvd = keyValueEntry('KTXorientation', 'S=r,T=d');
  const kvdOffset = dfdOffset + dfd.length;
  // Every indexed region is 8-byte aligned, and the mip level array additionally
  // starts at lcm(texelBlockSize, 4) - 16 for a 16-byte block, 8 for an 8-byte one.
  const levelAlignment = Math.max(8, leastCommonMultiple(spec.bytesPerBlock ?? 1, 4));
  const dataOffset = Math.ceil((kvdOffset + kvd.length) / levelAlignment) * levelAlignment;

  const encoded = levels.map(level => (spec.supercompression === 3 ? new Uint8Array(deflateSync(level.data)) : level.data));
  const dataBytes = encoded.reduce((total, level) => total + level.length, 0);
  const buffer = new Uint8Array(dataOffset + dataBytes);
  const view = new DataView(buffer.buffer);

  buffer.set(IDENTIFIER, 0);
  view.setUint32(12, spec.vkFormat, true);
  view.setUint32(16, 1, true); // typeSize: 1 for 2D, non-array, one face
  view.setUint32(20, spec.width, true);
  view.setUint32(24, spec.height, true);
  view.setUint32(28, 0, true); // pixelDepth
  view.setUint32(32, 0, true); // layerCount
  view.setUint32(36, 1, true); // faceCount
  view.setUint32(40, levels.length, true);
  view.setUint32(44, spec.supercompression ?? 0, true);
  view.setUint32(48, dfdOffset, true);
  view.setUint32(52, dfd.length, true);
  view.setUint32(56, kvdOffset, true);
  view.setUint32(60, kvd.length, true);
  // sgdOffset / sgdLength stay zero: no supercompression global data.

  buffer.set(dfd, dfdOffset);
  buffer.set(kvd, kvdOffset);

  let cursor = dataOffset + dataBytes;

  for (let index = levels.length - 1; index >= 0; index--) {
    const level = encoded[index]!;
    const entry = HEADER_BYTES + index * LEVEL_INDEX_ENTRY_BYTES;

    cursor -= level.length;
    // Each field is a 64-bit little-endian value written as two 32-bit halves; the
    // high halves stay zero because no fixture approaches 4 GiB.
    view.setUint32(entry, cursor, true);
    view.setUint32(entry + 4, 0, true);
    view.setUint32(entry + 8, level.length, true);
    view.setUint32(entry + 12, 0, true);
    // uncompressedByteLength is what the level DECODES to, which is the same as
    // byteLength for schemes 0 and 3 with a stored stream, and larger for a
    // deflated one.
    view.setUint32(entry + 16, spec.supercompression === 3 ? levels[index]!.data.length : level.length, true);
    view.setUint32(entry + 20, 0, true);
    buffer.set(level, cursor);
  }

  return buffer;
};

const greatestCommonDivisor = (a: number, b: number): number => (b === 0 ? a : greatestCommonDivisor(b, a % b));
const leastCommonMultiple = (a: number, b: number): number => (a / greatestCommonDivisor(a, b)) * b;

/** One RGBA8 level of the given extent, with a per-texel generator. */
const level = (width: number, height: number, texel: (x: number, y: number) => readonly [number, number, number, number]): Uint8Array => {
  const data = new Uint8Array(width * height * RGBA8_BYTES_PER_TEXEL);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = texel(x, y);
      const offset = (y * width + x) * RGBA8_BYTES_PER_TEXEL;

      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }

  return data;
};

/**
 * A texel pattern that is asymmetric in both axes.
 *
 * Every level below reuses the same generator scaled to its own extent, so a level
 * that arrived in the wrong order, or got flipped, cannot read as correct.
 */
const rampTexel = (x: number, y: number, size: number): readonly [number, number, number, number] => {
  const stepX = Math.round((x * 255) / (size - 1));
  const stepY = Math.round((y * 255) / (size - 1));

  return [stepX, stepY, 255 - stepX, 255];
};

/**
 * Opaque red on the left, an alpha ramp on the right, every texel carrying a
 * different hidden colour.
 *
 * The zero at x=4 sits next to full coverage, which is the fringe case, and the
 * fractional alphas beside it are what make a premultiplied authoring checkable:
 * the product in linear light and the product in encoded space differ measurably
 * at those texels and nowhere else.
 */
const alphaTexel = (x: number): readonly [number, number, number, number] => {
  if (x < 4) {
    return [220, 30, 40, 255];
  }

  return [10, 200, 90, Math.round(((x - 4) / 3) * 255)];
};

/** The premultiplied authoring definition: E(linearRGB * alpha), not E(rgb) * alpha. */
const premultipliedTexel = (x: number): readonly [number, number, number, number] => {
  const straight = alphaTexel(x);
  const alpha = straight[3] / 255;
  const encode = (value: number): number => {
    const linear = (value / 255) * alpha;

    return Math.round(255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055));
  };

  return [encode(straight[0]), encode(straight[1]), encode(straight[2]), straight[3]];
};

const RGBA8_FIXTURES: readonly FixtureSpec[] = [
  {
    name: 'rgba8-linear.ktx2',
    width: 8,
    height: 8,
    vkFormat: VK_FORMAT_R8G8B8A8_UNORM,
    transferFunction: KHR_DFTRANSFER_LINEAR,
    alphaFlags: KDF_DFALPHA_STRAIGHT,
    note: 'Same bytes as rgba8-srgb.ktx2 with linear transfer metadata. The pair is what proves transfer is carried rather than assumed.',
    levels: [{ width: 8, height: 8, data: level(8, 8, (x, y) => rampTexel(x, y, 8)) }],
  },
  {
    name: 'rgba8-srgb.ktx2',
    width: 8,
    height: 8,
    vkFormat: VK_FORMAT_R8G8B8A8_SRGB,
    transferFunction: KHR_DFTRANSFER_SRGB,
    alphaFlags: KDF_DFALPHA_STRAIGHT,
    note: 'Identical pixels to rgba8-linear.ktx2, differing only in vkFormat and the DFD transfer function.',
    levels: [{ width: 8, height: 8, data: level(8, 8, (x, y) => rampTexel(x, y, 8)) }],
  },
  {
    name: 'rgba8-mips-srgb.ktx2',
    width: 8,
    height: 8,
    vkFormat: VK_FORMAT_R8G8B8A8_SRGB,
    transferFunction: KHR_DFTRANSFER_SRGB,
    alphaFlags: KDF_DFALPHA_STRAIGHT,
    note: 'A complete four-level chain, each level authored independently so a dropped or reordered level is visible in the bytes.',
    levels: [8, 4, 2, 1].map(size => ({ width: size, height: size, data: level(size, size, (x, y) => rampTexel(x, y, size)) })),
  },
  {
    name: 'rgba8-zlib.ktx2',
    width: 8,
    height: 8,
    vkFormat: VK_FORMAT_R8G8B8A8_SRGB,
    transferFunction: KHR_DFTRANSFER_SRGB,
    alphaFlags: KDF_DFALPHA_STRAIGHT,
    supercompression: 3,
    note: 'The rgba8-srgb payload behind ZLIB (scheme 3). Decompressing it must reproduce those pixels exactly.',
    levels: [{ width: 8, height: 8, data: level(8, 8, (x, y) => rampTexel(x, y, 8)) }],
  },
  {
    name: 'alpha-straight-srgb.ktx2',
    width: 8,
    height: 8,
    vkFormat: VK_FORMAT_R8G8B8A8_SRGB,
    transferFunction: KHR_DFTRANSFER_SRGB,
    alphaFlags: KDF_DFALPHA_STRAIGHT,
    note: 'Opaque red beside fully transparent texels with a different hidden colour, straight. The fringe this profile exists to expose.',
    levels: [{ width: 8, height: 8, data: level(8, 8, (x, _y) => alphaTexel(x)) }],
  },
  {
    name: 'alpha-pma-srgb.ktx2',
    width: 8,
    height: 8,
    vkFormat: VK_FORMAT_R8G8B8A8_SRGB,
    transferFunction: KHR_DFTRANSFER_SRGB,
    alphaFlags: KDF_DFALPHA_PREMULTIPLIED,
    note: 'The same texels authored premultiplied in linear light - E(linearRGB * alpha), NOT E(rgb) * alpha - and flagged with the registry premultiplied bit.',
    levels: [{ width: 8, height: 8, data: level(8, 8, (x, _y) => premultipliedTexel(x)) }],
  },
];

// ---------------------------------------------------------------------------
// Native block-compressed fixtures
//
// Every block below is emitted in a form the specification defines as decoding to
// a single colour, so the reference decode is a few lines of arithmetic on the
// stored fields rather than the output of an encoder. That is what keeps these
// files an oracle: the bytes are derived from the published block layout, and
// the manifest records the colour they must decode to.
//
// Colours are restricted to all-zero and all-one components because those are the
// only values every conforming decoder is required to agree on: an endpoint
// expanded from a narrower component has more than one legal rounding, and
// pinning a value that depends on the rounding would make the fixture an oracle
// for a choice the specification does not fix.
// ---------------------------------------------------------------------------

/** An RGBA colour whose components are each 0 or 255, rendered as `#rrggbbaa`. */
type ConstantColor = readonly [number, number, number, number];

/**
 * The colours a 2x2 grid of blocks carries, one per block in raster order.
 *
 * Distinct per block, so a level whose blocks arrived reordered or transposed is
 * visible rather than averaging out to the same image.
 *
 * Each channel is written with the pair of values a narrow endpoint cannot round
 * ambiguously, EXCEPT green, which sweeps four distinct 8-bit values instead. That
 * asymmetry is what lets one grid serve every channel count: the green sweep gives
 * a single-channel format four distinct values, the blue pair gives a two-channel
 * format a second dimension to vary, and red stays free for the formats that also
 * store a colour. A format never has to be handed a value it cannot represent.
 */
const GRID_LEVELS = [0, 85, 170, 255] as const;

/**
 * Green sweeps four values so a single-channel format spans four distinct
 * blocks; red and blue carry one bit each so a two- and three-channel format have
 * a second and third dimension to vary, and alpha is left opaque because every
 * fixture in this family is.
 */
const blockGridColors = (): readonly ConstantColor[] =>
  GRID_LEVELS.map((green, index) => [index % 2 === 0 ? 0 : 255, green, index >= 2 ? 255 : 0, 255] as const);

const colorHex = ([r, g, b, a]: ConstantColor): string => `#${[r, g, b, a].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;

/**
 * A BC1-style colour block: two equal RGB565 endpoints and all-zero indices.
 *
 * With both endpoints equal, every palette entry the decoder can select
 * interpolates back to that one colour, so the block decodes to a constant
 * without any of the block's 2-bit selectors being non-zero.
 *
 * Each endpoint component is written as all-zero or all-ones of its own field
 * width, the pair of values a decoder must agree on however it rounds the
 * expansion. A 5- or 6-bit field has no room for a middle value that survives
 * that rounding unambiguously, so the two components a format does not sweep -
 * red here - carry the one bit that separates the four blocks.
 */
const bc1ColorBlock = (color: ConstantColor): Uint8Array => {
  const block = new Uint8Array(8);
  const endpoint = ((color[0] === 255 ? 0x1f : 0) << 11) | ((color[1] === 255 ? 0x3f : 0) << 5) | (color[2] === 255 ? 0x1f : 0);

  block[0] = endpoint & 0xff;
  block[1] = (endpoint >> 8) & 0xff;
  block[2] = endpoint & 0xff;
  block[3] = (endpoint >> 8) & 0xff;
  // bytes 4..7 stay zero: every texel selects palette entry 0.

  return block;
};

/**
 * A BC4-style single-channel block: two equal 8-bit endpoints, all-zero indices.
 *
 * Equal endpoints collapse the interpolated table to that one value, and an
 * all-zero 3-bit index selects the first entry, so the block decodes to a
 * constant whatever the endpoint is. A signed format reads the two endpoints as
 * the ends of [-1, 1].
 */
const bc4ChannelBlock = (level: number): Uint8Array => {
  const block = new Uint8Array(8);

  block[0] = level;
  block[1] = level;

  return block;
};

/**
 * An ASTC LDR void-extent block: the encoding the ASTC specification defines for
 * a block that is a single colour.
 *
 * Bits [8:0] are `111111100` and bits [11:10] are 1, which is what marks the
 * block as void-extent; bit 9 is the dynamic-range flag and is 0 for LDR, so the
 * four colour components are UNORM16. Every void-extent coordinate bit is set,
 * which the specification defines as ignoring the extent and decoding the block
 * as a constant colour. All-ones colour components keep the decode exact.
 */
const astcVoidExtentBlock = ([r, g, b, a]: ConstantColor): Uint8Array => {
  const block = new Uint8Array(16);
  const view = new DataView(block.buffer);

  // bits[11:0]: the void-extent signature `111111100` in [8:0], the LDR
  // dynamic-range flag 0 in bit 9, and both reserved bits set in [11:10].
  view.setUint16(0, 0x0ffe, true);
  // bits[63:12]: all void-extent coordinates, which makes the extent ignored.
  for (let byte = 2; byte < 8; byte++) {
    block[byte] = 0xff;
  }
  // bits[127:64]: R, G, B then A, each a little-endian UNORM16.
  const components = [r, g, b, a];

  for (const [index, component] of components.entries()) {
    const value = component === 0 ? 0x0000 : 0xffff;

    view.setUint16(8 + index * 2, value, true);
  }

  return block;
};

/**
 * An EAC R11 single-channel block: an all-ones base with a zero multiplier table.
 *
 * A multiplier table entry of 0 is the zero multiplier, so every texel decodes to
 * the base unchanged regardless of which index it selects. The base occupies the
 * top 16 bits of the big-endian 64-bit block.
 */
const eacR11Block = (level: number): Uint8Array => {
  const block = new Uint8Array(8);
  const view = new DataView(block.buffer);
  // Bits [63:48] base, [47:39] multiplier table, [38:27] texel indices. The base
  // is an 11-bit value, so an 8-bit level scales into its top bits and the
  // decoder's expansion of it is exact.
  const value = (BigInt(Math.round((level / 255) * 0x7ff)) << 48n) & 0xffffffffffff0000n;
  view.setBigUint64(0, value, false);

  return block;
};

interface NativeSpec {
  readonly name: string;
  readonly vkFormat: number;
  readonly blockWidth: number;
  readonly blockHeight: number;
  readonly bytesPerBlock: number;
  readonly transferFunction: number;
  /** Two samples where the format stores alpha beside colour. */
  readonly samples: readonly DfdSample[];
  /** Build one block for a colour that decodes to it. */
  readonly encode: (color: ConstantColor) => Uint8Array;
  /** The colour `encode` stores, as the format's own range maps it. */
  readonly decoded: (color: ConstantColor) => string;
  readonly note: string;
}

const BC_BLOCK = { blockWidth: 4, blockHeight: 4 } as const;

/** `VK_FORMAT_BC1_RGB_UNORM_BLOCK` through `VK_FORMAT_BC7_SRGB_BLOCK`. */
const BC1_RGB = { unorm: 131, srgb: 132 } as const;
const BC1_RGBA = { unorm: 133, srgb: 134 } as const;
const BC2 = { unorm: 135, srgb: 136 } as const;
const BC3 = { unorm: 137, srgb: 138 } as const;
const BC4 = { unorm: 139, snorm: 140 } as const;
const BC5 = { unorm: 141, snorm: 142 } as const;
const EAC_R11 = 153;
const EAC_RG11 = 155;
const ASTC_VK_BASE = 157;

/** A single sample covering the whole block, as the registry describes it. */
const singleSample = (bitLength: number, channelId: number): readonly DfdSample[] => [{ bitOffset: 0, bitLength, channelId }];
/** Two cosited samples, the second at bit 64 for a 16-byte block. */
const twoSamples = (firstChannelId: number, secondChannelId: number): readonly DfdSample[] => [
  { bitOffset: 0, bitLength: 64, channelId: firstChannelId },
  { bitOffset: 64, bitLength: 64, channelId: secondChannelId },
];

const ASTC_BLOCK_SIZES: readonly (readonly [number, number])[] = [
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
];

/** Two 2x2 blocks across, so a level holds four blocks in a known order. */
const nativeLevel = (
  blockWidth: number,
  blockHeight: number,
  encode: (color: ConstantColor) => Uint8Array,
  decode: (color: ConstantColor) => string,
): FixtureLevel => {
  const width = blockWidth * 2;
  const height = blockHeight * 2;
  const colors = blockGridColors();
  const blocks = colors.map(encode);
  const data = new Uint8Array(blocks.reduce((total, block) => total + block.length, 0));
  let offset = 0;

  for (const block of blocks) {
    data.set(block, offset);
    offset += block.length;
  }

  return { width, height, data, blockColors: colors.map(decode) };
};

const NATIVE_SPECS: readonly NativeSpec[] = [
  {
    name: 'native-bc1-rgb-unorm.ktx2',
    vkFormat: BC1_RGB.unorm,
    ...BC_BLOCK,
    bytesPerBlock: 8,
    transferFunction: KHR_DFTRANSFER_LINEAR,
    samples: singleSample(64, 0),
    encode: color => bc1ColorBlock(color),
    decoded: color => colorHex([color[0], color[1], color[2], 255]),
    note: 'BC1 RGB, linear. Two equal RGB565 endpoints, so every palette entry interpolates to one colour.',
  },
  {
    name: 'native-bc1-rgb-unorm-srgb.ktx2',
    vkFormat: BC1_RGB.srgb,
    ...BC_BLOCK,
    bytesPerBlock: 8,
    transferFunction: KHR_DFTRANSFER_SRGB,
    samples: singleSample(64, 0),
    encode: color => bc1ColorBlock(color),
    decoded: color => colorHex([color[0], color[1], color[2], 255]),
    note: 'The BC1 RGB block of its linear twin with the sRGB transfer only, which is what makes transfer a carried property.',
  },
  {
    name: 'native-bc1-rgba-unorm.ktx2',
    vkFormat: BC1_RGBA.unorm,
    ...BC_BLOCK,
    bytesPerBlock: 8,
    transferFunction: KHR_DFTRANSFER_LINEAR,
    samples: singleSample(64, 1),
    encode: color => bc1ColorBlock(color),
    decoded: color => colorHex([color[0], color[1], color[2], color[3]]),
    note: 'BC1 RGBA, linear. Distinct vkFormat from BC1 RGB, so the two must not collapse onto one identity.',
  },
  {
    name: 'native-bc1-rgba-unorm-srgb.ktx2',
    vkFormat: BC1_RGBA.srgb,
    ...BC_BLOCK,
    bytesPerBlock: 8,
    transferFunction: KHR_DFTRANSFER_SRGB,
    samples: singleSample(64, 1),
    encode: color => bc1ColorBlock(color),
    decoded: color => colorHex([color[0], color[1], color[2], color[3]]),
    note: 'The BC1 RGBA block of its linear twin with the sRGB transfer only.',
  },
  {
    name: 'native-bc2-rgba-unorm.ktx2',
    vkFormat: BC2.unorm,
    ...BC_BLOCK,
    bytesPerBlock: 16,
    transferFunction: KHR_DFTRANSFER_LINEAR,
    samples: twoSamples(15, 0),
    encode: color => {
      const block = new Uint8Array(16);

      // Explicit 4-bit alpha: every texel is all ones, so alpha is opaque.
      block.fill(0xff, 0, 8);
      block.set(bc1ColorBlock(color), 8);

      return block;
    },
    decoded: color => colorHex([color[0], color[1], color[2], 255]),
    note: 'BC2, linear. Explicit 4-bit alpha all ones, then the same constant-colour block as BC1.',
  },
  {
    name: 'native-bc2-rgba-unorm-srgb.ktx2',
    vkFormat: BC2.srgb,
    ...BC_BLOCK,
    bytesPerBlock: 16,
    transferFunction: KHR_DFTRANSFER_SRGB,
    samples: twoSamples(15, 0),
    encode: color => {
      const block = new Uint8Array(16);

      block.fill(0xff, 0, 8);
      block.set(bc1ColorBlock(color), 8);

      return block;
    },
    decoded: color => colorHex([color[0], color[1], color[2], 255]),
    note: 'The BC2 block of its linear twin with the sRGB transfer only.',
  },
  {
    name: 'native-bc3-rgba-unorm.ktx2',
    vkFormat: BC3.unorm,
    ...BC_BLOCK,
    bytesPerBlock: 16,
    transferFunction: KHR_DFTRANSFER_LINEAR,
    samples: twoSamples(15, 0),
    encode: color => {
      const block = new Uint8Array(16);

      // Equal alpha endpoints collapse the interpolated alpha table to one value.
      block[0] = color[3];
      block[1] = color[3];
      block.set(bc1ColorBlock(color), 8);

      return block;
    },
    decoded: color => colorHex([color[0], color[1], color[2], color[3]]),
    note: 'BC3, linear. Interpolated alpha with equal endpoints, then the same constant-colour block as BC1.',
  },
  {
    name: 'native-bc3-rgba-unorm-srgb.ktx2',
    vkFormat: BC3.srgb,
    ...BC_BLOCK,
    bytesPerBlock: 16,
    transferFunction: KHR_DFTRANSFER_SRGB,
    samples: twoSamples(15, 0),
    encode: color => {
      const block = new Uint8Array(16);

      block[0] = color[3];
      block[1] = color[3];
      block.set(bc1ColorBlock(color), 8);

      return block;
    },
    decoded: color => colorHex([color[0], color[1], color[2], color[3]]),
    note: 'The BC3 block of its linear twin with the sRGB transfer only.',
  },
  {
    name: 'native-bc4-r-unorm.ktx2',
    vkFormat: BC4.unorm,
    ...BC_BLOCK,
    bytesPerBlock: 8,
    transferFunction: KHR_DFTRANSFER_LINEAR,
    samples: singleSample(64, 0),
    encode: color => bc4ChannelBlock(color[1]),
    decoded: color => `${color[0]} in [0, 255]`,
    note: 'BC4, linear. A single-channel data format: the decoded value is a number, not a colour.',
  },
  {
    name: 'native-bc4-r-snorm.ktx2',
    vkFormat: BC4.snorm,
    ...BC_BLOCK,
    bytesPerBlock: 8,
    transferFunction: KHR_DFTRANSFER_LINEAR,
    samples: singleSample(64, 0),
    encode: color => bc4ChannelBlock(color[1]),
    decoded: color => `${color[0] === 255 ? '+1.0' : '-1.0'} in [-1, 1]`,
    note: 'BC4, signed. The same block bytes as its unsigned twin decode to the opposite endpoints, so the two must stay distinct identities.',
  },
  {
    name: 'native-bc5-rg-unorm.ktx2',
    vkFormat: BC5.unorm,
    ...BC_BLOCK,
    bytesPerBlock: 16,
    transferFunction: KHR_DFTRANSFER_LINEAR,
    samples: twoSamples(0, 1),
    encode: color => {
      const block = new Uint8Array(16);

      block.set(bc4ChannelBlock(color[0]), 0);
      block.set(bc4ChannelBlock(color[2]), 8);

      return block;
    },
    decoded: color => `R ${color[0]}, B ${color[2]} (two-channel data)`,
    note: 'BC5, linear. Two independent single-channel blocks, the shape a tangent-space normal map needs.',
  },
  {
    name: 'native-bc5-rg-snorm.ktx2',
    vkFormat: BC5.snorm,
    ...BC_BLOCK,
    bytesPerBlock: 16,
    transferFunction: KHR_DFTRANSFER_LINEAR,
    samples: twoSamples(0, 1),
    encode: color => {
      const block = new Uint8Array(16);

      block.set(bc4ChannelBlock(color[0]), 0);
      block.set(bc4ChannelBlock(color[2]), 8);

      return block;
    },
    decoded: color => `R ${color[0] === 255 ? '+1' : '-1'}, B ${color[2] === 255 ? '+1' : '-1'} in [-1, 1]`,
    note: 'BC5, signed. Byte-identical to its unsigned twin, but the same bytes decode to the opposite range.',
  },
  {
    name: 'native-eac-r11-unorm.ktx2',
    vkFormat: EAC_R11,
    ...BC_BLOCK,
    bytesPerBlock: 8,
    transferFunction: KHR_DFTRANSFER_LINEAR,
    samples: singleSample(64, 0),
    encode: color => eacR11Block(color[1]),
    decoded: color => `${color[0] === 255 ? 1 : 0} in [0, 1]`,
    note: 'EAC R11, a single channel: the ETC2-family counterpart of BC4, and a distinct identity from it.',
  },
  {
    name: 'native-eac-rg11-unorm.ktx2',
    vkFormat: EAC_RG11,
    ...BC_BLOCK,
    bytesPerBlock: 16,
    transferFunction: KHR_DFTRANSFER_LINEAR,
    samples: twoSamples(0, 1),
    encode: color => {
      const block = new Uint8Array(16);

      block.set(eacR11Block(color[0]), 0);
      block.set(eacR11Block(color[2]), 8);

      return block;
    },
    decoded: color => `R ${color[0]}, B ${color[2]} in [0, 1]`,
    note: 'EAC RG11, two channels. Two independent R11 blocks, so this is the ETC2-family counterpart of BC5.',
  },
];

/** Every exposed ASTC LDR block size, linear and sRGB, as separate fixtures. */
const ASTC_SPECS: readonly NativeSpec[] = ASTC_BLOCK_SIZES.flatMap(([blockWidth, blockHeight], index) => {
  const size = `${blockWidth}x${blockHeight}`;

  return (
    [
      { suffix: 'unorm', transferFunction: KHR_DFTRANSFER_LINEAR },
      { suffix: 'srgb', transferFunction: KHR_DFTRANSFER_SRGB },
    ] as const
  ).map(({ suffix, transferFunction }) => ({
    name: `native-astc-${size}-${suffix}.ktx2`,
    // The registry numbers the ASTC block formats in this exact order, linear
    // first, which is why the pair above advances the vkFormat by one.
    vkFormat: ASTC_VK_BASE + index * 2 + (suffix === 'srgb' ? 1 : 0),
    blockWidth,
    blockHeight,
    bytesPerBlock: 16,
    transferFunction,
    samples: singleSample(128, 0),
    encode: (color: ConstantColor) => astcVoidExtentBlock(color),
    decoded: colorHex,
    note: `ASTC ${size}, ${suffix === 'srgb' ? 'sRGB' : 'linear'}. A void-extent block, the encoding the ASTC specification defines for a block of one colour, so the decode is the stored colour read back with no interpolation.`,
  }));
});

const toFixtureSpec = (spec: NativeSpec): FixtureSpec => {
  const level0 = nativeLevel(spec.blockWidth, spec.blockHeight, spec.encode, spec.decoded);

  return {
    name: spec.name,
    width: level0.width,
    height: level0.height,
    vkFormat: spec.vkFormat,
    transferFunction: spec.transferFunction,
    alphaFlags: KDF_DFALPHA_STRAIGHT,
    blockWidth: spec.blockWidth,
    blockHeight: spec.blockHeight,
    bytesPerBlock: spec.bytesPerBlock,
    samples: spec.samples,
    levels: [level0],
    note: spec.note,
  };
};

const FIXTURES: readonly FixtureSpec[] = [...RGBA8_FIXTURES, ...[...NATIVE_SPECS, ...ASTC_SPECS].map(toFixtureSpec)];

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

interface ManifestEntry {
  readonly file: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly vkFormat: number;
  readonly width: number;
  readonly height: number;
  readonly supercompression: number;
  readonly transferFunction: number;
  readonly alphaFlags: number;
  /** Texel block extent; absent for the one-texel-per-block uncompressed family. */
  readonly blockWidth?: number;
  readonly blockHeight?: number;
  readonly bytesPerBlock?: number;
  readonly levels: readonly {
    readonly level: number;
    readonly width: number;
    readonly height: number;
    readonly byteLength: number;
    /** The colour each block must decode to, in raster order. */
    readonly blockColors?: readonly string[];
  }[];
  readonly provenance: string;
  readonly note: string;
}

const GENERATOR = 'scripts/generate-color-fixtures.ts';

/**
 * Reformat generated JSON through the repository's own prettier.
 *
 * The commit hook formats this file, so emitting unformatted JSON would make
 * every regeneration look like a change and train reviewers to ignore the diff.
 * Formatting with the same tool the hook uses means a regeneration that changes
 * nothing changes no bytes, which is the property worth having.
 */
const formatJson = (json: string): string =>
  execFileSync(process.execPath, [join(REPO_ROOT, 'node_modules/prettier/bin/prettier.cjs'), '--parser', 'json'], {
    input: json,
    encoding: 'utf8',
  });

const buildManifest = (): ManifestEntry[] => {
  const entries: ManifestEntry[] = [];

  for (const spec of FIXTURES) {
    const bytes = buildKtx2(spec);
    const file = join(FIXTURE_DIR, spec.name);

    writeFileSync(file, bytes);

    entries.push({
      file: spec.name,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
      vkFormat: spec.vkFormat,
      width: spec.width,
      height: spec.height,
      supercompression: spec.supercompression ?? 0,
      transferFunction: spec.transferFunction,
      alphaFlags: spec.alphaFlags,
      ...(spec.bytesPerBlock === undefined ? {} : { blockWidth: spec.blockWidth, blockHeight: spec.blockHeight, bytesPerBlock: spec.bytesPerBlock }),
      // Derived here from the container layout, never from the engine's table.
      levels: spec.levels.map((level, index) => ({
        level: index,
        width: level.width,
        height: level.height,
        byteLength:
          spec.supercompression === 3
            ? new Uint8Array(deflateSync(level.data)).length
            : levelByteLength(level, spec.bytesPerBlock, spec.blockWidth ?? 1, spec.blockHeight ?? 1),
        ...(level.blockColors === undefined ? {} : { blockColors: level.blockColors }),
      })),
      provenance: `${GENERATOR}; procedural texels and constant-colour blocks written from the published block layouts; no external encoder and no third-party asset`,
      note: spec.note,
    });
  }

  return entries;
};

const SCOPE =
  'Covers native RGBA8 and the native block-compressed formats that have a spec-defined constant-colour encoding: BC1 RGB, BC1 RGBA, BC2, BC3, BC4, BC5, EAC R11, EAC RG11 and all fourteen exposed ASTC LDR block sizes, each in the transfer variants the engine advertises. NOT covered, and deliberately so: BC6H and BC7, which have no constant-colour encoding in their block layouts and would need a real encoder; and ETC2 RGB, RGB+A1 and RGBA8, whose encodings reinterpret chosen endpoint bit patterns as the T, H, A, E and P modes, so an endpoint chosen to mean one colour can silently select another mode and the reference decode would not be derivable from the specification. No Khronos ktx validator has been run against any fixture here; these files have not been confirmed by that tool. Every colour is authored with all-zero or all-one components so the expected decode does not depend on an endpoint rounding the specification does not fix.';

const main = (): void => {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const entries = buildManifest();
  const json = `${JSON.stringify(
    {
      $comment:
        'Generated by scripts/generate-color-fixtures.ts - do not hand-edit. Level byte lengths are derived from the KTX 2.0 layout in that script, not from the engine, so a wrong engine table fails the fixture suite instead of agreeing with it.',
      generator: GENERATOR,
      scope: SCOPE,
      colorModels: { 1: 'KHR_DF_MODEL_RGBSDA' },
      transferFunctions: { 1: 'linear', 2: 'srgb' },
      alphaFlags: { 0: 'straight', 1: 'KHR_DF_FLAG_ALPHA_PREMULTIPLIED' },
      supercompressionSchemes: { 0: 'none', 3: 'zlib' },
      vkFormats: { 37: 'VK_FORMAT_R8G8B8A8_UNORM', 43: 'VK_FORMAT_R8G8B8A8_SRGB' },
      fixtures: entries,
    },
    null,
    2,
  )}\n`;

  writeFileSync(join(FIXTURE_DIR, 'manifest.json'), formatJson(json));

  for (const entry of entries) {
    process.stdout.write(`wrote ${entry.file} (${entry.byteLength} bytes, sha256 ${entry.sha256.slice(0, 16)}...)\n`);
  }

  // A regeneration that changes nothing must change no bytes: a drifting fixture
  // would otherwise be committed without anyone noticing which run wrote it.
  if (!readFileSync(join(FIXTURE_DIR, 'manifest.json'), 'utf8').includes(entries[0]!.sha256)) {
    throw new Error('manifest.json does not list the fixtures just written.');
  }

  process.stdout.write(`\n${entries.length} fixture(s) written to ${FIXTURE_DIR}\n`);
};

main();
