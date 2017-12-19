import { INPUT_CHANNELS_DEVICE, INPUT_CHANNELS_GLOBAL, INPUT_OFFSET_GAMEPAD, INPUT_OFFSET_KEYBOARD, INPUT_OFFSET_POINTER } from '../const';
import ChannelManager from './ChannelManager';
import Keyboard from './Keyboard';
import GamepadManager from './gamepad/GamepadManager';
import PointerManager from './pointer/PointerManager';

/**
 * @class InputManager
 * @extends ChannelManager
 */
export default class InputManager extends ChannelManager {

    /**
     * @constructor
     * @param {Application} app
     * @param {ArrayBuffer} [channelBuffer=new ArrayBuffer(INPUT_CHANNELS_GLOBAL * 4)]
     * @param {Number} [offset=0]
     * @param {Number} [length=INPUT_CHANNELS_GLOBAL]
     */
    constructor(app, channelBuffer = new ArrayBuffer(INPUT_CHANNELS_GLOBAL * 4), offset = 0, length = INPUT_CHANNELS_GLOBAL) {
        super(channelBuffer, offset, length);

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

        /**
         * @private
         * @member {Set<Input>}
         */
        this._inputs = new Set();

        /**
         * @private
         * @member {Keyboard}
         */
        this._keyboard = new Keyboard(app, channelBuffer, INPUT_OFFSET_KEYBOARD, INPUT_CHANNELS_DEVICE);

        /**
         * @private
         * @member {PointerManager}
         */
        this._pointerManager = new PointerManager(app, channelBuffer, INPUT_OFFSET_POINTER, INPUT_CHANNELS_DEVICE);

        /**
         * @private
         * @member {GamepadManager}
         */
        this._gamepadManager = new GamepadManager(app, channelBuffer, INPUT_OFFSET_GAMEPAD, INPUT_CHANNELS_DEVICE);
    }

    /**
     * @public
     * @chainable
     * @param {Input|Input[]} inputs
     * @returns {InputManager}
     */
    add(inputs) {
        if (Array.isArray(inputs)) {
            inputs.forEach(this.add, this);

            return this;
        }

        this._inputs.add(inputs);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Input|Input[]} inputs
     * @returns {InputManager}
     */
    remove(inputs) {
        if (Array.isArray(inputs)) {
            inputs.forEach(this.remove, this);

            return this;
        }

        this._inputs.delete(inputs);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Boolean} [destroyInputs=false]
     * @returns {InputManager}
     */
    clear(destroyInputs = false) {
        if (destroyInputs) {
            for (const input of this._inputs) {
                input.destroy();
            }
        }

        this._inputs.clear();

        return this;
    }

    /**
     * @public
     */
    update() {
        this._gamepadManager.update();

        for (const input of this._inputs) {
            input.update(this.channels);
        }

        this._keyboard.update();
        this._pointerManager.update();
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._inputs.clear();
        this._inputs = null;

        this._keyboard.destroy();
        this._keyboard = null;

        this._pointerManager.destroy();
        this._pointerManager = null;

        this._gamepadManager.destroy();
        this._gamepadManager = null;

        this._app = null;
    }
}
