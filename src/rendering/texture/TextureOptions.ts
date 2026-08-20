import type { ScaleModes, WrapModes } from '#rendering/types';

/**
 * GPU sampling state: how a texture is filtered and how UV coordinates
 * outside `[0, 1]` are resolved.
 *
 * Sampling state is independent of a texture's pixel content, so backends
 * realize it as a shared sampler object keyed on these two values alone.
 * Materials can override it per draw without disturbing the texture.
 */
export interface SamplerOptions {
  /** Minification and magnification filter applied when sampling the texture. */
  scaleMode: ScaleModes;
  /** Behaviour when UV coordinates exceed [0, 1]. */
  wrapMode: WrapModes;
}

/**
 * How a texture's source content is interpreted on its way to the GPU.
 *
 * Unlike {@link SamplerOptions}, these belong to the texture itself: they
 * decide what ends up in GPU memory, so changing one requires a re-upload
 * rather than a different sampler.
 */
export interface TextureUploadOptions {
  /** Whether pixel values are premultiplied by their alpha before uploading to the GPU. */
  premultiplyAlpha: boolean;
  /** Whether to generate a full mipmap chain after upload. */
  generateMipMap: boolean;
  /**
   * Whether the source content is stored bottom-up. Resolved when UVs are
   * packed rather than by flipping pixels at upload time, so it costs nothing
   * per frame but does invalidate geometry recorded against the old value.
   */
  flipY: boolean;
}

/** Full construction options of a texture: sampling state plus upload state. */
export interface TextureOptions extends SamplerOptions, TextureUploadOptions {}

/**
 * Allocation-free cache key for a sampling state.
 *
 * Every scale and wrap mode is a GL enum well below `0x10000`, so both pack
 * into one integer. Backends key their sampler caches on this instead of a
 * template string because the value is recomputed for every bound texture of
 * every draw.
 * @internal
 */
export const samplerStateKey = (scaleMode: ScaleModes, wrapMode: WrapModes): number => scaleMode * 0x10000 + wrapMode;
