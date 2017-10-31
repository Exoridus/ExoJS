import ParticleModifier from '../ParticleModifier';

/**
 * @class TorqueModifier
 * @extends {ParticleModifier}
 */
export default class TorqueModifier extends ParticleModifier {

    /**
     * @constructs TorqueModifier
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
        particle.rotationSpeed = particle.rotationSpeed + (delta.seconds * this._angularAcceleration);
    }

    /**
     * @override
     */
    copy(modifier) {
        this.angularAcceleration = modifier.angularAcceleration;

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
