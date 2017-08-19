import ChannelHandler from './ChannelHandler';
import Keyboard from './Keyboard';
import Mouse from './Mouse';
import GamepadManager from './gamepad/GamepadManager';
import PointerManager from './pointer/PointerManager';

const bufferSize = 4 << 8;

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
        super(new ArrayBuffer(bufferSize * 4), 0, bufferSize);

        /**
         * @private
         * @member {Exo.Game}
         */
        this._game = game;

        /**
         * @private
         * @member {Set<Input>}
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

        game.on('input:add', this.onInputAdd, this)
            .on('input:remove', this.onInputRemove, this)
            .on('input:clear', this.onInputClear, this);
    }

    /**
     * @public
     * @param {Exo.Input|Exo.Input[]} input
     */
    onInputAdd(input) {
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
     * @param {Boolean} [destroyInput=false]
     */
    onInputRemove(input, destroyInput = false) {
        if (Array.isArray(input)) {
            input.forEach((input) => {
                this.onInputRemove(input, destroyInput);
            });

            return;
        }

        if (destroyInput) {
            input.destroy();
        }

        this._inputs.delete(input);
    }

    /**
     * @public
     * @param {Boolean} [destroyInputs=false]
     */
    onInputClear(destroyInputs = false) {
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
        super.destroy(true);

        this._game.trigger('input:clear');
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
