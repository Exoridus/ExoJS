import ChannelHandler from './ChannelHandler';
import Vector from '../core/shape/Vector';
import { CHANNEL_OFFSET, CHANNEL_LENGTH } from '../const';

/**
 * @class Mouse
 * @extends {ChannelHandler}
 */
export default class Mouse extends ChannelHandler {

    /**
     * @constructor
     * @param {Game} game
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(game, channelBuffer) {
        super(channelBuffer, CHANNEL_OFFSET.MOUSE, CHANNEL_LENGTH.DEVICE);

        /**
         * @private
         * @member {Game}
         */
        this._game = game;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = game.canvas;

        /**
         * @private
         * @member {Vector}
         */
        this._position = new Vector();

        /**
         * @private
         * @member {Vector}
         */
        this._positionDelta = new Vector();

        /**
         * @private
         * @member {Vector}
         */
        this._scrollDelta = new Vector();

        /**
         * @private
         * @member {Boolean}
         */
        this._insideWindow = false;

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
        this._flags = 0;

        this._addEventListeners();

        /**
         * @event Mouse#leave
         * @member {Function}
         * @property {Mouse} mouse
         */

        /**
         * @event Mouse#enter
         * @member {Function}
         * @property {Mouse} mouse
         */

        /**
         * @event Mouse#scroll
         * @member {Function}
         * @property {Mouse} mouse
         */

        /**
         * @event Mouse#move
         * @member {Function}
         * @property {Mouse} mouse
         */

        /**
         * @event Mouse#down
         * @member {Function}
         * @property {Mouse} mouse
         */

