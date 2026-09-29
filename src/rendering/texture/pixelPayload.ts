import type { TextureAlphaMode, TextureColorSpace } from './TextureOptions';

/** One RGBA8 mip level carried directly from an image container or pixel producer. */
export interface Rgba8TextureLevel {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/**
 * RGBA8 pixels supplied without a browser image source.
 *
 * The source interpretation is required because identical bytes can represent
 * encoded color, linear color, or numeric values. Levels are largest first and
 * may stop at any valid mip level.
 */
export interface Rgba8TexturePayload {
  readonly levels: readonly Rgba8TextureLevel[];
  readonly colorSpace: TextureColorSpace;
  readonly alphaMode: TextureAlphaMode;
}

const validExtent = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

/** Validate a raw RGBA8 payload and return its base level. @internal */
export const validateRgba8Payload = ({ levels }: Rgba8TexturePayload): Rgba8TextureLevel => {
  const [base] = levels;

  if (base === undefined) {
    throw new Error('An RGBA8 texture payload needs at least one mip level.');
  }

  if (!validExtent(base.width) || !validExtent(base.height)) {
    throw new Error(`RGBA8 mip level 0 requires positive integer dimensions, got ${base.width}x${base.height}.`);
  }

  const maxMipLevelCount = Math.floor(Math.log2(Math.max(base.width, base.height))) + 1;

  if (levels.length > maxMipLevelCount) {
    throw new Error(`RGBA8 payload has ${levels.length} mip levels, but ${base.width}x${base.height} permits at most ${maxMipLevelCount}.`);
  }

  for (const [index, level] of levels.entries()) {
    const expectedWidth = Math.max(Math.floor(base.width / 2 ** index), 1);
    const expectedHeight = Math.max(Math.floor(base.height / 2 ** index), 1);

    if (!validExtent(level.width) || !validExtent(level.height) || level.width !== expectedWidth || level.height !== expectedHeight) {
      throw new Error(`RGBA8 mip level ${index} must be ${expectedWidth}x${expectedHeight}, got ${level.width}x${level.height}.`);
    }

    const expectedBytes = level.width * level.height * 4;

    if (!(level.data instanceof Uint8Array) || level.data.byteLength !== expectedBytes) {
      const actualBytes = level.data instanceof Uint8Array ? level.data.byteLength : 'a non-Uint8Array value';
      throw new Error(`RGBA8 mip level ${index} is ${level.width}x${level.height}, which needs ${expectedBytes} bytes, but carries ${actualBytes}.`);
    }
  }

  return base;
};

/**
 * Whether one RGBA8 level is fully opaque, in which case premultiplying it by
 * its own alpha would change nothing.
 *
 * Only answerable for raw bytes: a browser image source cannot be inspected
 * without decoding it, which is exactly the CPU round trip managed colour
 * uploads exist to avoid.
 * @internal
 */
export const isFullyOpaqueLevel = (data: Uint8Array): boolean => {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 255) {
      return false;
    }
  }

  return true;
};
