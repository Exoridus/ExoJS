import { CHANNEL_RANGE, CHANNEL_OFFSET } from '../const/input';
import Flags from '../math/Flags';
import support from '../support';
import { stopEvent } from '../utils/core';
import Vector from '../math/Vector';
import Pointer from './Pointer';
import Gamepad from './Gamepad';
import { GLOBAL } from '../const/core';
import Signal from '../core/Signal';
import { getDistance } from '../utils/math';

/**
 * @inner
 * @type {Object<String, Number>}
 */
const FLAGS = {
        NONE:           0x000,
        KEY_DOWN:       0x001,
        KEY_UP:         0x002,
        POINTER_ENTER:  0x004,
        POINTER_LEAVE:  0x008,
        POINTER_MOVE:   0x010,
        POINTER_DOWN:   0x020,
        POINTER_UP:     0x040,
        POINTER_CANCEL: 0x080,
        MOUSE_WHEEL:   0x100,
    },

    /**
     * @inner
     * @type {Object<String, Boolean>|Boolean}
     */
    passive = (support.eventOptions ? {
        capture: true,
        passive: true,
    } : true),

    /**
     * @inner
     * @type {Object<String, Boolean>|Boolean}
     */
    active = (support.eventOptions ? {
        capture: true,
        passive: false,
    } : true);

/**
 * @typedef {MouseEvent} PointerEvent
 * @property {Number} pointerId
 * @property {Number} width
 * @property {Number} height
 * @property {Number} pressure
 * @property {Number} tiltX
 * @property {Number} tiltY
 * @property {Number} tangentialPressure
 * @property {Number} twist
 * @property {String} pointerType
 * @property {Boolean} isPrimary
 */

/**
 * @class InputManager
 */
export default class InputManager {

