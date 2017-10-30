import { INPUT_CHANNELS_GLOBAL } from '../const';
import ChannelManager from './ChannelManager';
import Keyboard from './Keyboard';
import GamepadManager from './gamepad/GamepadManager';
import PointerManager from './pointer/PointerManager';

/**
 * @class InputManager
 * @extends {ChannelManager}
 */
export default class InputManager extends ChannelManager {

    /**
     * @constructor
     * @param {Application} app
     */
    constructor(app) {
        super(new ArrayBuffer(INPUT_CHANNELS_GLOBAL * 4), 0, INPUT_CHANNELS_GLOBAL);

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
        this._keyboard = new Keyboard(app, this.channelBuffer);

        /**
         * @private
         * @member {PointerManager}
         */
        this._pointerManager = new PointerManager(app, this.channelBuffer);

        /**
         * @private
         * @member {GamepadManager}
         */
        this._gamepadManager = new GamepadManager(app, this.channelBuffer);
    }

    /**
     * @public
     * @param {Input|Input[]} inputs
     */
    add(inputs) {
        if (Array.isArray(inputs)) {
            for (const input of inputs) {
                this.add(input);
            }

            return;
        }

        this._inputs.add(inputs);
    }

    /**
     * @public
     * @param {Input|Input[]} inputs
     */
    remove(inputs) {
        if (Array.isArray(inputs)) {
            for (const input of inputs) {
                this.remove(input);
            }

            return;
        }

        this._inputs.delete(inputs);
    }

    /**
     * @public
     * @param {Boolean} [destroyInputs=false]
     */
    clear(destroyInputs = false) {
        if (destroyInputs) {
            for (const input of this._inputs) {
                input.destroy();
            }

            return;
        }

        this._inputs.clear();
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
