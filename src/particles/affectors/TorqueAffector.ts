import type { ParticleAffector } from '@/particles/affectors/ParticleAffector';
import type { Particle } from '@/particles/Particle';
import type { Time } from '@/core/Time';

/**
 * Accelerates a particle's angular velocity ({@link Particle.rotationSpeed})
 * by a constant `angularAcceleration` (degrees per second²) each tick.
 * The updated `rotationSpeed` is then integrated into
 * {@link Particle.rotation} by {@link ParticleSystem.updateParticle}.
 * Use a negative value to decelerate spin over time.
 */
export class TorqueAffector implements ParticleAffector {

    private _angularAcceleration: number;

    public constructor(angularAcceleration: number) {
        this._angularAcceleration = angularAcceleration;
    }

    public get angularAcceleration(): number {
        return this._angularAcceleration;
    }

    public set angularAcceleration(angularAcceleration: number) {
        this.setAngularAcceleration(angularAcceleration);
    }

    public setAngularAcceleration(angularAcceleration: number): this {
        this._angularAcceleration = angularAcceleration;

        return this;
    }

    /**
     * Adds `angularAcceleration * delta.seconds` to `particle.rotationSpeed`,
     * increasing or decreasing spin rate for this timestep.
     */
    public apply(particle: Particle, delta: Time): this {
        particle.rotationSpeed += (delta.seconds * this._angularAcceleration);

        return this;
    }

    public destroy(): void {
        // no-op — pure value class, kept for Destroyable interface conformance
    }
}
