/// <reference types="@webgpu/types" />

import { Curve } from '#distributions/Curve';
import type { ParticleBatch } from '#ParticleStorage';

import type { GlslContribution } from './GlslContribution';
import { ParticleCurveLookup, particleLookupGlsl, particleLookupWgsl, sampleCurveLookup, uploadParticleLookup } from './particleLookup';
import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

/**
 * Fades only the alpha channel over a particle's lifetime, leaving RGB
 * untouched. Pair with a spawn-time tint or a separate `ColorOverLifetime`
 * to keep the color layer stable while controlling opacity from a single
 * curve.
 *
 * The default curve `1 → 0` produces a linear fade-out. For a fade-in then
 * fade-out, pass a curve like `[0,0]→[0.5,1]→[1,0]`.
 *
 * CPU, WebGL2 and WebGPU use the same 256-sample lookup table with
 * explicit linear interpolation. Narrow keyframe features are approximated.
 * Color channels are quantized to the nearest byte after interpolation.
 */
export class AlphaFadeOverLifetime extends UpdateModule {
  private readonly _lookup = new ParticleCurveLookup();

  public curve: Curve;

  public constructor(
    curve: Curve = new Curve([
      { t: 0, v: 1 },
      { t: 1, v: 0 },
    ]),
  ) {
    super();
    this.curve = curve;
  }

  public override apply(particles: ParticleBatch, _dt: number): void {
    const { elapsed, lifetime } = particles.timing;
    const color = particles.color;
    const liveCount = particles.count;
    const lookup = this._lookup.get(this.curve);

    for (let i = 0; i < liveCount; i++) {
      const t = (elapsed[i] ?? 0) / Math.max(lifetime[i] ?? 1, 0.000001);
      const a = sampleCurveLookup(lookup, t);
      const alphaByte = Math.round(Math.max(0, Math.min(1, a)) * 255) & 255;

      color[i] = ((color[i] ?? 0) & 0x00ffffff) | (alphaByte << 24);
    }
  }

  public override glsl(): GlslContribution {
    return {
      ...this.wgsl(),
      prelude: particleLookupGlsl('AlphaFadeOverLifetime', 'curve'),
      body: `
float alphaSample = AlphaFadeOverLifetime_sample(timing.x / max(timing.y, 0.000001)).r;
uint alphaByte = uint(floor(clamp(alphaSample, 0.0, 1.0) * 255.0 + 0.5));
color = (color & 0x00ffffffu) | (alphaByte << 24u);
      `,
    };
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'AlphaFadeOverLifetime',
      prelude: particleLookupWgsl('AlphaFadeOverLifetime', 'curve'),
      textures: [{ name: 'curve', format: 'r32float' }],
      body: `
                let alphaT = clamp(timing[idx].x / max(timing[idx].y, 0.000001), 0.0, 1.0);
                let alphaSample = AlphaFadeOverLifetime_sample(alphaT).r;
                let alphaByte = u32(floor(clamp(alphaSample, 0.0, 1.0) * 255.0 + 0.5)) & 255u;
                color[idx] = (color[idx] & 0x00ffffffu) | (alphaByte << 24u);
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