        /**
         * @event Mouse#up
         * @member {Function}
         * @property {Mouse} mouse
         */
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
     * @member {Vector}
     */
    get positionDelta() {
        return this._positionDelta;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get deltaX() {
        return this._positionDelta.x;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get deltaY() {
        return this._positionDelta.y;
    }

    /**
     * @public
     * @readonly
     * @member {Vector}
     */
    get scrollDelta() {
        return this._scrollDelta;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get scrollX() {
        return this._scrollDelta.x;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get scrollY() {
        return this._scrollDelta.y;
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

        if (this._flags & Mouse.FLAGS.WINDOW_STATE) {
            this._game.trigger(this._insideWindow ? 'mouse:enter' : 'mouse:leave', this);
        }

        if (this._flags & Mouse.FLAGS.SCROLL) {
            this._game.trigger('mouse:scroll', this._scrollDelta, this);
            this._scrollDelta.reset();
        }

        if (this._flags & Mouse.FLAGS.POSITION) {
            this._game.trigger('mouse:move', this._position, this);
            this._positionDelta.reset();
        }

        if (this._flags & Mouse.FLAGS.BUTTON_DOWN) {
            this._game.trigger('mouse:down', this._channelsPressed, this);
            this._channelsPressed.clear();
        }

        if (this._flags & Mouse.FLAGS.BUTTON_UP) {
            this._game.trigger('mouse:up', this._channelsReleased, this);
            this._channelsReleased.clear();
        }

        this._flags = Mouse.FLAGS.NONE;

        this.channels.fill(0, 5, 17);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._removeEventListeners();

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
        this._game = null;
    }

    /**
     * @private
     */
    _addEventListeners() {
        const canvas = this._canvas;

        this._onMouseDownHandler = this._onMouseDown.bind(this);
        this._onMouseUpHandler = this._onMouseUp.bind(this);
        this._onMouseMoveHandler = this._onMouseMove.bind(this);
        this._onMouseOverHandler = this._onMouseOver.bind(this);
        this._onMouseOutHandler = this._onMouseOut.bind(this);
        this._onMouseWheelHandler = this._onMouseWheel.bind(this);
        this._killEventHandler = this._killEvent.bind(this);

        canvas.addEventListener('mousedown', this._onMouseDownHandler, true);
        canvas.addEventListener('mouseup', this._onMouseUpHandler, true);
        canvas.addEventListener('mousemove', this._onMouseMoveHandler, true);
        canvas.addEventListener('mouseover', this._onMouseOverHandler, true);
        canvas.addEventListener('mouseout', this._onMouseOutHandler, true);
        canvas.addEventListener('wheel', this._onMouseWheelHandler, true);
        canvas.addEventListener('contextmenu', this._killEventHandler, true);
        canvas.addEventListener('selectstart', this._killEventHandler, true);
    }

    /**
     * @private
     */
    _removeEventListeners() {
        const canvas = this._canvas;

        canvas.removeEventListener('mousedown', this._onMouseDownHandler, true);
        canvas.removeEventListener('mouseup', this._onMouseUpHandler, true);
        canvas.removeEventListener('mousemove', this._onMouseMoveHandler, true);
        canvas.removeEventListener('mouseover', this._onMouseOverHandler, true);
        canvas.removeEventListener('mouseout', this._onMouseOutHandler, true);
        canvas.removeEventListener('wheel', this._onMouseWheelHandler, true);
        canvas.removeEventListener('contextmenu', this._killEventHandler, true);
        canvas.removeEventListener('selectstart', this._killEventHandler, true);

        this._onMouseDownHandler = null;
        this._onMouseUpHandler = null;
        this._onMouseMoveHandler = null;
        this._onMouseOverHandler = null;
        this._onMouseOutHandler = null;
        this._onMouseWheelHandler = null;
        this._killEventHandler = null;
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
        this._channelsPressed.add(Mouse.getChannelCode(button));

        this._flags |= Mouse.FLAGS.BUTTON_DOWN;

        event.preventDefault();
    }

    /**
     * @private
     * @param {MouseEvent} event
     */
    _onMouseUp(event) {
        const button = Math.min(event.button, 4);

        this.channels[button] = 0;
        this._channelsReleased.add(Mouse.getChannelCode(button));

        this._flags |= Mouse.FLAGS.BUTTON_UP;

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

        this._flags |= Mouse.FLAGS.POSITION;

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

        this._flags |= Mouse.FLAGS.SCROLL;
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

        this._flags |= Mouse.FLAGS.WINDOW_STATE;
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

        this._flags |= Mouse.FLAGS.WINDOW_STATE;
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @returns {Number}
     */
    static getChannelCode(key) {
        return CHANNEL_OFFSET.MOUSE + (key % CHANNEL_LENGTH.DEVICE);
    }
}

/**
 * @public
 * @static
 * @type {Object<String, Number>}
 * @property {Number} NONE
 * @property {Number} POSITION
 * @property {Number} SCROLL
 * @property {Number} WINDOW_STATE
 * @property {Number} BUTTON_DOWN
 * @property {Number} BUTTON_UP
 */
Mouse.FLAGS = {
    NONE: 0,
    POSITION: 1 << 0,
    SCROLL: 1 << 1,
    WINDOW_STATE: 1 << 2,
    BUTTON_DOWN: 1 << 3,
    BUTTON_UP: 1 << 4,
};

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.LeftButton = CHANNEL_OFFSET.MOUSE + 0;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MiddleButton = CHANNEL_OFFSET.MOUSE + 1;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.RightButton = CHANNEL_OFFSET.MOUSE + 2;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.BackButton = CHANNEL_OFFSET.MOUSE + 3;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ForwardButton = CHANNEL_OFFSET.MOUSE + 4;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.Move = CHANNEL_OFFSET.MOUSE + 5;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveLeft = CHANNEL_OFFSET.MOUSE + 6;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveRight = CHANNEL_OFFSET.MOUSE + 7;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveUp = CHANNEL_OFFSET.MOUSE + 8;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveDown = CHANNEL_OFFSET.MOUSE + 9;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.Scroll = CHANNEL_OFFSET.MOUSE + 10;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollLeft = CHANNEL_OFFSET.MOUSE + 11;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollRight = CHANNEL_OFFSET.MOUSE + 12;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollUp = CHANNEL_OFFSET.MOUSE + 13;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollDown = CHANNEL_OFFSET.MOUSE + 14;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.EnterWindow = CHANNEL_OFFSET.MOUSE + 15;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.LeaveWindow = CHANNEL_OFFSET.MOUSE + 16;
