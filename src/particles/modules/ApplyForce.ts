import { UpdateModule } from './UpdateModule';
import type { ParticleSystem } from '@/particles/ParticleSystem';

/**
 * Adds a constant 2D acceleration to every live particle's velocity each
 * frame. Use for gravity (`new ApplyForce(0, 980)`), wind, or any uniform
 * force field. Force is applied to all particles equally — for per-particle
 * variation, layer multiple ApplyForce modules with different gates.
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
}
