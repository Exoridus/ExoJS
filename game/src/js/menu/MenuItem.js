import { Text, Color } from 'exojs';

/**
 * @class MenuItem
 * @extends Text
 */
export default class MenuItem extends Text {

    /**
     * @constructor
     * @param {String} text
     * @param {Object} [style]
     */
    constructor(text, {
        fill = 'white',
        fontSize = 45,
        fontFamily = 'AndyBold',
        stroke = 'black',
        strokeThickness = 5,
    } = {}) {
        super(text, { fill, fontSize, fontFamily, stroke, strokeThickness });

        /**
         * @private
         * @member {Number}
         */
        this._ticker = 0;

        /**
         * @private
         * @member {Number}
         */
        this._scalingFactor = 1.2;

        /**
         * @private
         * @member {Number}
         */
        this._scalingSpeed = 2;

        this.setOrigin(0.5, 0.5);
    }

    /**
     * @public
     */
    activate() {
        this.setTint(Color.Yellow);
        this._ticker = 0;
    }

    /**
     * @public
     * @param {Time} delta
     */
    update(delta) {
        const time = this._ticker * this._scalingSpeed,
            scalingCenter = (this._scalingFactor - 1) / 2,
            scale = 1 + (Math.sin(time * Math.PI) * scalingCenter) + scalingCenter;

        this.setScale(scale, scale);
        this._ticker += delta.seconds;
    }

    /**
     * @public
     */
    reset() {
        this.setTint(Color.White);
        this.setScale(1);
        this._ticker = 0;
    }
}
