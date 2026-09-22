import type { ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { UniformArray } from '#rendering/uniforms/uniformDeclarations';
import { UniformType } from '#rendering/uniforms/UniformType';

import { Filter } from './Filter';
import { createFilterShader, ShaderFilter } from './ShaderFilter';
import glslFragment from './shaders/blur.frag';
import wgslFragment from './shaders/blur.wgsl';

/**
 * Taps per side one sweep may take, and with it the size of the tap table the
 * shader reads. Thirty-two keeps the kernel sampled at one texel or finer up to
 * a strength of about ten logical units, which covers the blurs a scene
 * actually asks for, and bounds one sweep at 65 texture fetches.
 */
const MAX_TAPS_PER_SIDE = 32;

/** Tap-table entries: the centre tap plus one per positive-side tap. */
const TAP_ENTRIES = MAX_TAPS_PER_SIDE + 1;

/**
 * Standard deviations the kernel spans on each side.
 *
 * Three is the usual truncation point: it keeps 99.7% of the Gaussian's mass,
 * so the discarded tail is below what eight-bit output can show, and it is what
 * makes {@link BlurFilter.strength} convertible to a reach at all.
 */
const KERNEL_SIGMAS = 3;

/**
 * The blur source pair, built once and shared by every instance. Exported so
 * the structural parity checks can read the same object the filter runs rather
 * than a copy of it.
 * @internal
 */
export const blurShader = createFilterShader({
  glsl: { fragment: glslFragment },
  wgsl: wgslFragment,
  uniforms: { uTaps: new UniformArray(UniformType.Vec4, TAP_ENTRIES) },
});

/** Construction-time options for a {@link BlurFilter}. */
export interface BlurFilterOptions {
  /**
   * Gaussian standard deviation in LOGICAL units - unchanged by the display's
   * pixel ratio. The same quantity CSS `blur()` and Pixi's `strength` take, so
   * a value carried over from either produces the same blur here. Default `2`.
   */
  readonly strength?: number;
  /**
   * Upper bound on the taps one sweep may take per side, as a cost cap. Omit it
   * and the tap count follows {@link strength} on its own, which is the usual
   * case; set it to trade smoothness for texture fetches on a weak device.
   *
   * Capping does not shorten the blur: the taps still span the full kernel, so
   * a cap well below the derived count widens their spacing and can show as
   * banding. The ceiling is 32 either way.
   */
  readonly quality?: number;
}

/**
 * Gaussian blur {@link Filter}, run as two separable passes.
 *
 * The input is swept along X into a scratch target, then that scratch is swept
 * along Y into the output, each sweep sampling a Gaussian kernel of
 * {@link strength} standard deviations in ONE draw. Because the two sweeps are
 * chained rather than summed, the effective 2D kernel is their product - a real
 * isotropic blur that reaches diagonally as well as along the axes.
 *
 * (Summing the two sweeps into one target instead, which is what this filter
 * used to do, produces a cross: a pixel diagonally off a corner is touched by
 * neither sweep and stays black at any strength.)
 *
 * ```ts
 * // The same blur as CSS `filter: blur(4px)`.
 * subtree.filters = [new BlurFilter({ strength: 4 })];
 * ```
 *
 * The kernel is truncated at three standard deviations, so the filter reaches
 * `strength * 3` logical units outside its input on every edge and the tap
 * count follows the strength without the caller choosing one.
 *
 * Runs on a {@link ShaderFilter} carrying both a GLSL and a WGSL source, so it
 * works on either backend without the caller choosing one.
 */
export class BlurFilter extends Filter {
  private readonly _shaderFilter = ShaderFilter.from(blurShader);
  /**
   * Normalised Gaussian tap weights for the current kernel, index `0` the
   * centre. Rebuilt only when the resolved kernel changes, which a filter
   * applied to many nodes at one resolution means is once.
   */
  private readonly _weights = new Float32Array(TAP_ENTRIES);
  private _strength: number;
  private _quality: number;
  /** Kernel the cached weights describe, so a re-application rebuilds nothing. */
  private _builtSigma = -1;
  private _builtTapsPerSide = -1;
  private _tapsPerSide = 0;
  private _tapSpacing = 0;

  public constructor(options: BlurFilterOptions = {}) {
    super();

    this._strength = Math.max(0, options.strength ?? 2);
    this._quality = clampTapLimit(options.quality);
  }

  /**
   * Gaussian standard deviation in LOGICAL units.
   *
   * Independent of the display: the filter scales it into target texels itself,
   * so a strength of 8 covers the same on-screen distance at every
   * {@link Filter.resolution} and every device pixel ratio.
   */
  public get strength(): number {
    return this._strength;
  }

  public set strength(strength: number) {
    const next = Math.max(0, strength);

    if (this._strength !== next) {
      this._strength = next;
      this.invalidate();
    }
  }

  /** Tap cap per side - see {@link BlurFilterOptions.quality}. `0` means derived. */
  public get quality(): number {
    return this._quality;
  }

  public set quality(quality: number) {
    const next = clampTapLimit(quality);

    if (this._quality !== next) {
      this._quality = next;
      this.invalidate();
    }
  }

  /**
   * The blur reaches `strength * 3` logical units outside its input on every
   * edge - the point the kernel is truncated at, and therefore the furthest a
   * value can travel along one sweep. Chaining the two sweeps means it can
   * travel that far in BOTH, which is the corner of the box this rectangle
   * already declares. `quality` redistributes the taps inside that reach and
   * does not change it.
   */
  public override getOutputBounds(input: ReadonlyRectangle, output: Rectangle): void {
    const reach = this._strength * KERNEL_SIGMAS;

    output.set(input.x - reach, input.y - reach, input.width + reach * 2, input.height + reach * 2);
  }

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution = 1): void {
    // `strength` is logical; the target is `resolution` texels per logical unit,
    // so the kernel has to scale with it. Without this the blur would shrink to
    // 1/resolution of its authored width the moment targets started inheriting
    // the surface resolution.
    const sigma = this._strength * resolution;

    this._buildKernel(sigma);

    if (this._tapsPerSide === 0) {
      // A degenerate kernel is a copy, and a copy needs no second sweep.
      this._stageTaps(0, 0);
      this._shaderFilter.apply(backend, input, output, resolution);

      return;
    }

    // The horizontal sweep needs somewhere to land that is not `output` - the
    // vertical sweep reads every texel of it, so the two cannot share a target.
    // Borrowed from the backend's pool rather than allocated: a blurred node
    // would otherwise create and destroy a full-size render texture per frame.
    const scratch = backend.acquireRenderTexture(output.width, output.height);

    try {
      this._stageTaps(this._tapSpacing / output.width, 0);
      this._shaderFilter.apply(backend, input, scratch, resolution);

      // The kernel is symmetric about the centre tap, so the vertical sweep
      // needs no v-axis orientation correction: +offset and -offset are both
      // sampled whichever way the backend stores the effect domain.
      this._stageTaps(0, this._tapSpacing / output.height);
      this._shaderFilter.apply(backend, scratch, output, resolution);
    } finally {
      backend.releaseRenderTexture(scratch);
    }
  }

  public override destroy(): void {
    super.destroy();
    this._shaderFilter.destroy();
  }

  /**
   * Resolve the tap count, their spacing and their weights for `sigma` texels.
   *
   * One tap per texel is the finest the target can show, so the derived count
   * is the truncated reach in texels; the cap only ever widens the spacing,
   * which keeps the reach - and therefore the bounds this filter declared -
   * true whatever the cap is.
   */
  private _buildKernel(sigma: number): void {
    const reach = sigma * KERNEL_SIGMAS;
    const limit = this._quality === 0 ? MAX_TAPS_PER_SIDE : this._quality;
    const tapsPerSide = sigma <= 0 ? 0 : Math.min(limit, Math.max(1, Math.ceil(reach)));

    this._tapsPerSide = tapsPerSide;
    this._tapSpacing = tapsPerSide === 0 ? 0 : reach / tapsPerSide;

    if (this._builtSigma === sigma && this._builtTapsPerSide === tapsPerSide) {
      return;
    }

    this._builtSigma = sigma;
    this._builtTapsPerSide = tapsPerSide;
    this._weights[0] = 1;

    if (tapsPerSide === 0) {
      return;
    }

    const spacing = this._tapSpacing;
    const denominator = 2 * sigma * sigma;
    // The centre is counted once and every other tap twice - the loop below
    // writes one entry per MIRROR PAIR, and both halves of the pair carry the
    // weight the normalisation has to account for.
    let total = 1;

    for (let tap = 1; tap <= tapsPerSide; tap++) {
      const distance = tap * spacing;
      const weight = Math.exp(-(distance * distance) / denominator);

      this._weights[tap] = weight;
      total += weight * 2;
    }

    for (let tap = 0; tap <= tapsPerSide; tap++) {
      // In-bounds: `tap` <= `tapsPerSide` <= MAX_TAPS_PER_SIDE.
      this._weights[tap] = this._weights[tap]! / total;
    }
  }

  /**
   * Write the resolved kernel into the shader's tap table, stepping by
   * `(du, dv)` UV units per tap. Entry 0 is the centre: its weight in `z` and
   * the table's used length in `w`, which is what bounds the shader's loop.
   */
  private _stageTaps(du: number, dv: number): void {
    const taps = this._shaderFilter.uniforms.uTaps;
    const tapsPerSide = this._tapsPerSide;

    taps.at(0).set(0, 0, this._weights[0]!, tapsPerSide + 1);

    for (let tap = 1; tap <= tapsPerSide; tap++) {
      // In-bounds: `tap` <= `tapsPerSide` <= MAX_TAPS_PER_SIDE.
      taps.at(tap).set(du * tap, dv * tap, this._weights[tap]!, 0);
    }
  }
}

/** `0` for "derive from the strength", otherwise a tap cap inside the shader's table. */
const clampTapLimit = (quality: number | undefined): number => (quality === undefined ? 0 : Math.min(MAX_TAPS_PER_SIDE, Math.max(1, Math.floor(quality))));
