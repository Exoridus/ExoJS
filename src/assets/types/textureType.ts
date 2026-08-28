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
 * GPU-ready {@link Texture}s decoded from PNG, JPG, WebP, AVIF and GIF bytes, or
 * from a KTX2 container holding a hardware-compressed payload.
 *
 * One type covers both because the payload kind is a property of the bytes, not
 * of the asset: an {@link AssetVariantSet} rule may resolve one logical source to
 * a compressed container where the device supports the format and to an image
 * elsewhere, and a caller holding the handle sees a `Texture` either way.
 */
export class TextureAssetType extends AssetType<ArrayBuffer, Texture, TextureAssetOptions> {
  public readonly id = 'texture';
  public override readonly extensions = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'ktx2'];
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
