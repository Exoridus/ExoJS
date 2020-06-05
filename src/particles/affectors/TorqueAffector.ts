import type { ParticleAffectorInterface } from "particles/affectors/ParticleAffectorInterface";
import type { Particle } from 'particles/Particle';
import type { Time } from 'core/Time';

export class TorqueAffector implements ParticleAffectorInterface {

    private _angularAcceleration: number;

    constructor(angularAcceleration: number) {
        this._angularAcceleration = angularAcceleration;
    }

    get angularAcceleration() {
        return this._angularAcceleration;
    }

    set angularAcceleration(angularAcceleration) {
        this.setAngularAcceleration(angularAcceleration);
    }

    setAngularAcceleration(angularAcceleration: number) {
        this._angularAcceleration = angularAcceleration;

        return this;
    }

    apply(particle: Particle, delta: Time) {
        particle.rotationSpeed += (delta.seconds * this._angularAcceleration);

        return this;
    }

    destroy() {
        // todo - check if destroy is needed
    }
}
