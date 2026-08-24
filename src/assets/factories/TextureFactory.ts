import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import { determineMimeType } from '#assets/utils';
import { Texture } from '#rendering/texture/Texture';
import type { TextureOptions } from '#rendering/texture/TextureOptions';

import { decodeImageBlob } from './decodeImageBlob';
import { ObjectUrlPool } from './ObjectUrlPool';

/** Options accepted by an asset of the built-in `texture` type. */
export interface TextureAssetOptions {
  /** MIME type for the intermediate blob. Inferred from the magic bytes when omitted. */
  mimeType?: string;
  /** Sampling and upload state forwarded to the {@link Texture} constructor; any subset. */
  textureOptions?: Partial<TextureOptions>;
}

/**
 * Decodes raster image bytes (PNG, JPG, WebP, AVIF, ...) into a GPU-ready
 * {@link Texture}.
 * @internal
 */
export class TextureFactory implements AssetFactory<ArrayBuffer, Texture, TextureAssetOptions> {
  private readonly _objectUrls = new ObjectUrlPool();

  public async create(source: ArrayBuffer, context: AssetFactoryContext<TextureAssetOptions>): Promise<Texture> {
    const { mimeType, textureOptions } = context.options ?? {};
    const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });

    return new Texture(await decodeImageBlob(blob, this._objectUrls), textureOptions);
  }

  public destroy(): void {
    this._objectUrls.revokeAll();
  }
}
