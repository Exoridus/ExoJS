import {clamp} from '../../utils';

/**
 * @class GamepadButton
 * @memberof Exo
 */
export default class GamepadButton {

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
        this._threshold = clamp(threshold, 0, 1);

        /**
         * @private
         * @member {Boolean}
         */
        this._negate = negate;

        /**
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

    set index(value) {
        this._index = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get channel() {
        return this._channel;
    }

    set channel(value) {
        this._channel = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get threshold() {
        return this._threshold;
    }

    set threshold(value) {
        this._threshold = clamp(value, 0, 1);
    }

    /**
     * @public
     * @member {Boolean}
     */
    get negate() {
        return this._negate;
    }

    set negate(value) {
        this._negate = value;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get normalize() {
        return this._normalize;
    }

    set normalize(value) {
        this._normalize = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get keyCode() {
        return this._channel & 31;
    }

    /**
     * @public
     * @param {Exo.GamepadButton|Number} buttonValue
     * @returns {Number}
     */
    transformValue(buttonValue) {
        let value = (typeof buttonValue.value === 'number') ? buttonValue.value : buttonValue;

        if (this._negate) {
            value *= -1;
        }

        if (this._normalize) {
            value = (value + 1) / 2;
        }

        return (value >= this._threshold) ? value : 0;
    }
}
