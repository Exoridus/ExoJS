import ChannelHandler from '../ChannelHandler';
import GamepadDefaultMapping from './GamepadDefaultMapping';
import {CHANNEL_RANGE_HANDLER, CHANNEL_RANGE_DEVICE, INPUT_DEVICE} from '../../const';

const offset = INPUT_DEVICE.GAMEPAD * CHANNEL_RANGE_DEVICE;

/**
 * @class Gamepad
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
 */
export default class Gamepad extends ChannelHandler {

    /**
     * @constructor
     * @param {ArrayBuffer} channelBuffer
     * @param {Number} [index=0]
     * @param {Gamepad} [gamepad]
     */
    constructor(channelBuffer, index, gamepad) {
        super(channelBuffer, offset | (index * CHANNEL_RANGE_HANDLER), CHANNEL_RANGE_HANDLER);

        /**
         * @private
         * @member {Number}
         */
        this._index = index | 0;

        /**
         * @private
         * @member {Gamepad}
         */
        this._rawGamepad = gamepad;

        /**
         * @private
         * @member {Exo.GamepadMapping}
         */
        this._mapping = new GamepadDefaultMapping();
    }

    /**
     * @public
     * @member {Exo.Gamepad}
     */
    get rawGamepad() {
        return this._rawGamepad;
    }

    set rawGamepad(value) {
        this._rawGamepad = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get index() {
        return this._index;
    }

    set index(value) {
        if (this._index !== value) {
            this._index = value | 0;
            this.setChannelOffset(offset | (this._index * CHANNEL_RANGE_HANDLER), CHANNEL_RANGE_HANDLER);
        }
    }

    /**
     * @public
     * @member {Exo.GamepadMapping}
     */
    get mapping() {
        return this._mapping;
    }

    set mapping(value) {
        this._mapping = value;
    }

    /**
     * @public
     */
    update() {
        const rawGamepad = this._rawGamepad,
            mapping = this._mapping;

        if (!this.active) {
            return;
        }

        this.updateButtons(rawGamepad.buttons, mapping.buttons);
        this.updateButtons(rawGamepad.axes, mapping.axes);
    }

    /**
     * @public
     * @param {Exo.GamepadButton[]|Number[]} buttons
     * @param {Exo.GamepadButton[]} mappingButtons
     */
    updateButtons(buttons, mappingButtons) {
        const channels = this.channels;

        mappingButtons.forEach((mappingButton) => {
            if (mappingButton.index in buttons) {
                channels[mappingButton.keyCode] = mappingButton.getMappedValue(buttons[mappingButton.index]);
            }
        });
    }

    /**
     * @public
     * @param {Boolean} [resetChannels=false]
     */
    destroy(resetChannels = false) {
        super.destroy(resetChannels);

        this._mapping.destroy();
        this._mapping = null;

        this._rawGamepad = null;
        this._index = null;
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @param {Number} [index=0]
     * @returns {Number}
     */
    static getChannelCode(key, index = 0) {
        return offset | ((index * CHANNEL_RANGE_HANDLER) | (key & 255));
    }
}

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonBottom = offset | 0;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonLeft = offset | 1;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonRight = offset | 2;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonTop = offset | 3;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftTriggerBottom = offset | 4;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightTriggerBottom = offset | 5;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftTriggerTop = offset | 6;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightTriggerTop = offset | 7;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.Select = offset | 8;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.Start = offset | 9;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickButton = offset | 10;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickButton = offset | 11;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadUp = offset | 12;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadDown = offset | 13;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadLeft = offset | 14;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadRight = offset | 15;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.Special = offset | 16;

/**
 * Left analogue stick
 */

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickLeft = offset | 17;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickRight = offset | 18;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickUp = offset | 19;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickDown = offset | 20;

/**
 * Right analogue stick
 */

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickLeft = offset | 21;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickRight = offset | 22;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickUp = offset | 23;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickDown = offset | 24;
