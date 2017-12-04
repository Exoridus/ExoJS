import ParticleModifier from '../ParticleModifier';
import Vector from '../../math/Vector';

/**
 * @class ScaleModifier
 * @extends ParticleModifier
 */
export default class ScaleModifier extends ParticleModifier {

    /**
     * @constructor
     * @param {Number} factorX
     * @param {Number} factorY
     */
    constructor(factorX, factorY) {
        super();

        /**
         * @private
         * @member {Vector}
         */
        this._scaleFactor = new Vector(factorX, factorY);
    }

    /**
     * @public
     * @member {Vector}
     */
    get scaleFactor() {
        return this._scaleFactor;
    }

    set scaleFactor(scaleFactor) {
        this.setScaleFactor(scaleFactor);
    }

    /**
     * @public
     * @chainable
     * @param {Vector} scaleFactor
     * @returns {ScaleModifier}
     */
    setScaleFactor(scaleFactor) {
        this._scaleFactor.copy(scaleFactor);

        return this;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        const { x, y } = this._scaleFactor,
            { seconds } = delta;

        particle.scale.add(x * seconds, y * seconds);
    }

    /**
     * @override
     */
    clone() {
        return new ScaleModifier(this._scaleFactor.x, this._scaleFactor.y);
    }

    /**
     * @override
     */
    destroy() {
        this._scaleFactor.destroy();
        this._scaleFactor = null;
    }
}
