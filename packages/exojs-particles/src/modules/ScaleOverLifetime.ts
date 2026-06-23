/// <reference types="@webgpu/types" />

import type { Curve } from "#distributions/Curve";
import type { ParticleSystem } from "#ParticleSystem";

import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

const lookupSize = 256;

/**
 * Sets every live particle's scale to a curve sampled at the particle's
 * current lifetime ratio. Both axes share one curve — for non-uniform
 * scaling layer two ScaleOverLifetime modules with separate `axis` filters
 * (or extend with a per-axis variant).
 *
 * Common patterns: shrink-to-zero (start at 1, end at 0), pulse (sine-like
 * curve up to peak then down), slow-grow (linear ramp).
 *
 * GPU-eligible: the curve is uploaded once as a 256-tap 1D R32F texture and
 * sampled with linear filtering on the GPU — no curve evaluation cost in
 * the inner loop.
 */
export class ScaleOverLifetime extends UpdateModule {
  public curve: Curve;

  public constructor(curve: Curve) {
    super();
    this.curve = curve;
  }

  public override apply(system: ParticleSystem, _dt: number): void {
    const { scaleX, scaleY, elapsed, lifetime, liveCount } = system;
    const curve = this.curve;

    for (let i = 0; i < liveCount; i++) {
      const t = (elapsed[i] ?? 0) / (lifetime[i] ?? 1);
      const s = curve.evaluate(t);

      scaleX[i] = s;
      scaleY[i] = s;
    }
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'ScaleOverLifetime',
      textures: [{ name: 'curve', format: 'r32float' }],
      body: `
                let scaleT = clamp(timing[idx].x / max(timing[idx].y, 0.000001), 0.0, 1.0);
                let scaleSample = textureSampleLevel(u_ScaleOverLifetime_curve, u_ScaleOverLifetime_curve_sampler, scaleT, 0.0).r;
                scales[idx] = vec2<f32>(scaleSample, scaleSample);
            `,
    };
  }

  public override uploadTextures(device: GPUDevice, textures: ReadonlyMap<string, GPUTexture>): void {
    const texture = textures.get('curve');

    if (texture === undefined) {
      return;
    }

    const data = new Float32Array(lookupSize);

    for (let i = 0; i < lookupSize; i++) {
      data[i] = this.curve.evaluate(i / (lookupSize - 1));
    }

    device.queue.writeTexture(
      { texture },
      data.buffer,
      { offset: 0, bytesPerRow: lookupSize * 4, rowsPerImage: 1 },
      { width: lookupSize, height: 1, depthOrArrayLayers: 1 },
    );
  }
}

/** Texture width for the curve lookup table. Exposed for ParticleGpuState. */
export const scaleLookupSize = lookupSize;
