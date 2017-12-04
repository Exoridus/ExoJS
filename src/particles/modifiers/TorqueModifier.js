import ParticleModifier from '../ParticleModifier';

/**
 * @class TorqueModifier
 * @extends ParticleModifier
 */
export default class TorqueModifier extends ParticleModifier {

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
     * @returns {TorqueModifier}
     */
    setAngularAcceleration(angularAcceleration) {
        this._angularAcceleration = angularAcceleration;

        return this;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        particle.rotationSpeed = particle.rotationSpeed + (this._angularAcceleration * delta.seconds);

        return this;
    }

    /**
     * @override
     */
    clone() {
        return new TorqueModifier(this._angularAcceleration);
    }

    /**
     * @override
     */
    destroy() {
        this._angularAcceleration = null;
    }
}
