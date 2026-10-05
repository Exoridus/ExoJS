export const srgbToLinear = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

export const linearToSrgb = (value: number): number => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

export const SRGB_BYTE_TO_LINEAR = Float64Array.from({ length: 256 }, (_, channel) => srgbToLinear(channel / 255));
