import ChannelHandler from '../ChannelHandler';
import InputDevice from '../InputDevice';
import GamepadDefaultMapping from './GamepadDefaultMapping';

const device = InputDevice.Gamepad << 8,
    bufferSize = 1 << 5;

/**
 * @class Gamepad
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
 */
export default class Gamepad extends ChannelHandler {

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
            this.setChannelOffset(device | (this._index << 5), bufferSize);
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
     * @constructor
     * @param {ArrayBuffer} channelBuffer
     * @param {Number} index
     * @param {Exo.Gamepad} rawGamepad
     */
    constructor(channelBuffer, index, rawGamepad) {
        super(channelBuffer, (device | (index << 5)), bufferSize);

        /**
         * @private
         * @member {Number}
         */
        this._index = index | 0;

        /**
         * @private
         * @member {Exo.Gamepad}
         */
        this._rawGamepad = rawGamepad;

        /**
         * @private
         * @member {Exo.GamepadMapping}
         */
        this._mapping = new GamepadDefaultMapping();
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
     * @param {Number} gamepadIndex
     * @returns {Number}
     */
    static getChannelCode(key, gamepadIndex) {
        return device | ((key & 255) | (gamepadIndex << 5));
    }
}

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonBottom = device | 0;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonLeft = device | 1;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonRight = device | 2;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonTop = device | 3;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftTriggerBottom = device | 4;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightTriggerBottom = device | 5;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftTriggerTop = device | 6;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightTriggerTop = device | 7;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.Select = device | 8;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.Start = device | 9;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickButton = device | 10;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickButton = device | 11;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadUp = device | 12;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadDown = device | 13;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadLeft = device | 14;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadRight = device | 15;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.Special = device | 16;

/**
 * Left analogue stick
 */

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickLeft = device | 17;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickRight = device | 18;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickUp = device | 19;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickDown = device | 20;

/**
 * Right analogue stick
 */

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickLeft = device | 21;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickRight = device | 22;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickUp = device | 23;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickDown = device | 24;
