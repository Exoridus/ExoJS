import type { ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import type { RenderBackend } from '#rendering/RenderBackend';
import { assertNumericTexture } from '#rendering/texture/numericTexture';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { UniformType } from '#rendering/uniforms/UniformType';

import { Filter } from './Filter';
import { createFilterShader, ShaderFilter } from './ShaderFilter';
import glslFragment from './shaders/displacement.frag';
import wgslFragment from './shaders/displacement.wgsl';

const displacementUniforms = { uScale: UniformType.Vec4, uOffset: UniformType.Vec4 } as const;

/**
 * The displacement source pair, built once and shared by every instance.
 * @internal
 */
export const displacementShader = createFilterShader({ glsl: { fragment: glslFragment }, wgsl: wgslFragment, uniforms: displacementUniforms });

/** Construction-time options for a {@link DisplacementFilter}. */
export interface DisplacementFilterOptions {
  /**
   * The displacement map. Its red and green channels are read as a direction in
   * `[-1, 1]` (`0.5` grey displaces nothing), stretched across the filtered
   * area and read with the texture's own filtering and wrap mode. The filter
   * samples the map but does not own it - destroying the filter leaves the
   * texture alone.
   *
   * Sampled as numeric data, never colour: the map must resolve to
   * `colorSpace: 'none'`. `'srgb'` storage is hardware-decoded on sample
   * regardless of what the shader does with the result, and `'linear-srgb'`
   * still gets colour alpha handling, either of which would corrupt the
   * displacement vector. A `DataTexture` is accepted directly, as is an image
   * `Texture` declared `colorSpace: 'none'`. The check repeats on every
   * {@link DisplacementFilter.apply}, so a texture reinterpreted after
   * assignment fails there instead of sampling corrupted vectors.
   * @throws Error - `map.colorSpace` does not resolve to `'none'`.
   */
  readonly map: Texture;
  /**
   * Maximum displacement in LOGICAL units, per axis; one number applies to
   * both. Negative values invert the direction. Default `20`.
   */
  readonly scale?: number | readonly [x: number, y: number];
  /**
   * Where the map is sampled from, in the map's own UV units (`u` right, `v`
   * down the image). Animate it to scroll the distortion across the subject
   * without redrawing the map; give the map `WrapModes.Repeat` for a scroll
   * that never runs off its edge. Default `[0, 0]`.
   */
  readonly offset?: readonly [u: number, v: number];
}

/**
 * A {@link Filter} that offsets every fragment's source position by a direction
 * read out of a texture - heat haze, water refraction, glass, shockwaves and
 * dissolve-style warping.
 *
 * The map's red channel drives the horizontal direction and its green channel
 * the vertical, both decoded from `[0, 1]` to `[-1, 1]`, so flat `(0.5, 0.5)`
 * grey is no displacement at all. The result is scaled by {@link scaleX} /
 * {@link scaleY} in logical units, which keeps the distortion the same size on
 * screen at every pixel ratio and {@link Filter.resolution}.
 *
 * ```ts
 * const haze = new DisplacementFilter({ map: noiseTexture, scale: 12 });
 *
 * water.filters = [haze];
 *
 * // Scroll the map from the scene's update to animate the distortion.
 * haze.offsetV -= delta * 0.1;
 * ```
 *
 * A fragment displaced past the edge of the effect domain has nothing to read
 * and comes out transparent rather than smearing the border. The domain grows
 * by the largest displacement on every side, so a subject at rest keeps the
 * room its distortion needs.
 *
 * Runs on a {@link ShaderFilter} carrying both a GLSL and a WGSL source, so it
 * works on either backend without the caller choosing one.
 */
export class DisplacementFilter extends Filter {
  private readonly _shaderFilter: ShaderFilter<typeof displacementUniforms>;
  private _map: Texture;
  private _scaleX: number;
  private _scaleY: number;

  public constructor(options: DisplacementFilterOptions) {
    super();

    assertNumericMap(options.map);

    const scale = options.scale ?? 20;
    const offset = options.offset ?? [0, 0];

    this._map = options.map;
    this._scaleX = typeof scale === 'number' ? scale : scale[0];
    this._scaleY = typeof scale === 'number' ? scale : scale[1];
    this._shaderFilter = ShaderFilter.from(displacementShader, {
      uniforms: { uOffset: [offset[0], offset[1], 0, 0] },
      textures: { uMap: this._map },
    });
  }

  /** The displacement map. Assigning swaps it without rebuilding the pass. */
  public get map(): Texture {
    return this._map;
  }

  public set map(map: Texture) {
    if (this._map !== map) {
      assertNumericMap(map);
      this._map = map;
      this._shaderFilter._setTexture('uMap', map);
    }
  }

  /** Maximum horizontal displacement in logical units. */
  public get scaleX(): number {
    return this._scaleX;
  }

  public set scaleX(scaleX: number) {
    if (this._scaleX !== scaleX) {
      this._scaleX = scaleX;
      this.invalidate();
    }
  }

  /** Maximum vertical displacement in logical units. */
  public get scaleY(): number {
    return this._scaleY;
  }

  public set scaleY(scaleY: number) {
    if (this._scaleY !== scaleY) {
      this._scaleY = scaleY;
      this.invalidate();
    }
  }

  /** Horizontal map sampling offset, in the map's own UV units. */
  public get offsetU(): number {
    return this._shaderFilter.uniforms.uOffset.x;
  }

  public set offsetU(offsetU: number) {
    this._shaderFilter.uniforms.uOffset.x = offsetU;
  }

  /** Vertical map sampling offset, in the map's own UV units. */
  public get offsetV(): number {
    return this._shaderFilter.uniforms.uOffset.y;
  }

  public set offsetV(offsetV: number) {
    this._shaderFilter.uniforms.uOffset.y = offsetV;
  }

  /** Set both axes at once. Returns `this` for chaining. */
  public setScale(scale: number | readonly [x: number, y: number]): this {
    this.scaleX = typeof scale === 'number' ? scale : scale[0];
    this.scaleY = typeof scale === 'number' ? scale : scale[1];

    return this;
  }

  /**
   * A fragment can be displaced by the full scale in either direction, so the
   * effect reaches that far on every side - the same distance on both axes,
   * because a diagonal displacement uses both at once.
   */
  public override getOutputBounds(input: ReadonlyRectangle, output: Rectangle): void {
    const reach = Math.max(Math.abs(this._scaleX), Math.abs(this._scaleY));

    output.set(input.x - reach, input.y - reach, input.width + reach * 2, input.height + reach * 2);
  }

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution = 1): void {
    assertNumericMap(this._map);

    // Logical units become UV units of THIS target, which the caller sizes:
    // resolving it here is what keeps the distortion the same size on screen
    // whatever pixel ratio or filter resolution the pass runs at.
    this._shaderFilter.uniforms.uScale.set((this._scaleX * resolution) / output.width, (this._scaleY * resolution) / output.height, 0, 0);
    this._shaderFilter.apply(backend, input, output, resolution);
  }

  public override destroy(): void {
    super.destroy();
    this._shaderFilter.destroy();
  }
}

const assertNumericMap = (map: Texture): void => {
  assertNumericTexture(map, 'DisplacementFilter map', "Build the map as a DataTexture, or declare it colorSpace: 'none'.");
};
