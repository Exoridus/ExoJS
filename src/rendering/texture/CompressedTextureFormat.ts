/**
 * A block-compressed GPU texture format.
 *
 * These are hardware formats: the GPU samples the compressed blocks directly,
 * so a compressed texture costs a fraction of the VRAM and upload bandwidth of
 * the same image as RGBA8 and stays compressed for its whole lifetime. No
 * device supports all of them - desktop GPUs implement the BC family, mobile
 * GPUs implement ETC2 and ASTC - so a project ships one file per target family
 * and lets {@link AssetVariantProfile} pick per device rather than picking at
 * build time.
 *
 * The values are the engine's own vocabulary, mapped per backend
 * (`Bc7RgbaUnorm` becomes `bc7-rgba-unorm` on WebGPU and
 * `COMPRESSED_RGBA_BPTC_UNORM_EXT` on WebGL2). Availability is read from
 * {@link RenderBackend.supportedTextureFormats}.
 * @stable
 */
export enum CompressedTextureFormat {
  /** BC1 / DXT1: RGB, 1-bit alpha cutout, 4:1 ratio. The cheapest BC format. */
  Bc1RgbaUnorm = 'bc1-rgba-unorm',
  /** BC2 / DXT3: RGB with 4-bit explicit alpha. Rarely worth choosing over BC3. */
  Bc2RgbaUnorm = 'bc2-rgba-unorm',
  /** BC3 / DXT5: RGB with interpolated alpha, 4:1 ratio. The classic RGBA workhorse. */
  Bc3RgbaUnorm = 'bc3-rgba-unorm',
  /** BC4: single channel, 2:1 ratio. Masks, height and occlusion maps. */
  Bc4RUnorm = 'bc4-r-unorm',
  /** BC5: two channels, 2:1 ratio. Tangent-space normal maps. */
  Bc5RgUnorm = 'bc5-rg-unorm',
  /** BC6H: HDR RGB half-float, 2:1 ratio. No alpha channel. */
  Bc6hRgbUfloat = 'bc6h-rgb-ufloat',
  /** BC7: RGBA, 2:1 ratio, the highest BC quality. Preferred wherever BC exists. */
  Bc7RgbaUnorm = 'bc7-rgba-unorm',
  /** ETC2: RGB, no alpha, 4:1 ratio. Mandatory in OpenGL ES 3.0. */
  Etc2Rgb8Unorm = 'etc2-rgb8unorm',
  /** ETC2: RGB with a 1-bit alpha cutout, 4:1 ratio. */
  Etc2Rgb8A1Unorm = 'etc2-rgb8a1unorm',
  /** ETC2 + EAC: RGB with 8-bit alpha, 2:1 ratio. */
  Etc2Rgba8Unorm = 'etc2-rgba8unorm',
  /** EAC: single channel, 2:1 ratio. */
  EacR11Unorm = 'eac-r11unorm',
  /** EAC: two channels, 1:1 ratio. */
  EacRg11Unorm = 'eac-rg11unorm',
  /** ASTC 4x4: RGBA at 8 bits per pixel. Highest ASTC quality. */
  Astc4x4Unorm = 'astc-4x4-unorm',
  /** ASTC 5x5: RGBA at ~5.12 bits per pixel. */
  Astc5x5Unorm = 'astc-5x5-unorm',
  /** ASTC 6x6: RGBA at ~3.56 bits per pixel. */
  Astc6x6Unorm = 'astc-6x6-unorm',
  /** ASTC 8x8: RGBA at 2 bits per pixel. Highest ASTC compression. */
  Astc8x8Unorm = 'astc-8x8-unorm',
}

/**
 * Block geometry of a compressed format: the texel footprint of one block and
 * how many bytes that block occupies.
 *
 * Both backends need it for every upload - WebGL2 to size the level slice it
 * hands `compressedTexImage2D`, WebGPU to compute a `bytesPerRow` that counts
 * block rows rather than texel rows - and the container parser needs it to
 * validate a level's declared byte length before trusting it.
 */
export interface CompressedBlockLayout {
  readonly blockWidth: number;
  readonly blockHeight: number;
  readonly bytesPerBlock: number;
}

