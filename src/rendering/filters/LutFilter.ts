import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import { Texture } from '@/rendering/texture/Texture';
import { ScaleModes, WrapModes } from '@/rendering/types';

import { Filter } from './Filter';
import { WebGl2ShaderFilter } from './WebGl2ShaderFilter';
import { WebGpuShaderFilter } from './WebGpuShaderFilter';

/** Storage layout for a Look-Up Table texture. */
export type LutMode = '1d' | '3d';

/** Construction options for {@link LutFilter}. */
export interface LutFilterOptions {
  /**
   * Storage mode of the LUT texture.
   * - `'1d'` — texture is `N×1`, indexed by the source pixel's red channel. Used for palette mapping and indexed-color effects.
   * - `'3d'` — texture is `N²×N`, indexed by the full source RGB. Used for color grading, tone mapping, film emulation. Default `'3d'`.
   */
  mode?: LutMode;
  /**
   * Size `N` of a 3D LUT (cube edge length). Common values: 8, 16, 17, 32, 33. Ignored for 1D mode.
   * Default `17` (matches DaVinci/OBS export defaults).
   */
  size?: number;
}

const glsl1dFragment = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform sampler2D uLut;
in vec2 vUv;
out vec4 fragColor;
void main() {
    vec4 src = texture(uTexture, vUv);
    vec3 graded = texture(uLut, vec2(src.r, 0.5)).rgb;
    fragColor = vec4(graded, src.a);
}
`;

const glsl3dFragment = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform sampler2D uLut;
uniform float uLutSize;
in vec2 vUv;
out vec4 fragColor;

vec3 sampleLut3d(vec3 c) {
    float n = uLutSize;
    float scaled = clamp(c.b, 0.0, 1.0) * (n - 1.0);
    float bLow = floor(scaled);
    float bHigh = min(bLow + 1.0, n - 1.0);
    float bFrac = scaled - bLow;
    float invN2 = 1.0 / (n * n);
    float invN = 1.0 / n;
    float halfPx = 0.5 / (n * n);
    float halfRow = 0.5 / n;
    float rOff = clamp(c.r, 0.0, 1.0) * (n - 1.0) * invN2;
    float gOff = clamp(c.g, 0.0, 1.0) * (n - 1.0) * invN + halfRow;
    float uLow = bLow * invN + rOff + halfPx;
    float uHigh = bHigh * invN + rOff + halfPx;
    vec3 lo = texture(uLut, vec2(uLow, gOff)).rgb;
    vec3 hi = texture(uLut, vec2(uHigh, gOff)).rgb;
    return mix(lo, hi, bFrac);
}

void main() {
    vec4 src = texture(uTexture, vUv);
    fragColor = vec4(sampleLut3d(src.rgb), src.a);
}
`;

const wgsl1dFragment = `
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(1) var uLut: texture_2d<f32>;

@fragment
fn fragMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let src = textureSample(uTexture, uSampler, vUv);
    let graded = textureSample(uLut, uSampler, vec2<f32>(src.r, 0.5)).rgb;
    return vec4<f32>(graded, src.a);
}
`;

const wgsl3dFragment = `
struct Uniforms {
    uLutSize: f32,
};

@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;
@group(1) @binding(1) var uLut: texture_2d<f32>;

fn sampleLut3d(c: vec3<f32>) -> vec3<f32> {
    let n = uniforms.uLutSize;
    let scaled = clamp(c.b, 0.0, 1.0) * (n - 1.0);
    let bLow = floor(scaled);
    let bHigh = min(bLow + 1.0, n - 1.0);
    let bFrac = scaled - bLow;
    let invN2 = 1.0 / (n * n);
    let invN = 1.0 / n;
    let halfPx = 0.5 / (n * n);
    let halfRow = 0.5 / n;
    let rOff = clamp(c.r, 0.0, 1.0) * (n - 1.0) * invN2;
    let gOff = clamp(c.g, 0.0, 1.0) * (n - 1.0) * invN + halfRow;
    let uLow = bLow * invN + rOff + halfPx;
    let uHigh = bHigh * invN + rOff + halfPx;
    let lo = textureSample(uLut, uSampler, vec2<f32>(uLow, gOff)).rgb;
    let hi = textureSample(uLut, uSampler, vec2<f32>(uHigh, gOff)).rgb;
    return mix(lo, hi, bFrac);
}

@fragment
fn fragMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let src = textureSample(uTexture, uSampler, vUv);
    return vec4<f32>(sampleLut3d(src.rgb), src.a);
}
`;

