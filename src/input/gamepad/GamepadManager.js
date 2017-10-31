import { INPUT_CHANNELS_DEVICE, INPUT_OFFSET_GAMEPAD } from '../../const';
import Gamepad from './Gamepad';
import ChannelManager from '../ChannelManager';

const navigator = window.navigator;

/**
 * @class GamepadManager
 * @extends {ChannelManager}
 */
export default class GamepadManager extends ChannelManager {

    /**
     * @constructs GamepadManager
     * @param {Application} app
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(app, channelBuffer) {
        super(channelBuffer, INPUT_OFFSET_GAMEPAD, INPUT_CHANNELS_DEVICE);

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
            if (!!fetchedGamepads[i] === currentGamepads.has(i)) {
                continue;
            }

            if (fetchedGamepads[i]) {
                const gamepad = new Gamepad(fetchedGamepads[i], this.channelBuffer);

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
