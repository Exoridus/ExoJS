/// <reference types="@webgpu/types" />

import { Color } from '@codexo/exojs';

import type { ColorGradient } from "#distributions/ColorGradient";
import type { ParticleSystem } from "#ParticleSystem";

import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

const lookupSize = 256;

/**
 * Per-frame, per-particle color sampler driven by velocity magnitude rather
 * than lifetime ratio. Each live particle's tint is set to the gradient
 * evaluated at `clamp((|velocity| - minSpeed) / (maxSpeed - minSpeed), 0, 1)`.
 *
 * Use cases: heat-mapping (slow=blue, fast=red), velocity-tinted trails,
 * speed-gated highlights.
 *
 * GPU-eligible: gradient uploaded as a 256-tap 1D RGBA8 texture, sampled
 * with linear filtering. Replaces the full color word — pair with a
 * separate {@link AlphaFadeOverLifetime} after this module if you want to
 * keep alpha controlled by lifetime.
 */
export class ColorOverSpeed extends UpdateModule {
  public gradient: ColorGradient;
  public minSpeed: number;
  public maxSpeed: number;

  public constructor(gradient: ColorGradient, minSpeed: number, maxSpeed: number) {
    super();
    this.gradient = gradient;
    this.minSpeed = minSpeed;
    this.maxSpeed = maxSpeed;
  }

  public override apply(system: ParticleSystem, _dt: number): void {
    const { velX, velY, color, liveCount } = system;
    const gradient = this.gradient;
    const min = this.minSpeed;
    const span = Math.max(1e-5, this.maxSpeed - this.minSpeed);

    for (let i = 0; i < liveCount; i++) {
      const vx = velX[i] ?? 0;
      const vy = velY[i] ?? 0;
      const speed = Math.sqrt(vx * vx + vy * vy);
      const t = Math.max(0, Math.min(1, (speed - min) / span));

      color[i] = gradient.evaluateRgba(t);
    }
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'ColorOverSpeed',
      uniforms: [
        { name: 'minSpeed', type: 'f32' },
        { name: 'invSpan', type: 'f32' },
      ],
      textures: [{ name: 'gradient', format: 'rgba8unorm' }],
      body: `
                let speedMag = length(velocities[idx]);
                let speedT = clamp((speedMag - modules.u_ColorOverSpeed.minSpeed) * modules.u_ColorOverSpeed.invSpan, 0.0, 1.0);
                let speedSample = textureSampleLevel(u_ColorOverSpeed_gradient, u_ColorOverSpeed_gradient_sampler, speedT, 0.0);
                let speedR = u32(speedSample.r * 255.0) & 255u;
                let speedG = u32(speedSample.g * 255.0) & 255u;
                let speedB = u32(speedSample.b * 255.0) & 255u;
                let speedA = u32(speedSample.a * 255.0) & 255u;
                color[idx] = (speedA << 24u) | (speedB << 16u) | (speedG << 8u) | speedR;
            `,
    };
  }

  public override writeUniforms(view: DataView, offset: number): void {
    const span = Math.max(1e-5, this.maxSpeed - this.minSpeed);

    view.setFloat32(offset + 0, this.minSpeed, true);
    view.setFloat32(offset + 4, 1 / span, true);
  }

  public override uploadTextures(device: GPUDevice, textures: ReadonlyMap<string, GPUTexture>): void {
    const texture = textures.get('gradient');

    if (texture === undefined) {
      return;
    }

    const data = new Uint8Array(lookupSize * 4);
    const scratch = new Color();

    for (let i = 0; i < lookupSize; i++) {
      const t = i / (lookupSize - 1);

      this.gradient.evaluate(t, scratch);

      const o = i * 4;

      data[o + 0] = scratch.r & 255;
      data[o + 1] = scratch.g & 255;
      data[o + 2] = scratch.b & 255;
      data[o + 3] = ((scratch.a * 255) | 0) & 255;
    }

    device.queue.writeTexture(
      { texture },
      data.buffer,
      { offset: 0, bytesPerRow: lookupSize * 4, rowsPerImage: 1 },
      { width: lookupSize, height: 1, depthOrArrayLayers: 1 },
    );
  }
}
