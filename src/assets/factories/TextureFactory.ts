import { AssetDecodeError } from '#assets/AssetDecodeError';
import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import { determineMimeType } from '#assets/utils';
import { CompressedTexture } from '#rendering/texture/CompressedTexture';
import { Texture } from '#rendering/texture/Texture';
import type { SamplerOptions, TextureAlphaMode, TextureColorSpace, TextureOptions } from '#rendering/texture/TextureOptions';

import { decodeImageBlob } from './decodeImageBlob';
import { inflateKtx2Levels, isKtx2, parseKtx2 } from './ktx2';
import { ObjectUrlPool } from './ObjectUrlPool';

/** Options accepted by an asset of the built-in `texture` type. */
export interface TextureAssetOptions {
  /** MIME type for the intermediate blob. Inferred from the magic bytes when omitted. Ignored for a KTX2 payload. */
  mimeType?: string;
  /**
   * Sampling and upload state forwarded to the {@link Texture} constructor; any
   * subset. A KTX2 payload keeps the transfer and alpha meaning its descriptor
   * declares: a request that contradicts it is refused, except that a LINEAR
   * payload may be declared `colorSpace: 'none'` to use it as numeric data. Upload
   * options that cannot apply to block-compressed data (`premultiplyAlpha`,
   * `generateMipMap`) or to any KTX2 payload (`flipY`) are refused rather than ignored.
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

    const mode = textureOptions?.colorSpace === 'none' ? 'data' : 'color';
    const image = await decodeImageBlob(blob, this._objectUrls, mode);
    const texture = new Texture(null, textureOptions);

    texture._setDecodedImageSource(image, mode === 'data' ? 'none' : 'srgb');

    return texture;
  }

  public destroy(): void {
    this._objectUrls.revokeAll();
  }

  private async _createFromKtx2(source: ArrayBuffer, name: string, textureOptions: Partial<TextureOptions> | undefined): Promise<Texture> {
    // ZLIB supercompression is inflated ahead of the parser rather than inside
    // it: DecompressionStream is a stream, and keeping the parser synchronous
    // keeps it testable without I/O.
    const payload = parseKtx2(await inflateKtx2Levels(source, name), name);

    const requested = textureOptions ?? {};
    const colorSpace = resolveKtx2ColorSpace(name, payload.colorSpace, requested.colorSpace);
    const alphaMode = resolveKtx2AlphaMode(name, payload.alphaMode, requested.alphaMode);

    if (requested.flipY === true) {
      throw ktx2OptionError(name, 'flipY cannot re-orient a KTX2 payload; author it top-down instead.');
    }

    // Copied key by key rather than picked with a destructure: a key present
    // with an `undefined` value still wins a spread, so it would erase the
    // texture defaults instead of falling through to them.
    const samplerOptions: Partial<SamplerOptions> = {};

    if (requested.scaleMode !== undefined) {
      samplerOptions.scaleMode = requested.scaleMode;
    }

    if (requested.wrapMode !== undefined) {
      samplerOptions.wrapMode = requested.wrapMode;
    }

    if (payload.kind === 'compressed') {
      if (requested.premultiplyAlpha === true) {
        throw ktx2OptionError(name, 'premultiplyAlpha cannot apply to block-compressed data.');
      }

      if (requested.generateMipMap === true) {
        throw ktx2OptionError(name, 'generateMipMap cannot apply to block-compressed data; author the mip chain in the file.');
      }

      return new CompressedTexture({ format: payload.format, levels: payload.levels, colorSpace, alphaMode, samplerOptions });
    }

    // Raw texels take the upload half of the options too.
    const uploadOptions: Partial<TextureOptions> = { ...samplerOptions };

    if (requested.premultiplyAlpha !== undefined) {
      uploadOptions.premultiplyAlpha = requested.premultiplyAlpha;
    }

    if (requested.generateMipMap !== undefined) {
      uploadOptions.generateMipMap = requested.generateMipMap;
    }

    return Texture.fromPixels({ levels: payload.levels, colorSpace, alphaMode }, uploadOptions);
  }
}

const ktx2OptionError = (source: string, message: string): AssetDecodeError =>
  new AssetDecodeError({ message: `KTX2 file "${source}": ${message}`, assetType: 'ktx2' });

/**
 * The colour space a KTX2 payload is loaded with. The file's own transfer is a fact about its
 * bytes, so an explicit request may not contradict it - with one exception: a LINEAR payload may
 * be declared numeric (`'none'`), which is how a normal map or lookup table stored in a linear
 * container is used. An sRGB payload cannot be relabelled, because its bytes are colour.
 */
const resolveKtx2ColorSpace = (source: string, payload: TextureColorSpace, requested: TextureColorSpace | undefined): TextureColorSpace => {
  if (requested === undefined || requested === payload) {
    return payload;
  }

  if (requested === 'none' && payload === 'linear-srgb') {
    return 'none';
  }

  throw ktx2OptionError(source, `textureOptions.colorSpace '${requested}' contradicts the file's ${payload} transfer.`);
};

const resolveKtx2AlphaMode = (source: string, payload: TextureAlphaMode, requested: TextureAlphaMode | undefined): TextureAlphaMode => {
  if (requested !== undefined && requested !== payload) {
    throw ktx2OptionError(source, `textureOptions.alphaMode '${requested}' contradicts the file's ${payload} alpha.`);
  }

  return payload;
};
