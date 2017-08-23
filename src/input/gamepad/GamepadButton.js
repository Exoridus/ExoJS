import {clamp} from '../../utils';

/**
 * @class GamepadButton
 * @memberof Exo
 */
export default class GamepadButton {

    /**
     * @public
     * @member {Number}
     */
    get index() {
        return this._index;
    }

    set index(value) {
        this._index = value | 0;
    }

    /**
     * @public
     * @member {Number}
     */
    get channel() {
        return this._channel;
    }

    set channel(value) {
        this._channel = value | 0;
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
        this._negate = !!value;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get normalize() {
        return this._normalize;
    }

    set normalize(value) {
        this._normalize = !!value;
    }

    /**
     * @public
     * @member {Number}
     */
    get keyCode() {
        return this._channel & 31;
    }

    /**
     * @constructor
     * @param {Number} index
     * @param {Number} channel
     * @param {Object} [options={}]
     * @param {Number} [options.threshold]
     * @param {Boolean} [options.negate]
     * @param {Boolean} [options.normalize]
     */
    constructor(index, channel, options = {}) {

        /**
         * @private
         * @member {Number}
         */
        this._index = index | 0;

        /**
         * @private
         * @member {Number}
         */
        this._channel = channel | 0;

        /**
         * @private
         * @member {Number}
         */
        this._threshold = clamp(options.threshold || 0.2, 0, 1);

        /**
         * @private
         * @member {Boolean}
         */
        this._negate = options.negate;

        /**
         * @private
         * @member {Boolean}
         */
        this._normalize = options.normalize;
    }

    /**
     * @public
     * @param {Exo.GamepadButton|Number} buttonValue
     * @returns {Number}
     */
    getMappedValue(buttonValue) {
        let val = (typeof buttonValue.value === 'number') ? buttonValue.value : buttonValue;

        if (this._negate) {
            val *= -1;
        }

        if (this._normalize) {
            val = (val + 1) / 2;
        }

        return val >= this._threshold ? val : 0;
    }
}
