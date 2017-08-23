import EventEmitter from '../core/EventEmitter';

/**
 * @class ChannelHandler
 * @extends {Exo.EventEmitter}
 * @memberof Exo
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

    set active(value) {
        this._active = !!value;
    }

    /**
     * @public
     * @param {Number} offset
     * @param {Number} length
     */
    setChannelOffset(offset, length) {
        this._channels = new Float32Array(this._channelBuffer, offset * 4, length);
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
