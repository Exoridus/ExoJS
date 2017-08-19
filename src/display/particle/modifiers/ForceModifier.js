import ParticleModifier from '../ParticleModifier';

/**
 * @class ForceModifier
 * @implements {Exo.ParticleModifier}
 * @memberof Exo
 */
export default class ForceModifier extends ParticleModifier {

    /**
     * @constructor
     * @param {Exo.Vector} acceleration
     */
    constructor(acceleration) {
        super();

        this._acceleration = acceleration.clone();
    }

    /**
     * @public
     * @param {Exo.Vector} acceleration
     */
    setAcceleration(acceleration) {
        this._acceleration.copy(acceleration);
    }

    /**
     * @public
     * @returns {Exo.Vector}
     */
    getAcceleration() {
        return this._acceleration;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        const acceleration = this._acceleration,
            seconds = delta.asSeconds();

        particle.velocity.add(seconds * acceleration.x, seconds * acceleration.y);
    }
}
