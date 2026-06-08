/// <reference types="@webgpu/types" />

import type { Curve } from "#distributions/Curve";
import type { ParticleSystem } from "#ParticleSystem";

import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

const lookupSize = 256;

/**
 * Multiplies every live particle's velocity by a curve sampled at the
 * particle's current `elapsed / lifetime` ratio. The same scalar is applied
 * to both axes — the direction is preserved, only the magnitude scales.
 *
 * Common patterns:
 * - **Snappy spawn, slow drift:** `[0,1]→[1,0.1]` — fast initial motion
 *   that decays over lifetime.
 * - **Late acceleration:** `[0,0.2]→[1,1]` — particles ease in.
 * - **Pulse:** sine-shaped curve for breathing-style motion.
 *
 * Note: the curve **replaces** velocity each frame relative to the previous
 * frame's velocity, so the effect is multiplicative. Pair with `ApplyForce`
 * if you want a constant external acceleration on top.
 *
 * GPU-eligible: uploads the curve as a 256-tap 1D R32F texture; sampled
 * once per particle per frame.
 */
export class VelocityOverLifetime extends UpdateModule {
  public curve: Curve;

  private _prevSample = new Float32Array(0);

  public constructor(curve: Curve) {
    super();
    this.curve = curve;
  }

  public override apply(system: ParticleSystem, _dt: number): void {
    const { velX, velY, elapsed, lifetime, liveCount } = system;
    const curve = this.curve;

    // Resize per-particle previous-sample cache once.
    if (this._prevSample.length < system.capacity) {
      this._prevSample = new Float32Array(system.capacity);
      this._prevSample.fill(1);
    }

    const prev = this._prevSample;

    for (let i = 0; i < liveCount; i++) {
      const t = elapsed[i] / lifetime[i];
      const sample = curve.evaluate(t);
      const last = prev[i] === 0 ? 1 : prev[i];
      const delta = sample / last;

      velX[i] *= delta;
      velY[i] *= delta;
      prev[i] = sample === 0 ? 1e-6 : sample;
    }
  }

  public override wgsl(): WgslContribution {
    // GPU path uses a different formulation: re-derive velocity from
    // initial speed at t=0 by storing nothing — instead, scale relative
    // to the previous sample stored in scales[idx] alpha? No — keep it
    // simple and stateless: scale the integrated velocity by the
    // *ratio* of (current sample) / (sample at previous frame's t).
    // We approximate the previous t with `(elapsed - dt) / lifetime`.
    return {
      key: 'VelocityOverLifetime',
      textures: [{ name: 'curve', format: 'r32float' }],
      body: `
                let velLifetime = max(timing[idx].y, 0.000001);
                let velTNow = clamp(timing[idx].x / velLifetime, 0.0, 1.0);
                let velTPrev = clamp((timing[idx].x - dt) / velLifetime, 0.0, 1.0);
                let velSampleNow = textureSampleLevel(u_VelocityOverLifetime_curve, u_VelocityOverLifetime_curve_sampler, velTNow, 0.0).r;
                let velSamplePrev = textureSampleLevel(u_VelocityOverLifetime_curve, u_VelocityOverLifetime_curve_sampler, velTPrev, 0.0).r;
                let velRatio = velSampleNow / max(velSamplePrev, 0.000001);
                velocities[idx] = velocities[idx] * velRatio;
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
