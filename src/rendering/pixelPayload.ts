import { type ColorTextureFormat, TextureFormat } from '#rendering/types';

/** Storage returned by a pixel read. */
export type PixelArray = Uint8ClampedArray | Float32Array;
/** Explicit output representation; float formats require `float32`. */
export type PixelDataType = 'uint8' | 'float32';
/** Array corresponding to the requested representation. */
export type PixelArrayFor<T extends PixelDataType> = T extends 'float32' ? Float32Array : Uint8ClampedArray;

/** @internal */
export const createPixelArray = <T extends PixelDataType>(length: number, dataType: T): PixelArrayFor<T> =>
  (dataType === 'float32' ? new Float32Array(length) : new Uint8ClampedArray(length)) as PixelArrayFor<T>;

/** @internal */
export const pixelTransferBytes = (format: ColorTextureFormat): number => {
  switch (format) {
    case TextureFormat.Rgba32F:
      return 16;
    case TextureFormat.Rgba16F:
      return 8;
    default:
      return 4;
  }
};
