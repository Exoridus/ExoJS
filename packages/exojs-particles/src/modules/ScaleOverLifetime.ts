/// <reference types="@webgpu/types" />

import type { Curve } from '#distributions/Curve';
import type { ParticleBatch } from '#ParticleStorage';

import type { GlslContribution } from './GlslContribution';
import { ParticleCurveLookup, particleLookupGlsl, particleLookupWgsl, sampleCurveLookup, uploadParticleLookup } from './particleLookup';
import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

const lookupSize = 256;

/**
 * Sets every live particle's scale to a curve sampled at the particle's
 * current lifetime ratio. Both axes share one curve; non-uniform per-axis
 * scaling isn't supported by this module.
 *
 * Common patterns: shrink-to-zero (start at 1, end at 0), pulse (sine-like
 * curve up to peak then down), slow-grow (linear ramp).
 *
 * CPU, WebGL2 and WebGPU use the same 256-sample lookup table with
 * explicit linear interpolation. Narrow keyframe features are approximated.
 */
export class ScaleOverLifetime extends UpdateModule {
  private readonly _lookup = new ParticleCurveLookup();

  public curve: Curve;

  public constructor(curve: Curve) {
    super();
    this.curve = curve;
  }

  public override apply(particles: ParticleBatch, _dt: number): void {
    const { x: scaleX, y: scaleY } = particles.scale;
    const { elapsed, lifetime } = particles.timing;
    const liveCount = particles.count;
    const lookup = this._lookup.get(this.curve);

    for (let i = 0; i < liveCount; i++) {
      const t = (elapsed[i] ?? 0) / Math.max(lifetime[i] ?? 1, 0.000001);
      const s = sampleCurveLookup(lookup, t);

      scaleX[i] = s;
      scaleY[i] = s;
    }
  }

  public override glsl(): GlslContribution {
    return {
      ...this.wgsl(),
      prelude: particleLookupGlsl('ScaleOverLifetime', 'curve'),
      body: `
scale = vec2(ScaleOverLifetime_sample(timing.x / max(timing.y, 0.000001)).r);
      `,
    };
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'ScaleOverLifetime',
      prelude: particleLookupWgsl('ScaleOverLifetime', 'curve'),
      textures: [{ name: 'curve', format: 'r32float' }],
      body: `
                let scaleT = clamp(timing[idx].x / max(timing[idx].y, 0.000001), 0.0, 1.0);
                let scaleSample = ScaleOverLifetime_sample(scaleT).r;
                scales[idx] = vec2<f32>(scaleSample, scaleSample);
            `,
    };
  }

  public override textureData(): ReadonlyMap<string, Float32Array<ArrayBuffer>> {
    return new Map([['curve', this._lookup.get(this.curve)]]);
  }

  public override uploadTextures(device: GPUDevice, textures: ReadonlyMap<string, GPUTexture>): void {
    uploadParticleLookup(device, textures.get('curve'), this._lookup.get(this.curve));
  }
}

/** Texture width for the curve lookup table. Exposed for ParticleGpuState. */
export const scaleLookupSize = lookupSize;
