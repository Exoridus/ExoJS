/**
 * Independent numerical oracle for the fixed-function blend equations (D4):
 * derives each mode's expected result straight from its documented formula,
 * evaluates the actual factor pairs both backends install, and checks all
 * three agree per channel - transparent and opaque destination, fractional
 * destination alpha, zero-alpha RGB (nonzero colour at zero coverage), and
 * over-range (>1) input.
 *
 * WebGL2 factors are captured from the real `WebGl2Backend` against a
 * recording fake GL context (`gl.blendFuncSeparate`); WebGPU factors come
 * straight from `getWebGpuBlendState`. Neither backend's own blend-selection
 * code is trusted - this file supplies its own formulas per mode.
 */
import { BlendModes } from '#rendering/types';
import { getWebGpuBlendState } from '#rendering/webgpu/blendState';

import { createWebGl2Harness } from '../perf/rendering/harness';

/** One RGBA sample. Components are straight (unassociated) for the oracle's own arithmetic. */
interface Sample {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A captured (or declared) WebGL2 blend factor pair, named. */
type GlFactorName = 'ONE' | 'ZERO' | 'DST_COLOR' | 'ONE_MINUS_SRC_COLOR' | 'ONE_MINUS_SRC_ALPHA';

interface GlFactors {
  srcRgb: GlFactorName;
  dstRgb: GlFactorName;
  srcAlpha: GlFactorName;
  dstAlpha: GlFactorName;
}

/** A captured WebGPU blend factor pair. */
interface WgpuFactors {
  srcRgb: GPUBlendFactor;
  dstRgb: GPUBlendFactor;
  srcAlpha: GPUBlendFactor;
  dstAlpha: GPUBlendFactor;
}

const evalGlRgbFactor = (factor: GlFactorName, cs: number, as: number, cd: number): number => {
  switch (factor) {
    case 'ONE':
      return 1;
    case 'ZERO':
      return 0;
    case 'DST_COLOR':
      return cd;
    case 'ONE_MINUS_SRC_COLOR':
      return 1 - cs;
    case 'ONE_MINUS_SRC_ALPHA':
      return 1 - as;
  }
};

const evalGlAlphaFactor = (factor: GlFactorName, as: number, ad: number): number => {
  switch (factor) {
    case 'ONE':
      return 1;
    case 'ZERO':
      return 0;
    // A colour-valued factor's own alpha COMPONENT is the source/dest alpha itself.
    case 'DST_COLOR':
      return ad;
    case 'ONE_MINUS_SRC_COLOR':
      return 1 - as;
    case 'ONE_MINUS_SRC_ALPHA':
      return 1 - as;
  }
};

const evalWgpuRgbFactor = (factor: GPUBlendFactor, cs: number, as: number, cd: number): number => {
  switch (factor) {
    case 'one':
      return 1;
    case 'zero':
      return 0;
    case 'dst':
      return cd;
    case 'one-minus-src':
      return 1 - cs;
    case 'one-minus-src-alpha':
      return 1 - as;
    case 'dst-alpha':
      return as; // unused by the modes under test; present for exhaustiveness
    default:
      throw new Error(`blend-color-contract oracle: unhandled WebGPU factor '${factor}'.`);
  }
};

const evalWgpuAlphaFactor = (factor: GPUBlendFactor, as: number, ad: number): number => {
  switch (factor) {
    case 'one':
      return 1;
    case 'zero':
      return 0;
    case 'dst':
      return ad;
    case 'one-minus-src':
      return 1 - as;
    case 'one-minus-src-alpha':
      return 1 - as;
    default:
      throw new Error(`blend-color-contract oracle: unhandled WebGPU factor '${factor}'.`);
  }
};

/** Apply a captured GL factor pair to one RGB channel, given straight src/dst samples. */
const applyGlRgb = (factors: GlFactors, cs: number, src: Sample, dst: Sample, cd: number): number =>
  evalGlRgbFactor(factors.srcRgb, cs, src.a, cd) * cs + evalGlRgbFactor(factors.dstRgb, cs, src.a, cd) * cd;

const applyGlAlpha = (factors: GlFactors, src: Sample, dst: Sample): number =>
  evalGlAlphaFactor(factors.srcAlpha, src.a, dst.a) * src.a + evalGlAlphaFactor(factors.dstAlpha, src.a, dst.a) * dst.a;

const applyWgpuRgb = (factors: WgpuFactors, cs: number, src: Sample, cd: number): number =>
  evalWgpuRgbFactor(factors.srcRgb, cs, src.a, cd) * cs + evalWgpuRgbFactor(factors.dstRgb, cs, src.a, cd) * cd;

const applyWgpuAlpha = (factors: WgpuFactors, src: Sample, dst: Sample): number =>
  evalWgpuAlphaFactor(factors.srcAlpha, src.a, dst.a) * src.a + evalWgpuAlphaFactor(factors.dstAlpha, src.a, dst.a) * dst.a;

/** Independent D4 reference: each mode's documented equation, computed with no shared code path to either backend. */
const referenceRgb = (mode: BlendModes, cs: number, src: Sample, cd: number): number => {
  switch (mode) {
    case BlendModes.Normal:
      return cs + cd * (1 - src.a);
    case BlendModes.Additive:
      return cs + cd;
    case BlendModes.Subtract:
      return cd * (1 - cs);
    case BlendModes.Multiply:
      return cs * cd + cd * (1 - src.a);
    case BlendModes.Screen:
      return cs + cd * (1 - cs);
    default:
      throw new Error(`blend-color-contract oracle: no reference RGB formula for mode ${mode}.`);
  }
};

const referenceAlpha = (mode: BlendModes, src: Sample, dst: Sample): number => {
  switch (mode) {
    case BlendModes.Subtract:
      // Not a coverage composite: alpha is preserved exactly.
      return dst.a;
    default:
      // Normal, Additive, Multiply, Screen all use ordinary source-over
      // coverage for alpha, whatever their RGB equation does.
      return src.a + dst.a * (1 - src.a);
  }
};

/** Capture the WebGl2Backend's actual (srcRgb, dstRgb, srcAlpha, dstAlpha) for `mode`. */
const captureGlFactors = (mode: BlendModes): GlFactors => {
  const harness = createWebGl2Harness({ width: 4, height: 4 });
  const gl = harness.context;
  const names: Record<number, GlFactorName> = {
    [gl.ONE]: 'ONE',
    [gl.ZERO]: 'ZERO',
    [gl.DST_COLOR]: 'DST_COLOR',
    [gl.ONE_MINUS_SRC_COLOR]: 'ONE_MINUS_SRC_COLOR',
    [gl.ONE_MINUS_SRC_ALPHA]: 'ONE_MINUS_SRC_ALPHA',
  };
  let captured: GlFactors | null = null;

  (gl as unknown as Record<string, unknown>)['blendFuncSeparate'] = (srcRgb: number, dstRgb: number, srcAlpha: number, dstAlpha: number): void => {
    captured = { srcRgb: names[srcRgb]!, dstRgb: names[dstRgb]!, srcAlpha: names[srcAlpha]!, dstAlpha: names[dstAlpha]! };
  };

  // The backend initializes with Normal already in force, so setting Normal
  // again would be a no-op cache hit and never reach the GL call under test.
  harness.backend.setBlendMode(null);
  harness.backend.setBlendMode(mode);
  harness.destroy();

  if (captured === null) {
    throw new Error(`blend-color-contract oracle: WebGl2Backend never called blendFuncSeparate for mode ${mode}.`);
  }

  return captured;
};

const captureWgpuFactors = (mode: BlendModes): WgpuFactors => {
  const state = getWebGpuBlendState(mode);

  return {
    srcRgb: state.color.srcFactor!,
    dstRgb: state.color.dstFactor!,
    srcAlpha: state.alpha.srcFactor!,
    dstAlpha: state.alpha.dstFactor!,
  };
};

const FIXED_FUNCTION_MODES = [BlendModes.Normal, BlendModes.Additive, BlendModes.Subtract, BlendModes.Multiply, BlendModes.Screen] as const;

const modeName = (mode: BlendModes): string => BlendModes[mode]!;

/** Representative (src, dst) sample pairs: opaque/transparent/fractional destination, zero-alpha src colour, over-range input. */
const SAMPLE_CASES: ReadonlyArray<{ readonly label: string; readonly src: Sample; readonly dst: Sample }> = [
  { label: 'opaque destination', src: { r: 0.8, g: 0.2, b: 0.4, a: 1 }, dst: { r: 0.1, g: 0.6, b: 0.9, a: 1 } },
  { label: 'transparent destination', src: { r: 0.8, g: 0.2, b: 0.4, a: 0.6 }, dst: { r: 0, g: 0, b: 0, a: 0 } },
  { label: 'fractional destination alpha', src: { r: 0.3, g: 0.7, b: 0.1, a: 0.5 }, dst: { r: 0.4, g: 0.2, b: 0.6, a: 0.4 } },
  { label: 'zero-alpha source RGB', src: { r: 0.9, g: 0.3, b: 0.1, a: 0 }, dst: { r: 0.2, g: 0.2, b: 0.2, a: 0.7 } },
  { label: 'over-range input', src: { r: 1.6, g: 0.05, b: 2.2, a: 0.8 }, dst: { r: 1.1, g: 0.9, b: 0.3, a: 0.3 } },
];

describe('blend equation colour contract (D4)', () => {
  describe.each(FIXED_FUNCTION_MODES)('%s', mode => {
    const glFactors = captureGlFactors(mode);
    const wgpuFactors = captureWgpuFactors(mode);

    test.each(SAMPLE_CASES)(`$label: WebGL2 and WebGPU factors both reproduce the reference formula`, ({ src, dst }) => {
      for (const channel of ['r', 'g', 'b'] as const) {
        const reference = referenceRgb(mode, src[channel], src, dst[channel]);
        const glResult = applyGlRgb(glFactors, src[channel], src, dst, dst[channel]);
        const wgpuResult = applyWgpuRgb(wgpuFactors, src[channel], src, dst[channel]);

        expect(glResult, `${modeName(mode)} channel ${channel}: WebGL2 factors`).toBeCloseTo(reference, 10);
        expect(wgpuResult, `${modeName(mode)} channel ${channel}: WebGPU factors`).toBeCloseTo(reference, 10);
      }

      const referenceA = referenceAlpha(mode, src, dst);
      const glAlpha = applyGlAlpha(glFactors, src, dst);
      const wgpuAlpha = applyWgpuAlpha(wgpuFactors, src, dst);

      expect(glAlpha, `${modeName(mode)} alpha: WebGL2 factors`).toBeCloseTo(referenceA, 10);
      expect(wgpuAlpha, `${modeName(mode)} alpha: WebGPU factors`).toBeCloseTo(referenceA, 10);
    });
  });

  test('Additive alpha is source-over coverage, not unconstrained addition', () => {
    const gl = captureGlFactors(BlendModes.Additive);
    const wgpu = captureWgpuFactors(BlendModes.Additive);

    // Two additive draws with as=0.7 each must not exceed alpha 1.
    const src: Sample = { r: 1, g: 1, b: 1, a: 0.7 };
    const dst: Sample = { r: 0, g: 0, b: 0, a: 0.7 };

    expect(applyGlAlpha(gl, src, dst)).toBeLessThanOrEqual(1);
    expect(applyWgpuAlpha(wgpu, src, dst)).toBeLessThanOrEqual(1);
  });

  test('Subtract preserves destination alpha exactly, on both backends', () => {
    const gl = captureGlFactors(BlendModes.Subtract);
    const wgpu = captureWgpuFactors(BlendModes.Subtract);
    const src: Sample = { r: 0.4, g: 0.4, b: 0.4, a: 0.9 };
    const dst: Sample = { r: 0.6, g: 0.6, b: 0.6, a: 0.37 };

    expect(applyGlAlpha(gl, src, dst)).toBeCloseTo(dst.a, 10);
    expect(applyWgpuAlpha(wgpu, src, dst)).toBeCloseTo(dst.a, 10);
  });

  test('Subtract RGB is Cd*(1-Cs), not arithmetic subtraction', () => {
    const gl = captureGlFactors(BlendModes.Subtract);
    const src: Sample = { r: 0.3, g: 0.3, b: 0.3, a: 1 };
    const dst: Sample = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const naiveSubtraction = dst.r - src.r; // what the name would suggest, and is NOT the formula
    const actual = applyGlRgb(gl, src.r, src, dst, dst.r);

    expect(actual).toBeCloseTo(dst.r * (1 - src.r), 10);
    expect(actual).not.toBeCloseTo(naiveSubtraction, 3);
  });
});
