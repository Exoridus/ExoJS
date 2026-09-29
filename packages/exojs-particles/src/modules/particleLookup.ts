import type { ColorGradient } from '#distributions/ColorGradient';
import type { Curve } from '#distributions/Curve';

const lookupSize = 256;

export class ParticleCurveLookup {
  private _source: Curve | null = null;
  private readonly _data = new Float32Array(lookupSize);

  public get(source: Curve): Float32Array<ArrayBuffer> {
    if (source !== this._source) {
      for (let i = 0; i < lookupSize; i++) this._data[i] = source.evaluate(i / (lookupSize - 1));
      this._source = source;
    }
    return this._data;
  }
}

/**
 * Numeric authored-color storage: this table holds packed `Color`
 * components (sRGB-encoded, per {@link ColorGradient}), never a
 * hardware-sRGB-decoded texture. The GL texture is uploaded as `RGBA8` and
 * the WebGPU texture as `rgba8unorm`, both read with a raw integer fetch
 * (`texelFetch` / `textureLoad`) so no backend applies an implicit sRGB
 * decode. {@link sampleColorLookup}, {@link particleLookupGlsl} and
 * {@link particleLookupWgsl} all implement the identical
 * nearest-plus-fractional-lerp formula over these bytes, so CPU, WebGL2 and
 * WebGPU particles read the same authored color at a given lifetime/speed
 * ratio. Conversion to linear light for rendering happens once, downstream,
 * in the sprite/mesh/ribbon/trail vertex stage that consumes the resulting
 * packed color - never here and never twice.
 */
export class ParticleColorLookup {
  private _source: ColorGradient | null = null;
  private readonly _data = new Uint8Array(lookupSize * 4);

  public get(source: ColorGradient): Uint8Array<ArrayBuffer> {
    if (source !== this._source) {
      for (let i = 0; i < lookupSize; i++) {
        const color = source.evaluateRgba(i / (lookupSize - 1));
        this._data[i * 4] = color & 255;
        this._data[i * 4 + 1] = (color >>> 8) & 255;
        this._data[i * 4 + 2] = (color >>> 16) & 255;
        this._data[i * 4 + 3] = color >>> 24;
      }
      this._source = source;
    }
    return this._data;
  }
}

export const sampleCurveLookup = (data: Float32Array, t: number): number => {
  const x = Math.max(0, Math.min(1, t)) * (lookupSize - 1);
  const lo = Math.floor(x);
  const a = data[lo] ?? 0;
  const b = data[Math.min(lo + 1, lookupSize - 1)] ?? 0;
  return a + (b - a) * (x - lo);
};

export const sampleColorLookup = (data: Uint8Array, t: number): number => {
  const x = Math.max(0, Math.min(1, t)) * (lookupSize - 1);
  const lo = Math.floor(x);
  const hi = Math.min(lo + 1, lookupSize - 1);
  const ratio = x - lo;
  let result = 0;
  for (let channel = 0; channel < 4; channel++) {
    const a = data[lo * 4 + channel] ?? 0;
    const b = data[hi * 4 + channel] ?? 0;
    result |= Math.round(a + (b - a) * ratio) << (channel * 8);
  }
  return result >>> 0;
};

export const uploadParticleLookup = (device: GPUDevice, texture: GPUTexture | undefined, data: Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>): void => {
  if (texture === undefined) return;
  device.queue.writeTexture(
    { texture },
    data.buffer,
    { offset: data.byteOffset, bytesPerRow: lookupSize * 4, rowsPerImage: 1 },
    { width: lookupSize, height: 1, depthOrArrayLayers: 1 },
  );
};

export const particleLookupWgsl = (key: string, name: string): string => `
fn ${key}_sample(t: f32) -> vec4<f32> {
    let x = clamp(t, 0.0, 1.0) * 255.0;
    let lo = i32(floor(x));
    let a = textureLoad(u_${key}_${name}, lo, 0);
    let b = textureLoad(u_${key}_${name}, min(lo + 1, 255), 0);
    return a + (b - a) * (x - f32(lo));
}`;

export const particleLookupGlsl = (key: string, name: string): string => `
vec4 ${key}_sample(float t) {
    float x = clamp(t, 0.0, 1.0) * 255.0;
    int lo = int(floor(x));
    vec4 a = texelFetch(u_${key}_${name}, ivec2(lo, 0), 0);
    vec4 b = texelFetch(u_${key}_${name}, ivec2(min(lo + 1, 255), 0), 0);
    return a + (b - a) * (x - float(lo));
}`;