/**
 * A {@link Filter} that maps every pixel of the input through a Look-Up Table texture.
 *
 * Two storage modes:
 * - **1D LUT** (`N×1`, default `N=256`): indexed by the source's red channel only. Used for palette cycling, indexed-colour effects, and luminance-based recoloring.
 * - **3D LUT** (`N²×N` unwrapped cube): indexed by the full source RGB with trilinear interpolation between slices. Used for cinematic colour grading, tone mapping, film stock emulation, accessibility filters (color-blindness simulation), and similar standard colour-pipeline tasks. `N=17` matches DaVinci/OBS export defaults.
 *
 * ## Quick start
 *
 * ```ts
 * // Color-graded look from a 17³ LUT exported by your DCC/grading tool:
 * const lut = LutFilter.fromImage(myLutImage);                 // 289×17 PNG
 * const filter = new LutFilter({ mode: '3d', size: 17 }).setLut(lut);
 * sprite.filters = [filter];
 *
 * // Palette cycling — rotate a 1D palette every frame:
 * const palette = LutFilter.identityLut1D();
 * const filter = new LutFilter({ mode: '1d' }).setLut(palette);
 * // Replace `palette.source` per frame with a shifted copy.
 * ```
 *
 * Internally creates a {@link WebGl2ShaderFilter} or {@link WebGpuShaderFilter} on first
 * apply, depending on the active backend.
 */
export class LutFilter extends Filter {
  /**
   * Build a 1D identity LUT (`N×1` texture with smooth grayscale gradient).
   *
   * Useful as a starting point: applying this LUT is a no-op, mutate
   * `texture.source` to derive cycling palettes, posterization, sepia,
   * grayscale, etc.
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
   * DaVinci Resolve, OBS, and similar tools — typically a `289×17` or
   * `1024×32` strip for 3D LUTs, or a `256×1` strip for 1D.
   */
  public static fromImage(image: HTMLImageElement | HTMLCanvasElement): Texture {
    return new Texture(image, { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.ClampToEdge, generateMipMap: false });
  }

  private readonly _mode: LutMode;
  private readonly _size: number;
  private _lut: Texture;
  private _backendFilter: WebGl2ShaderFilter | WebGpuShaderFilter | null = null;

  public constructor(options: LutFilterOptions = {}) {
    super();
    this._mode = options.mode ?? '3d';
    this._size = Math.max(2, Math.floor(options.size ?? 17));
    this._lut = this._mode === '1d' ? LutFilter.identityLut1D() : LutFilter.identityLut3D(this._size);
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
    if (this._backendFilter !== null) {
      this._backendFilter.uniforms.uLut = lut;
    }
    return this;
  }

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture): void {
    if (this._backendFilter === null) {
      this._backendFilter = this._createBackendFilter(backend);
    }
    this._backendFilter.apply(backend, input, output);
  }

  public override destroy(): void {
    if (this._backendFilter !== null) {
      this._backendFilter.destroy();
      this._backendFilter = null;
    }
  }

  private _createBackendFilter(backend: RenderBackend): WebGl2ShaderFilter | WebGpuShaderFilter {
    const is3d = this._mode === '3d';
    const uniforms: Record<string, Texture | number> = { uLut: this._lut };
    if (is3d) {
      uniforms.uLutSize = this._size;
    }
    if (backend.backendType === RenderBackendType.WebGpu) {
      return new WebGpuShaderFilter({
        fragmentSource: is3d ? wgsl3dFragment : wgsl1dFragment,
        uniforms,
      });
    }
    return new WebGl2ShaderFilter({
      fragmentSource: is3d ? glsl3dFragment : glsl1dFragment,
      uniforms,
    });
  }
}
