import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, WrapModes } from '#rendering/types';

import { Filter } from './Filter';
import { createFilterShaderSource, ShaderFilter } from './ShaderFilter';
import glsl3dFragment from './shaders/lut-3d.frag';
import wgsl3dFragment from './shaders/lut-3d.wgsl';
import glslRgb1dFragment from './shaders/lut-rgb1d.frag';
import wgslRgb1dFragment from './shaders/lut-rgb1d.wgsl';

/** Storage layout for a Look-Up Table texture. */
export type LutMode = 'rgb1d' | '3d';

/** Construction options for {@link LutFilter}. */
export interface LutFilterOptions {
  /**
   * Storage mode of the LUT texture.
   * - `'rgb1d'` - texture is `N×1`, holding three independent per-channel curves: red is graded through the LUT's red channel, green through green, blue through blue. Used for levels/curves-style grading, colour ramps and posterisation.
   * - `'3d'` - texture is `N²×N`, indexed by the full source RGB. Used for color grading, tone mapping, film emulation. Default `'3d'`.
   */
  mode?: LutMode;
  /**
   * Size `N` of a 3D LUT (cube edge length). Common values: 8, 16, 17, 32, 33. Ignored for 1D mode.
   * Default `17` (matches DaVinci/OBS export defaults).
   */
  size?: number;
}

// Three independent lookups, one per channel - NOT one lookup indexed by red.
// `textureSize` supplies N, so the sample lands on a texel centre for LUTs of
// any width and an identity ramp is an exact no-op.
/**
 * The per-channel-curve source pair, built once and shared by every `'rgb1d'`
 * instance. Exported so the structural parity checks can read the same object
 * the filter runs rather than a copy of it.
 * @internal
 */
export const lutRgb1dShaderSource = createFilterShaderSource({ glsl: { fragment: glslRgb1dFragment }, wgsl: wgslRgb1dFragment });

/**
 * The cube-lookup source pair, built once and shared by every `'3d'` instance.
 * @internal
 */
export const lut3dShaderSource = createFilterShaderSource({ glsl: { fragment: glsl3dFragment }, wgsl: wgsl3dFragment });

/**
 * A {@link Filter} that maps every pixel of the input through a Look-Up Table texture.
 *
 * Two storage modes:
 * - **RGB 1D LUT** (`N×1`, default `N=256`): three independent per-channel curves - `R' = lut(src.r).r`, `G' = lut(src.g).g`, `B' = lut(src.b).b`, alpha untouched. Used for levels/curves-style grading, colour ramps, posterisation and animated recolouring.
 * - **3D LUT** (`N²×N` unwrapped cube): indexed by the full source RGB with trilinear interpolation between slices. Used for cinematic colour grading, tone mapping, film stock emulation, accessibility filters (color-blindness simulation), and similar standard colour-pipeline tasks. `N=17` matches DaVinci/OBS export defaults.
 *
 * A 1D LUT cannot express cross-channel mixing (that is what the 3D mode is
 * for), and it is not an indexed-colour palette lookup: each channel only ever
 * sees its own curve.
 *
 * ## Quick start
 *
 * ```ts
 * // Color-graded look from a 17³ LUT exported by your DCC/grading tool:
 * const lut = LutFilter.fromImage(myLutImage);                 // 289×17 PNG
 * const filter = new LutFilter({ mode: '3d', size: 17 }).setLut(lut);
 * sprite.filters = [filter];
 *
 * // Animated per-channel curves - shift the ramp every frame:
 * const ramp = LutFilter.identityLut1D();
 * const filter = new LutFilter({ mode: 'rgb1d' }).setLut(ramp);
 * // Replace `ramp.source` per frame with a shifted copy.
 * ```
 *
 * Runs on a {@link ShaderFilter} carrying both a GLSL and a WGSL source, so it
 * works on either backend without the caller choosing one.
 */
