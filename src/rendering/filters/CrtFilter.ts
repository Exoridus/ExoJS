import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { UniformType } from '#rendering/uniforms/UniformType';

import { Filter } from './Filter';
import { createFilterShader, ShaderFilter } from './ShaderFilter';
import glslFragment from './shaders/crt.frag';
import wgslFragment from './shaders/crt.wgsl';

/** The shared CRT source pair. @internal */
export const crtShader = createFilterShader({
  glsl: { fragment: glslFragment },
  wgsl: wgslFragment,
  uniforms: { uStrength: UniformType.Float, uRgbSeparation: UniformType.Float, uTime: UniformType.Float },
});

/** Construction-time options for a {@link CrtFilter}. */
export interface CrtFilterOptions {
  /** Curvature, scanline, grain and vignette strength, clamped to `[0, 1]`. Default `0.8`. */
  readonly strength?: number;
  /** Horizontal red/blue sampling offset as a fraction of capture width, clamped to zero or greater. Default `0.006`. */
  readonly rgbSeparation?: number;
  /** Grain animation time in seconds, clamped to zero or greater. Advance it from the scene's update. Default `0`. */
  readonly time?: number;
}

/**
 * Curved CRT display with scanlines, grain, vignette and horizontal RGB separation.
 *
 * Set {@link strength} to `0` for RGB separation alone; setting both strength and
 * {@link rgbSeparation} to `0` leaves the input unchanged. Grain advances only
 * when the caller changes {@link time}, so a fixed time gives a still image.
 *
 * The three channel samples share their largest alpha, preserving separation
 * fringes around transparent content without adding grain to empty pixels.
 * The output stays inside the capture bounds; samples outside them are transparent.
 */
export class CrtFilter extends Filter {
  private readonly _shaderFilter = ShaderFilter.from(crtShader);
  private _strength = 0;
  private _rgbSeparation = 0;
  private _time = 0;

  public constructor(options: CrtFilterOptions = {}) {
    super();

    this.strength = options.strength ?? 0.8;
    this.rgbSeparation = options.rgbSeparation ?? 0.006;
    this.time = options.time ?? 0;
  }

  /** Curvature, scanline, grain and vignette strength in `[0, 1]`. */
  public get strength(): number {
    return this._strength;
  }

  public set strength(strength: number) {
    const next = Math.min(1, Math.max(0, strength));

    if (this.strength !== next) {
      this._strength = next;
      this._shaderFilter.uniforms.uStrength.set(next);
      this.invalidate();
    }
  }

  /** Horizontal red/blue sampling offset as a nonnegative fraction of capture width. */
  public get rgbSeparation(): number {
    return this._rgbSeparation;
  }

  public set rgbSeparation(rgbSeparation: number) {
    const next = Math.max(0, rgbSeparation);

    if (this.rgbSeparation !== next) {
      this._rgbSeparation = next;
      this._shaderFilter.uniforms.uRgbSeparation.set(next);
      this.invalidate();
    }
  }

  /** Nonnegative grain animation time in seconds. The filter never advances it automatically. */
  public get time(): number {
    return this._time;
  }

  public set time(time: number) {
    const next = Math.max(0, time);

    if (this.time !== next) {
      this._time = next;
      this._shaderFilter.uniforms.uTime.set(next);
      this.invalidate();
    }
  }

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution = 1): void {
    this._shaderFilter.apply(backend, input, output, resolution);
  }

  public override destroy(): void {
    super.destroy();
    this._shaderFilter.destroy();
  }
}
