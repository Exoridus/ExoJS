import Animation from './Animation';

/**
 * @class ColorAnimation
 * @implements {Exo.Animation}
 * @memberof Exo
 */
export default class ColorAnimation extends Animation {

    /**
     * @constructor
     * @param {Exo.Color[]} colors
     */
    constructor(...colors) {
        super();

        /**
         * @private
         * @member {Exo.Color[]}
         */
        this._colorGradient = colors;
    }
}
