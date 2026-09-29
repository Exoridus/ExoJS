import type { CompressedTextureFormat } from './CompressedTextureFormat';
import { compressedBlockLayout, compressedLevelByteLength } from './CompressedTextureFormat';
import type { TextureAlphaMode, TextureColorSpace } from './TextureOptions';

/**
 * One mip level of a compressed texture payload: the block bytes exactly as the
 * container stored them, plus the texel extent they decode to.
 *
 * `data` is uploaded verbatim - nothing decodes, re-packs or premultiplies it -
 * so its length must be exactly `compressedLevelByteLength(format, width, height)`.
 */
export interface CompressedTextureLevel {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/**
 * A texture payload already in a hardware block-compressed format, as carried by
 * {@link Texture.compressed}.
 *
 * The saving is real in both directions: a BC7 or ASTC 4x4 image occupies a
 * quarter of the VRAM of the same image as RGBA8 and a BC1 or ETC2 image an
 * eighth, and it never has to be decoded on the CPU first.
 *
 * # Upload state does not apply
 *
 * `premultiplyAlpha` and `generateMipMap` are ignored for a compressed payload,
 * and that is not a simplification: both operate on decoded texels, which is
 * precisely what compressed blocks never become. Premultiplication has to happen
 * in the authoring tool before compression, and a mip chain has to be compressed
 * level by level and shipped inside the container. A payload with a single level
 * therefore samples without mips however the sampler is configured.
 *
 * # Availability is per device
 *
 * No GPU implements every format. Binding a texture whose format the live
 * backend does not support throws a `RenderError` with code
 * `'unsupported-format'` rather than uploading something the driver would
 * misread. Check {@link RenderBackend.supportedTextureFormats}, or - better -
 * declare the alternatives as asset variants and let the loader choose.
 * @stable
 */
export interface CompressedTexturePayload {
  readonly format: CompressedTextureFormat;
  /** Interpretation retained by a container when its format does not fix it. */
  readonly colorSpace?: TextureColorSpace;
  /** Source association retained by a container when it provides one. */
  readonly alphaMode?: TextureAlphaMode;
  /**
   * Mip chain, largest level first and at least one level long. The first
   * level's extent is the texture's size; the chain is uploaded as given, so a
   * partial chain stays partial.
   */
  readonly levels: readonly CompressedTextureLevel[];
}

/**
 * Validate a compressed payload and return its base level.
 *
 * Called on every path that installs one, so a malformed payload is rejected
 * where it enters rather than at first bind, where the only symptom would be a
 * driver-side read past the end of a level.
 * @internal
 */
export const validateCompressedPayload = ({ format, levels }: CompressedTexturePayload): CompressedTextureLevel => {
  const [base] = levels;

  if (base === undefined) {
    throw new Error('A compressed texture payload needs at least one mip level.');
  }

  const { blockWidth, blockHeight } = compressedBlockLayout(format);

  if (!Number.isSafeInteger(base.width) || !Number.isSafeInteger(base.height) || base.width <= 0 || base.height <= 0) {
    throw new Error(`A ${format} payload needs positive integer base dimensions, got ${base.width}x${base.height}.`);
  }

  // WebGPU refuses to create a compressed texture whose base extent is not a
  // whole number of blocks, while WebGL2 silently pads it. Rejecting it here
  // keeps the two backends telling the same story instead of one failing at first
  // bind on a payload the other accepted. Smaller mip levels are exempt: a chain
  // from a block-aligned base legitimately ends below one block.
  if (base.width % blockWidth !== 0 || base.height % blockHeight !== 0) {
    throw new Error(
      `A ${format} payload is compressed in ${blockWidth}x${blockHeight} blocks, so its base level must be a multiple of that on both axes, but it is ${base.width}x${base.height}.`,
    );
  }

  const maxMipLevelCount = Math.floor(Math.log2(Math.max(base.width, base.height))) + 1;

  if (levels.length > maxMipLevelCount) {
    throw new Error(`A ${format} payload has ${levels.length} mip levels, but ${base.width}x${base.height} permits at most ${maxMipLevelCount}.`);
  }

  for (const [index, level] of levels.entries()) {
    const expectedWidth = Math.max(Math.floor(base.width / 2 ** index), 1);
    const expectedHeight = Math.max(Math.floor(base.height / 2 ** index), 1);

    if (!Number.isSafeInteger(level.width) || !Number.isSafeInteger(level.height) || level.width !== expectedWidth || level.height !== expectedHeight) {
      throw new Error(
        `Compressed mip level ${index} of a ${format} payload must be ${expectedWidth}x${expectedHeight}, but is ${level.width}x${level.height}.`,
      );
    }

    const expected = compressedLevelByteLength(format, level.width, level.height);

    if (level.data.byteLength !== expected) {
      throw new Error(
        `Compressed mip level ${index} of a ${format} payload is ${level.width}x${level.height}, which occupies ${expected} bytes, but carries ${level.data.byteLength}.`,
      );
    }
  }

  return base;
};

/**
 * The compressed payload of a texture-like value, or `null` when it carries none
 * - including for a value with no such property at all.
 *
 * Read structurally rather than against a `Texture` parameter type: the backends
 * handle a `Texture | RenderTexture` union of which only one arm can carry a
 * payload, and importing either class here would make the payload module depend
 * on the module that stores it. A structural parameter type cannot express that
 * either - TypeScript rejects an all-optional target that shares no property
 * with the argument - so the read is asserted instead of the parameter narrowed.
 */
export const compressedPayloadOf = (texture: object): CompressedTexturePayload | null =>
  (texture as { readonly compressed?: CompressedTexturePayload | null }).compressed ?? null;
