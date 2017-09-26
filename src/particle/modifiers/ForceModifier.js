import ParticleModifier from '../ParticleModifier';
import Vector from '../../core/Vector';

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

        /**
         * @private
         * @member {Vector}
         */
        this._acceleration = (acceleration && acceleration.clone()) || new Vector();
    }

    /**
     * @public
     * @member {Vector}
     */
    get acceleration() {
        return this._acceleration;
    }

    set acceleration(acceleration) {
        this._acceleration.copy(acceleration);
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
