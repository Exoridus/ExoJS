import { IParticleAffector } from "./IParticleAffector";
import { Particle } from '../Particle';
import { Time } from '../../core/Time';

export class TorqueAffector implements IParticleAffector {

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
