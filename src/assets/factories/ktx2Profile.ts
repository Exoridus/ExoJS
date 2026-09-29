import { compressedBlockLayout, CompressedTextureFormat as Format } from '#rendering/texture/CompressedTextureFormat';

/**
 * `VkFormat` values a KTX2 payload may carry, mapped onto this engine's format
 * vocabulary.
 *
 * Each Vulkan format has its matching storage and transfer identity. A backend
 * may choose a compatible upload representation later, but parsing must retain
 * the authored format until that decision is made.
 */
export const formatByVkFormat = new Map<number, Format>([
  [131, Format.Bc1RgbUnorm],
  [132, Format.Bc1RgbUnormSrgb],
  [133, Format.Bc1RgbaUnorm],
  [134, Format.Bc1RgbaUnormSrgb],
  [135, Format.Bc2RgbaUnorm],
  [136, Format.Bc2RgbaUnormSrgb],
  [137, Format.Bc3RgbaUnorm],
  [138, Format.Bc3RgbaUnormSrgb],
  [139, Format.Bc4RUnorm],
  [140, Format.Bc4RSnorm],
  [141, Format.Bc5RgUnorm],
  [142, Format.Bc5RgSnorm],
  [143, Format.Bc6hRgbUfloat],
  [144, Format.Bc6hRgbFloat],
  [145, Format.Bc7RgbaUnorm],
  [146, Format.Bc7RgbaUnormSrgb],
  [147, Format.Etc2Rgb8Unorm],
  [148, Format.Etc2Rgb8Srgb],
  [149, Format.Etc2Rgb8A1Unorm],
  [150, Format.Etc2Rgb8A1Srgb],
  [151, Format.Etc2Rgba8Unorm],
  [152, Format.Etc2Rgba8Srgb],
  [153, Format.EacR11Unorm],
  [155, Format.EacRg11Unorm],
  [157, Format.Astc4x4Unorm],
  [158, Format.Astc4x4Srgb],
  [159, Format.Astc5x4Unorm],
  [160, Format.Astc5x4Srgb],
  [161, Format.Astc5x5Unorm],
  [162, Format.Astc5x5Srgb],
  [163, Format.Astc6x5Unorm],
  [164, Format.Astc6x5Srgb],
  [165, Format.Astc6x6Unorm],
  [166, Format.Astc6x6Srgb],
  [167, Format.Astc8x5Unorm],
  [168, Format.Astc8x5Srgb],
  [169, Format.Astc8x6Unorm],
  [170, Format.Astc8x6Srgb],
  [171, Format.Astc8x8Unorm],
  [172, Format.Astc8x8Srgb],
  [173, Format.Astc10x5Unorm],
  [174, Format.Astc10x5Srgb],
  [175, Format.Astc10x6Unorm],
  [176, Format.Astc10x6Srgb],
  [177, Format.Astc10x8Unorm],
  [178, Format.Astc10x8Srgb],
  [179, Format.Astc10x10Unorm],
  [180, Format.Astc10x10Srgb],
  [181, Format.Astc12x10Unorm],
  [182, Format.Astc12x10Srgb],
  [183, Format.Astc12x12Unorm],
  [184, Format.Astc12x12Srgb],
]);

/** `VK_FORMAT_R8G8B8A8_UNORM` and `..._SRGB` - the one uncompressed payload the parser accepts. */
export const vkFormatRgba8Unorm = 37;
export const vkFormatRgba8Srgb = 43;

/** `KHR_DF_MODEL_*` values of the Khronos Data Format registry. */
const dfdModelRgbSda = 1;
const dfdModelBc1a = 128;
const dfdModelBc2 = 129;
const dfdModelBc3 = 130;
const dfdModelBc4 = 131;
const dfdModelBc5 = 132;
const dfdModelBc6h = 133;
const dfdModelBc7 = 134;
const dfdModelEtc2 = 161;
const dfdModelAstc = 162;

/** `KHR_DF_SAMPLE_DATATYPE_*`: the qualifier bits in the high nibble of a sample's channel type. */
export const dfdSampleLinear = 0x10;
export const dfdSampleSigned = 0x40;
export const dfdSampleFloat = 0x80;

/**
 * What a DFD must say about a `vkFormat` the engine can upload: the colour model that
 * describes its layout, its texel block, and the sample qualifier its data type carries
 * (a linear-alpha bit may accompany any of them).
 */
export interface Ktx2FormatProfile {
  readonly dfdModel: number;
  readonly blockWidth: number;
  readonly blockHeight: number;
  readonly blockBytes: number;
  /** Qualifier bits every sample must carry, apart from the optional linear bit. */
  readonly sampleQualifier: number;
}

const dfdModelByFamily: ReadonlyArray<readonly [prefix: string, model: number]> = [
  ['bc1-', dfdModelBc1a],
  ['bc2-', dfdModelBc2],
  ['bc3-', dfdModelBc3],
  ['bc4-', dfdModelBc4],
  ['bc5-', dfdModelBc5],
  ['bc6h-', dfdModelBc6h],
  ['bc7-', dfdModelBc7],
  ['etc2-', dfdModelEtc2],
  ['eac-', dfdModelEtc2],
  ['astc-', dfdModelAstc],
];

const compressedSampleQualifier = (format: Format): number => {
  if (format === Format.Bc6hRgbFloat) {
    return dfdSampleFloat | dfdSampleSigned;
  }

  if (format === Format.Bc6hRgbUfloat) {
    return dfdSampleFloat;
  }

  return format.endsWith('snorm') ? dfdSampleSigned : 0;
};

/** The DFD profile of `vkFormat`, or `undefined` for a format the engine cannot upload. */
export const ktx2FormatProfile = (vkFormat: number): Ktx2FormatProfile | undefined => {
  if (vkFormat === vkFormatRgba8Unorm || vkFormat === vkFormatRgba8Srgb) {
    return { dfdModel: dfdModelRgbSda, blockWidth: 1, blockHeight: 1, blockBytes: 4, sampleQualifier: 0 };
  }

  const format = formatByVkFormat.get(vkFormat);

  if (format === undefined) {
    return undefined;
  }

  const family = dfdModelByFamily.find(([prefix]) => format.startsWith(prefix));

  if (family === undefined) {
    return undefined;
  }

  const layout = compressedBlockLayout(format);

  return {
    dfdModel: family[1],
    blockWidth: layout.blockWidth,
    blockHeight: layout.blockHeight,
    blockBytes: layout.bytesPerBlock,
    sampleQualifier: compressedSampleQualifier(format),
  };
};

const greatestCommonDivisor = (a: number, b: number): number => (b === 0 ? a : greatestCommonDivisor(b, a % b));

/**
 * The byte alignment a mip level of an uncompressed-supercompression container must start on:
 * `lcm(texel block size, 4)`. A format the engine does not know falls back to 8.
 */
export const ktx2LevelAlignment = (vkFormat: number): number => {
  const profile = ktx2FormatProfile(vkFormat);

  if (profile === undefined) {
    return 8;
  }

  return (profile.blockBytes * 4) / greatestCommonDivisor(profile.blockBytes, 4);
};
