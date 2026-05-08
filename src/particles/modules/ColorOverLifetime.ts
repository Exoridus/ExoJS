/// <reference types="@webgpu/types" />

import { Color } from '@/core/Color';
import type { Gradient } from '@/particles/distributions/Gradient';
import type { ParticleSystem } from '@/particles/ParticleSystem';

import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

const lookupSize = 256;

/**
 * Per-frame, per-particle color sampler. Each live particle's tint is set
 * to the gradient evaluated at the particle's current `elapsed / lifetime`
 * ratio, packed RGBA. Replaces the per-particle blend of `ColorAffector`
 * (legacy) with a multi-keyframe gradient.
 *
 * GPU-eligible: the gradient is uploaded once as a 256-tap 1D RGBA8 texture
 * and sampled with linear filtering on the GPU.
 */
export class ColorOverLifetime extends UpdateModule {
  public gradient: Gradient;

  public constructor(gradient: Gradient) {
    super();
    this.gradient = gradient;
  }

  public override apply(system: ParticleSystem, _dt: number): void {
    const { color, elapsed, lifetime, liveCount } = system;
    const gradient = this.gradient;

    for (let i = 0; i < liveCount; i++) {
      const t = elapsed[i] / lifetime[i];

      color[i] = gradient.evaluateRgba(t);
    }
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'ColorOverLifetime',
      textures: [{ name: 'gradient', format: 'rgba8unorm' }],
      body: `
                let colorT = clamp(timing[idx].x / max(timing[idx].y, 0.000001), 0.0, 1.0);
                let colorSample = textureSampleLevel(u_ColorOverLifetime_gradient, u_ColorOverLifetime_gradient_sampler, colorT, 0.0);
                let r = u32(colorSample.r * 255.0) & 255u;
                let g = u32(colorSample.g * 255.0) & 255u;
                let b = u32(colorSample.b * 255.0) & 255u;
                let a = u32(colorSample.a * 255.0) & 255u;
                color[idx] = (a << 24u) | (b << 16u) | (g << 8u) | r;
            `,
    };
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

/** Texture width for the gradient lookup table. Exposed for ParticleGpuState. */
export const colorLookupSize = lookupSize;
