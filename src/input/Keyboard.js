import { INPUT_CHANNELS_DEVICE, INPUT_OFFSET_KEYBOARD } from '../const';
import { addFlag, hasFlag, removeFlag } from '../utils';
import ChannelManager from './ChannelManager';

const FLAGS = {
    NONE: 0,
    KEY_DOWN: 1 << 0,
    KEY_UP: 1 << 1,
};

/**
 * @class Keyboard
 * @extends {ChannelManager}
 */
export default class Keyboard extends ChannelManager {

    /**
     * @constructor
     * @param {Application} app
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(app, channelBuffer) {
        super(channelBuffer, INPUT_OFFSET_KEYBOARD, INPUT_CHANNELS_DEVICE);

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

        if (hasFlag(FLAGS.KEY_DOWN, this._flags)) {
            this.trigger('keyboard:down', this._channelsPressed, this);
            this._channelsPressed.clear();

            this._flags = removeFlag(FLAGS.KEY_DOWN, this._flags);
        }

        if (hasFlag(FLAGS.KEY_UP, this._flags)) {
            this.trigger('keyboard:up', this._channelsReleased, this);
            this._channelsReleased.clear();

            this._flags = removeFlag(FLAGS.KEY_UP, this._flags);
        }
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

        this._flags = addFlag(FLAGS.KEY_DOWN, this._flags);
    }

    /**
     * @private
     * @param {Event} event
     */
    _onKeyUp(event) {
        this.channels[event.keyCode] = 0;
        this._channelsReleased.add(Keyboard.getChannelCode(event.keyCode));

        this._flags = addFlag(FLAGS.KEY_UP, this._flags);
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @returns {Number}
     */
    static getChannelCode(key) {
        return INPUT_OFFSET_KEYBOARD + (key % INPUT_CHANNELS_DEVICE);
    }

    /**
     * @public
     * @static
     * @param {Number} channel
     * @returns {Number}
     */
    static getKeyCode(channel) {
        return (channel % INPUT_CHANNELS_DEVICE);
    }
}
