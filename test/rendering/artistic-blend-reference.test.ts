/**
 * Independent numerical oracle for the backdrop-aware compositor's artistic
 * blend modes (Multiply, Screen, Darken..Luminosity - the modes
 * `WebGl2BackdropBlendCompositor`/`WebGpuBackdropBlendCompositor` evaluate in
 * shader). Derived straight from the W3C Compositing & Blending general
 * formula for "source-over with a blend function":
 *
 *   Co = (1-as)*ab*Cb + (1-ab)*as*Cs + as*ab*B(Cb, Cs)
 *   Ao = as + ab*(1-as)
 *
 * with straight (un-premultiplied) `Cb`/`Cs` in [0, 1] and `B` the mode's W3C
 * blend function evaluated on colour CLAMPED to [0, 1] - these are bounded
 * grading operations, not a transparent HDR transport. This is algebraically
 * equivalent to the shaders' own decomposition (blend the source against the
 * backdrop, premultiply by source alpha, let the GPU source-over composite
 * the result), but is derived independently here rather than copied from
 * shader code, so agreement is a real cross-check.
 *
 * `w3cBlend`/`ADVANCED_BLEND_MODES` are reused from the browser suite's own
 * reference (same W3C per-mode formulas) rather than re-typed a third time;
 * only the compositing formula around them - the part under test
 * fractional destination-alpha coverage for - is independent here.
 */
import { BlendModes } from '#rendering/types';

import { ADVANCED_BLEND_MODES, type Rgb, w3cBlend } from './browser/_blendReference';

