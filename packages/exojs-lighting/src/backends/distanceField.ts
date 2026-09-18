import { CallbackRenderPass, createFilterShader, type PassContext, RenderTexture, ScaleModes, ShaderFilter, TextureFormat, UniformType } from '@codexo/exojs';

import sdfResolveFragment from './shaders/sdf-resolve.frag';
import sdfResolveWgsl from './shaders/sdf-resolve.wgsl';
import sdfSeedFragment from './shaders/sdf-seed.frag';
import sdfSeedWgsl from './shaders/sdf-seed.wgsl';
import sdfStepFragment from './shaders/sdf-step.frag';
import sdfStepWgsl from './shaders/sdf-step.wgsl';

/**
 * Turns the occluder mask into a field of seeds: every blocking texel names
 * itself as the nearest blocking one, every other texel names itself as the
 * nearest open one.
 * @internal
 */
export const sdfSeedShader = createFilterShader({ glsl: { fragment: sdfSeedFragment }, wgsl: sdfSeedWgsl });

/**
 * One jump-flood round: every texel takes the nearest seed of each class that
 * any of its nine taps knows about, at the round's own stride.
 * @internal
 */
export const sdfStepShader = createFilterShader({
  glsl: { fragment: sdfStepFragment },
  wgsl: sdfStepWgsl,
  uniforms: { uStep: UniformType.Float },
});

/**
 * Turns the finished seed field into distance out of the nearest surface and
 * depth into one, each as a fraction of the reach the field was built for and
 * each measured to the surface's edge rather than to a texel centre.
 * @internal
 */
export const sdfResolveShader = createFilterShader({
  glsl: { fragment: sdfResolveFragment },
  wgsl: sdfResolveWgsl,
  uniforms: { uScale: UniformType.Float, uFar: UniformType.Float },
});

/**
 * The distance to the nearest occluder, everywhere the camera can see, built
 * from the occluder mask by jump flooding.
 *
 * A jump flood is `log2(size)` rounds of nine taps each, which is what makes a
 * whole-screen field affordable at all: the alternative is a search per texel.
 * What comes out is two distances: out of the nearest surface, which is what
 * lets a ray step by the distance it is guaranteed not to hit anything in
 * rather than by one texel at a time, and into the surface a texel is part
 * of, which is what tells a ray that has entered a source how much of its own
 * width the source takes. Both are measured to the surface's edge, from the
 * coverage the mask holds, so a ray narrower than a texel still reads an
 * outline rather than a staircase.
 *
 * Both backends run the same fragment rounds. A WebGPU compute path would
 * dispatch the same `log2(size)` rounds and is an optimisation with a
 * measurement attached, not a different algorithm.
 * @internal
 */
/**
 * Largest texel index a half-float seed holds exactly.
 *
 * A seed is an integer index, and half-float carries integers exactly up to
 * `2 ** 11`. Past that the stored index is rounded, which both moves the
 * distance by up to half a texel and - because the index is fetched from the
 * mask again to read the edge's position inside its texel - reads the coverage
 * of a texel the wall is not in, or one outside the field entirely.
 */
const EXACT_INDEX = 2048;

/**
 * The seed format a field of this size needs to name every one of its texels
 * exactly.
 * @internal
 */
export const seedFormat = (width: number, height: number): TextureFormat.Rgba16F | TextureFormat.Rgba32F =>
  Math.max(width, height) > EXACT_INDEX ? TextureFormat.Rgba32F : TextureFormat.Rgba16F;

/** The ping-pong pair. Unfiltered: interpolating two seeds would name a texel where neither wall is. */
const createSeeds = (format: TextureFormat.Rgba16F | TextureFormat.Rgba32F): readonly [RenderTexture, RenderTexture] => [
  new RenderTexture(1, 1, { format, scaleMode: ScaleModes.Nearest }),
  new RenderTexture(1, 1, { format, scaleMode: ScaleModes.Nearest }),
];

export class DistanceField {
  /** The whole build, as one pass. Owned by the caller's pipeline and disabled until something reads the field. */
  public readonly pass: CallbackRenderPass;

