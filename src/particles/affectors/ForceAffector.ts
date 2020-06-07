import type { IParticleAffector } from 'particles/affectors/IParticleAffector';
import { Vector } from 'math/Vector';
import type { Particle } from 'particles/Particle';
import type { Time } from 'core/Time';

export class ForceAffector implements IParticleAffector {

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
