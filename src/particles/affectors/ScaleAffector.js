import ParticleAffector from './ParticleAffector';
import Vector from '../../types/Vector';

/**
 * @class ScaleAffector
 * @extends ParticleAffector
 */
export default class ScaleAffector extends ParticleAffector {

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
     * @returns {ScaleAffector}
     */
    setScaleFactor(scaleFactor) {
        this._scaleFactor.copy(scaleFactor);

        return this;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        particle.scale.add(
            delta.seconds * this._scaleFactor.x,
            delta.seconds * this._scaleFactor.y
        );

        return this;
    }

    /**
     * @override
     */
    destroy() {
        this._scaleFactor.destroy();
        this._scaleFactor = null;
    }
}
