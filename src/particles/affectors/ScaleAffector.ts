import { IParticleAffector } from './IParticleAffector';
import Vector from '../../math/Vector';
import Time from "../../core/time/Time";
import Particle from "../Particle";

export default class ScaleAffector implements IParticleAffector {

    private readonly _scaleFactor: Vector;

    constructor(factorX: number, factorY: number) {
        this._scaleFactor = new Vector(factorX, factorY);
    }

    get scaleFactor() {
        return this._scaleFactor;
    }

    set scaleFactor(scaleFactor) {
        this.setScaleFactor(scaleFactor);
    }

    setScaleFactor(scaleFactor: Vector) {
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

    destroy() {
        this._scaleFactor.destroy();
    }
}
