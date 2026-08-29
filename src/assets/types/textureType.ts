import type { AssetConstructor } from '#assets/AssetConstructor';
import type { AssetFactory } from '#assets/AssetFactory';
import type { AssetSourceCodec } from '#assets/AssetSourceCodec';
import { binarySourceCodec } from '#assets/AssetSourceCodec';
import type { AssetRequest } from '#assets/AssetType';
import { AssetType } from '#assets/AssetType';
import { type TextureAssetOptions, TextureFactory } from '#assets/factories/TextureFactory';
import { textureSeamlessAdapter } from '#assets/seamless';
import { Texture } from '#rendering/texture/Texture';

/**
 * GPU-ready {@link Texture}s decoded from PNG, APNG, JPG, WebP, AVIF, GIF, BMP
 * and ICO bytes, or from a KTX2 container holding a hardware-compressed payload.
 *
 * One type covers both because the payload kind is a property of the bytes, not
 * of the asset: an {@link AssetVariantSet} rule may resolve one logical source to
 * a compressed container where the device supports the format and to an image
 * elsewhere, and a caller holding the handle sees a `Texture` either way.
 *
 * An animated source (APNG, animated WebP or GIF, an AVIF sequence) decodes to
 * its first frame - a texture is a still image. Use the animation asset types
 * for playback.
 *
 * An `.ico` file may hold several resolutions of one image. Which of them the
 * decode yields is the browser's choice and is not specified anywhere, so an
 * icon whose exact size matters should be shipped as the single image it is
 * meant to be rather than as a multi-resolution container.
 */
export class TextureAssetType extends AssetType<ArrayBuffer, Texture, TextureAssetOptions> {
  public readonly id = 'texture';
  public override readonly extensions = ['png', 'apng', 'jpg', 'jpeg', 'jpe', 'jfif', 'webp', 'avif', 'avifs', 'gif', 'bmp', 'ico', 'ktx2'];
  public override readonly leaf = textureSeamlessAdapter;
  public override readonly _token: AssetConstructor = Texture;
  public override readonly codec: AssetSourceCodec<ArrayBuffer> = binarySourceCodec;

  /**
   * Only the MIME type is identity. Sampler and upload state belong to the
   * individual handle - two handles for one image share a single decode and
   * keep independent samplers - so folding it in would decode the same bytes
   * twice.
   */
  public override resourceIdentity({ options }: AssetRequest<TextureAssetOptions>): string {
    return options?.mimeType === undefined ? '' : `mimeType=${options.mimeType}`;
  }

  public createFactory(): AssetFactory<ArrayBuffer, Texture, TextureAssetOptions> {
    return new TextureFactory();
  }
}

/** The built-in `texture` asset type. */
export const textureType = new TextureAssetType();
