import type { AssetConstructor } from '#assets/AssetConstructor';
import type { AssetFactory } from '#assets/AssetFactory';
import type { AssetSourceCodec } from '#assets/AssetSourceCodec';
import { binarySourceCodec, textSourceCodec } from '#assets/AssetSourceCodec';
import type { AssetRequest } from '#assets/AssetType';
import { AssetType } from '#assets/AssetType';
import { type DecodedImage, type ImageAssetOptions, ImageFactory } from '#assets/factories/ImageFactory';
import { type SvgAssetOptions, SvgFactory } from '#assets/factories/SvgFactory';
import { ImageAsset, SvgAsset } from '#assets/tokens';

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
