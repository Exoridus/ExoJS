import { CompressedTextureFormat, orderCompressedFormats } from '#rendering/texture/CompressedTextureFormat';

/**
 * WebGPU groups compressed formats into three optional features, and a device
 * only carries a feature that was requested at `requestDevice`. Each family maps
 * its members onto the `GPUTextureFormat` strings the device accepts.
 */
const families: ReadonlyArray<{ readonly feature: GPUFeatureName; readonly formats: Readonly<Partial<Record<CompressedTextureFormat, GPUTextureFormat>>> }> = [
  {
    feature: 'texture-compression-bc',
    formats: {
      [CompressedTextureFormat.Bc1RgbaUnorm]: 'bc1-rgba-unorm',
      [CompressedTextureFormat.Bc2RgbaUnorm]: 'bc2-rgba-unorm',
      [CompressedTextureFormat.Bc3RgbaUnorm]: 'bc3-rgba-unorm',
      [CompressedTextureFormat.Bc4RUnorm]: 'bc4-r-unorm',
      [CompressedTextureFormat.Bc4RSnorm]: 'bc4-r-snorm',
      [CompressedTextureFormat.Bc5RgUnorm]: 'bc5-rg-unorm',
      [CompressedTextureFormat.Bc5RgSnorm]: 'bc5-rg-snorm',
      [CompressedTextureFormat.Bc6hRgbUfloat]: 'bc6h-rgb-ufloat',
      [CompressedTextureFormat.Bc6hRgbFloat]: 'bc6h-rgb-float',
      [CompressedTextureFormat.Bc7RgbaUnorm]: 'bc7-rgba-unorm',
    },
  },
  {
    feature: 'texture-compression-etc2',
    formats: {
      [CompressedTextureFormat.Etc2Rgb8Unorm]: 'etc2-rgb8unorm',
      [CompressedTextureFormat.Etc2Rgb8A1Unorm]: 'etc2-rgb8a1unorm',
      [CompressedTextureFormat.Etc2Rgba8Unorm]: 'etc2-rgba8unorm',
      [CompressedTextureFormat.EacR11Unorm]: 'eac-r11unorm',
      [CompressedTextureFormat.EacRg11Unorm]: 'eac-rg11unorm',
    },
  },
  {
    feature: 'texture-compression-astc',
    formats: {
      [CompressedTextureFormat.Astc4x4Unorm]: 'astc-4x4-unorm',
      [CompressedTextureFormat.Astc5x4Unorm]: 'astc-5x4-unorm',
      [CompressedTextureFormat.Astc5x5Unorm]: 'astc-5x5-unorm',
      [CompressedTextureFormat.Astc6x5Unorm]: 'astc-6x5-unorm',
      [CompressedTextureFormat.Astc6x6Unorm]: 'astc-6x6-unorm',
      [CompressedTextureFormat.Astc8x5Unorm]: 'astc-8x5-unorm',
      [CompressedTextureFormat.Astc8x6Unorm]: 'astc-8x6-unorm',
      [CompressedTextureFormat.Astc8x8Unorm]: 'astc-8x8-unorm',
      [CompressedTextureFormat.Astc10x5Unorm]: 'astc-10x5-unorm',
      [CompressedTextureFormat.Astc10x6Unorm]: 'astc-10x6-unorm',
      [CompressedTextureFormat.Astc10x8Unorm]: 'astc-10x8-unorm',
      [CompressedTextureFormat.Astc10x10Unorm]: 'astc-10x10-unorm',
      [CompressedTextureFormat.Astc12x10Unorm]: 'astc-12x10-unorm',
      [CompressedTextureFormat.Astc12x12Unorm]: 'astc-12x12-unorm',
    },
  },
];

/** The three optional features that carry compressed formats, for `requestDevice`. */
export const webgpuCompressedTextureFeatures: readonly GPUFeatureName[] = Object.freeze(families.map(({ feature }) => feature));

/** The compressed formats one device implements, and the `GPUTextureFormat` each maps to. */
export interface WebgpuCompressedFormatSupport {
  readonly formats: readonly CompressedTextureFormat[];
  readonly gpuFormats: ReadonlyMap<CompressedTextureFormat, GPUTextureFormat>;
}

/**
 * Read `device.features` and build its compressed-format table.
 *
 * Reads the granted device rather than the adapter: an adapter may advertise a
 * family the device was never asked for, and a texture created in a format the
 * device does not carry is a validation error, not a soft fallback.
 */
export const readWebgpuCompressedFormats = (device: GPUDevice): WebgpuCompressedFormatSupport => {
  const gpuFormats = new Map<CompressedTextureFormat, GPUTextureFormat>();
  // Optional-chained like the adapter reads in the backend: a stand-in device
  // (a probe, a test double) carries no feature set, and the honest answer for
  // one is "no compressed formats" rather than a throw during initialization.
  const features = (device as { features?: GPUSupportedFeatures }).features;

  for (const { feature, formats } of families) {
    if (features?.has(feature) !== true) {
      continue;
    }

    for (const [format, gpuFormat] of Object.entries(formats)) {
      gpuFormats.set(format as CompressedTextureFormat, gpuFormat);
    }
  }

  return { formats: orderCompressedFormats(gpuFormats.keys()), gpuFormats };
};
