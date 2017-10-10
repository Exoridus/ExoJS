import ChannelHandler from '../ChannelHandler';
import { RANGE_NODE, OFFSET_GAMEPAD } from '../../const';
import settings from '../../settings';

/**
 * @class Gamepad
 * @extends {ChannelHandler}
 */
export default class Gamepad extends ChannelHandler {

    /**
     * @constructor
     * @param {Gamepad} gamepad
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(gamepad, channelBuffer) {
        super(channelBuffer, OFFSET_GAMEPAD + (gamepad.index * RANGE_NODE), RANGE_NODE);

        /**
         * @private
         * @member {Gamepad}
         */
        this._gamepad = gamepad;

        /**
         * @private
         * @member {GamepadMapping}
         */
        this._mapping = settings.GAMEPAD_MAPPING;
    }

    /**
     * @public
     * @readonly
     * @member {Gamepad}
     */
    get gamepad() {
        return this._gamepad;
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
     * @member {Number}
     */
    get id() {
        return this._gamepad.id;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get index() {
        return this._gamepad.index;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get connected() {
        return this._gamepad.connected;
    }

    /**
     * @public
     */
    update() {
        const channels = this.channels,
            buttonMapping = this._mapping.buttons,
            axesMapping = this._mapping.axes,
            gamepdaButtons = this._gamepad.buttons,
            gamepadAxes = this._gamepad.axes;

        for (const button of buttonMapping) {
            if (button.index in gamepdaButtons) {
                channels[button.key] = button.transformValue(gamepdaButtons[button.index].value);
            }
        }

        for (const axis of axesMapping) {
            if (axis.index in gamepadAxes) {
                channels[axis.key] = axis.transformValue(gamepadAxes[axis.index]);
            }
        }
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._mapping.destroy();
        this._mapping = null;

        this._gamepad = null;
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @param {Number} [index=0]
     * @returns {Number}
     */
    static getChannelCode(key, index = 0) {
        return OFFSET_GAMEPAD + (index * RANGE_NODE) + (key % RANGE_NODE);
    }
}
