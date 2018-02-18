import ParticleAffector from './ParticleAffector';
import Vector from '../../types/Vector';

/**
 * @class ForceAffector
 * @extends ParticleAffector
 */
export default class ForceAffector extends ParticleAffector {

    /**
     * @constructor
     * @param {Number} accelerationX
     * @param {Number} accelerationY
     */
    constructor(accelerationX, accelerationY) {
        super();

        /**
         * @private
         * @member {Vector}
         */
        this._acceleration = new Vector(accelerationX, accelerationY);
    }

    /**
     * @public
     * @member {Vector}
     */
    get acceleration() {
        return this._acceleration;
    }

    set acceleration(acceleration) {
        this.setAcceleration(acceleration);
    }

    /**
     * @public
     * @chainable
     * @param {Vector} acceleration
     * @returns {ForceAffector}
     */
    setAcceleration(acceleration) {
        this._acceleration.copy(acceleration);

        return this;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        particle.velocity.add(
            delta.seconds * this._acceleration.x,
            delta.seconds * this._acceleration.y
        );

        return this;
    }

    /**
     * @override
     */
    destroy() {
        this._acceleration.destroy();
        this._acceleration = null;
    }
}
