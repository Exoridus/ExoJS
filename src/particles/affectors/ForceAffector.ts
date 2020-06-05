import type { ParticleAffectorInterface } from 'particles/affectors/ParticleAffectorInterface';
import { Vector } from 'math/Vector';
import type { Particle } from 'particles/Particle';
import type { Time } from 'core/Time';

export class ForceAffector implements ParticleAffectorInterface {

    private readonly _acceleration: Vector;

    constructor(accelerationX: number, accelerationY: number) {
        this._acceleration = new Vector(accelerationX, accelerationY);
    }

    get acceleration(): Vector {
        return this._acceleration;
    }

    set acceleration(acceleration: Vector) {
        this.setAcceleration(acceleration);
    }

    setAcceleration(acceleration: Vector): this {
        this._acceleration.copy(acceleration);

        return this;
    }

    apply(particle: Particle, delta: Time): this {
        particle.velocity.add(
            delta.seconds * this._acceleration.x,
            delta.seconds * this._acceleration.y
        );

        return this;
    }

    destroy(): void {
        this._acceleration.destroy();
    }
}
