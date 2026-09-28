/**
 * Deterministic colour-fixture generation.
 *
 * The point of these files is to be INDEPENDENT of the engine: every byte length
 * here is derived from the KTX 2.0 container layout and the block-size formula
 * written out below, never from `src/`. A wrong entry in the engine's own
 * `compressedLevelByteLength` table therefore fails the fixture suite instead of
 * hiding inside it, which is exactly what a test whose expectations come from the
 * same table as the code cannot do.
 *
 * Scope, stated plainly: the uncompressed RGBA8 family below is byte-exact and
 * fully qualified - real pixels, real transfer metadata, independently derived
 * sizes. The native block-compressed family is NOT produced here. Encoding real
 * BC1/BC3/BC7/ETC2/ASTC blocks needs an encoder, and qualifying them needs the
 * Khronos `ktx` validator; neither is a repository dependency, so a hand-rolled
 * encoder would be a worse oracle than no fixture at all. That half of the plan's
 * R19 stays open rather than being faked with plausible-looking block bytes.
 *
 * Run with no arguments to write every fixture and its manifest.
 */
import { createHash } from 'node:crypto';
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
 * `descriptorBlockSize` is 24 + 16 per sample. Native RGBA8 is a single 32-bit
 * sample, which is the smallest descriptor that can describe it.
 */
const DFD_SAMPLE_COUNT = 1;
const DFD_SAMPLE_BYTES = 16;
const DFD_FIXED_BYTES = 28;
const DFD_TOTAL_BYTES = DFD_FIXED_BYTES + DFD_SAMPLE_COUNT * DFD_SAMPLE_BYTES;
const DFD_BLOCK_BYTES = DFD_TOTAL_BYTES - 4;

/** `VK_FORMAT_R8G8B8A8_UNORM` / `_SRGB`, the two native RGBA8 pair members. */
const VK_FORMAT_R8G8B8A8_UNORM = 37;
const VK_FORMAT_R8G8B8A8_SRGB = 43;

const KDF_DFTRANSFER_LINEAR = 1;
const KDF_DFTRANSFER_SRGB = 2;
const KDF_DFALPHA_STRAIGHT = 0;
/**
 * The flags byte the engine reads as premultiplied.
 *
 * The KHR data format registry defines `KHR_DF_FLAG_ALPHA_PREMULTIPLIED` as bit 0
 * (value 1), while the parser's DFD handling tests for 2. This fixture therefore
 * uses the value the engine accepts, and the discrepancy is recorded rather than
 * papered over: a file written by a tool following the registry would be read as
 * STRAIGHT, which is a silent wrong-alpha bug in the opposite direction. The
 * descriptor work owns the fix; until then a fixture claiming otherwise would be
 * a fixture asserting the engine is wrong.
 */
const KDF_DFALPHA_PREMULTIPLIED = 2;

/** Bytes one RGBA8 texel occupies. */
const RGBA8_BYTES_PER_TEXEL = 4;

interface FixtureLevel {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

interface FixtureSpec {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly vkFormat: number;
  readonly transferFunction: number;
  readonly alphaFlags: number;
  /** Pixel rows for level 0; smaller levels are authored explicitly. */
  readonly levels: readonly FixtureLevel[];
  /** KTX2 supercompression: 0 none, 3 ZLIB. */
  readonly supercompression?: number;
  readonly note: string;
}

/**
 * Bytes one level occupies, from the container layout rather than the engine.
 *
 * For an uncompressed format this is simply texels times bytes per texel; the
 * engine has the same answer, which is the point - agreement is the assertion.
 */
const levelByteLength = (width: number, height: number): number => width * height * RGBA8_BYTES_PER_TEXEL;

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

const buildDfd = (transferFunction: number, alphaFlags: number): Uint8Array => {
  const dfd = new Uint8Array(DFD_TOTAL_BYTES);
  const view = new DataView(dfd.buffer);

  view.setUint32(0, DFD_TOTAL_BYTES, true);
  // vendorId 0, descriptorType 0, versionNumber 2, descriptorBlockSize.
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 2, true);
  view.setUint16(10, DFD_BLOCK_BYTES, true);
  dfd[12] = 1; // KHR_DF_MODEL_RGBSDA
  dfd[13] = 1; // KHR_DF_PRIMARIES_BT709
  dfd[14] = transferFunction;
  dfd[15] = alphaFlags;
  dfd[16] = 3; // texelBlockDimension[0] = 3: a texel is 1 << 3 wide
  dfd[17] = 3; // texelBlockDimension[1] = 3: ... and 1 << 3 high
  dfd[18] = 0;
  dfd[19] = 0;
  // bytesPlane[0..7]: exactly one plane, RGBA8_BYTES_PER_TEXEL wide.
  dfd[20] = RGBA8_BYTES_PER_TEXEL;

