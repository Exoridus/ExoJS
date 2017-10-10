import ParticleModifier from '../ParticleModifier';
import Vector from '../../../math/Vector';

/**
 * @class ScaleModifier
 * @extends {ParticleModifier}
 */
export default class ScaleModifier extends ParticleModifier {

    /**
     * @constructor
     * @param {Vector} scaleFactor
     */
    constructor(scaleFactor) {
        super();

        /**
         * @private
         * @member {Vector}
         */
        this._scaleFactor = (scaleFactor && scaleFactor.clone()) || new Vector();
    }

    /**
     * @public
     * @member {Vector}
     */
    get scaleFactor() {
        return this._scaleFactor;
    }

    set scaleFactor(scaleFactor) {
        this._scaleFactor.copy(scaleFactor);
    }

    /**
     * @override
     */
    apply(particle, delta) {
        const scaleFactor = this._scaleFactor,
            seconds = delta.seconds;

        particle.scale.add(seconds * scaleFactor.x, seconds * scaleFactor.y);
    }
}
