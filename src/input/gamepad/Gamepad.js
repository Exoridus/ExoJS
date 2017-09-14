import ChannelHandler from '../ChannelHandler';
import DefaultGamepadMapping from './DefaultGamepadMapping';
import { CHANNEL_OFFSET, CHANNEL_LENGTH } from '../../const';

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
        super(channelBuffer, CHANNEL_OFFSET.GAMEPAD + (gamepad.index * CHANNEL_LENGTH.CHILD), CHANNEL_LENGTH.CHILD);

        /**
         * @private
         * @member {Gamepad}
         */
        this._gamepad = gamepad;

        /**
         * @private
         * @member {GamepadMapping}
         */
        this._mapping = new DefaultGamepadMapping();
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
        return CHANNEL_OFFSET.GAMEPAD + (index * CHANNEL_LENGTH.CHILD) + (key % CHANNEL_LENGTH.CHILD);
    }
}

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonBottom = CHANNEL_OFFSET.GAMEPAD + 0;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonLeft = CHANNEL_OFFSET.GAMEPAD + 1;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonRight = CHANNEL_OFFSET.GAMEPAD + 2;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonTop = CHANNEL_OFFSET.GAMEPAD + 3;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftTriggerBottom = CHANNEL_OFFSET.GAMEPAD + 4;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightTriggerBottom = CHANNEL_OFFSET.GAMEPAD + 5;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftTriggerTop = CHANNEL_OFFSET.GAMEPAD + 6;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightTriggerTop = CHANNEL_OFFSET.GAMEPAD + 7;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.Select = CHANNEL_OFFSET.GAMEPAD + 8;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.Start = CHANNEL_OFFSET.GAMEPAD + 9;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickButton = CHANNEL_OFFSET.GAMEPAD + 10;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickButton = CHANNEL_OFFSET.GAMEPAD + 11;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadUp = CHANNEL_OFFSET.GAMEPAD + 12;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadDown = CHANNEL_OFFSET.GAMEPAD + 13;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadLeft = CHANNEL_OFFSET.GAMEPAD + 14;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadRight = CHANNEL_OFFSET.GAMEPAD + 15;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.Special = CHANNEL_OFFSET.GAMEPAD + 16;

/**
 * Left analogue stick
 */

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickLeft = CHANNEL_OFFSET.GAMEPAD + 17;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickRight = CHANNEL_OFFSET.GAMEPAD + 18;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickUp = CHANNEL_OFFSET.GAMEPAD + 19;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickDown = CHANNEL_OFFSET.GAMEPAD + 20;

/**
 * Right analogue stick
 */

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickLeft = CHANNEL_OFFSET.GAMEPAD + 21;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickRight = CHANNEL_OFFSET.GAMEPAD + 22;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickUp = CHANNEL_OFFSET.GAMEPAD + 23;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickDown = CHANNEL_OFFSET.GAMEPAD + 24;
