import ParticleModifier from '../ParticleModifier';

/**
 * @class ForceModifier
 * @implements {ParticleModifier}
 */
export default class ForceModifier extends ParticleModifier {

    /**
     * @constructor
     * @param {Vector} acceleration
     */
    constructor(acceleration) {
        super();

        this._acceleration = acceleration.clone();
    }

    /**
     * @public
     * @param {Vector} acceleration
     */
    setAcceleration(acceleration) {
        this._acceleration.copy(acceleration);
    }

    /**
     * @public
     * @returns {Vector}
     */
    getAcceleration() {
        return this._acceleration;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        const acceleration = this._acceleration,
            seconds = delta.seconds;

        particle.velocity.add(seconds * acceleration.x, seconds * acceleration.y);
    }
}
