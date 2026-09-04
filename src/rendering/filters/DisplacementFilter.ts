import type { ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';

import { Filter } from './Filter';
import { createFilterShaderSource, ShaderFilter } from './ShaderFilter';
import glslFragment from './shaders/displacement.frag';
import wgslFragment from './shaders/displacement.wgsl';

/**
 * The displacement source pair, built once and shared by every instance.
 * @internal
 */
export const displacementShaderSource = createFilterShaderSource({ glsl: { fragment: glslFragment }, wgsl: wgslFragment });

/** Construction-time options for a {@link DisplacementFilter}. */
export interface DisplacementFilterOptions {
  /**
   * The displacement map. Its red and green channels are read as a direction in
   * `[-1, 1]` (`0.5` grey displaces nothing), stretched across the filtered
   * area and read with the texture's own filtering and wrap mode. The filter
   * samples the map but does not own it - destroying the filter leaves the
   * texture alone.
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
  /**
   * Bound live: `uScale` is the displacement in UV units of the pass target,
   * `uOffset` the map sampling offset. Insertion order is the WGSL struct order.
   */
  private readonly _scaleUniform: Float32Array;
  private readonly _offsetUniform: Float32Array;
  private readonly _shaderFilter: ShaderFilter;
  private _map: Texture;
  private _scaleX: number;
  private _scaleY: number;

  public constructor(options: DisplacementFilterOptions) {
    super();

    const scale = options.scale ?? 20;
    const offset = options.offset ?? [0, 0];
    const scaleUniform = new Float32Array(4);
    const offsetUniform = new Float32Array(4);

    this._map = options.map;
    this._scaleX = typeof scale === 'number' ? scale : scale[0];
    this._scaleY = typeof scale === 'number' ? scale : scale[1];
    this._scaleUniform = scaleUniform;
    this._offsetUniform = offsetUniform;
    offsetUniform[0] = offset[0];
    offsetUniform[1] = offset[1];

    // Insertion order matters on WebGPU: the packer lays each non-texture
    // uniform out in a 16-byte slot, in declaration order, and textures follow.
    this._shaderFilter = ShaderFilter.from(displacementShaderSource, {
      uniforms: { uScale: scaleUniform, uOffset: offsetUniform, uMap: this._map },
    });
  }

  /** The displacement map. Assigning swaps it without rebuilding the pass. */
  public get map(): Texture {
    return this._map;
  }

  public set map(map: Texture) {
    if (this._map !== map) {
      this._map = map;
      this._shaderFilter.setUniform('uMap', map);
      this.invalidate();
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
    return this._offsetUniform[0]!;
  }

  public set offsetU(offsetU: number) {
    if (this._offsetUniform[0] !== offsetU) {
      this._offsetUniform[0] = offsetU;
      this.invalidate();
    }
  }

  /** Vertical map sampling offset, in the map's own UV units. */
  public get offsetV(): number {
    return this._offsetUniform[1]!;
  }

  public set offsetV(offsetV: number) {
    if (this._offsetUniform[1] !== offsetV) {
      this._offsetUniform[1] = offsetV;
      this.invalidate();
    }
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
    // Logical units become UV units of THIS target, which the caller sizes:
    // resolving it here is what keeps the distortion the same size on screen
    // whatever pixel ratio or filter resolution the pass runs at.
    this._scaleUniform[0] = (this._scaleX * resolution) / output.width;
    this._scaleUniform[1] = (this._scaleY * resolution) / output.height;
    this._shaderFilter.apply(backend, input, output, resolution);
  }

  public override destroy(): void {
    super.destroy();
    this._shaderFilter.destroy();
  }
}
