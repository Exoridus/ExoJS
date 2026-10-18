import { CompressedTextureFormat as Format } from '#rendering/texture/CompressedTextureFormat';

export interface BasisTarget {
  readonly id: number;
  readonly format?: Format;
}

interface Candidate extends BasisTarget {
  readonly alpha: boolean;
  readonly srgb: boolean;
}

const candidates = new Map<Format, Candidate>();

for (const [linear, srgb, id, alpha] of [
  [Format.Bc7RgbaUnorm, Format.Bc7RgbaUnormSrgb, 6, true],
  [Format.Astc4x4Unorm, Format.Astc4x4Srgb, 10, true],
  [Format.Etc2Rgba8Unorm, Format.Etc2Rgba8Srgb, 1, true],
  [Format.Etc2Rgb8Unorm, Format.Etc2Rgb8Srgb, 0, false],
  [Format.Bc3RgbaUnorm, Format.Bc3RgbaUnormSrgb, 3, true],
  [Format.Bc1RgbUnorm, Format.Bc1RgbUnormSrgb, 2, false],
  [Format.Bc1RgbaUnorm, Format.Bc1RgbaUnormSrgb, 2, false],
] as const) {
  candidates.set(linear, { id, format: linear, alpha, srgb: false });
  candidates.set(srgb, { id, format: srgb, alpha, srgb: true });
}

/** Uses the backend's ranking, retaining all RGB channels and authored alpha. */
export const selectBasisTarget = (formats: readonly Format[], hasAlpha: boolean, srgb: boolean): BasisTarget => {
  for (const format of formats) {
    const candidate = candidates.get(format);

    if (candidate?.srgb === srgb && (!hasAlpha || candidate.alpha)) {
      return candidate;
    }
  }

  return { id: 13 };
};