  private readonly _mask: RenderTexture;
  /** Ping-pong pair: a jump-flood round reads every texel of its input, so it cannot write it. */
  private _seeds: readonly [RenderTexture, RenderTexture];
  private _seedFormat: TextureFormat.Rgba16F | TextureFormat.Rgba32F = TextureFormat.Rgba16F;
  private readonly _distance: RenderTexture;
  private readonly _seedFilter: ShaderFilter;
  private readonly _stepFilter: ShaderFilter<{ readonly uStep: UniformType.Float }>;
  private readonly _resolveFilter: ShaderFilter<{ readonly uScale: UniformType.Float; readonly uFar: UniformType.Float }>;
  private _far = 1;

  public constructor(mask: RenderTexture) {
    this._mask = mask;
    this._seeds = createSeeds(this._seedFormat);
    // Filtered, because what reads this samples between texels while it traces.
    this._distance = new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Linear });
    this._seedFilter = ShaderFilter.from(sdfSeedShader);
    this._stepFilter = ShaderFilter.from(sdfStepShader);
    // Bound once and read live: the mask is the caller's target and never
    // changes identity, which is what lets it ride on the filter's fixed
    // texture bindings.
    this._resolveFilter = ShaderFilter.from(sdfResolveShader, { textures: { uMask: mask } });
    this.pass = new CallbackRenderPass((pass: PassContext) => this._build(pass), { label: 'lighting:distance-field', enabled: false });
  }

  /** The finished field: distance out of the nearest occluder in `r`, and that plus the depth into one in `g`, each as a fraction of {@link far}. */
  public get texture(): RenderTexture {
    return this._distance;
  }

  /** World units the field's `1.0` stands for, and the distance it reports where nothing blocks at all. */
  public get far(): number {
    return this._far;
  }

  /** Match the mask's grid, so a texel of one is a texel of the other. */
  public setSize(width: number, height: number): void {
    const format = seedFormat(width, height);

    // Rebuilt rather than resized when the grid outgrows half-float's exact
    // integers. Both float formats are renderable under the same condition -
    // `EXT_color_buffer_float` on WebGL2, core on WebGPU - and the caller only
    // builds this field where that condition holds, so the wider one is
    // available whenever it is needed.
    if (format !== this._seedFormat) {
      this._seeds[0].destroy();
      this._seeds[1].destroy();
      this._seedFormat = format;
      this._seeds = createSeeds(format);
    }

    this._seeds[0].setSize(width, height);
    this._seeds[1].setSize(width, height);
    this._distance.setSize(width, height);
  }

  /**
   * Point the field at this frame's camera. `texel` is one mask texel in world
   * units and `far` the reach the distance is stored as a fraction of - the
   * view's diagonal, so nothing the camera sees saturates.
   */
  public update(texel: number, far: number): void {
    this._far = Math.max(1, far);
    this._resolveFilter.uniforms.uScale.set(texel);
    this._resolveFilter.uniforms.uFar.set(this._far);
  }

  public destroy(): void {
    this.pass.destroy();
    this._seedFilter.destroy();
    this._stepFilter.destroy();
    this._resolveFilter.destroy();
    this._seeds[0].destroy();
    this._seeds[1].destroy();
    this._distance.destroy();
  }

  /**
   * Seed from the mask, flood, resolve.
   *
   * The stride halves from half the field's longest side down to one, which is
   * the schedule that makes the result exact for all but a few pathological
   * seed layouts - and those are wrong by a texel, which is below what the
   * conservative mask width already costs.
   */
  private _build(pass: PassContext): void {
    const { backend } = pass;
    const width = this._distance.width;
    const height = this._distance.height;

    if (width <= 1 && height <= 1) {
      return;
    }

    const [first, second] = this._seeds;

    this._seedFilter.apply(backend, this._mask, first);

    let flipped = false;

    for (let stride = Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(width, height))) / 2); stride >= 1; stride /= 2) {
      this._stepFilter.uniforms.uStep.set(stride);
      this._stepFilter.apply(backend, flipped ? second : first, flipped ? first : second);
      flipped = !flipped;
    }

    this._resolveFilter.apply(backend, flipped ? second : first, this._distance);
  }
}
