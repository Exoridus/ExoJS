import ChannelHandler from '../ChannelHandler';
import Vector from '../../core/Vector';
import { CHANNEL_OFFSET, CHANNEL_LENGTH } from '../../const';

const FLAGS = {
    NONE: 0,
    BUTTON_DOWN: 1 << 0,
    BUTTON_UP: 1 << 1,
    POSITION: 1 << 2,
    WINDOW_STATE: 1 << 3,
};

/**
 * @class Pointer
 * @extends {ChannelHandler}
 */
export default class Pointer extends ChannelHandler {

    /**
     * @constructor
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(channelBuffer) {
        super(channelBuffer, CHANNEL_OFFSET.POINTER, CHANNEL_LENGTH.CHILD);

        /**
         * @private
         * @member {Vector}
         */
        this._position = new Vector();

        /**
         * @private
         * @member {Vector}
         */
        this._size = new Vector();

        /**
         * @private
         * @member {Boolean}
         */
        this._insideWindow = false;

        /**
         * @private
         * @member {Number}
         */
        this._flags = FLAGS.NONE;
    }

    /**
     * @public
     * @readonly
     * @member {Vector}
     */
    get position() {
        return this._position;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get x() {
        return this._position.x;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get y() {
        return this._position.y;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get insideWindow() {
        return this._insideWindow;
    }

    /**
     * @public
     * @fires Mouse#enter
     * @fires Mouse#leave
     * @fires Mouse#scroll
     * @fires Mouse#move
     * @fires Mouse#down
     * @fires Mouse#up
     */
    update() {
        if (!this._flags) {
            return;
        }

        this._flags = FLAGS.NONE;

        this.channels.fill(0, 5, 17);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._position.destroy();
        this._position = null;

        this._positionDelta.destroy();
        this._positionDelta = null;

        this._scrollDelta.destroy();
        this._scrollDelta = null;

        this._channelsPressed.clear();
        this._channelsPressed = null;

        this._channelsReleased.clear();
        this._channelsReleased = null;

        this._flags = null;
        this._insideWindow = null;
        this._canvas = null;
        this._app = null;
    }
}
