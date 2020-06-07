import type { IParticleAffector } from 'particles/affectors/IParticleAffector';
import type { Particle } from 'particles/Particle';
import type { Time } from 'core/Time';

export class TorqueAffector implements IParticleAffector {

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

    public apply(particle: Particle, delta: Time): this {
        particle.rotationSpeed += (delta.seconds * this._angularAcceleration);

        return this;
    }

    public destroy(): void {
        // todo - check if destroy is needed
    }
}
