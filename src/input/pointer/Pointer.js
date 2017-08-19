import ChannelHandler from '../ChannelHandler';
import InputDevice from '../../const/InputDevice';

const device = InputDevice.Pointer << 8,
    bufferSize = 1 << 5;

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
    constructor(channelBuffer) {
        super(channelBuffer, device, bufferSize);
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
     * @param {Boolean} [resetChannels=false]
     */
    destroy(resetChannels = false) {
        super.destroy(resetChannels);
    }
}

Pointer.Down = device | 0;
Pointer.SwipeLeft = device | 0;
Pointer.SwipeRight = device | 0;
Pointer.SwipeUp = device | 0;
Pointer.SwipeDown = device | 0;
