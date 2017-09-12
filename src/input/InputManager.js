import ChannelHandler from './ChannelHandler';
import Keyboard from './Keyboard';
import Mouse from './Mouse';
import GamepadManager from './gamepad/GamepadManager';
import PointerManager from './pointer/PointerManager';
import { CHANNEL_LENGTH } from '../const';

/**
 * @class InputManager
 * @extends {ChannelHandler}
 */
export default class InputManager extends ChannelHandler {

    /**
     * @constructor
     * @param {Game} game
     */
    constructor(game) {
        super(new ArrayBuffer(CHANNEL_LENGTH.GLOBAL * 4), 0, CHANNEL_LENGTH.GLOBAL);

        /**
         * @private
         * @member {Game}
         */
        this._game = game;

        /**
         * @private
         * @member {Set<Input>}
         */
        this._inputs = new Set();

        /**
         * @private
         * @member {Keyboard}
         */
        this._keyboard = new Keyboard(game, this.channelBuffer);

        /**
         * @private
         * @member {Mouse}
         */
        this._mouse = new Mouse(game, this.channelBuffer);

        /**
         * @private
         * @member {GamepadManager}
         */
        this._gamepadManager = new GamepadManager(game, this.channelBuffer);

        /**
         * @private
         * @member {PointerManager}
         */
        this._pointerManager = new PointerManager(game, this.channelBuffer);

        game.on('input:add', this.add, this)
            .on('input:remove', this.remove, this)
            .on('input:clear', this.clear, this);
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

        this._mouse.update();
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._game
            .off('input:add', this.add, this)
            .off('input:remove', this.remove, this)
            .off('input:clear', this.clear, this);

        this._inputs.clear();
        this._inputs = null;

        this._keyboard.destroy();
        this._keyboard = null;

        this._mouse.destroy();
        this._mouse = null;

        this._gamepadManager.destroy();
        this._gamepadManager = null;

        this._pointerManager.destroy();
        this._pointerManager = null;

        this._game = null;
    }
}
