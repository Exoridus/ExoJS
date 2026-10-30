import { CompressedTextureFormat as Format } from '#rendering/texture/CompressedTextureFormat';

export interface BasisTarget {
  /** Basis transcoder target (`basist::transcoder_texture_format`) handed to the worker. */
  readonly id: number;
  /** Engine format the transcoded blocks upload as; absent when the target is uncompressed RGBA32. */
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

/**
 * Uses the backend's ranking, retaining all RGB channels and authored alpha.
 *
 * When no candidate matches the payload's transfer - or, for a payload with
 * alpha, none of the alpha-capable candidates is supported - the result is
 * `{ id: 13 }`, Basis `cTFRGBA32`: uncompressed RGBA, which `decodeKtx2` turns
 * into an `rgba8` payload at four bytes per texel. The absence of `format` is
 * what marks that case.
 */
export const selectBasisTarget = (formats: readonly Format[], hasAlpha: boolean, srgb: boolean): BasisTarget => {
  for (const format of formats) {
    const candidate = candidates.get(format);

    if (candidate?.srgb === srgb && (!hasAlpha || candidate.alpha)) {
      return candidate;
    }
  }

  return { id: 13 };
};