export class LutFilter extends Filter {
  /**
   * Build a 1D identity LUT (`N×1` texture with a smooth grayscale gradient).
   *
   * Because all three channels carry the same ramp, applying this LUT in
   * `'rgb1d'` mode is an exact no-op for ANY colour. Mutate `texture.source` to
   * derive curves, posterization, contrast pushes, per-channel ramps, etc.
   */
  public static identityLut1D(size = 256): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      throw new Error('LutFilter.identityLut1D: 2D canvas context unavailable.');
    }
    const image = ctx.createImageData(size, 1);
    for (let i = 0; i < size; i++) {
      const v = Math.round((i / (size - 1)) * 255);
      const offset = i * 4;
      image.data[offset] = v;
      image.data[offset + 1] = v;
      image.data[offset + 2] = v;
      image.data[offset + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return new Texture(canvas, { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.ClampToEdge, generateMipMap: false });
  }

  /**
   * Build a 3D identity LUT (`N²×N` unwrapped cube texture).
   *
   * Applying this LUT is a no-op for any RGB input. Use as a starting point
   * for procedural grading or as a fallback when a real LUT image hasn't
   * loaded yet.
   */
  public static identityLut3D(size = 17): Texture {
    const width = size * size;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      throw new Error('LutFilter.identityLut3D: 2D canvas context unavailable.');
    }
    const image = ctx.createImageData(width, size);
    const max = size - 1;
    for (let bIndex = 0; bIndex < size; bIndex++) {
      const b = Math.round((bIndex / max) * 255);
      for (let g = 0; g < size; g++) {
        const gVal = Math.round((g / max) * 255);
        for (let r = 0; r < size; r++) {
          const rVal = Math.round((r / max) * 255);
          const x = bIndex * size + r;
          const y = g;
          const offset = (y * width + x) * 4;
          image.data[offset] = rVal;
          image.data[offset + 1] = gVal;
          image.data[offset + 2] = b;
          image.data[offset + 3] = 255;
        }
      }
    }
    ctx.putImageData(image, 0, 0);
    return new Texture(canvas, { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.ClampToEdge, generateMipMap: false });
  }

  /**
   * Wrap an image element as a LUT texture with the right sampler defaults
   * (linear filtering, clamp-to-edge, no mipmaps).
   *
   * Accepts the standard LUT image conventions exported by Photoshop,
   * DaVinci Resolve, OBS, and similar tools - typically a `289×17` or
   * `1024×32` strip for 3D LUTs, or a `256×1` strip for 1D.
   */
  public static fromImage(image: HTMLImageElement | HTMLCanvasElement): Texture {
    return new Texture(image, { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.ClampToEdge, generateMipMap: false });
  }

  private readonly _mode: LutMode;
  private readonly _size: number;
  private readonly _shaderFilter: ShaderFilter;
  private _lut: Texture;

  public constructor(options: LutFilterOptions = {}) {
    super();
    this._mode = options.mode ?? '3d';
    this._size = Math.max(2, Math.floor(options.size ?? 17));

    const is3d = this._mode === '3d';

    this._lut = is3d ? LutFilter.identityLut3D(this._size) : LutFilter.identityLut1D();

    // Insertion order matters on WebGPU: the packer lays each non-texture
    // uniform out in a 16-byte slot, in declaration order.
    const uniforms: Record<string, Texture | number> = is3d ? { uLutSize: this._size, uLut: this._lut } : { uLut: this._lut };

    this._shaderFilter = ShaderFilter.from(is3d ? lut3dShaderSource : lutRgb1dShaderSource, { uniforms });
  }

  /** The LUT mode this filter was constructed with. */
  public get mode(): LutMode {
    return this._mode;
  }

  /** The cube edge size (3D only). For 1D this returns the constructor-time size hint. */
  public get size(): number {
    return this._size;
  }

  /** The current LUT texture. */
  public get lut(): Texture {
    return this._lut;
  }

  /** Replace the LUT texture. Returns `this` for chaining. */
  public setLut(lut: Texture): this {
    this._lut = lut;
    this._shaderFilter.setUniform('uLut', lut);
    this.invalidate();
    return this;
  }

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution = 1): void {
    this._shaderFilter.apply(backend, input, output, resolution);
  }

  public override destroy(): void {
    super.destroy();
    this._shaderFilter.destroy();
  }
}
