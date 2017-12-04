import ParticleModifier from '../ParticleModifier';
import Vector from '../../math/Vector';
import Color from '../../core/Color';

/**
 * @class ColorModifier
 * @extends ParticleModifier
 */
export default class ColorModifier extends ParticleModifier {

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
        this._fromColor = (fromColor && fromColor.clone()) || new Color();

        /**
         * @private
         * @member {Color}
         */
        this._toColor = (toColor && toColor.clone()) || new Color();
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
     * @returns {ColorModifier}
     */
    setFromColor(color) {
        this._fromColor.copy(color);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Color} color
     * @returns {ColorModifier}
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
            { r: rA, g: gA, b: bA, a: aA } = this._fromColor,
            { r: rB, g: gB, b: bB, a: aB } = this._toColor;

        particle.tint.set(
            ((rB - rA) * ratio) + rA,
            ((gB - gA) * ratio) + gA,
            ((bB - bA) * ratio) + bA,
            ((aB - aA) * ratio) + aA
        );

        return this;
    }

    /**
     * @override
     */
    clone() {
        return new ColorModifier(this._fromColor, this._toColor);
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
