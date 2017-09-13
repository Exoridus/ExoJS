import ParticleModifier from '../ParticleModifier';

/**
 * @class TorqueModifier
 * @implements {ParticleModifier}
 */
export default class TorqueModifier extends ParticleModifier {

    /**
     * @constructor
     * @param {Number} angularAcceleration
     */
    constructor(angularAcceleration) {
        super();

        /**
         * @private
         * @member {Number}
         */
        this._angularAcceleration = angularAcceleration || 0;
    }

    /**
     * @public
     * @member {Number}
     */
    get angularAcceleration() {
        return this._acceleration;
    }

    set angularAcceleration(angularAcceleration) {
        this._angularAcceleration = angularAcceleration;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        particle.rotationSpeed += (delta.seconds * this._angularAcceleration);
    }
}
