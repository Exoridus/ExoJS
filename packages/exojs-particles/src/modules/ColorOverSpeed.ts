/// <reference types="@webgpu/types" />

import type { ColorGradient } from '#distributions/ColorGradient';
import type { ParticleBatch } from '#ParticleStorage';

import type { GlslContribution } from './GlslContribution';
import { ParticleColorLookup, particleLookupGlsl, particleLookupWgsl, sampleColorLookup, uploadParticleLookup } from './particleLookup';
import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

/**
 * Per-frame, per-particle color sampler driven by velocity magnitude rather
 * than lifetime ratio. Each live particle's tint is set to the gradient
 * evaluated at `clamp((|velocity| - minSpeed) / (maxSpeed - minSpeed), 0, 1)`.
 *
 * Use cases: heat-mapping (slow=blue, fast=red), velocity-tinted trails,
 * speed-gated highlights.
 *
 * CPU, WebGL2 and WebGPU use the same 256-sample lookup table with
 * explicit linear interpolation. Narrow keyframe features are approximated.
 * Color channels are quantized to the nearest byte after interpolation.
 */
export class ColorOverSpeed extends UpdateModule {
  private readonly _lookup = new ParticleColorLookup();

  public gradient: ColorGradient;
  public minSpeed: number;
  public maxSpeed: number;

  public constructor(gradient: ColorGradient, minSpeed: number, maxSpeed: number) {
    super();
    this.gradient = gradient;
    this.minSpeed = minSpeed;
    this.maxSpeed = maxSpeed;
  }

  public override apply(particles: ParticleBatch, _dt: number): void {
    const { x: velX, y: velY } = particles.velocity;
    const color = particles.color;
    const liveCount = particles.count;
    const lookup = this._lookup.get(this.gradient);
    const min = this.minSpeed;
    const span = Math.max(1e-5, this.maxSpeed - this.minSpeed);

    for (let i = 0; i < liveCount; i++) {
      const vx = velX[i] ?? 0;
      const vy = velY[i] ?? 0;
      const speed = Math.sqrt(vx * vx + vy * vy);
      const t = Math.max(0, Math.min(1, (speed - min) / span));

      color[i] = sampleColorLookup(lookup, t);
    }
  }

  public override glsl(): GlslContribution {
    return {
      ...this.wgsl(),
      prelude: particleLookupGlsl('ColorOverSpeed', 'gradient'),
      body: `
float speedT = clamp((length(velocity) - u_ColorOverSpeed.minSpeed) * u_ColorOverSpeed.invSpan, 0.0, 1.0);
uvec4 speedBytes = uvec4(floor(ColorOverSpeed_sample(speedT) * 255.0 + 0.5));
color = (speedBytes.a << 24u) | (speedBytes.b << 16u) | (speedBytes.g << 8u) | speedBytes.r;
      `,
    };
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'ColorOverSpeed',
      uniforms: [
        { name: 'minSpeed', type: 'f32' },
        { name: 'invSpan', type: 'f32' },
      ],
      prelude: particleLookupWgsl('ColorOverSpeed', 'gradient'),
      textures: [{ name: 'gradient', format: 'rgba8unorm' }],
      body: `
                let speedMag = length(velocities[idx]);
                let speedT = clamp((speedMag - modules.u_ColorOverSpeed.minSpeed) * modules.u_ColorOverSpeed.invSpan, 0.0, 1.0);
                let speedSample = ColorOverSpeed_sample(speedT);
                let speedR = u32(floor(speedSample.r * 255.0 + 0.5)) & 255u;
                let speedG = u32(floor(speedSample.g * 255.0 + 0.5)) & 255u;
                let speedB = u32(floor(speedSample.b * 255.0 + 0.5)) & 255u;
                let speedA = u32(floor(speedSample.a * 255.0 + 0.5)) & 255u;
                color[idx] = (speedA << 24u) | (speedB << 16u) | (speedG << 8u) | speedR;
            `,
    };
  }

  public override writeUniforms(view: DataView, offset: number): void {
    const span = Math.max(1e-5, this.maxSpeed - this.minSpeed);

    view.setFloat32(offset + 0, this.minSpeed, true);
    view.setFloat32(offset + 4, 1 / span, true);
  }

  public override textureData(): ReadonlyMap<string, Uint8Array<ArrayBuffer>> {
    return new Map([['gradient', this._lookup.get(this.gradient)]]);
  }

  public override uploadTextures(device: GPUDevice, textures: ReadonlyMap<string, GPUTexture>): void {
    uploadParticleLookup(device, textures.get('gradient'), this._lookup.get(this.gradient));
  }
}
