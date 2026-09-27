/// <reference types="@webgpu/types" />

import type { Curve } from '#distributions/Curve';
import type { ParticleBatch } from '#ParticleStorage';

import type { GlslContribution } from './GlslContribution';
import { ParticleCurveLookup, particleLookupGlsl, particleLookupWgsl, sampleCurveLookup, uploadParticleLookup } from './particleLookup';
import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

/**
 * Multiplies velocity by the ratio between a curve sampled at the current
 * lifetime ratio and at `(elapsed - dt) / lifetime`. The previous sample is
 * clamped to at least `1e-6`, keeping zero crossings finite; negative previous
 * samples use the same lower bound. All backends use the same stateless ratio,
 * so particle compaction and slot reuse cannot inherit another particle's state.
 *
 * Uses a 256-sample float lookup table with linear interpolation on CPU,
 * WebGL2 and WebGPU. Features narrower than one lookup interval are approximated.
 */
export class VelocityOverLifetime extends UpdateModule {
  private readonly _lookup = new ParticleCurveLookup();

  public curve: Curve;

  public constructor(curve: Curve) {
    super();
    this.curve = curve;
  }

  public override apply(particles: ParticleBatch, dt: number): void {
    const { x: velX, y: velY } = particles.velocity;
    const { elapsed, lifetime } = particles.timing;
    const liveCount = particles.count;
    const lookup = this._lookup.get(this.curve);

    for (let i = 0; i < liveCount; i++) {
      const life = Math.max(lifetime[i] ?? 1, 0.000001);
      const age = elapsed[i] ?? 0;
      const sample = sampleCurveLookup(lookup, age / life);
      const previous = sampleCurveLookup(lookup, (age - dt) / life);
      const ratio = sample / Math.max(previous, 0.000001);
      velX[i] = (velX[i] ?? 0) * ratio;
      velY[i] = (velY[i] ?? 0) * ratio;
    }
  }

  public override glsl(): GlslContribution {
    return {
      ...this.wgsl(),
      prelude: particleLookupGlsl('VelocityOverLifetime', 'curve'),
      body: `
float velLifetime = max(timing.y, 0.000001);
float velSampleNow = VelocityOverLifetime_sample(timing.x / velLifetime).r;
float velSamplePrev = VelocityOverLifetime_sample((timing.x - dt) / velLifetime).r;
velocity *= velSampleNow / max(velSamplePrev, 0.000001);
      `,
    };
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'VelocityOverLifetime',
      prelude: particleLookupWgsl('VelocityOverLifetime', 'curve'),
      textures: [{ name: 'curve', format: 'r32float' }],
      body: `
                let velLifetime = max(timing[idx].y, 0.000001);
                let velTNow = clamp(timing[idx].x / velLifetime, 0.0, 1.0);
                let velTPrev = clamp((timing[idx].x - dt) / velLifetime, 0.0, 1.0);
                let velSampleNow = VelocityOverLifetime_sample(velTNow).r;
                let velSamplePrev = VelocityOverLifetime_sample(velTPrev).r;
                let velRatio = velSampleNow / max(velSamplePrev, 0.000001);
                velocities[idx] = velocities[idx] * velRatio;
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
