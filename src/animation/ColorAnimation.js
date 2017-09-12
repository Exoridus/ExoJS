import Animation from './Animation';

/**
 * @class ColorAnimation
 * @implements {Animation}
 */
export default class ColorAnimation extends Animation {

    /**
     * @constructor
     * @param {...Color} colors
     */
    constructor(...colors) {
        super();

        /**
         * @private
         * @member {Color[]}
         */
        this._colorGradient = colors;
    }
}
