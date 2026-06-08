import type { ParticleSystem } from "../ParticleSystem";

import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

/**
 * Exponential velocity damping. Each frame multiplies every live particle's
 * velocity by `(1 - drag * dt)`, simulating linear air resistance.
 *
 * `drag = 0` is no damping; `drag = 1` halves velocity in ~1 second; higher
 * values slow particles faster. Negative values accelerate (don't do that
 * unless you mean it).
 *
 * GPU-eligible.
 */
export class Drag extends UpdateModule {
  public drag: number;

  public constructor(drag: number) {
    super();
    this.drag = drag;
  }

  public override apply(system: ParticleSystem, dt: number): void {
    const { velX, velY, liveCount } = system;
    const factor = 1 - this.drag * dt;

    for (let i = 0; i < liveCount; i++) {
      velX[i] *= factor;
      velY[i] *= factor;
    }
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'Drag',
      uniforms: [{ name: 'drag', type: 'f32' }],
      body: `
                let dragFactor = 1.0 - modules.u_Drag.drag * dt;
                velocities[idx] = velocities[idx] * dragFactor;
            `,
    };
  }

  public override writeUniforms(view: DataView, offset: number): void {
    view.setFloat32(offset + 0, this.drag, true);
  }
}
