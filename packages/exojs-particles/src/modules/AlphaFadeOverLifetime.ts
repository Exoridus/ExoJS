/// <reference types="@webgpu/types" />

import { Curve } from "#distributions/Curve";
import type { ParticleSystem } from "#ParticleSystem";

import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

const lookupSize = 256;

/**
 * Fades only the alpha channel over a particle's lifetime, leaving RGB
 * untouched. Pair with a spawn-time tint or a separate `ColorOverLifetime`
 * to keep the color layer stable while controlling opacity from a single
 * curve.
 *
 * The default curve `1 → 0` produces a linear fade-out. For a fade-in then
 * fade-out, pass a curve like `[0,0]→[0.5,1]→[1,0]`.
 *
 * GPU-eligible: uploads the curve as a 256-tap 1D R32F texture; alpha is
 * resampled per-particle in the compute shader and stitched into the
 * existing color word with a single mask + shift.
 */
export class AlphaFadeOverLifetime extends UpdateModule {
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

  public override apply(system: ParticleSystem, _dt: number): void {
    const { color, elapsed, lifetime, liveCount } = system;
    const curve = this.curve;

    for (let i = 0; i < liveCount; i++) {
      const t = (elapsed[i] ?? 0) / (lifetime[i] ?? 1);
      const a = curve.evaluate(t);
      const alphaByte = (Math.max(0, Math.min(1, a)) * 255) & 255;

      color[i] = ((color[i] ?? 0) & 0x00ffffff) | (alphaByte << 24);
    }
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'AlphaFadeOverLifetime',
      textures: [{ name: 'curve', format: 'r32float' }],
      body: `
                let alphaT = clamp(timing[idx].x / max(timing[idx].y, 0.000001), 0.0, 1.0);
                let alphaSample = textureSampleLevel(u_AlphaFadeOverLifetime_curve, u_AlphaFadeOverLifetime_curve_sampler, alphaT, 0.0).r;
                let alphaByte = u32(clamp(alphaSample, 0.0, 1.0) * 255.0) & 255u;
                color[idx] = (color[idx] & 0x00ffffffu) | (alphaByte << 24u);
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
