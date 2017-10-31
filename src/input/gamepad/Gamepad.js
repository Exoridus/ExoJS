import { INPUT_CHANNELS_HANDLER, INPUT_OFFSET_GAMEPAD } from '../../const';
import settings from '../../settings';
import ChannelManager from '../ChannelManager';

/**
 * @class Gamepad
 * @extends {ChannelManager}
 */
export default class Gamepad extends ChannelManager {

    /**
     * @constructs Gamepad
     * @param {Gamepad} gamepad
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(gamepad, channelBuffer) {
        super(channelBuffer, INPUT_OFFSET_GAMEPAD + (gamepad.index * INPUT_CHANNELS_HANDLER), INPUT_CHANNELS_HANDLER);

        /**
         * @private
         * @member {Gamepad}
         */
        this._gamepadIndex = gamepad;

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
        return this._gamepadIndex;
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
        return this._gamepadIndex.id;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get index() {
        return this._gamepadIndex.index;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get connected() {
        return this._gamepadIndex.connected;
    }

    /**
     * @public
     */
    update() {
        const channels = this.channels,
            buttonMapping = this._mapping.buttons,
            axesMapping = this._mapping.axes,
            gamepdaButtons = this._gamepadIndex.buttons,
            gamepadAxes = this._gamepadIndex.axes;

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

        this._gamepadIndex = null;
    }
}
