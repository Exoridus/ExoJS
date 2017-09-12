import Gamepad from './Gamepad';
import ChannelHandler from '../ChannelHandler';
import { CHANNEL_OFFSET, CHANNEL_LENGTH } from '../../const';

const navigator = window.navigator;

/**
 * @class GamepadManager
 * @extends {ChannelHandler}
 */
export default class GamepadManager extends ChannelHandler {

    /**
     * @constructor
     * @param {Game} game
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(game, channelBuffer) {
        super(channelBuffer, CHANNEL_OFFSET.GAMEPAD, CHANNEL_LENGTH.DEVICE);

        /**
         * @private
         * @member {Game}
         */
        this._game = game;

        /**
         * @private
         * @member {Map<Number, Gamepad>}
         */
        this._gamepads = new Map();
    }

    /**
     * @public
     * @readonly
     * @member {Map<Number, Gamepad>}
     */
    get gamepads() {
        return this._gamepads;
    }

    /**
     * @public
     */
    update() {
        this.updateGamepads();

        if (this.active) {
            for (const gamepad of this._gamepads.values()) {
                gamepad.update();
            }
        }
    }

    /**
     * @public
     */
    updateGamepads() {
        const game = this._game,
            activeGamepads = this._gamepads,
            nativeGamepads = navigator.getGamepads(),
            length = nativeGamepads.length;

        for (let index = 0; index < length; index++) {
            if (!nativeGamepads[index] === !activeGamepads.has(index)) {
                continue;
            }

            if (nativeGamepads[index]) {
                const newGamepad = new Gamepad(nativeGamepads[index], this.channelBuffer);

                activeGamepads.set(index, newGamepad);
                game.trigger('gamepad:add', newGamepad, index, activeGamepads);
            } else {
                const oldGamepad = activeGamepads.get(index);

                activeGamepads.delete(index);
                game.trigger('gamepad:remove', oldGamepad, index, activeGamepads);
                oldGamepad.destroy();
            }

            game.trigger('gamepad:change', activeGamepads);
        }
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        for (const gamepad of this._gamepads.values()) {
            gamepad.destroy();
        }

        this._gamepads.clear();
        this._gamepads = null;

        this._game = null;
    }
}
