import settings from '../settings';
import Signal from '../core/Signal';

/**
 * @class Gamepad
 */
export default class Gamepad {

    /**
     * @constructor
     * @param {Number} index
     * @param {Float32Array} channels
     */
    constructor(index, channels) {

        /**
         * @private
         * @member {Number}
         */
        this._index = index;

        /**
         * @private
         * @member {Float32Array}
         */
        this._channels = channels;

        /**
         * @private
         * @member {Boolean}
         */
        this._connected = false;

        /**
         * @private
         * @member {?Gamepad}
         */
        this._gamepad = null;

        /**
         * @private
         * @member {GamepadMapping}
         */
        this._mapping = settings.GAMEPAD_MAPPING;
    }

    /**
     * @public
     * @member {GamepadMapping}
     */
    get mapping() {
        return this._mapping;
    }

    set mapping(mapping) {
        this._mapping = mapping;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get channels() {
        return this._channels;
    }

    /**
     * @public
     * @readonly
     * @member {?Gamepad}
     */
    get gamepad() {
        return this._gamepad;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get index() {
        return this._index;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get connected() {
        return this._connected;
    }

    /**
     * @public
     * @chainable
     * @param {Gamepad} gamepad
     * @returns {Gamepad}
     */
    connect(gamepad) {
        if (!this._connected) {
            this._gamepad = gamepad;
            this._connected = true;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Gamepad} gamepad
     * @returns {Gamepad}
     */
    disconnect() {
        if (this._connected) {
            this._gamepad = null;
            this._connected = false;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Gamepad}
     */
    update() {
        if (this._connected) {
            const channels = this._channels,
                gamepadButtons = this._gamepad.buttons,
                mappingButtons = this._mapping.buttons,
                gamepadAxes = this._gamepad.axes,
                mappingAxes = this._mapping.axes;

            for (const mapping of mappingButtons) {
                const { index, channel } = mapping;

                if (index in gamepadButtons) {
                    const value = mapping.transformValue(gamepadButtons[index].value) || 0;

                    if (channels[channel] !== value) {
                        channels[channel] = value;
                    }
                }
            }

            for (const mapping of mappingAxes) {
                const { index, channel } = mapping;

                if (index in gamepadAxes) {
                    const value = mapping.transformValue(gamepadAxes[index]) || 0;

                    if (channels[channel] !== value) {
                        channels[channel] = value;
                    }
                }
            }
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.disconnect();

        this._mapping.destroy();
        this._mapping = null;

        this._index = null;
        this._channels = null;
        this._connected = null;
        this._gamepad = null;
    }
}
