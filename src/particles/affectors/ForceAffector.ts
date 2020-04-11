import { IParticleAffector } from './IParticleAffector';
import Vector from '../../math/Vector';
import Particle from "../Particle";
import Time from "../../core/time/Time";

export default class ForceAffector implements IParticleAffector {

    private readonly _acceleration: Vector;

    constructor(accelerationX: number, accelerationY: number) {
        this._acceleration = new Vector(accelerationX, accelerationY);
    }

    get acceleration() {
        return this._acceleration;
    }

    set acceleration(acceleration) {
        this.setAcceleration(acceleration);
    }

    setAcceleration(acceleration: Vector) {
        this._acceleration.copy(acceleration);

        return this;
    }

    apply(particle: Particle, delta: Time) {
        particle.velocity.add(
            delta.seconds * this._acceleration.x,
            delta.seconds * this._acceleration.y
        );

        return this;
    }

    destroy() {
        this._acceleration.destroy();
    }
}
