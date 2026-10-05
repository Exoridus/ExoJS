/// <reference types="@webgpu/types" />

import type { ColorGradient } from '#distributions/ColorGradient';
import type { ParticleBatch } from '#ParticleStorage';

import type { GlslContribution } from './GlslContribution';
import { ParticleColorLookup, particleLookupGlsl, particleLookupWgsl, sampleColorLookup, uploadParticleLookup } from './particleLookup';
import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

const lookupSize = 256;

/**
 * Per-frame, per-particle color sampler. Each live particle's tint is set
 * to the gradient evaluated at the particle's current `elapsed / lifetime`
 * ratio, packed RGBA. Replaces the per-particle blend of `ColorAffector`
 * (legacy) with a multi-keyframe gradient.
 *
 * CPU, WebGL2 and WebGPU use the same 256-sample lookup table with
 * explicit linear interpolation. Narrow keyframe features are approximated.
 * Color channels are quantized to the nearest byte after interpolation.
 */
export class ColorOverLifetime extends UpdateModule {
  private readonly _lookup = new ParticleColorLookup();

  public gradient: ColorGradient;

  public constructor(gradient: ColorGradient) {
    super();
    this.gradient = gradient;
  }

  public override apply(particles: ParticleBatch, _dt: number): void {
    const { elapsed, lifetime } = particles.timing;
    const color = particles.color;
    const liveCount = particles.count;
    const lookup = this._lookup.get(this.gradient);

    for (let i = 0; i < liveCount; i++) {
      const t = (elapsed[i] ?? 0) / Math.max(lifetime[i] ?? 1, 0.000001);

      color[i] = sampleColorLookup(lookup, t);
    }
  }

  public override glsl(): GlslContribution {
    return {
      ...this.wgsl(),
      prelude: particleLookupGlsl('ColorOverLifetime', 'gradient'),
      body: `
vec4 colorSample = ColorOverLifetime_sample(timing.x / max(timing.y, 0.000001));
uvec4 colorBytes = uvec4(floor(colorSample * 255.0 + 0.5));
color = (colorBytes.a << 24u) | (colorBytes.b << 16u) | (colorBytes.g << 8u) | colorBytes.r;
      `,
    };
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'ColorOverLifetime',
      prelude: particleLookupWgsl('ColorOverLifetime', 'gradient'),
      textures: [{ name: 'gradient', format: 'rgba8unorm' }],
      body: `
                let colorT = clamp(timing[idx].x / max(timing[idx].y, 0.000001), 0.0, 1.0);
                let colorSample = ColorOverLifetime_sample(colorT);
                let r = u32(floor(colorSample.r * 255.0 + 0.5)) & 255u;
                let g = u32(floor(colorSample.g * 255.0 + 0.5)) & 255u;
                let b = u32(floor(colorSample.b * 255.0 + 0.5)) & 255u;
                let a = u32(floor(colorSample.a * 255.0 + 0.5)) & 255u;
                color[idx] = (a << 24u) | (b << 16u) | (g << 8u) | r;
            `,
    };
  }

  public override textureData(): ReadonlyMap<string, Uint8Array<ArrayBuffer>> {
    return new Map([['gradient', this._lookup.get(this.gradient)]]);
  }

  public override uploadTextures(device: GPUDevice, textures: ReadonlyMap<string, GPUTexture>): void {
    uploadParticleLookup(device, textures.get('gradient'), this._lookup.get(this.gradient));
  }
}

/** Texture width for the gradient lookup table. Exposed for ParticleGpuState. */
export const colorLookupSize = lookupSize;
