import Gamepad from './Gamepad';
import ChannelHandler from '../ChannelHandler';
import InputDevice from '../../const/InputDevice';

const offset = InputDevice.Gamepad << 8,
    bufferSize = 1 << 8;

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
        super(channelBuffer, offset, bufferSize);

        /**
         * @private
         * @member {Exo.Game}
         */
        this._game = game;

        /**
         * @private
         * @member {Exo.Gamepad[]}
         */
        this._gamepads = [];
    }

    /**
     * @public
     * @returns {Array}
     */
    getGamepads() {
        return this._gamepads;
    }

    /**
     * @public
     * @param {Number} index
     * @returns {Exo.Gamepad|null}
     */
    getGamepad(index) {
        return this._gamepads[index] || null;
    }

    /**
     * @public
     */
    update() {
        this.updateGamepads();

        if (!this.active) {
            return;
        }

        this._gamepads.forEach((gamepad) => {
            gamepad.update();
        });
    }

    /**
     * @public
     */
    updateGamepads() {
        const game = this._game,
            currentGamepads = this._gamepads,
            currentLength = currentGamepads.length,
            rawGamepads = this.getRawGamepads(),
            rawLength = rawGamepads.length;

        if (currentLength === rawLength) {
            return;
        }

        if (currentLength < rawLength) {
            this.addGamepads(rawGamepads);
        } else {
            this.removeGamepads(rawGamepads);
        }

        game.trigger('gamepad:change', currentGamepads);
    }

    addGamepads(rawGamepads) {
        const game = this._game,
            channelBuffer = this._channelBuffer,
            currentGamepads = this._gamepads;

        for (let index = currentGamepads.length; index < rawGamepads.length; index++) {
            currentGamepads.push(new Gamepad(channelBuffer, index, rawGamepads[index]));

            game.trigger('gamepad:add', currentGamepads);
        }
    }

    removeGamepads(rawGamepads) {
        const game = this._game,
            currentGamepads = this._gamepads,
            rawLength = rawGamepads.length;

        for (let i = currentGamepads.length - 1; i >= 0; i--) {
            const currentGamepad = currentGamepads[i];

            if (i < rawLength) {
                currentGamepad.rawGamepad = rawGamepads[i];
                currentGamepad.index = i;
                continue;
            }

            currentGamepad.destroy(true);
            currentGamepads.splice(i, 1);

            game.trigger('gamepad:remove', currentGamepads);
        }
    }

    /**
     * @public
     * @returns {Array}
     */
    getRawGamepads() {
        const navigator = window.navigator,
            rawGamepads = navigator.getGamepads(),
            activeGamepads = [],
            len = rawGamepads.length;

        for (let i = 0; i < len; i++) {
            if (rawGamepads[i]) {
                activeGamepads.push(rawGamepads[i]);
            }
        }

        return activeGamepads;
    }

    /**
     * @public
     * @param {Boolean} [resetChannels]
     */
    destroy(resetChannels) {
        super.destroy(resetChannels);

        this._gamepads.forEach((gamepad) => {
            gamepad.destroy();
        });
        this._gamepads.length = 0;
        this._gamepads = null;

        this._defaultMapping.destroy();
        this._defaultMapping = null;

        this._game = null;
    }
}
