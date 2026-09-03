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
  // Only a bitmap this factory decoded may be closed. Closing one the engine
  // merely passed through would tear down a source its owner still draws from.
  private readonly _decoded = new WeakSet<ImageBitmap>();

  public async create(source: ArrayBuffer, context: AssetFactoryContext<ImageAssetOptions>): Promise<DecodedImage> {
    const blob = new Blob([source], { type: context.options?.mimeType ?? determineMimeType(source) });
    const image = await decodeImageBlob(blob, this._objectUrls);

    if (isClosable(image)) {
      this._decoded.add(image);
    }

    return image;
  }

  /** Frees the decoded bitmap behind a released image instead of leaving it to the garbage collector. */
  public dispose(resource: DecodedImage): void {
    if (this._decoded.delete(resource as ImageBitmap)) {
      (resource as ImageBitmap).close();
    }
  }

  public destroy(): void {
    this._objectUrls.revokeAll();
  }
}

/** The `<img>` fallback owns no releasable decode, so only a real bitmap is tracked. */
const isClosable = (image: DecodedImage): image is ImageBitmap => typeof (image as ImageBitmap).close === 'function';