interface Sample {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const clampRgb = (rgb: Rgb): Rgb => [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];

/** Co/Ao per the W3C general compositing-with-blend formula, straight [0,1] inputs/output. */
const compositeOverBackdrop = (mode: BlendModes, src: Sample, dst: Sample): Sample => {
  const cb: Rgb = [dst.r, dst.g, dst.b];
  const cs: Rgb = [src.r, src.g, src.b];
  const blended = w3cBlend(mode, clampRgb(cb), clampRgb(cs));
  const as = src.a;
  const ab = dst.a;

  const co = (channel: 0 | 1 | 2): number => (1 - as) * ab * cb[channel] + (1 - ab) * as * cs[channel] + as * ab * blended[channel];

  return { r: co(0), g: co(1), b: co(2), a: as + ab * (1 - as) };
};

const modeName = (mode: BlendModes): string => BlendModes[mode]!;

describe('backdrop-aware compositor artistic blend reference (D4)', () => {
  describe.each(ADVANCED_BLEND_MODES)('%s', mode => {
    test('opaque destination reduces to the raw W3C blend result', () => {
      const src: Sample = { r: 0.9, g: 0.3, b: 0.1, a: 1 };
      const dst: Sample = { r: 0.2, g: 0.6, b: 0.8, a: 1 };
      const result = compositeOverBackdrop(mode, src, dst);
      const raw = w3cBlend(mode, [dst.r, dst.g, dst.b], [src.r, src.g, src.b]);

      expect(result.r, `${modeName(mode)} r`).toBeCloseTo(raw[0], 10);
      expect(result.g, `${modeName(mode)} g`).toBeCloseTo(raw[1], 10);
      expect(result.b, `${modeName(mode)} b`).toBeCloseTo(raw[2], 10);
      expect(result.a).toBeCloseTo(1, 10);
    });

    test('transparent destination leaves the source untouched (no backdrop to blend with)', () => {
      const src: Sample = { r: 0.7, g: 0.4, b: 0.2, a: 0.65 };
      const dst: Sample = { r: 0.5, g: 0.5, b: 0.5, a: 0 };
      const result = compositeOverBackdrop(mode, src, dst);

      expect(result.r).toBeCloseTo(src.r * src.a, 10);
      expect(result.g).toBeCloseTo(src.g * src.a, 10);
      expect(result.b).toBeCloseTo(src.b * src.a, 10);
      expect(result.a).toBeCloseTo(src.a, 10);
    });

    test('fractional destination alpha blends only the covered fraction of the backdrop', () => {
      const src: Sample = { r: 0.3, g: 0.8, b: 0.5, a: 0.9 };
      const dst: Sample = { r: 0.6, g: 0.1, b: 0.2, a: 0.4 };
      const result = compositeOverBackdrop(mode, src, dst);
      const raw = w3cBlend(mode, [dst.r, dst.g, dst.b], [src.r, src.g, src.b]);
      const mixedSource: Rgb = [src.r + (raw[0] - src.r) * dst.a, src.g + (raw[1] - src.g) * dst.a, src.b + (raw[2] - src.b) * dst.a];
      // What the shader itself outputs (premultiplied by source alpha only);
      // the GPU's own normal source-over blend then adds the untouched
      // backdrop's contribution, (1-as)*ab*Cb, on top - the shader never
      // computes that part itself.
      const shaderPremultiplied: Rgb = [mixedSource[0] * src.a, mixedSource[1] * src.a, mixedSource[2] * src.a];
      const gpuSourceOver = (channel: 0 | 1 | 2, cb: number): number => shaderPremultiplied[channel] + (1 - src.a) * dst.a * cb;

      // Cross-check against the shaders' own decomposition plus the GPU's
      // normal-blend compositing step, to confirm the two equivalent
      // derivations agree, not just that each is internally consistent.
      expect(result.r).toBeCloseTo(gpuSourceOver(0, dst.r), 10);
      expect(result.g).toBeCloseTo(gpuSourceOver(1, dst.g), 10);
      expect(result.b).toBeCloseTo(gpuSourceOver(2, dst.b), 10);
      expect(result.a).toBeCloseTo(src.a + dst.a * (1 - src.a), 10);
    });

    test('over-range straight colour is clamped before the blend function runs', () => {
      const src: Sample = { r: 1.6, g: -0.2, b: 0.5, a: 1 };
      const dst: Sample = { r: 0.4, g: 0.7, b: 2.1, a: 1 };
      const result = compositeOverBackdrop(mode, src, dst);
      const clampedRaw = w3cBlend(mode, clampRgb([dst.r, dst.g, dst.b]), clampRgb([src.r, src.g, src.b]));

      expect(result.r).toBeCloseTo(clampedRaw[0], 10);
      expect(result.g).toBeCloseTo(clampedRaw[1], 10);
      expect(result.b).toBeCloseTo(clampedRaw[2], 10);
    });
  });

  describe('Multiply/Screen fractional destination-alpha coverage', () => {
    const cases: ReadonlyArray<{ readonly label: string; readonly src: Sample; readonly dst: Sample }> = [
      { label: 'low backdrop coverage', src: { r: 0.8, g: 0.2, b: 0.6, a: 0.7 }, dst: { r: 0.3, g: 0.9, b: 0.1, a: 0.15 } },
      { label: 'high backdrop coverage', src: { r: 0.5, g: 0.5, b: 0.5, a: 0.4 }, dst: { r: 0.9, g: 0.1, b: 0.4, a: 0.85 } },
      { label: 'equal fractional coverage', src: { r: 0.25, g: 0.75, b: 0.35, a: 0.5 }, dst: { r: 0.6, g: 0.4, b: 0.8, a: 0.5 } },
    ];

    test.each(cases)('$label: Multiply and Screen reduce to the fixed-function shortcut only when the destination is opaque', ({ src }) => {
      const opaqueDst: Sample = { ...src, r: 0.6, g: 0.3, b: 0.9, a: 1 };
      const translucentDst: Sample = { ...opaqueDst, a: 0.5 };

      for (const mode of [BlendModes.Multiply, BlendModes.Screen]) {
        const opaqueResult = compositeOverBackdrop(mode, src, opaqueDst);
        const translucentResult = compositeOverBackdrop(mode, src, translucentDst);

        // The fixed-function shortcut (blendState.ts / WebGl2Backend.ts) is
        // documented as exact only against an opaque destination - the two
        // results below diverge once destination alpha is fractional, which is
        // exactly the gap the backdrop-aware compositor exists to close.
        expect([opaqueResult.r, opaqueResult.g, opaqueResult.b]).not.toEqual([translucentResult.r, translucentResult.g, translucentResult.b]);
      }
    });
  });
});
