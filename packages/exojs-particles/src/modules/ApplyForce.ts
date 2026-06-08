import type { ParticleSystem } from "#ParticleSystem";

import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

/**
 * Adds a constant 2D acceleration to every live particle's velocity each
 * frame. Use for gravity (`new ApplyForce(0, 980)`), wind, or any uniform
 * force field. Force is applied to all particles equally — for per-particle
 * variation, layer multiple ApplyForce modules with different gates.
 *
 * GPU-eligible: implements {@link UpdateModule.wgsl} so this module runs in
 * the system's compute shader on WebGPU backends with no CPU readback.
 */
export class ApplyForce extends UpdateModule {
  public accelerationX: number;
  public accelerationY: number;

  public constructor(accelerationX: number, accelerationY: number) {
    super();
    this.accelerationX = accelerationX;
    this.accelerationY = accelerationY;
  }

  public override apply(system: ParticleSystem, dt: number): void {
    const { velX, velY, liveCount } = system;
    const ax = this.accelerationX * dt;
    const ay = this.accelerationY * dt;

    for (let i = 0; i < liveCount; i++) {
      velX[i] += ax;
      velY[i] += ay;
    }
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'ApplyForce',
      uniforms: [
        { name: 'ax', type: 'f32' },
        { name: 'ay', type: 'f32' },
      ],
      body: `
                velocities[idx] = velocities[idx] + vec2<f32>(modules.u_ApplyForce.ax, modules.u_ApplyForce.ay) * dt;
            `,
    };
  }

  public override writeUniforms(view: DataView, offset: number): void {
    view.setFloat32(offset + 0, this.accelerationX, true);
    view.setFloat32(offset + 4, this.accelerationY, true);
  }
}
