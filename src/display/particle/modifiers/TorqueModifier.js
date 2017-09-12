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

        this._angularAcceleration = angularAcceleration;
    }

    /**
     * @public
     * @param {Number} angularAcceleration
     */
    setAngularAcceleration(angularAcceleration) {
        this._angularAcceleration = angularAcceleration;
    }

    /**
     * @public
     * @returns {Vector}
     */
    getAngularAcceleration() {
        return this._angularAcceleration;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        particle.rotationSpeed += (delta.seconds * this._angularAcceleration);
    }
}
