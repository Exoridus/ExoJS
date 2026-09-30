import { CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';

/**
 * The engine format each Vulkan format id of the external corpus must map to.
 * Written out from the Vulkan format registry so a wrong entry in the engine's
 * own table fails a test instead of agreeing with itself.
 */
export const externalCorpusFormats: Readonly<Record<number, CompressedTextureFormat>> = {
  145: CompressedTextureFormat.Bc7RgbaUnorm,
  146: CompressedTextureFormat.Bc7RgbaUnormSrgb,
  147: CompressedTextureFormat.Etc2Rgb8Unorm,
  148: CompressedTextureFormat.Etc2Rgb8Srgb,
  151: CompressedTextureFormat.Etc2Rgba8Unorm,
  152: CompressedTextureFormat.Etc2Rgba8Srgb,
  157: CompressedTextureFormat.Astc4x4Unorm,
  158: CompressedTextureFormat.Astc4x4Srgb,
};