    /**
     * @constructor
     * @param {Application} app
     */
    constructor(app) {

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

        /**
         * @private
         * @member {Float32Array}
         */
        this._channels = new Float32Array(CHANNEL_RANGE.GLOBAL);

        /**
         * @private
         * @member {Set<Input>}
         */
        this._inputs = new Set();

        /**
         * @private
         * @member {Object<Number, Pointer>}
         */
        this._pointers = {};

        /**
         * @private
         * @member {Object<Number, Gamepad>}
         */
        this._gamepads = {
            0: new Gamepad(0, this._channels),
            1: new Gamepad(1, this._channels),
            2: new Gamepad(2, this._channels),
            3: new Gamepad(3, this._channels),
        };

        /**
         * @private
         * @member {Vector}
         */
        this._wheelOffset = new Vector();

        /**
         * @private
         * @member {Flags}
         */
        this._flags = new Flags();

        /**
         * @private
         * @member {Number[]}
         */
        this._channelsPressed = [];

        /**
         * @private
         * @member {Number[]}
         */
        this._channelsReleased = [];

        /**
         * @private
         * @member {Pointer[]}
         */
        this._pointersEntered = [];

        /**
         * @private
         * @member {Pointer[]}
         */
        this._pointersLeft = [];

        /**
         * @private
         * @member {Pointer[]}
         */
        this._pointersPressed = [];

        /**
         * @private
         * @member {Pointer[]}
         */
        this._pointersMoved = [];

        /**
         * @private
         * @member {Pointer[]}
         */
        this._pointersReleased = [];

        /**
         * @private
         * @member {Pointer[]}
         */
        this._pointersCancelled = [];

        /**
         * @private
         * @member {Signal}
         */
        this._onPointerEnter = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onPointerLeave = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onPointerDown = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onPointerMove = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onPointerUp = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onPointerTap = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onPointerSwipe = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onPointerCancel = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onMouseWheel = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onKeyDown = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onKeyUp = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onGamepadConnected = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onGamepadDisconnected = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onGamepadUpdated = new Signal();

        this._addEventListeners();
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
     * @readonly
     * @member {Object<Number, Pointer>}
     */
    get pointers() {
        return this._pointers;
    }

    /**
     * @public
     * @readonly
     * @member {Object<Number, Gamepad>}
     */
    get gamepads() {
        return this._gamepads;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onPointerEnter() {
        return this._onPointerEnter;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onPointerLeave() {
        return this._onPointerLeave;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onPointerDown() {
        return this._onPointerDown;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onPointerMove() {
        return this._onPointerMove;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onPointerUp() {
        return this._onPointerUp;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onPointerTap() {
        return this._onPointerTap;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onPointerSwipe() {
        return this._onPointerSwipe;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onPointerCancel() {
        return this._onPointerCancel;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onMouseWheel() {
        return this._onMouseWheel;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onKeyDown() {
        return this._onKeyDown;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onKeyUp() {
        return this._onKeyUp;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onGamepadConnected() {
        return this._onGamepadConnected;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onGamepadDisconnected() {
        return this._onGamepadDisconnected;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onGamepadUpdated() {
        return this._onGamepadUpdated;
    }

    /**
     * @public
     * @chainable
     * @param {Input|Input[]} inputs
     * @returns {InputManager}
     */
    add(inputs) {
        if (Array.isArray(inputs)) {
            inputs.forEach(this.add, this);

            return this;
        }

        this._inputs.add(inputs);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Input|Input[]} inputs
     * @returns {InputManager}
     */
    remove(inputs) {
        if (Array.isArray(inputs)) {
            inputs.forEach(this.remove, this);

            return this;
        }

        this._inputs.delete(inputs);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Boolean} [destroyInputs=false]
     * @returns {InputManager}
     */
    clear(destroyInputs = false) {
        if (destroyInputs) {
            for (const input of this._inputs) {
                input.destroy();
            }
        }

        this._inputs.clear();

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {InputManager}
     */
    update() {
        this._updateGamepads();

        for (const input of this._inputs) {
            input.update(this._channels);
        }

        this._updateEvents();

        for (const pointer of Object.values(this._pointers)) {
            pointer.updateEvents();
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._removeEventListeners();

        for (const key of Object.keys(this._pointers)) {
            this._pointers[key].destroy();
            delete this._pointers[key];
        }

        for (const key of Object.keys(this._gamepads)) {
            this._gamepads[key].destroy();
            delete this._gamepads[key];
        }

        this._inputs.clear();
        this._inputs = null;

        this._channelsPressed.length = 0;
        this._channelsPressed = null;

        this._channelsReleased.length = 0;
        this._channelsReleased = null;

        this._pointersEntered.length = 0;
        this._pointersEntered = null;

        this._pointersLeft.length = 0;
        this._pointersLeft = null;

        this._pointersPressed.length = 0;
        this._pointersPressed = null;

        this._pointersMoved.length = 0;
        this._pointersMoved = null;

        this._pointersReleased.length = 0;
        this._pointersReleased = null;

        this._pointersCancelled.length = 0;
        this._pointersCancelled = null;

        this._wheelOffset.destroy();
        this._wheelOffset = null;

        this._flags.destroy();
        this._flags = null;

        this._onPointerEnter.destroy();
        this._onPointerEnter = null;

        this._onPointerLeave.destroy();
        this._onPointerLeave = null;

        this._onPointerDown.destroy();
        this._onPointerDown = null;

        this._onPointerMove.destroy();
        this._onPointerMove = null;

        this._onPointerUp.destroy();
        this._onPointerUp = null;

        this._onPointerTap.destroy();
        this._onPointerTap = null;

        this._onPointerSwipe.destroy();
        this._onPointerSwipe = null;

        this._onPointerCancel.destroy();
        this._onPointerCancel = null;

        this._onMouseWheel.destroy();
        this._onMouseWheel = null;

        this._onKeyDown.destroy();
        this._onKeyDown = null;

        this._onKeyUp.destroy();
        this._onKeyUp = null;

        this._onGamepadConnected.destroy();
        this._onGamepadConnected = null;

        this._onGamepadDisconnected.destroy();
        this._onGamepadDisconnected = null;

        this._onGamepadUpdated.destroy();
        this._onGamepadUpdated = null;

        this._gamepads = null;
        this._pointers = null;
        this._channels = null;
        this._app = null;
    }

    /**
     * @private
     */
    _addEventListeners() {
        const canvas = this._app.canvas;

        this._keyDownHandler = this._keyDown.bind(this);
        this._keyUpHandler = this._keyUp.bind(this);
        this._mouseWheelHandler = this._mouseWheel.bind(this);
        this._pointerEnterHandler = this._pointerEnter.bind(this);
        this._pointerLeaveHandler = this._pointerLeave.bind(this);
        this._pointerDownHandler = this._pointerDown.bind(this);
        this._pointerMoveHandler = this._pointerMove.bind(this);
        this._pointerUpHandler = this._pointerUp.bind(this);
        this._pointerCancelHandler = this._pointerCancel.bind(this);

        GLOBAL.addEventListener('keydown', this._keyDownHandler, true);
        GLOBAL.addEventListener('keyup', this._keyUpHandler, true);
        canvas.addEventListener('wheel', this._mouseWheelHandler, active);
        canvas.addEventListener('pointerover', this._pointerEnterHandler, passive);
        canvas.addEventListener('pointerleave', this._pointerLeaveHandler, passive);
        canvas.addEventListener('pointerdown', this._pointerDownHandler, active);
        canvas.addEventListener('pointermove', this._pointerMoveHandler, passive);
        canvas.addEventListener('pointerup', this._pointerUpHandler, active);
        canvas.addEventListener('pointercancel', this._pointerCancelHandler, passive);
        canvas.addEventListener('contextmenu', stopEvent, active);
        canvas.addEventListener('selectstart', stopEvent, active);
    }

    /**
     * @private
     */
    _removeEventListeners() {
        const canvas = this._app.canvas;

        GLOBAL.removeEventListener('keydown', this._keyDownHandler, true);
        GLOBAL.removeEventListener('keyup', this._keyUpHandler, true);
        canvas.removeEventListener('wheel', this._mouseWheelHandler, active);
        canvas.removeEventListener('pointerover', this._pointerEnterHandler, passive);
        canvas.removeEventListener('pointerleave', this._pointerLeaveHandler, passive);
        canvas.removeEventListener('pointerdown', this._pointerDownHandler, active);
        canvas.removeEventListener('pointermove', this._pointerMoveHandler, passive);
        canvas.removeEventListener('pointerup', this._pointerUpHandler, active);
        canvas.removeEventListener('pointercancel', this._pointerCancelHandler, passive);
        canvas.removeEventListener('contextmenu', stopEvent, active);
        canvas.removeEventListener('selectstart', stopEvent, active);

        this._keyDownHandler = null;
        this._keyUpHandler = null;
        this._mouseWheelHandler = null;
        this._pointerEnterHandler = null;
        this._pointerLeaveHandler = null;
        this._pointerDownHandler = null;
        this._pointerMoveHandler = null;
        this._pointerUpHandler = null;
        this._pointerCancelHandler = null;
    }

    /**
     * @private
     * @param {Event} event
     */
    _keyDown(event) {
        const channel = (CHANNEL_OFFSET.KEYBOARD + event.keyCode);

        this._channels[channel] = 1;
        this._channelsPressed.push(channel);
        this._flags.add(FLAGS.KEY_DOWN);
    }

    /**
     * @private
     * @param {Event} event
     */
    _keyUp(event) {
        const channel = (CHANNEL_OFFSET.KEYBOARD + event.keyCode);

        this._channels[channel] = 0;
        this._channelsReleased.push(channel);
        this._flags.add(FLAGS.KEY_UP);
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _pointerEnter(event) {
        const pointer = new Pointer(event);

        this._pointers[pointer.id] = pointer;
        this._pointersEntered.push(pointer);
        this._flags.add(FLAGS.POINTER_ENTER);
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _pointerLeave(event) {
        const pointer = this._pointers[event.pointerId].update(event);

        delete this._pointers[pointer.id];
        this._pointersLeft.push(pointer);
        this._flags.add(FLAGS.POINTER_LEAVE);
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _pointerDown(event) {
        const pointer = this._pointers[event.pointerId].update(event);

        pointer.startPos.copy(pointer.position);
        this._pointersPressed.push(pointer);
        this._flags.add(FLAGS.POINTER_DOWN);

        event.preventDefault();
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _pointerMove(event) {
        const pointer = this._pointers[event.pointerId].update(event);

        this._pointersMoved.push(pointer);
        this._flags.add(FLAGS.POINTER_MOVE);
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _pointerUp(event) {
        const pointer = this._pointers[event.pointerId].update(event);

        this._pointersReleased.push(pointer);
        this._flags.add(FLAGS.POINTER_UP);

        event.preventDefault();
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _pointerCancel(event) {
        const pointer = this._pointers[event.pointerId].update(event);

        this._pointersCancelled.push(pointer);
        this._flags.add(FLAGS.POINTER_CANCEL);
    }

    /**
     * @private
     * @param {WheelEvent} event
     */
    _mouseWheel(event) {
        this._wheelOffset.set(event.deltaX, event.deltaY);
        this._flags.add(FLAGS.MOUSE_WHEEL);
    }

    /**
     * @private
     * @chainable
     * @returns {InputManager}
     */
    _updateGamepads() {
        const activeGamepads = GLOBAL.navigator.getGamepads();

        for (const gamepad of Object.values(this._gamepads)) {
            const activeGamepad = activeGamepads[gamepad.index];

            if (!!activeGamepad !== gamepad.connected) {
                if (activeGamepad) {
                    this._onGamepadConnected.dispatch(gamepad.connect(activeGamepad), this._gamepads);
                } else {
                    this._onGamepadDisconnected.dispatch(gamepad.disconnect(), this._gamepads);
                }
            }

            this._onGamepadUpdated.dispatch(gamepad.update(), this._gamepads);
        }

        return this;
    }

    /**
     * @private
     * @chainable
     * @returns {InputManager}
     */
    _updateEvents() {
        if (!this._flags.value) {
            return this;
        }

        if (this._flags.has(FLAGS.KEY_DOWN)) {
            while (this._channelsPressed.length > 0) {
                this._onKeyDown.dispatch(this._channelsPressed.pop());
            }

            this._flags.remove(FLAGS.KEY_DOWN);
        }

        if (this._flags.has(FLAGS.KEY_UP)) {
            while (this._channelsReleased.length > 0) {
                this._onKeyUp.dispatch(this._channelsReleased.pop());
            }

            this._flags.remove(FLAGS.KEY_UP);
        }

        if (this._flags.has(FLAGS.POINTER_ENTER)) {
            while (this._pointersEntered.length > 0) {
                this._onPointerEnter.dispatch(this._pointersEntered.pop());
            }

            this._flags.remove(FLAGS.POINTER_ENTER);
        }

        if (this._flags.has(FLAGS.POINTER_LEAVE)) {
            while (this._pointersLeft.length > 0) {
                this._onPointerLeave.dispatch(this._pointersLeft.pop());
            }

            this._flags.remove(FLAGS.POINTER_LEAVE);
        }

        if (this._flags.has(FLAGS.POINTER_DOWN)) {
            while (this._pointersPressed.length > 0) {
                this._onPointerDown.dispatch(this._pointersPressed.pop());
            }

            this._flags.remove(FLAGS.POINTER_DOWN);
        }

        if (this._flags.has(FLAGS.POINTER_MOVE)) {
            while (this._pointersMoved.length > 0) {
                this._onPointerMove.dispatch(this._pointersMoved.pop());
            }

            this._flags.remove(FLAGS.POINTER_MOVE);
        }

        if (this._flags.has(FLAGS.POINTER_UP)) {
            while (this._pointersReleased.length > 0) {
                const pointer = this._pointersReleased.pop(),
                    { x: startX, y: startY } = pointer.startPos;

                this._onPointerUp.dispatch(pointer);

                if (startX > 0 && startY > 0) {
                    if (getDistance(startX, startY, pointer.x, pointer.y) < 10) {
                        this._onPointerTap.dispatch(pointer);
                    } else {
                        this._onPointerSwipe.dispatch(pointer);
                    }
                }

                pointer.startPos.set(-1, -1);
            }

            this._flags.remove(FLAGS.POINTER_UP);
        }

        if (this._flags.has(FLAGS.POINTER_CANCEL)) {
            while (this._pointersCancelled.length > 0) {
                this._onPointerCancel.dispatch(this._pointersCancelled.pop());
            }

            this._flags.remove(FLAGS.POINTER_CANCEL);
        }

        if (this._flags.has(FLAGS.MOUSE_WHEEL)) {
            this._onMouseWheel.dispatch(this._wheelOffset);
            this._wheelOffset.set(0, 0);

            this._flags.remove(FLAGS.MOUSE_WHEEL);
        }

        return this;
    }
}
