import EventEmitter from '../core/EventEmitter';

/**
 * @class ChannelManager
 * @extends EventEmitter
 */
export default class ChannelManager extends EventEmitter {

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
         * @member {Number}
         */
        this._offset = offset;

        /**
         * @private
         * @member {Number}
         */
        this._length = length;

        /**
         * @private
         * @member {Float32Array}
         */
        this._channels = new Float32Array(channelBuffer, offset * 4, length);
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
     * @member {Number}
     */
    get offset() {
        return this._offset;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get length() {
        return this._length;
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
     * @param {Number} key
     * @returns {Number}
     */
    getChannelCode(key) {
        return this.offset + (key % this.length);
    }

    /**
     * @public
     * @param {Number} channel
     * @returns {Number}
     */
    getKeyCode(channel) {
        return (channel % this.length);
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
        this._offset = null;
        this._length = null;
        this._channels = null;
    }
}
