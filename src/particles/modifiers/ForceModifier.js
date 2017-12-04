import ParticleModifier from '../ParticleModifier';
import Vector from '../../math/Vector';

/**
 * @class ForceModifier
 * @extends ParticleModifier
 */
export default class ForceModifier extends ParticleModifier {

    /**
     * @constructor
     * @param {Number} velocityX
     * @param {Number} velocityY
     */
    constructor(velocityX, velocityY) {
        super();

        /**
         * @private
         * @member {Vector}
         */
        this._velocity = new Vector(velocityX, velocityY);
    }

    /**
     * @public
     * @member {Vector}
     */
    get velocity() {
        return this._velocity;
    }

    set velocity(velocity) {
        this.setVelocity(velocity);
    }

    /**
     * @public
     * @chainable
     * @param {Vector} velocity
     * @returns {ForceModifier}
     */
    setVelocity(velocity) {
        this._velocity.copy(velocity);

        return this;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        const { x, y } = this._velocity,
            { seconds } = delta;

        particle.velocity.add(x * seconds, y * seconds);

        return this;
    }

    /**
     * @override
     */
    clone() {
        return new ForceModifier(this._velocity.x, this._velocity.y);
    }

    /**
     * @override
     */
    destroy() {
        this._velocity.destroy();
        this._velocity = null;
    }
}
