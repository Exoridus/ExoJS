import { type AssetConstructor } from '#assets/AssetConstructor';
import { type AssetFactory } from '#assets/AssetFactory';
import { type AssetSourceCodec, binarySourceCodec, textSourceCodec } from '#assets/AssetSourceCodec';
import { type AssetRequest, AssetType } from '#assets/AssetType';
import { type DecodedImage, type ImageAssetOptions, ImageFactory } from '#assets/factories/ImageFactory';
import { type SvgAssetOptions, SvgFactory } from '#assets/factories/SvgFactory';
import { type TextureAssetOptions, TextureFactory } from '#assets/factories/TextureFactory';
import { textureSeamlessAdapter } from '#assets/seamless';
import { ImageAsset, SvgAsset } from '#assets/tokens';
import { Texture } from '#rendering/texture/Texture';

/**
 * Raster images decoded without a {@link Texture} wrapper - an `ImageBitmap`
 * where the environment has one.
 *
 * It claims no file suffixes: those belong to `texture`, which is what a bare
 * image path should resolve to. Name an image asset explicitly to get the
 * undecorated bitmap instead.
 */
export class ImageAssetType extends AssetType<ArrayBuffer, DecodedImage, ImageAssetOptions> {
  public readonly id = 'image';
  public override readonly leaf = 'none';
  public override readonly _token: AssetConstructor = ImageAsset;
  public override readonly codec: AssetSourceCodec<ArrayBuffer> = binarySourceCodec;

  public override resourceIdentity({ options }: AssetRequest<ImageAssetOptions>): string {
    return options?.mimeType === undefined ? '' : `mimeType=${options.mimeType}`;
  }

  public createFactory(): AssetFactory<ArrayBuffer, DecodedImage, ImageAssetOptions> {
    return new ImageFactory();
  }
}

/** SVG markup rasterised into an `HTMLImageElement`. */
export class SvgAssetType extends AssetType<string, HTMLImageElement, SvgAssetOptions> {
  public readonly id = 'svg';
  public override readonly leaf = 'none';
  public override readonly _token: AssetConstructor = SvgAsset;
  public override readonly codec: AssetSourceCodec<string> = textSourceCodec;

  /** The requested size is rasterised into the bitmap, so two sizes are two resources over one download. */
  public override resourceIdentity({ options }: AssetRequest<SvgAssetOptions>): string {
    const { width, height } = options ?? {};

    return width === undefined && height === undefined ? '' : `size=${width ?? ''}x${height ?? ''}`;
  }

  public createFactory(): AssetFactory<string, HTMLImageElement, SvgAssetOptions> {
    return new SvgFactory();
  }
}

/** The built-in `image` asset type. */
export const imageType = new ImageAssetType();
/** The built-in `svg` asset type. */
export const svgType = new SvgAssetType();

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
