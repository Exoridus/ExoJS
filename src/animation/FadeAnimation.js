import Animation from './Animation';

/**
 * @class FadeAnimation
 * @implements {Exo.Animation}
 * @memberof Exo
 */
export default class FadeAnimation extends Animation {

    /**
     * @constructor
     * @param {Number} inRatio
     * @param {Number} outRatio
     */
    constructor(inRatio, outRatio) {
        super();

        /**
         * @private
         * @member {Number}
         */
        this._inRatio = inRatio;

        /**
         * @private
         * @member {Number}
         */
        this._outRatio = outRatio;
    }

    /**
     * @override
     * @param {*} animated
     * @param {Number} progress
     */
    apply(animated, progress) {
        const inRatio = this._inRatio,
            outRatio = this._outRatio;

        if (progress < inRatio) {
            animated.color.a = 255 * progress / inRatio;
        } else if (progress > (1 - outRatio)) {
            animated.color.a = 255 * (1 - progress) / outRatio;
        }
    }
}
