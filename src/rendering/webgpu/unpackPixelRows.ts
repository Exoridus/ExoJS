import { type PixelArray, pixelTransferBytes } from '#rendering/pixelPayload';
import type { ColorTextureFormat } from '#rendering/types';

/** Expand IEEE 754 binary16, including signed zero, subnormals and non-finite values. @internal */
export const decodeFloat16 = (bits: number): number => {
  const sign = (bits & 0x8000) === 0 ? 1 : -1;
  const exponent = (bits >>> 10) & 0x1f;
  const fraction = bits & 0x3ff;

  if (exponent === 0) {
    return sign * fraction * 2 ** -24;
  }
  if (exponent === 31) {
    return fraction === 0 ? sign * Infinity : NaN;
  }

  return sign * (1024 + fraction) * 2 ** (exponent - 25);
};

/** Copy padded GPU rows into existing top-down RGBA storage. @internal */
export const unpackPixelRows = (
  mapped: ArrayBuffer,
  destination: PixelArray,
  width: number,
  height: number,
  bytesPerRow: number,
  format: ColorTextureFormat,
): void => {
  const components = width * 4;
  const bytes = pixelTransferBytes(format) / 4;

  if (bytes !== 2) {
    const source = bytes === 4 ? new Float32Array(mapped) : new Uint8Array(mapped);
    const stride = bytesPerRow / bytes;
    for (let row = 0; row < height; row++) {
      destination.set(source.subarray(row * stride, row * stride + components), row * components);
    }
    return;
  }

  const source = new Uint16Array(mapped);
  const stride = bytesPerRow / 2;
  for (let row = 0; row < height; row++) {
    for (let component = 0; component < components; component++) {
      destination[row * components + component] = decodeFloat16(source[row * stride + component]!);
    }
  }
};
