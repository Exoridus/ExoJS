import type { ParticleAffector } from '@/particles/affectors/ParticleAffector';
import { Vector } from '@/math/Vector';
import type { Particle } from '@/particles/Particle';
import type { Time } from '@/core/Time';

/**
 * Applies a constant 2-D acceleration to every particle's
 * {@link Particle.velocity} each tick, simulating forces such as gravity
 * (`new ForceAffector(0, 980)`) or wind. Velocity is mutated in place;
 * the system then integrates position from velocity in
 * {@link ParticleSystem.updateParticle}.
 */
export class ForceAffector implements ParticleAffector {

    private readonly _acceleration: Vector;

    public constructor(accelerationX: number, accelerationY: number) {
        this._acceleration = new Vector(accelerationX, accelerationY);
    }

    public get acceleration(): Vector {
        return this._acceleration;
    }

    public set acceleration(acceleration: Vector) {
        this.setAcceleration(acceleration);
    }

    public setAcceleration(acceleration: Vector): this {
        this._acceleration.copy(acceleration);

        return this;
    }

    /**
     * Adds `acceleration * delta.seconds` to `particle.velocity`, implementing
     * Euler integration for the configured force vector.
     */
    public apply(particle: Particle, delta: Time): this {
        particle.velocity.add(
            delta.seconds * this._acceleration.x,
            delta.seconds * this._acceleration.y
        );

        return this;
    }

    public destroy(): void {
        this._acceleration.destroy();
    }
}
