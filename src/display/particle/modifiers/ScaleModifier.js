import ParticleModifier from '../ParticleModifier';

/**
 * @class ScaleModifier
 * @implements {Exo.ParticleModifier}
 * @memberof Exo
 */
export default class ScaleModifier extends ParticleModifier {

    /**
     * @constructor
     * @param {Exo.Vector} scaleFactor
     */
    constructor(scaleFactor) {
        super();

        this._scaleFactor = scaleFactor.clone();
    }

    /**
     * @public
     * @param {Exo.Vector} scaleFactor
     */
    setScaleFactor(scaleFactor) {
        this._scaleFactor.copy(scaleFactor);
    }

    /**
     * @public
     * @returns {Exo.Vector}
     */
    getScaleFactor() {
        return this._scaleFactor;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        const scaleFactor = this._scaleFactor,
            seconds = delta.asSeconds();

        particle.scale.add(seconds * scaleFactor.x, seconds * scaleFactor.y);
    }
}
