import ParticleModifier from '../ParticleModifier';

/**
 * @class ScaleModifier
 * @implements {ParticleModifier}
 */
export default class ScaleModifier extends ParticleModifier {

    /**
     * @constructor
     * @param {Vector} scaleFactor
     */
    constructor(scaleFactor) {
        super();

        this._scaleFactor = scaleFactor.clone();
    }

    /**
     * @public
     * @param {Vector} scaleFactor
     */
    setScaleFactor(scaleFactor) {
        this._scaleFactor.copy(scaleFactor);
    }

    /**
     * @public
     * @returns {Vector}
     */
    getScaleFactor() {
        return this._scaleFactor;
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
