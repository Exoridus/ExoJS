import { INPUT_CHANNELS_HANDLER, INPUT_OFFSET_GAMEPAD } from '../../const';
import settings from '../../settings';

/**
 * @class GamepadControl
 */
export default class GamepadControl {

    /**
     * @constructor
     * @param {Number} index
     * @param {Number} channel
     * @param {Object} [options={}]
     * @param {Boolean} [options.invert=false]
     * @param {Boolean} [options.normalize=false]
     * @param {Number} [options.threshold=settings.THRESHOLD_GAMEPAD]
     */
    constructor(index, channel, {
        invert = false,
        normalize = false,
        threshold = settings.THRESHOLD_GAMEPAD,
    } = {}) {

        /**
         * @private
         * @member {Number}
         */
        this._index = index;

        /**
         * @private
         * @member {Number}
         */
        this._channel = channel;

        /**
         * @private
         * @member {Number}
         */
        this._key = (channel % INPUT_CHANNELS_HANDLER);

        /**
         * Transform value range from {-1..1} to {1..-1}.
         *
         * @private
         * @member {Boolean}
         */
        this._invert = invert;

        /**
         * Transform value range from {-1..1} to {0..1}.
         *
         * @private
         * @member {Boolean}
         */
        this._normalize = normalize;

        /**
         * @private
         * @member {Number}
         */
        this._threshold = threshold;
    }

    /**
     * @public
     * @member {Number}
     */
    get index() {
        return this._index;
    }

    set index(index) {
        this._index = index;
    }

    /**
     * @public
     * @member {Number}
     */
    get channel() {
        return this._channel;
    }

    set channel(channel) {
        this._channel = channel;
        this._key = this._channel % INPUT_CHANNELS_HANDLER;
    }

    /**
     * @public
     * @member {Number}
     */
    get key() {
        return this._key;
    }

    set key(key) {
        this._key = key % INPUT_CHANNELS_HANDLER;
        this._channel = INPUT_OFFSET_GAMEPAD + this._key;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get invert() {
        return this._invert;
    }

    set invert(invert) {
        this._invert = invert;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get normalize() {
        return this._normalize;
    }

    set normalize(normalize) {
        this._normalize = normalize;
    }

    /**
     * @public
     * @member {Number}
     */
    get threshold() {
        return this._threshold;
    }

    set threshold(threshold) {
        this._threshold = threshold;
    }

    /**
     * @public
     * @param {Number} value
     * @returns {Number}
     */
    transformValue(value) {
        let result = value;

        if (this._invert) {
            result *= -1;
        }

        if (this._normalize) {
            result = (result + 1) / 2;
        }

        return (result > this._threshold) ? result : 0;
    }
}
