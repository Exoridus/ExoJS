import type { ParticleAffectorInterface } from "particles/affectors/ParticleAffectorInterface";
import type { Particle } from 'particles/Particle';
import type { Time } from 'core/Time';

export class TorqueAffector implements ParticleAffectorInterface {

    private _angularAcceleration: number;

    constructor(angularAcceleration: number) {
        this._angularAcceleration = angularAcceleration;
    }

    get angularAcceleration(): number {
        return this._angularAcceleration;
    }

    set angularAcceleration(angularAcceleration: number) {
        this.setAngularAcceleration(angularAcceleration);
    }

    setAngularAcceleration(angularAcceleration: number): this {
        this._angularAcceleration = angularAcceleration;

        return this;
    }

    apply(particle: Particle, delta: Time): this {
        particle.rotationSpeed += (delta.seconds * this._angularAcceleration);

        return this;
    }

    destroy(): void {
        // todo - check if destroy is needed
    }
}
