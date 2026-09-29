import { TextureFormat } from '#rendering/types';

import { type CompressedBlockLayout, compressedBlockLayout, CompressedTextureFormat, isCompressedTextureFormat } from './CompressedTextureFormat';
import type { TextureAlphaMode, TextureColorSpace } from './TextureOptions';

export interface TextureFormatMetadata {
  /** Caller-selected interpretation for formats whose storage does not fix it. */
  readonly colorSpace?: TextureColorSpace;
  /** Caller-declared association of RGB with source alpha. */
  readonly alphaMode?: TextureAlphaMode;
  /** Interpretation recorded by the payload, such as a KTX2 DFD transfer. */
  readonly payloadColorSpace?: TextureColorSpace;
  /** Alpha association recorded by the payload. */
  readonly payloadAlphaMode?: TextureAlphaMode;
}

export interface ResolvedTextureFormat {
  readonly storageFormat: TextureFormat | CompressedTextureFormat;
  readonly colorSpace: TextureColorSpace;
  readonly alphaMode: TextureAlphaMode;
  readonly hasAlpha: boolean;
  readonly blockLayout?: CompressedBlockLayout;
}

const srgbFormats = new Set<string>([
  TextureFormat.Rgba8Srgb,
  CompressedTextureFormat.Bc1RgbUnormSrgb,
  CompressedTextureFormat.Bc1RgbaUnormSrgb,
  CompressedTextureFormat.Bc2RgbaUnormSrgb,
  CompressedTextureFormat.Bc3RgbaUnormSrgb,
  CompressedTextureFormat.Bc7RgbaUnormSrgb,
  CompressedTextureFormat.Etc2Rgb8Srgb,
  CompressedTextureFormat.Etc2Rgb8A1Srgb,
  CompressedTextureFormat.Etc2Rgba8Srgb,
  CompressedTextureFormat.Astc4x4Srgb,
  CompressedTextureFormat.Astc5x4Srgb,
  CompressedTextureFormat.Astc5x5Srgb,
  CompressedTextureFormat.Astc6x5Srgb,
  CompressedTextureFormat.Astc6x6Srgb,
  CompressedTextureFormat.Astc8x5Srgb,
  CompressedTextureFormat.Astc8x6Srgb,
  CompressedTextureFormat.Astc8x8Srgb,
  CompressedTextureFormat.Astc10x5Srgb,
  CompressedTextureFormat.Astc10x6Srgb,
  CompressedTextureFormat.Astc10x8Srgb,
  CompressedTextureFormat.Astc10x10Srgb,
  CompressedTextureFormat.Astc12x10Srgb,
  CompressedTextureFormat.Astc12x12Srgb,
]);

const opaqueFormats = new Set<string>([
  TextureFormat.R8,
  TextureFormat.R32F,
  CompressedTextureFormat.Bc1RgbUnorm,
  CompressedTextureFormat.Bc1RgbUnormSrgb,
  CompressedTextureFormat.Bc4RUnorm,
  CompressedTextureFormat.Bc4RSnorm,
  CompressedTextureFormat.Bc5RgUnorm,
  CompressedTextureFormat.Bc5RgSnorm,
  CompressedTextureFormat.Bc6hRgbUfloat,
  CompressedTextureFormat.Bc6hRgbFloat,
  CompressedTextureFormat.Etc2Rgb8Unorm,
  CompressedTextureFormat.Etc2Rgb8Srgb,
  CompressedTextureFormat.EacR11Unorm,
  CompressedTextureFormat.EacRg11Unorm,
]);

const resolveMetadata = <T extends string>(value: T | undefined, payloadValue: T | undefined, inferredValue: T, key: string): T => {
  if (value !== undefined && payloadValue !== undefined && value !== payloadValue) {
    throw new TypeError(`Texture ${key} metadata contradicts the payload`);
  }

  return value ?? payloadValue ?? inferredValue;
};

/**
 * Resolves semantic interpretation and alpha association without changing the
 * exact storage identity. An sRGB storage format fixes the transfer function;
 * linear storage may be interpreted as linear color or as non-color data.
 */
export const resolveTextureFormat = (format: TextureFormat | CompressedTextureFormat, metadata: TextureFormatMetadata = {}): ResolvedTextureFormat => {
  const srgbStorage = srgbFormats.has(format);
  const hasAlpha = !opaqueFormats.has(format);
  const colorSpace = resolveMetadata(metadata.colorSpace, metadata.payloadColorSpace, srgbStorage ? 'srgb' : 'none', 'color-space');
  const alphaMode = resolveMetadata(metadata.alphaMode, metadata.payloadAlphaMode, 'straight', 'alpha-mode');

  if (srgbStorage && colorSpace !== 'srgb') {
    throw new TypeError('Texture color-space metadata contradicts the sRGB storage format');
  }

  // An uncompressed RGBA8 payload may declare 'srgb' over the plain format, because the
  // backend then realizes it as sRGB storage. A block-compressed format carries its transfer
  // in its identity, so an 'srgb' label over a UNORM block format would be trusted by the
  // shaders while the hardware never decodes it.
  if (!srgbStorage && colorSpace === 'srgb' && isCompressedTextureFormat(format)) {
    throw new TypeError("Texture color-space 'srgb' contradicts a compressed format that does not decode sRGB on sample");
  }

  if (!hasAlpha && alphaMode === 'premultiplied') {
    throw new TypeError('Texture alpha-mode metadata contradicts a format without alpha');
  }

  const blockLayout = isCompressedTextureFormat(format) ? compressedBlockLayout(format) : undefined;

  return {
    storageFormat: format,
    colorSpace,
    alphaMode,
    hasAlpha,
    ...(blockLayout === undefined ? {} : { blockLayout }),
  };
};
