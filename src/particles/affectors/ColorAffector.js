import ParticleAffector from './ParticleAffector';
import Vector from '../../math/Vector';
import Color from '../../core/Color';

/**
 * @class ColorAffector
 * @extends ParticleAffector
 */
export default class ColorAffector extends ParticleAffector {

    /**
     * @constructor
     * @param {Color} fromColor
     * @param {Color} toColor
     */
    constructor(fromColor, toColor) {
        super();

        /**
         * @private
         * @member {Color}
         */
        this._fromColor = (fromColor || Color.Black).clone();

        /**
         * @private
         * @member {Color}
         */
        this._toColor = (toColor || Color.White).clone();
    }

    /**
     * @public
     * @member {Color}
     */
    get fromColor() {
        return this._fromColor;
    }

    set fromColor(color) {
        this.setFromColor(color);
    }

    /**
     * @public
     * @member {Color}
     */
    get toColor() {
        return this._toColor;
    }

    set toColor(color) {
        this.setToColor(color);
    }

    /**
     * @public
     * @chainable
     * @param {Color} color
     * @returns {ColorAffector}
     */
    setFromColor(color) {
        this._fromColor.copy(color);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Color} color
     * @returns {ColorAffector}
     */
    setToColor(color) {
        this._toColor.copy(color);

        return this;
    }

    /**
     * @override
     */
    apply(particle, delta) {
        const ratio = particle.elapsedRatio,
            { r: r1, g: g1, b: b1, a: a1 } = this._fromColor,
            { r: r2, g: g2, b: b2, a: a2 } = this._toColor;

        particle.tint.set(
            ((r2 - r1) * ratio) + r1,
            ((g2 - g1) * ratio) + g1,
            ((b2 - b1) * ratio) + b1,
            ((a2 - a1) * ratio) + a1
        );

        return this;
    }

    /**
     * @override
     */
    destroy() {
        this._fromColor.destroy();
        this._fromColor = null;

        this._toColor.destroy();
        this._toColor = null;
    }
}
