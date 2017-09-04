import Animation from './Animation';
import AnimationFrame from './AnimationFrame';

/**
 * @class FrameAnimation
 * @implements {Exo.Animation}
 * @memberof Exo
 */
export default class FrameAnimation extends Animation {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Exo.AnimationFrame[]}
         */
        this._frames = [];

        /**
         * @private
         * @member {Boolean}
         */
        this._normalized = false;
    }

    /**
     * @public
     * @param {Number} relativeDuration
     * @param {Exo.Rectangle} rectangle
     * @param {Exo.Vector} [origin]
     */
    addFrame(relativeDuration, rectangle, origin) {
        this._frames.push(new AnimationFrame(relativeDuration, rectangle, origin));
        this._normalized = false;
    }

    /**
     * @public
     */
    ensureNormalized() {
        if (this._normalized) {
            return;
        }

        const sum = this._frames.reduce((val, frame) => val + frame.duration, 0);

        for (const frame of this._frames) {
            frame.duration /= sum;
        }

        this._normalized = true;
    }

    /**
     * @override
     */
    apply(target, progress) {
        if (!this._frames.length || progress < 0 || progress > 1) {
            return;
        }

        this.ensureNormalized();

        for (const frame of this._frames) {
            progress -= frame.duration;

            if (progress <= 0) {
                target.setTextureRect(frame.rectangle);

                if (frame.applyOrigin) {
                    target.setOrigin(frame.origin);
                }

                break;
            }
        }
    }
}
