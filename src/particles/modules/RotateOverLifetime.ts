import { UpdateModule } from './UpdateModule';
import type { ParticleSystem } from '@/particles/ParticleSystem';

/**
 * Adds a constant angular acceleration to every live particle each frame
 * (analogous to the legacy `TorqueAffector`). The system's integrate pass
 * advances `rotation` from `rotationSpeed`; this module increments
 * `rotationSpeed` itself.
 *
 * Units: degrees per second². Negative values decelerate spin.
 */
export class RotateOverLifetime extends UpdateModule {
    public angularAcceleration: number;

    public constructor(angularAcceleration: number) {
        super();
        this.angularAcceleration = angularAcceleration;
    }

    public override apply(system: ParticleSystem, dt: number): void {
        const { rotationSpeeds, liveCount } = system;
        const delta = this.angularAcceleration * dt;

        for (let i = 0; i < liveCount; i++) {
            rotationSpeeds[i] += delta;
        }
    }
}
