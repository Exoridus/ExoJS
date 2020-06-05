import type { ParticleAffectorInterface } from 'particles/affectors/ParticleAffectorInterface';
import { Vector } from 'math/Vector';
import type { Time } from 'core/Time';
import type { Particle } from 'particles/Particle';

export class ScaleAffector implements ParticleAffectorInterface {

    private readonly _scaleFactor: Vector;

    constructor(factorX: number, factorY: number) {
        this._scaleFactor = new Vector(factorX, factorY);
    }

    get scaleFactor(): Vector {
        return this._scaleFactor;
    }

    set scaleFactor(scaleFactor: Vector) {
        this.setScaleFactor(scaleFactor);
    }

    setScaleFactor(scaleFactor: Vector): this {
        this._scaleFactor.copy(scaleFactor);

        return this;
    }

    apply(particle: Particle, delta: Time): this {
        particle.scale.add(
            delta.seconds * this._scaleFactor.x,
            delta.seconds * this._scaleFactor.y
        );

        return this;
    }

    destroy(): void {
        this._scaleFactor.destroy();
    }
}
