/**
 * CPU reference implementation of the W3C Compositing & Blending Level 1 blend
 * functions, in straight (un-premultiplied) color space [0, 1]. Mirrors the
 * GLSL/WGSL backdrop-blend shaders and serves as the pixel-value oracle for the
 * `webgl2-backdrop-blend` / `webgpu-backdrop-blend` suite tests — written
 * independently of the shaders so an agreement is a real cross-check, not a
 * tautology.
 */

import { BlendModes } from '#rendering/types';

export type Rgb = readonly [number, number, number];

// Every advanced (backdrop-aware) blend mode, in enum order. The fixed-function
// modes (Normal/Additive/Subtract) are not part of the shader path.
export const ADVANCED_BLEND_MODES: readonly BlendModes[] = [
  BlendModes.Multiply,
  BlendModes.Screen,
  BlendModes.Darken,
  BlendModes.Lighten,
  BlendModes.Overlay,
  BlendModes.ColorDodge,
  BlendModes.ColorBurn,
  BlendModes.HardLight,
  BlendModes.SoftLight,
  BlendModes.Difference,
  BlendModes.Exclusion,
  BlendModes.Hue,
  BlendModes.Saturation,
  BlendModes.Color,
  BlendModes.Luminosity,
];

const blendChannel = (mode: BlendModes, cb: number, cs: number): number => {
  switch (mode) {
    case BlendModes.Multiply:
      return cb * cs;
    case BlendModes.Screen:
      return cb + cs - cb * cs;
    case BlendModes.Darken:
      return Math.min(cb, cs);
    case BlendModes.Lighten:
      return Math.max(cb, cs);
    case BlendModes.Overlay:
      return cb <= 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs);
    case BlendModes.HardLight:
      return cs <= 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs);
    case BlendModes.ColorDodge:
      if (cb <= 0) {
        return 0;
      }
      return cs >= 1 ? 1 : Math.min(1, cb / (1 - cs));
    case BlendModes.ColorBurn:
      if (cb >= 1) {
        return 1;
      }
      return cs <= 0 ? 0 : 1 - Math.min(1, (1 - cb) / cs);
    case BlendModes.SoftLight: {
      if (cs <= 0.5) {
        return cb - (1 - 2 * cs) * cb * (1 - cb);
      }
      const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
      return cb + (2 * cs - 1) * (d - cb);
    }
    case BlendModes.Difference:
      return Math.abs(cb - cs);
    case BlendModes.Exclusion:
      return cb + cs - 2 * cb * cs;
    default:
      return Math.min(cb, cs);
  }
};

const lum = (c: Rgb): number => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;

const clipColor = (c: Rgb): Rgb => {
  const l = lum(c);
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  let out: Rgb = c;

  if (n < 0) {
    out = [l + ((out[0] - l) * l) / (l - n), l + ((out[1] - l) * l) / (l - n), l + ((out[2] - l) * l) / (l - n)];
  }

  if (x > 1) {
    out = [l + ((out[0] - l) * (1 - l)) / (x - l), l + ((out[1] - l) * (1 - l)) / (x - l), l + ((out[2] - l) * (1 - l)) / (x - l)];
  }

  return out;
};

const setLum = (c: Rgb, l: number): Rgb => {
  const d = l - lum(c);

  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
};

const sat = (c: Rgb): number => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

const setSat = (c: Rgb, s: number): Rgb => {
  const mn = Math.min(c[0], c[1], c[2]);
  const mx = Math.max(c[0], c[1], c[2]);

  if (mx <= mn) {
    return [0, 0, 0];
  }

  const scale = s / (mx - mn);

  return [(c[0] - mn) * scale, (c[1] - mn) * scale, (c[2] - mn) * scale];
};

const blendNonSeparable = (mode: BlendModes, cb: Rgb, cs: Rgb): Rgb => {
  switch (mode) {
    case BlendModes.Hue:
      return setLum(setSat(cs, sat(cb)), lum(cb));
    case BlendModes.Saturation:
      return setLum(setSat(cb, sat(cs)), lum(cb));
    case BlendModes.Color:
      return setLum(cs, lum(cb));
    default:
      return setLum(cb, lum(cs)); // Luminosity
  }
};

/** W3C blend function B(Cb, Cs) for `mode`, straight color in [0, 1]. */
export const w3cBlend = (mode: BlendModes, cb: Rgb, cs: Rgb): Rgb => {
  if (mode >= BlendModes.Hue) {
    return blendNonSeparable(mode, cb, cs);
  }

  return [blendChannel(mode, cb[0], cs[0]), blendChannel(mode, cb[1], cs[1]), blendChannel(mode, cb[2], cs[2])];
};

/**
 * Expected 0..255 RGB for an OPAQUE source blended over an OPAQUE backdrop
 * through the compositor: with αs = αb = 1 the source-over recombination reduces
 * to the raw blend result B(Cb, Cs). Inputs are 0..255 bytes.
 */
export const expectedOpaqueBlend = (mode: BlendModes, backdrop: Rgb, source: Rgb): [number, number, number] => {
  const cb: Rgb = [backdrop[0] / 255, backdrop[1] / 255, backdrop[2] / 255];
  const cs: Rgb = [source[0] / 255, source[1] / 255, source[2] / 255];
  const blended = w3cBlend(mode, cb, cs);

  return [Math.round(blended[0] * 255), Math.round(blended[1] * 255), Math.round(blended[2] * 255)];
};
