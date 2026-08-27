import type { CompressedTexturePayload } from './compressedPayload';
import { Texture } from './Texture';
import type { SamplerOptions } from './TextureOptions';

/** Construction options for {@link CompressedTexture}. */
export interface CompressedTextureOptions extends CompressedTexturePayload {
  /** Sampling state. Upload state is not accepted - see {@link CompressedTexturePayload}. */
  readonly samplerOptions?: Partial<SamplerOptions>;
}

/**
 * A {@link Texture} constructed directly from a compressed payload.
 *
 * Convenience only: a compressed payload is something a plain `Texture` can
 * carry, so anything accepting a `Texture` accepts one of these, and a texture
 * loaded from a container arrives as a plain `Texture` with
 * {@link Texture.compressed} set. Code that needs to tell the difference reads
 * that property rather than testing the class.
 * @stable
 */
export class CompressedTexture extends Texture {
  public constructor({ format, levels, samplerOptions }: CompressedTextureOptions) {
    super(null, { ...samplerOptions, premultiplyAlpha: false, generateMipMap: false });

    this.setCompressed({ format, levels });
  }
}
