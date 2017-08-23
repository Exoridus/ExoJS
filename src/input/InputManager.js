import ChannelHandler from './ChannelHandler';
import Keyboard from './Keyboard';
import Mouse from './Mouse';
import GamepadManager from './gamepad/GamepadManager';
import PointerManager from './pointer/PointerManager';
import {CHANNEL_RANGE_DEVICE} from '../const';

/**
 * @class InputManager
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
 */
export default class InputManager extends ChannelHandler {

    /**
     * @constructor
     * @param {Exo.Game} game
     */
    constructor(game) {
        super(new ArrayBuffer(CHANNEL_RANGE_DEVICE * 16), 0, CHANNEL_RANGE_DEVICE * 4);

        /**
         * @private
         * @member {Exo.Game}
         */
        this._game = game;

        /**
         * @private
         * @member {Set.<Exo.Input>}
         */
        this._inputs = new Set();

        /**
         * @private
         * @member {Exo.Keyboard}
         */
        this._keyboard = new Keyboard(game, this._channelBuffer);

        /**
         * @private
         * @member {Exo.Mouse}
         */
        this._mouse = new Mouse(game, this._channelBuffer);

        /**
         * @private
         * @member {Exo.GamepadManager}
         */
        this._gamepadManager = new GamepadManager(game, this._channelBuffer);

        /**
         * @private
         * @member {Exo.PointerManager}
         */
        this._pointerManager = new PointerManager(game, this._channelBuffer);

        game.on('input:add', this.add, this)
            .on('input:remove', this.remove, this)
            .on('input:clear', this.clear, this);
    }

    /**
     * @public
     * @param {Exo.Input|Exo.Input[]} input
     */
    add(input) {
        if (Array.isArray(input)) {
            input.forEach((input) => {
                this._inputs.add(input);
            });
            return;
        }

        this._inputs.add(input);
    }

    /**
     * @public
     * @param {Exo.Input|Exo.Input[]} input
     */
    remove(input) {
        if (Array.isArray(input)) {
            input.forEach((input) => {
                this._inputs.delete(input);
            });
            return;
        }

        this._inputs.delete(input);
    }

    /**
     * @public
     * @param {Boolean} [destroyInputs=false]
     */
    clear(destroyInputs = false) {
        if (destroyInputs) {
            this._inputs.forEach((input) => {
                input.destroy();
            });
        }

        this._inputs.clear();
    }

    /**
     * @public
     */
    update() {
        const channels = this.channels;

        this._gamepadManager.update();
        this._inputs.forEach((input) => {
            input.update(channels);
        });
        this._mouse.update();
    }

    /**
     * @public
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
