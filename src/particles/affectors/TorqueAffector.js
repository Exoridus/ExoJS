import ParticleAffector from './ParticleAffector';

/**
 * @class TorqueAffector
 * @extends ParticleAffector
 */
export default class TorqueAffector extends ParticleAffector {

    /**
     * @constructor
     * @param {Number} angularAcceleration=0
     */
    constructor(angularAcceleration = 0) {
        super();

        /**
         * @private
         * @member {Number}
         */
        this._angularAcceleration = angularAcceleration;
    }

    /**
     * @public
     * @member {Number}
     */
    get angularAcceleration() {
        return this._angularAcceleration;
    }

    set angularAcceleration(angularAcceleration) {
        this.setAngularAcceleration(angularAcceleration);
    }

    /**
     * @public
     * @chainable
     * @param {Number} angularAcceleration
     * @returns {TorqueAffector}
     */
    setAngularAcceleration(angularAcceleration) {
        this._angularAcceleration = angularAcceleration;

        return this;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        particle.rotationSpeed += (delta.seconds * this._angularAcceleration);

        return this;
    }

    /**
     * @override
     */
    destroy() {
        this._angularAcceleration = null;
    }
}
