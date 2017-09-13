import ChannelHandler from './ChannelHandler';
import Vector from '../core/shape/Vector';
import { CHANNEL_OFFSET, CHANNEL_LENGTH } from '../const';

const SCALE_MODE_DIRTY = 0x01,
    WRAP_MODE_DIRTY = 0x02,
    PREMULTIPLY_ALPHA_DIRTY = 0x04,
    SOURCE_DIRTY = 0x08;

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
         * @member {Number}
         */
        this._dirty = 0;

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
         * @event Mouse#move
         * @member {Function}
         * @property {Mouse} mouse
         */

        /**
         * @event Mouse#scroll
         * @member {Function}
         * @property {Mouse} mouse
         */
    }

    /**
     * @public
     * @readonly
     * @member {Number}
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
     * @member {Number}
     */
    get wheelX() {
        return this._channels[5] - this._channels[6];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get wheelY() {
        return this._channels[7] - this._channels[8];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get wheelZ() {
        return this._channels[9] - this._channels[10];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get deltaX() {
        return this._channels[11] - this._channels[12];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get deltaY() {
        return this._channels[13] - this._channels[14];
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get hasEnteredWindow() {
        return !!this._channels[15];
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get hasLeftWindow() {
        return !!this._channels[16];
    }

    /**
     * @public
     * @fires Mouse#enter
     * @fires Mouse#leave
     * @fires Mouse#move
     * @fires Mouse#scroll
     */
    update() {
        if (!this.active) {
            return;
        }

        if (this._wheelChanged) {
            this._game.trigger('mouse:scroll', this);
            this._wheelChanged = false;
        }

        if (this._positionChanged) {
            this._game.trigger('mouse:move', this);
            this._positionChanged = false;
        }

        if (this._stateChanged) {
            this._game.trigger(this.hasEnteredWindow ? 'mouse:enter' : 'mouse:leave', this);
            this._stateChanged = false;
        }

        this.channels.fill(0, 5);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._removeEventListeners();
        this._wheelChanged = null;
        this._positionChanged = null;
        this._stateChanged = null;
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

        // Disable right clicking context menu
        canvas.addEventListener('contextmenu', this._killEventHandler, true);

        // Disable mouse selection
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
        event.preventDefault();

        const button = Math.min(event.button, 4);

        this.channels[button] = 1;
        this._game.trigger('mouse:down', Mouse.getChannelCode(button), this);
    }

    /**
     * @private
     * @param {MouseEvent} event
     */
    _onMouseUp(event) {
        event.preventDefault();

        const button = Math.min(event.button, 4);

        this.channels[button] = 0;
        this._game.trigger('mouse:up', Mouse.getChannelCode(button), this);
    }

    /**
     * @private
     * @param {MouseEvent} event
     */
    _onMouseMove(event) {
        event.preventDefault();

        const channels = this.channels,
            bounds = this._canvas.getBoundingClientRect(),
            x = (event.clientX - bounds.left),
            y = (event.clientY - bounds.top),
            deltaX = x - this.x,
            deltaY = y - this.y;

        // MoveLeft
        channels[11] = Math.abs(Math.min(0, deltaX));

        // MoveRight
        channels[12] = Math.max(0, deltaX);

        // MoveUp
        channels[13] = Math.abs(Math.min(0, deltaY));

        // MoveDown
        channels[14] = Math.max(0, deltaY);

        this._position.set(x, y);
        this._positionChanged = true;
    }

    /**
     * @private
     */
    _onMouseOver() {
        const channels = this.channels;

        channels[15] = 1;
        channels[16] = 0;

        this._stateChanged = true;
    }

    /**
     * @private
     */
    _onMouseOut() {
        const channels = this.channels;

        channels[15] = 0;
        channels[16] = 1;

        this._stateChanged = true;
    }

    /**
     * @private
     * @param {WheelEvent} event
     */
    _onMouseWheel(event) {
        const channels = this.channels,
            deltaX = event.deltaX,
            deltaY = event.deltaY,
            deltaZ = event.deltaZ;

        channels[5] = Math.abs(Math.min(0, deltaX));
        channels[6] = Math.max(0, deltaX);

        channels[7] = Math.abs(Math.min(0, deltaY));
        channels[8] = Math.max(0, deltaY);

        channels[9] = Math.abs(Math.min(0, deltaZ));
        channels[10] = Math.max(0, deltaZ);

        this._wheelChanged = true;
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
Mouse.ScrollLeft = CHANNEL_OFFSET.MOUSE + 5;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollRight = CHANNEL_OFFSET.MOUSE + 6;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollUp = CHANNEL_OFFSET.MOUSE + 7;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollDown = CHANNEL_OFFSET.MOUSE + 8;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollForward = CHANNEL_OFFSET.MOUSE + 9;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollBackward = CHANNEL_OFFSET.MOUSE + 10;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveLeft = CHANNEL_OFFSET.MOUSE + 11;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveRight = CHANNEL_OFFSET.MOUSE + 12;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveUp = CHANNEL_OFFSET.MOUSE + 13;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveDown = CHANNEL_OFFSET.MOUSE + 14;

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
