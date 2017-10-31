import ParticleModifier from '../ParticleModifier';
import Vector from '../../../math/Vector';

/**
 * @class ForceModifier
 * @extends {ParticleModifier}
 */
export default class ForceModifier extends ParticleModifier {

    /**
     * @constructs ForceModifier
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

        return this;
    }

    /**
     * @override
     */
    copy(modifier) {
        this.acceleration = modifier.acceleration;

        return this;
    }

    /**
     * @override
     */
    clone() {
        return new ForceModifier(this._acceleration);
    }

    /**
     * @override
     */
    destroy() {
        this._acceleration.destroy();
        this._acceleration = null;
    }
}
