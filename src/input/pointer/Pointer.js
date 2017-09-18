import ChannelHandler from '../ChannelHandler';
import { CHANNEL_OFFSET, CHANNEL_LENGTH } from '../../const';

/**
 * @class Pointer
 * @extends {ChannelHandler}
 */
export default class Pointer extends ChannelHandler {

    /**
     * @constructor
     * @param {ArrayBuffer} channelBuffer
     * @param {Number} index
     */
    constructor(channelBuffer, index) {
        super(channelBuffer, CHANNEL_OFFSET.POINTER + (index * CHANNEL_LENGTH.CHILD), CHANNEL_LENGTH.CHILD);
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @param {Number} [index=0]
     * @returns {Number}
     */
    static getChannelCode(key, index = 0) {
        return CHANNEL_OFFSET.POINTER + (index * CHANNEL_LENGTH.CHILD) + (key % CHANNEL_LENGTH.CHILD);
    }
}
