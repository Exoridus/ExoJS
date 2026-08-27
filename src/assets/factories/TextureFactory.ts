import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import { determineMimeType } from '#assets/utils';
import { CompressedTexture } from '#rendering/texture/CompressedTexture';
import { Texture } from '#rendering/texture/Texture';
import type { SamplerOptions, TextureOptions } from '#rendering/texture/TextureOptions';

import { decodeImageBlob } from './decodeImageBlob';
import { isKtx2, parseKtx2 } from './ktx2';
import { ObjectUrlPool } from './ObjectUrlPool';

/** Options accepted by an asset of the built-in `texture` type. */
export interface TextureAssetOptions {
  /** MIME type for the intermediate blob. Inferred from the magic bytes when omitted. Ignored for a KTX2 payload. */
  mimeType?: string;
  /**
   * Sampling and upload state forwarded to the {@link Texture} constructor; any
   * subset. A KTX2 payload in a hardware format takes the sampling half only -
   * premultiplication and mip generation cannot apply to compressed blocks.
   */
  textureOptions?: Partial<TextureOptions>;
}

/**
 * Decodes texture bytes into a GPU-ready {@link Texture}: raster image formats
 * (PNG, JPG, WebP, AVIF, GIF) through the browser's image decoder, and KTX2
 * containers into a compressed payload the GPU samples directly.
 *
 * The two are distinguished by the payload's magic bytes rather than by the file
 * suffix, so an asset variant is free to resolve one logical source to a
 * container on a device that supports the format and to an image elsewhere.
 * @internal
 */
export class TextureFactory implements AssetFactory<ArrayBuffer, Texture, TextureAssetOptions> {
  private readonly _objectUrls = new ObjectUrlPool();

  public async create(source: ArrayBuffer, context: AssetFactoryContext<TextureAssetOptions>): Promise<Texture> {
    const { mimeType, textureOptions } = context.options ?? {};

    if (isKtx2(new Uint8Array(source))) {
      return this._createFromKtx2(source, context.source, textureOptions);
    }

    const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });

    return new Texture(await decodeImageBlob(blob, this._objectUrls), textureOptions);
  }

  public destroy(): void {
    this._objectUrls.revokeAll();
  }

  private async _createFromKtx2(source: ArrayBuffer, name: string, textureOptions: Partial<TextureOptions> | undefined): Promise<Texture> {
    const payload = parseKtx2(source, name);

    if (payload.kind === 'compressed') {
      // Copied key by key rather than picked with a destructure: a key present
      // with an `undefined` value still wins a spread, so it would erase the
      // texture defaults instead of falling through to them.
      const samplerOptions: Partial<SamplerOptions> = {};

      if (textureOptions?.scaleMode !== undefined) {
        samplerOptions.scaleMode = textureOptions.scaleMode;
      }

      if (textureOptions?.wrapMode !== undefined) {
        samplerOptions.wrapMode = textureOptions.wrapMode;
      }

      return new CompressedTexture({ format: payload.format, levels: payload.levels, samplerOptions });
    }

    // An uncompressed container is turned into an ordinary image source rather
    // than kept as raw bytes: that way it takes exactly the same upload,
    // premultiplication and seamless-fill path as a PNG, instead of becoming a
    // third payload kind every backend would have to special-case.
    const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(payload.data), payload.width, payload.height));

    return new Texture(bitmap, textureOptions);
  }
}