const blockLayouts: Readonly<Record<CompressedTextureFormat, CompressedBlockLayout>> = Object.freeze({
  [CompressedTextureFormat.Bc1RgbaUnorm]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 },
  [CompressedTextureFormat.Bc2RgbaUnorm]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
  [CompressedTextureFormat.Bc3RgbaUnorm]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
  [CompressedTextureFormat.Bc4RUnorm]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 },
  [CompressedTextureFormat.Bc5RgUnorm]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
  [CompressedTextureFormat.Bc6hRgbUfloat]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
  [CompressedTextureFormat.Bc7RgbaUnorm]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
  [CompressedTextureFormat.Etc2Rgb8Unorm]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 },
  [CompressedTextureFormat.Etc2Rgb8A1Unorm]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 },
  [CompressedTextureFormat.Etc2Rgba8Unorm]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
  [CompressedTextureFormat.EacR11Unorm]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 },
  [CompressedTextureFormat.EacRg11Unorm]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
  [CompressedTextureFormat.Astc4x4Unorm]: { blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
  [CompressedTextureFormat.Astc5x5Unorm]: { blockWidth: 5, blockHeight: 5, bytesPerBlock: 16 },
  [CompressedTextureFormat.Astc6x6Unorm]: { blockWidth: 6, blockHeight: 6, bytesPerBlock: 16 },
  [CompressedTextureFormat.Astc8x8Unorm]: { blockWidth: 8, blockHeight: 8, bytesPerBlock: 16 },
});

/** Block geometry of `format`. */
export const compressedBlockLayout = (format: CompressedTextureFormat): CompressedBlockLayout => blockLayouts[format];

/** Whether `value` names a format this engine knows how to upload. */
export const isCompressedTextureFormat = (value: string): value is CompressedTextureFormat => Object.hasOwn(blockLayouts, value);

/** Number of block columns a mip level of `width` texels occupies. */
export const compressedBlocksAcross = (format: CompressedTextureFormat, width: number): number =>
  Math.ceil(Math.max(width, 1) / blockLayouts[format].blockWidth);

/** Number of block rows a mip level of `height` texels occupies. */
export const compressedBlocksDown = (format: CompressedTextureFormat, height: number): number =>
  Math.ceil(Math.max(height, 1) / blockLayouts[format].blockHeight);

/**
 * Exact byte length one mip level of `width` x `height` texels occupies in
 * `format`.
 *
 * A level is padded out to whole blocks, so a 5x5 BC7 level costs four blocks,
 * not one and a half. Container parsers compare this against the byte length
 * the file declares: a mismatch means the file is truncated or its format was
 * mis-identified, and uploading it would hand the driver a short buffer.
 */
export const compressedLevelByteLength = (format: CompressedTextureFormat, width: number, height: number): number =>
  compressedBlocksAcross(format, width) * compressedBlocksDown(format, height) * blockLayouts[format].bytesPerBlock;

/**
 * Order in which the engine prefers compressed formats when several are
 * available, best first.
 *
 * Both backends filter this to the formats their device actually implements, so
 * {@link RenderBackend.supportedTextureFormats} - and therefore variant
 * selection - ranks identically on WebGL2 and WebGPU. The order runs from the
 * highest-quality RGBA formats down to the cheapest, with the single- and
 * two-channel formats last: they are not interchangeable with an RGBA format,
 * so they only ever rank against each other.
 */
export const compressedFormatPreference: readonly CompressedTextureFormat[] = Object.freeze([
  CompressedTextureFormat.Bc7RgbaUnorm,
  CompressedTextureFormat.Astc4x4Unorm,
  CompressedTextureFormat.Astc5x5Unorm,
  CompressedTextureFormat.Astc6x6Unorm,
  CompressedTextureFormat.Astc8x8Unorm,
  CompressedTextureFormat.Etc2Rgba8Unorm,
  CompressedTextureFormat.Bc3RgbaUnorm,
  CompressedTextureFormat.Bc2RgbaUnorm,
  CompressedTextureFormat.Etc2Rgb8A1Unorm,
  CompressedTextureFormat.Etc2Rgb8Unorm,
  CompressedTextureFormat.Bc1RgbaUnorm,
  CompressedTextureFormat.Bc6hRgbUfloat,
  CompressedTextureFormat.Bc5RgUnorm,
  CompressedTextureFormat.EacRg11Unorm,
  CompressedTextureFormat.Bc4RUnorm,
  CompressedTextureFormat.EacR11Unorm,
]);

/**
 * `supported` in the engine's preference order.
 *
 * Backends collect what their device reports in whatever order they probe it;
 * this puts both of them on one ranking so variant selection cannot depend on
 * which backend is live.
 */
export const orderCompressedFormats = (supported: Iterable<CompressedTextureFormat>): readonly CompressedTextureFormat[] => {
  const available = new Set(supported);

  return Object.freeze(compressedFormatPreference.filter(format => available.has(format)));
};
