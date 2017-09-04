import ChannelHandler from '../ChannelHandler';
import {CHANNEL_OFFSET, CHANNEL_LENGTH} from '../../const';

/**
 * @class Pointer
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
 */
export default class Pointer extends ChannelHandler {

    /**
     * @constructor
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(channelBuffer, index) {
        super(channelBuffer, CHANNEL_OFFSET.POINTER | (index * CHANNEL_LENGTH.CHILD), CHANNEL_LENGTH.CHILD);
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @param {Number} identifier
     */
    onPress(x, y, identifier) {
        this.identifier = identifier;
        this.pressed = true;

        this.setPosition(x, y);
    }

    /**
     * @public
     */
    onRelease() {
        this.identifier = 0;
        this.pressed = false;
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     */
    setPosition(x, y) {
        if (this.moved === false) {
            this.moved = true;
            this.previousX = this.currentX;
            this.previousY = this.currentY;
        }

        this.currentX = x >>> 0;
        this.currentY = y >>> 0;
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @param {Number} [index=0]
     * @returns {Number}
     */
    static getChannelCode(key, index = 0) {
        return CHANNEL_OFFSET.POINTER | ((index * CHANNEL_LENGTH.CHILD) | (key & 255));
    }
}
