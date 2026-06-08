import type { ParticleSystem } from "../ParticleSystem";

import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

/**
 * Applies a tangential acceleration around a center point — perpendicular
 * to the radial vector `(particle − center)`. Combined with an attract /
 * repel module that controls the radial distance, this produces orbital,
 * spiral, or vortex motion.
 *
 * `angularSpeed` is the target angular velocity in radians/second. The
 * effective tangential acceleration scales with `radius * angularSpeed`,
 * so distant particles get pushed harder (matching uniform circular
 * motion). Positive values orbit counter-clockwise, negative clockwise.
 *
 * Use cases: galactic spirals, smoke vortices around an attractor, wind
 * eddies. Layer with {@link AttractToPoint} for stable orbits.
 *
 * GPU-eligible.
 */
export class OrbitalForce extends UpdateModule {
  public x: number;
  public y: number;
  public angularSpeed: number;

  public constructor(x: number, y: number, angularSpeed: number) {
    super();
    this.x = x;
    this.y = y;
    this.angularSpeed = angularSpeed;
  }

  public override apply(system: ParticleSystem, dt: number): void {
    const { posX, posY, velX, velY, liveCount } = system;
    const { x, y, angularSpeed } = this;
    const omega = angularSpeed * dt;

    for (let i = 0; i < liveCount; i++) {
      const dx = posX[i] - x;
      const dy = posY[i] - y;
      // Perpendicular vector: (-dy, dx) for counter-clockwise.
      velX[i] += -dy * omega;
      velY[i] += dx * omega;
    }
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'OrbitalForce',
      uniforms: [
        { name: 'center', type: 'vec2<f32>' },
        { name: 'angularSpeed', type: 'f32' },
        { name: '_pad0', type: 'f32' },
      ],
      body: `
                let orbitDelta = positions[idx] - modules.u_OrbitalForce.center;
                let orbitOmega = modules.u_OrbitalForce.angularSpeed * dt;
                velocities[idx] = velocities[idx] + vec2<f32>(-orbitDelta.y, orbitDelta.x) * orbitOmega;
            `,
    };
  }

  public override writeUniforms(view: DataView, offset: number): void {
    view.setFloat32(offset + 0, this.x, true);
    view.setFloat32(offset + 4, this.y, true);
    view.setFloat32(offset + 8, this.angularSpeed, true);
    view.setFloat32(offset + 12, 0, true);
  }
}
