import { CHANNEL_LENGTH, CHANNEL_OFFSET } from '../../const';

/**
 * @class GamepadControl
 */
export default class GamepadControl {

    /**
     * @constructor
     * @param {Number} index
     * @param {Number} channel
     * @param {Object} [options]
     * @param {Number} [options.threshold=0.2]
     * @param {Boolean} [options.negate=false]
     * @param {Boolean} [options.normalize=false]
     */
    constructor(index, channel, { threshold = 0.2, negate = false, normalize = false } = {}) {

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
        this._key = channel % CHANNEL_LENGTH.CHILD;

        /**
         * @private
         * @member {Number}
         */
        this._threshold = threshold;

        /**
         * Transform value range from [-1, 1] to [1, -1].
         *
         * @private
         * @member {Boolean}
         */
        this._negate = negate;

        /**
         * Transform value range from [-1, 1] to [0, 1].
         *
         * @private
         * @member {Boolean}
         */
        this._normalize = normalize;
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
        this._key = this._channel % CHANNEL_LENGTH.CHILD;
    }

    /**
     * @public
     * @member {Number}
     */
    get key() {
        return this._key;
    }

    set key(key) {
        this._key = key % CHANNEL_LENGTH.CHILD;
        this._channel = CHANNEL_OFFSET.GAMEPAD + this._key;
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
     * @member {Boolean}
     */
    get negate() {
        return this._negate;
    }

    set negate(negate) {
        this._negate = negate;
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
     * @param {Number} value
     * @returns {Number}
     */
    transformValue(value) {
        if (this._negate) {
            value *= -1;
        }

        if (this._normalize) {
            value = (value + 1) / 2;
        }

        return (value > this._threshold) ? value : 0;
    }
}
