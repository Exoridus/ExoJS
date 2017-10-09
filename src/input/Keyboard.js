import ChannelHandler from './ChannelHandler';
import { CHANNEL_OFFSET, CHANNEL_LENGTH } from '../const';

const FLAGS = {
    NONE: 0,
    KEY_DOWN: 1 << 0,
    KEY_UP: 1 << 1,
};

/**
 * @class Keyboard
 * @extends {ChannelHandler}
 */
export default class Keyboard extends ChannelHandler {

    /**
     * @constructor
     * @param {Application} app
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(app, channelBuffer) {
        super(channelBuffer, CHANNEL_OFFSET.KEYBOARD, CHANNEL_LENGTH.DEVICE);

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

        /**
         * @private
         * @member {Set<Number>}
         */
        this._channelsPressed = new Set();

        /**
         * @private
         * @member {Set<Number>}
         */
        this._channelsReleased = new Set();

        /**
         * @private
         * @member {Number}
         */
        this._flags = FLAGS.NONE;

        this._addEventListeners();
    }

    /**
     * @override
     */
    update() {
        if (!this._flags) {
            return;
        }

        if (this._flags & FLAGS.KEY_DOWN) {
            this.trigger('keyboard:down', this._channelsPressed, this);
            this._channelsPressed.clear();
        }

        if (this._flags & FLAGS.KEY_UP) {
            this.trigger('keyboard:up', this._channelsReleased, this);
            this._channelsReleased.clear();
        }

        this._flags = 0;

    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._removeEventListeners();

        this._channelsPressed.clear();
        this._channelsPressed = null;

        this._channelsReleased.clear();
        this._channelsReleased = null;

        this._flags = null;
        this._app = null;
    }

    /**
     * @private
     */
    _addEventListeners() {
        this._onKeyDownHandler = this._onKeyDown.bind(this);
        this._onKeyUpHandler = this._onKeyUp.bind(this);

        window.addEventListener('keydown', this._onKeyDownHandler, true);
        window.addEventListener('keyup', this._onKeyUpHandler, true);
    }

    /**
     * @private
     */
    _removeEventListeners() {
        window.removeEventListener('keydown', this._onKeyDownHandler, true);
        window.removeEventListener('keyup', this._onKeyUpHandler, true);

        this._onKeyDownHandler = null;
        this._onKeyUpHandler = null;
    }

    /**
     * @private
     * @param {Event} event
     */
    _onKeyDown(event) {
        this.channels[event.keyCode] = 1;
        this._channelsPressed.add(Keyboard.getChannelCode(event.keyCode));

        this._flags |= FLAGS.KEY_DOWN;
    }

    /**
     * @private
     * @param {Event} event
     */
    _onKeyUp(event) {
        this.channels[event.keyCode] = 0;
        this._channelsReleased.add(Keyboard.getChannelCode(event.keyCode));

        this._flags |= FLAGS.KEY_UP;
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @returns {Number}
     */
    static getChannelCode(key) {
        return CHANNEL_OFFSET.KEYBOARD + (key % CHANNEL_LENGTH.DEVICE);
    }
}
