import Gamepad from './Gamepad';
import ChannelManager from '../ChannelManager';
import { INPUT_CHANNELS_HANDLER } from '../../const';

const navigator = window.navigator;

/**
 * @class GamepadManager
 * @extends ChannelManager
 */
export default class GamepadManager extends ChannelManager {

    /**
     * @constructor
     * @param {Application} app
     * @param {ArrayBuffer} channelBuffer
     * @param {Number} offset
     * @param {Number} length
     */
    constructor(app, channelBuffer, offset, length) {
        super(channelBuffer, offset, length);

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

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
        const app = this._app,
            currentGamepads = this._gamepads,
            fetchedGamepads = navigator.getGamepads(),
            length = fetchedGamepads.length;

        for (let i = 0; i < length; i++) {
            const fetchedGamepad = fetchedGamepads[i];

            if (!!fetchedGamepad === currentGamepads.has(i)) {
                continue;
            }

            if (fetchedGamepad) {
                const gamepad = new Gamepad(
                    fetchedGamepad,
                    this.channelBuffer,
                    this.offset + (fetchedGamepad.index * INPUT_CHANNELS_HANDLER),
                    INPUT_CHANNELS_HANDLER
                );

                currentGamepads.set(i, gamepad);
                app.trigger('gamepad:add', gamepad, currentGamepads);
            } else {
                const gamepad = currentGamepads.get(i);

                currentGamepads.delete(i);
                app.trigger('gamepad:remove', gamepad, currentGamepads);
                gamepad.destroy();
            }

            app.trigger('gamepad:change', currentGamepads);
        }

        for (const gamepad of currentGamepads.values()) {
            gamepad.update();
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

        this._app = null;
    }
}
