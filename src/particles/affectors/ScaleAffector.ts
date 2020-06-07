import type { IParticleAffector } from 'particles/affectors/IParticleAffector';
import { Vector } from 'math/Vector';
import type { Time } from 'core/Time';
import type { Particle } from 'particles/Particle';

export class ScaleAffector implements IParticleAffector {

    private readonly _scaleFactor: Vector;

    public constructor(factorX: number, factorY: number) {
        this._scaleFactor = new Vector(factorX, factorY);
    }

    public get scaleFactor(): Vector {
        return this._scaleFactor;
    }

    public set scaleFactor(scaleFactor: Vector) {
        this.setScaleFactor(scaleFactor);
    }

    public setScaleFactor(scaleFactor: Vector): this {
        this._scaleFactor.copy(scaleFactor);

        return this;
    }

    public apply(particle: Particle, delta: Time): this {
        particle.scale.add(
            delta.seconds * this._scaleFactor.x,
            delta.seconds * this._scaleFactor.y
        );

        return this;
    }

    public destroy(): void {
        this._scaleFactor.destroy();
    }
}
