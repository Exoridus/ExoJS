import type { ParticleSystem } from "#ParticleSystem";

import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

/**
 * Pulls every live particle toward a fixed point in the system's local
 * coordinate space. Acceleration magnitude is `strength` (units / s²),
 * applied along the direction `(point − particle)`. The optional `falloff`
 * radius softens the pull near the center — particles within `falloff`
 * units lerp the strength linearly to zero, preventing the singularity at
 * `r = 0` from yielding infinite acceleration.
 *
 * Use cases: orbit anchors, pin emitters to a moving target, simulate a
 * "black hole" pickup. For repulsion, use {@link RepelFromPoint}; for
 * tangential motion, layer with {@link OrbitalForce}.
 *
 * GPU-eligible.
 */
export class AttractToPoint extends UpdateModule {
  public x: number;
  public y: number;
  public strength: number;
  public falloff: number;

  public constructor(x: number, y: number, strength: number, falloff = 0) {
    super();
    this.x = x;
    this.y = y;
    this.strength = strength;
    this.falloff = falloff;
  }

  public override apply(system: ParticleSystem, dt: number): void {
    const { posX, posY, velX, velY, liveCount } = system;
    const { x, y, strength, falloff } = this;

    for (let i = 0; i < liveCount; i++) {
      const dx = x - posX[i];
      const dy = y - posY[i];
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);

      if (dist < 1e-5) continue;

      const k = falloff > 0 ? Math.min(1, dist / falloff) : 1;
      const a = (strength * k * dt) / dist;

      velX[i] += dx * a;
      velY[i] += dy * a;
    }
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'AttractToPoint',
      uniforms: [
        { name: 'point', type: 'vec2<f32>' },
        { name: 'strength', type: 'f32' },
        { name: 'falloff', type: 'f32' },
      ],
      body: `
                let attractDelta = modules.u_AttractToPoint.point - positions[idx];
                let attractDist = length(attractDelta);
                if (attractDist > 0.00001) {
                    let attractK = select(1.0, min(1.0, attractDist / max(modules.u_AttractToPoint.falloff, 0.000001)), modules.u_AttractToPoint.falloff > 0.0);
                    let attractAccel = (modules.u_AttractToPoint.strength * attractK * dt) / attractDist;
                    velocities[idx] = velocities[idx] + attractDelta * attractAccel;
                }
            `,
    };
  }

  public override writeUniforms(view: DataView, offset: number): void {
    view.setFloat32(offset + 0, this.x, true);
    view.setFloat32(offset + 4, this.y, true);
    view.setFloat32(offset + 8, this.strength, true);
    view.setFloat32(offset + 12, this.falloff, true);
  }
}
