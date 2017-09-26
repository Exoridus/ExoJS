import ChannelHandler from '../ChannelHandler';
import Vector from '../../core/Vector';
import { CHANNEL_OFFSET, CHANNEL_LENGTH } from '../../const';

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
        this._flags = 0;
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

        // if (this._flags & Mouse.FLAGS.WINDOW_STATE) {
        //     this._app.trigger(this._insideWindow ? 'mouse:enter' : 'mouse:leave', this);
        // }
        //
        // if (this._flags & Mouse.FLAGS.SCROLL) {
        //     this._app.trigger('mouse:scroll', this._scrollDelta, this);
        //     this._scrollDelta.reset();
        // }
        //
        // if (this._flags & Mouse.FLAGS.POSITION) {
        //     this._app.trigger('mouse:move', this._position, this);
        //     this._positionDelta.reset();
        // }
        //
        // if (this._flags & Mouse.FLAGS.BUTTON_DOWN) {
        //     this._app.trigger('mouse:down', this._channelsPressed, this);
        //     this._channelsPressed.clear();
        // }
        //
        // if (this._flags & Mouse.FLAGS.BUTTON_UP) {
        //     this._app.trigger('mouse:up', this._channelsReleased, this);
        //     this._channelsReleased.clear();
        // }

        this._flags = Pointer.FLAGS.NONE;

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

    /**
     * @private
     * @param {Event} event
     */
    _killEvent(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    /**
     * @private
     * @param {MouseEvent} event
     */
    _onMouseDown(event) {
        const button = Math.min(event.button, 4);

        this.channels[button] = 1;
        this._channelsPressed.add(Pointer.getChannelCode(button));

        this._flags |= Pointer.FLAGS.BUTTON_DOWN;

        event.preventDefault();
    }

    /**
     * @private
     * @param {MouseEvent} event
     */
    _onMouseUp(event) {
        const button = Math.min(event.button, 4);

        this.channels[button] = 0;
        this._channelsReleased.add(Pointer.getChannelCode(button));

        this._flags |= Pointer.FLAGS.BUTTON_UP;

        event.preventDefault();
    }

    /**
     * @private
     * @param {MouseEvent} event
     */
    _onMouseMove(event) {
        const channels = this.channels,
            bounds = this._canvas.getBoundingClientRect(),
            x = (event.clientX - bounds.left),
            y = (event.clientY - bounds.top),
            deltaX = x - this.x,
            deltaY = y - this.y;

        // Move
        channels[5] = 1;

        // MoveLeft
        channels[6] = Math.abs(Math.min(0, deltaX));

        // MoveRight
        channels[7] = Math.max(0, deltaX);

        // MoveUp
        channels[8] = Math.abs(Math.min(0, deltaY));

        // MoveDown
        channels[9] = Math.max(0, deltaY);

        this._positionDelta.set(deltaX, deltaY);
        this._position.set(x, y);

        this._flags |= Pointer.FLAGS.POSITION;

        event.preventDefault();
    }

    /**
     * @private
     * @param {WheelEvent} event
     */
    _onMouseWheel(event) {
        const channels = this.channels;

        // Scroll
        channels[10] = 1;

        // ScrollLeft
        channels[11] = Math.abs(Math.min(0, event.deltaX));

        // ScrollRight
        channels[12] = Math.max(0, event.deltaX);

        // ScrollUp
        channels[13] = Math.abs(Math.min(0, event.deltaY));

        // ScrollDown
        channels[14] = Math.max(0, event.deltaY);

        this._scrollDelta.set(event.deltaX, event.deltaY);

        this._flags |= Pointer.FLAGS.SCROLL;
    }

    /**
     * @private
     */
    _onMouseOver() {
        const channels = this.channels;

        // EnterWindow
        channels[15] = 1;

        // LeaveWindow
        channels[16] = 0;

        this._insideWindow = true;

        this._flags |= Pointer.FLAGS.WINDOW_STATE;
    }

    /**
     * @private
     */
    _onMouseOut() {
        const channels = this.channels;

        // EnterWindow
        channels[15] = 0;

        // LeaveWindow
        channels[16] = 1;

        this._insideWindow = false;

        this._flags |= Pointer.FLAGS.WINDOW_STATE;
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @returns {Number}
     */
    static getChannelCode(key) {
        return CHANNEL_OFFSET.POINTER + (key % CHANNEL_LENGTH.CHILD);
    }
}

/**
 * @public
 * @static
 * @type {Object<String, Number>}
 * @property {Number} NONE
 * @property {Number} BUTTON_DOWN
 * @property {Number} BUTTON_UP
 * @property {Number} POSITION
 * @property {Number} WINDOW_STATE
 */
Pointer.FLAGS = {
    NONE: 0,
    BUTTON_DOWN: 1 << 0,
    BUTTON_UP: 1 << 1,
    POSITION: 1 << 2,
    WINDOW_STATE: 1 << 3,
};
