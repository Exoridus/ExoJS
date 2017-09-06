import ChannelHandler from './ChannelHandler';
import Vector from '../core/Vector';
import {CHANNEL_OFFSET, CHANNEL_LENGTH} from '../const';

/**
 * @class Mouse
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
 */
export default class Mouse extends ChannelHandler {

    /**
     * @constructor
     * @param {Exo.Game} game
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(game, channelBuffer) {
        super(channelBuffer, CHANNEL_OFFSET.MOUSE, CHANNEL_LENGTH.DEVICE);

        /**
         * @private
         * @member {Exo.Game}
         */
        this._game = game;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = game.canvas;

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._position = new Vector();

        /**
         * @private
         * @member {Boolean}
         */
        this._insideWindow = false;

        /**
         * @private
         * @member {Boolean}
         */
        this._positionChanged = false;

        /**
         * @private
         * @member {Boolean}
         */
        this._wheelChanged = false;

        /**
         * @private
         * @member {Boolean}
         */
        this._stateChanged = false;

        this._addEventListeners();
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */
    get position() {
        return this._position;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */
    get x() {
        return this._position.x;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */
    get y() {
        return this._position.y;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     * @memberof Mouse
     */
    get isInsideFrame() {
        return this._insideWindow;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */
    get wheelX() {
        return this._channels[5] - this._channels[6];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */
    get wheelY() {
        return this._channels[7] - this._channels[8];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */
    get wheelZ() {
        return this._channels[9] - this._channels[10];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */
    get deltaX() {
        return this._channels[11] - this._channels[12];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */
    get deltaY() {
        return this._channels[13] - this._channels[14];
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     * @memberof Mouse
     */
    get hasEnteredWindow() {
        return !!this._channels[15];
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     * @memberof Mouse
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
        const game = this._game;

        if (!this.active) {
            return;
        }

        if (this._stateChanged) {
            this._insideWindow = this.hasEnteredWindow;

            if (this._insideWindow) {

                /**
                 * @event Exo.Mouse#enter
                 * @member {Function}
                 * @property {Exo.Mouse} mouse
                 */
                game.trigger('mouse:enter', this);
            } else {

                /**
                 * @event Exo.Mouse#leave
                 * @member {Function}
                 * @property {Exo.Mouse} mouse
                 */
                game.trigger('mouse:leave', this);
            }

            this._setStateDelta(0);
            this._stateChanged = false;
        }

        if (this._positionChanged) {

            /**
             * @event Exo.Mouse#move
             * @member {Function}
             * @property {Exo.Mouse} mouse
             */
            game.trigger('mouse:move', this);

            this._setPositionDelta(0, 0);
            this._positionChanged = false;
        }

        if (this._wheelChanged) {

            /**
             * @event Exo.Mouse#scroll
             * @member {Function}
             * @property {Exo.Mouse} mouse
             */
            game.trigger('mouse:scroll', this);

            this._setWheelDelta(0, 0, 0);
            this._wheelChanged = false;
        }
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._removeEventListeners();
        this._stateChanged = null;
        this._positionChanged = null;
        this._wheelChanged = null;
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
        const button = Math.min(event.button, 4);

        this._channels[button] = 1;
        this._game.trigger('mouse:down', Mouse.getChannelCode(button), this);
        event.preventDefault();
    }

    /**
     * @private
     * @param {MouseEvent} event
     */
    _onMouseUp(event) {
        const button = Math.min(event.button, 4);

        this._channels[button] = 0;
        this._game.trigger('mouse:up', Mouse.getChannelCode(button), this);
        event.preventDefault();
    }

    /**
     * @private
     * @param {MouseEvent} event
     */
    _onMouseMove(event) {
        const rect = this._canvas.getBoundingClientRect(),
            x = (event.clientX - rect.left),
            y = (event.clientY - rect.top);

        this._setPositionDelta(x - this.x, y - this.y);
        this._position.set(x, y);
        this._positionChanged = true;
    }

    /**
     * @private
     */
    _onMouseOver() {
        this._setStateDelta(1);
    }

    /**
     * @private
     */
    _onMouseOut() {
        this._setStateDelta(-1);
    }

    /**
     * @private
     * @param {WheelEvent} event
     */
    _onMouseWheel(event) {
        this._setWheelDelta(event.deltaX, event.deltaY, event.deltaZ);
        this._wheelChanged = true;
    }

    /**
     * @param {Number} deltaX
     * @param {Number} deltaY
     * @param {Number} deltaZ
     * @memberof Mouse
     */
    _setWheelDelta(deltaX, deltaY, deltaZ) {
        const channels = this.channels;

        channels[5] = Math.abs(Math.min(0, deltaX));
        channels[6] = Math.max(0, deltaX);

        channels[7] = Math.abs(Math.min(0, deltaY));
        channels[8] = Math.max(0, deltaY);

        channels[9] = Math.abs(Math.min(0, deltaZ));
        channels[10] = Math.max(0, deltaZ);
    }

    /**
     * @param {Number} deltaX
     * @param {Number} deltaY
     * @memberof Mouse
     */
    _setPositionDelta(deltaX, deltaY) {
        const channels = this.channels;

        channels[11] = Math.abs(Math.min(0, deltaX));
        channels[12] = Math.max(0, deltaX);

        channels[13] = Math.abs(Math.min(0, deltaY));
        channels[14] = Math.max(0, deltaY);
    }

    /**
     *  1 = enter
     *  0 = nothing
     * -1 = leave
     *
     * @param {Number} delta
     * @memberof Mouse
     */
    _setStateDelta(delta) {
        const channels = this.channels;

        channels[15] = Math.max(0, delta);
        channels[16] = Math.abs(Math.min(0, delta));
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @returns {Number}
     */
    static getChannelCode(key) {
        return CHANNEL_OFFSET.MOUSE + (key & 255);
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
