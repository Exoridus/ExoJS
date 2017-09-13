import EventEmitter from '../core/EventEmitter';

/**
 * @class ChannelHandler
 * @extends {EventEmitter}
 */
export default class ChannelHandler extends EventEmitter {

    /**
     * @constructor
     * @param {ArrayBuffer} channelBuffer
     * @param {Number} offset
     * @param {Number} length
     */
    constructor(channelBuffer, offset, length) {
        super();

        /**
         * @private
         * @member {ArrayBuffer}
         */
        this._channelBuffer = channelBuffer;

        /**
         * @private
         * @member {Float32Array}
         */
        this._channels = new Float32Array(channelBuffer, offset * 4, length);

        /**
         * @private
         * @member {Boolean}
         */
        this._active = true;
    }

    /**
     * @public
     * @readonly
     * @member {ArrayBuffer}
     */
    get channelBuffer() {
        return this._channelBuffer;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get channels() {
        return this._channels;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get active() {
        return this._active;
    }

    set active(active) {
        this._active = active;
    }

    /**
     * @public
     */
    toggle() {
        this._active = !this._active;
    }

    /**
     * @public
     */
    resetChannels() {
        this._channels.fill(0);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this.resetChannels();
        this._channelBuffer = null;
        this._channels = null;
        this._active = null;
    }
}
