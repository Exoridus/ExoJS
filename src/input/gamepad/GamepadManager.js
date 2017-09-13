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
            currentGamepads = this._gamepads,
            fetchedGamepads = navigator.getGamepads(),
            length = fetchedGamepads.length;

        for (let i = 0; i < length; i++) {
            if (!!fetchedGamepads[i] === currentGamepads.has(i)) {
                continue;
            }

            if (fetchedGamepads[i]) {
                const gamepad = new Gamepad(fetchedGamepads[i], this.channelBuffer);

                currentGamepads.set(i, gamepad);
                game.trigger('gamepad:add', gamepad, currentGamepads);
            } else {
                const gamepad = currentGamepads.get(i);

                currentGamepads.delete(i);
                game.trigger('gamepad:remove', gamepad, currentGamepads);
                gamepad.destroy();
            }

            game.trigger('gamepad:change', currentGamepads);
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