  for (let index = 0; index < DFD_SAMPLE_COUNT; index++) {
    const base = DFD_FIXED_BYTES + index * DFD_SAMPLE_BYTES;

    view.setUint16(base, 0, true); // bitOffset
    view.setUint8(base + 2, 8 * RGBA8_BYTES_PER_TEXEL - 1); // bitLength - 1: 32 bits
    // channelType is a 4-byte field; the first byte is all a descriptor needs
    // here. 0 = KHR_DF_CHANNEL_R8G8B8A8_UNORM. The transfer function travels in
    // the descriptor's own byte rather than the channel type, which is why the
    // linear and sRGB files below differ in exactly two header bytes.
    dfd[base + 3] = 0;
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
  const indexBytes = levels.length * LEVEL_INDEX_ENTRY_BYTES;
  const dfdOffset = HEADER_BYTES + indexBytes;
  const kvd = keyValueEntry('KTXorientation', 'S=r,T=d');
  const kvdOffset = dfdOffset + DFD_TOTAL_BYTES;
  // Every indexed region is 8-byte aligned by the KTX 2.0 layout rules.
  const dataOffset = Math.ceil((kvdOffset + kvd.length) / 8) * 8;

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
  view.setUint32(52, DFD_TOTAL_BYTES, true);
  view.setUint32(56, kvdOffset, true);
  view.setUint32(60, kvd.length, true);
  // sgdOffset / sgdLength stay zero: no supercompression global data.

  buffer.set(buildDfd(spec.transferFunction, spec.alphaFlags), dfdOffset);
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

const FIXTURES: readonly FixtureSpec[] = [
  {
    name: 'rgba8-linear.ktx2',
    width: 8,
    height: 8,
    vkFormat: VK_FORMAT_R8G8B8A8_UNORM,
    transferFunction: KDF_DFTRANSFER_LINEAR,
    alphaFlags: KDF_DFALPHA_STRAIGHT,
    note: 'Same bytes as rgba8-srgb.ktx2 with linear transfer metadata. The pair is what proves transfer is carried rather than assumed.',
    levels: [{ width: 8, height: 8, data: level(8, 8, (x, y) => rampTexel(x, y, 8)) }],
  },
  {
    name: 'rgba8-srgb.ktx2',
    width: 8,
    height: 8,
    vkFormat: VK_FORMAT_R8G8B8A8_SRGB,
    transferFunction: KDF_DFTRANSFER_SRGB,
    alphaFlags: KDF_DFALPHA_STRAIGHT,
    note: 'Identical pixels to rgba8-linear.ktx2, differing only in vkFormat and the DFD transfer function.',
    levels: [{ width: 8, height: 8, data: level(8, 8, (x, y) => rampTexel(x, y, 8)) }],
  },
  {
    name: 'rgba8-mips-srgb.ktx2',
    width: 8,
    height: 8,
    vkFormat: VK_FORMAT_R8G8B8A8_SRGB,
    transferFunction: KDF_DFTRANSFER_SRGB,
    alphaFlags: KDF_DFALPHA_STRAIGHT,
    note: 'A complete four-level chain, each level authored independently so a dropped or reordered level is visible in the bytes.',
    levels: [8, 4, 2, 1].map(size => ({ width: size, height: size, data: level(size, size, (x, y) => rampTexel(x, y, size)) })),
  },
  {
    name: 'rgba8-zlib.ktx2',
    width: 8,
    height: 8,
    vkFormat: VK_FORMAT_R8G8B8A8_SRGB,
    transferFunction: KDF_DFTRANSFER_SRGB,
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
    transferFunction: KDF_DFTRANSFER_SRGB,
    alphaFlags: KDF_DFALPHA_STRAIGHT,
    note: 'Opaque red beside fully transparent texels with a different hidden colour, straight. The fringe this profile exists to expose.',
    levels: [{ width: 8, height: 8, data: level(8, 8, (x, _y) => alphaTexel(x)) }],
  },
  {
    name: 'alpha-pma-srgb.ktx2',
    width: 8,
    height: 8,
    vkFormat: VK_FORMAT_R8G8B8A8_SRGB,
    transferFunction: KDF_DFTRANSFER_SRGB,
    alphaFlags: KDF_DFALPHA_PREMULTIPLIED,
    note: 'The same texels authored premultiplied in linear light - E(linearRGB * alpha), NOT E(rgb) * alpha - and flagged as such.',
    levels: [{ width: 8, height: 8, data: level(8, 8, (x, _y) => premultipliedTexel(x)) }],
  },
];

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
  readonly levels: readonly { readonly level: number; readonly width: number; readonly height: number; readonly byteLength: number }[];
  readonly provenance: string;
  readonly note: string;
}

const GENERATOR = 'scripts/generate-color-fixtures.ts';

const buildManifest = (): { entries: ManifestEntry[]; json: string } => {
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
      // Derived here from the container layout, never from the engine's table.
      levels: spec.levels.map((level, index) => ({
        level: index,
        width: level.width,
        height: level.height,
        byteLength: spec.supercompression === 3 ? new Uint8Array(deflateSync(level.data)).length : levelByteLength(level.width, level.height),
      })),
      provenance: `${GENERATOR}; procedural texels; no external encoder and no third-party asset`,
      note: spec.note,
    });
  }

  const json = `${JSON.stringify(
    {
      $comment:
        'Generated by scripts/generate-color-fixtures.ts - do not hand-edit. Level byte lengths are derived from the KTX 2.0 layout in that script, not from the engine, so a wrong engine table fails the fixture suite instead of agreeing with it.',
      generator: GENERATOR,
      scope:
        'Uncompressed RGBA8 only. Native block-compressed fixtures need an independent encoder and the Khronos ktx validator, neither of which is a repository dependency; that half is open rather than synthesized.',
      transferFunctions: { 1: 'linear', 2: 'srgb' },
      alphaFlags: { 0: 'straight', 1: 'premultiplied' },
      supercompressionSchemes: { 0: 'none', 3: 'zlib' },
      vkFormats: { 37: 'VK_FORMAT_R8G8B8A8_UNORM', 43: 'VK_FORMAT_R8G8B8A8_SRGB' },
      fixtures: entries,
    },
    null,
    2,
  )}\n`;

  writeFileSync(join(FIXTURE_DIR, 'manifest.json'), json);

  return { entries, json };
};

const main = (): void => {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const { entries } = buildManifest();

  for (const entry of entries) {
    process.stdout.write(`wrote ${entry.file} (${entry.byteLength} bytes, sha256 ${entry.sha256.slice(0, 16)}...)\n`);
  }

  // A regeneration that changes nothing must change no bytes: a drifting fixture
  // would otherwise be committed without anyone noticing which run wrote it.
  const reread = readFileSync(join(FIXTURE_DIR, 'manifest.json'), 'utf8');

  if (!reread.includes(entries[0]!.sha256)) {
    throw new Error('manifest.json does not list the fixtures just written.');
  }

  process.stdout.write(`\n${entries.length} fixture(s) written to ${FIXTURE_DIR}\n`);
};

main();
