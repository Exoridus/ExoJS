import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import { determineMimeType } from '#assets/utils';

import { decodeImageBlob } from './decodeImageBlob';
import { ObjectUrlPool } from './ObjectUrlPool';

/** A decoded raster image: an {@link ImageBitmap} where the environment supports one. */
export type DecodedImage = HTMLImageElement | ImageBitmap;

/** Options accepted by an asset of the built-in `image` type. */
export interface ImageAssetOptions {
  /** MIME type for the intermediate blob. Inferred from the magic bytes when omitted. */
  mimeType?: string;
}

/**
 * Decodes raster image bytes into a {@link DecodedImage}, without wrapping it
 * in a {@link Texture}.
 * @internal
 */
export class ImageFactory implements AssetFactory<ArrayBuffer, DecodedImage, ImageAssetOptions> {
  private readonly _objectUrls = new ObjectUrlPool();

  public create(source: ArrayBuffer, context: AssetFactoryContext<ImageAssetOptions>): Promise<DecodedImage> {
    const blob = new Blob([source], { type: context.options?.mimeType ?? determineMimeType(source) });

    return decodeImageBlob(blob, this._objectUrls);
  }

  public destroy(): void {
    this._objectUrls.revokeAll();
  }
}
