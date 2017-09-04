import Gamepad from './Gamepad';
import ChannelHandler from '../ChannelHandler';
import {CHANNEL_OFFSET, CHANNEL_LENGTH} from '../../const';

const navigator = window.navigator;

/**
 * @class GamepadManager
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
 */
export default class GamepadManager extends ChannelHandler {

    /**
     * @constructor
     * @param {Exo.Game} game
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(game, channelBuffer) {
        super(channelBuffer, CHANNEL_OFFSET.GAMEPAD, CHANNEL_LENGTH.DEVICE);

        /**
         * @private
         * @member {Exo.Game}
         */
        this._game = game;

        /**
         * @private
         * @member {Map.<Number, Exo.Gamepad>}
         */
        this._gamepads = new Map();
    }

    /**
     * @public
     * @readonly
     * @member {Map.<Number, Exo.Gamepad>}
     */
    get gamepads() {
        return this._gamepads;
    }

    /**
     * @public
     */
    update() {
        this.updateGamepads();

        if (!this.active) {
            return;
        }

        for (const gamepad of this._gamepads.values()) {
            gamepad.update();
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

        for (let i = 0; i < length; i++) {
            if (!!nativeGamepads[i] === activeGamepads.has(i)) {
                continue;
            }

            if (nativeGamepads[i]) {
                const newGamepad = new Gamepad(this._channelBuffer, i, nativeGamepads[i]);

                activeGamepads.set(i, newGamepad);
                game.trigger('gamepad:add', newGamepad, i, activeGamepads);
            } else {
                const oldGamepad = activeGamepads.get(i);

                activeGamepads.delete(i);
                game.trigger('gamepad:remove', oldGamepad, i, activeGamepads);
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
