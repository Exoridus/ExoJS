import { UpdateModule } from './UpdateModule';
import type { ParticleSystem } from '@/particles/ParticleSystem';

/**
 * Exponential velocity damping. Each frame multiplies every live particle's
 * velocity by `(1 - drag * dt)`, simulating linear air resistance.
 *
 * `drag = 0` is no damping; `drag = 1` halves velocity in ~1 second; higher
 * values slow particles faster. Negative values accelerate (don't do that
 * unless you mean it).
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
}
