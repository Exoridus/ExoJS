import ParticleModifier from '../ParticleModifier';

/**
 * @class TorqueModifier
 * @implements {Exo.ParticleModifier}
 * @memberof Exo
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
     * @returns {Exo.Vector}
     */
    getAngularAcceleration() {
        return this._angularAcceleration;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        particle.rotationSpeed += (delta.asSeconds() * this._angularAcceleration);
    }
}
