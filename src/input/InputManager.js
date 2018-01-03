import { CHANNEL_RANGE, CHANNEL_OFFSET } from '../const/input';
import Flags from '../math/Flags';
import support from '../support';
import { stopEvent } from '../utils/core';
import Vector from '../math/Vector';
import Pointer from './Pointer';
import EventEmitter from '../core/EventEmitter';
import Gamepad from './Gamepad';
import { GLOBAL } from '../const/core';

const

    /**
     * @inner
     * @type {Object<String, Number>}
     */
    FLAGS = {
        NONE:           0x000,
        KEY_DOWN:       0x001,
        KEY_UP:         0x002,
        POINTER_ENTER:  0x004,
        POINTER_LEAVE:  0x008,
        POINTER_MOVE:   0x010,
        POINTER_DOWN:   0x020,
        POINTER_UP:     0x040,
        POINTER_CANCEL: 0x080,
        MOUSE_SCROLL:   0x100,
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
 * @extends EventEmitter
 */
export default class InputManager extends EventEmitter {

    /**
     * @constructor
     * @param {Application} app
     */
    constructor(app) {
        super();

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

        /**
         * @private
         * @member {Float32Array}
         */
        this._channels = new Float32Array(CHANNEL_RANGE.OVERALL);

        /**
         * @private
         * @member {Set<Input>}
         */
        this._inputs = new Set();

        /**
         * @private
         * @member {Number[]}
         */
        this._keyDownChannels = [];

        /**
         * @private
         * @member {Number[]}
         */
        this._keyUpChannels = [];

        /**
         * @private
         * @member {Map<Number, Pointer>}
         */
        this._pointers = new Map();

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
        this._pointersMoved = [];

        /**
         * @private
         * @member {Pointer[]}
         */
        this._pointersDown = [];

        /**
         * @private
         * @member {Pointer[]}
         */
        this._pointersUp = [];

        /**
         * @private
         * @member {Pointer[]}
         */
        this._pointersCancelled = [];

        /**
         * @private
         * @member {Vector}
         */
        this._scrollDelta = new Vector();

        /**
         * @private
         * @member {Gamepad[]}
         */
        this._gamepads = [
            new Gamepad(0, this._channels),
            new Gamepad(1, this._channels),
            new Gamepad(2, this._channels),
            new Gamepad(3, this._channels),
        ];

        /**
         * @private
         * @member {Flags}
         */
        this._flags = new Flags();

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
     * @member {Map<Number, Pointer>}
     */
    get pointers() {
        return this._pointers;
    }

    /**
     * @public
     * @readonly
     * @member {Gamepad[]}
     */
    get gamepads() {
        return this._gamepads;
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

        this._updateState();

        for (const pointer of this._pointers.values()) {
            pointer.update();
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._removeEventListeners();

        for (const pointer of this._pointers.values()) {
            pointer.destroy();
        }

        for (const gamepad of this._gamepads) {
            gamepad.destroy();
        }

        this._inputs.clear();
        this._inputs = null;

        this._keyDownChannels.length = 0;
        this._keyDownChannels = null;

        this._keyUpChannels.length = 0;
        this._keyUpChannels = null;

        this._pointers.clear();
        this._pointers = null;

        this._pointersEntered.length = 0;
        this._pointersEntered = null;

        this._pointersLeft.length = 0;
        this._pointersLeft = null;

        this._pointersDown.length = 0;
        this._pointersDown = null;

        this._pointersUp.length = 0;
        this._pointersUp = null;

        this._pointersCancelled.length = 0;
        this._pointersCancelled = null;

        this._scrollDelta.destroy();
        this._scrollDelta = null;

        this._gamepads.length = 0;
        this._gamepads = null;

        this._flags.destroy();
        this._flags = null;

        this._channels = null;
        this._app = null;
    }

    /**
     * @private
     */
    _addEventListeners() {
        const canvas = this._app.canvas;

        this._onKeyDownHandler = this._onKeyDown.bind(this);
        this._onKeyUpHandler = this._onKeyUp.bind(this);
        this._onPointerEnterHandler = this._onPointerEnter.bind(this);
        this._onPointerLeaveHandler = this._onPointerLeave.bind(this);
        this._onPointerMoveHandler = this._onPointerMove.bind(this);
        this._onPointerDownHandler = this._onPointerDown.bind(this);
        this._onPointerUpHandler = this._onPointerUp.bind(this);
        this._onPointerCancelHandler = this._onPointerCancel.bind(this);
        this._onMouseScrollHandler = this._onMouseScroll.bind(this);

        GLOBAL.addEventListener('keydown', this._onKeyDownHandler, true);
        GLOBAL.addEventListener('keyup', this._onKeyUpHandler, true);

        canvas.addEventListener('pointerover', this._onPointerEnterHandler, passive);
        canvas.addEventListener('pointerleave', this._onPointerLeaveHandler, passive);
        canvas.addEventListener('pointercancel', this._onPointerCancelHandler, passive);
        canvas.addEventListener('pointermove', this._onPointerMoveHandler, passive);
        canvas.addEventListener('pointerdown', this._onPointerDownHandler, active);
        canvas.addEventListener('pointerup', this._onPointerUpHandler, active);
        canvas.addEventListener('wheel', this._onMouseScrollHandler, active);
        canvas.addEventListener('contextmenu', stopEvent, active);
        canvas.addEventListener('selectstart', stopEvent, active);
    }

    /**
     * @private
     */
    _removeEventListeners() {
        const canvas = this._app.canvas;

        GLOBAL.removeEventListener('keydown', this._onKeyDownHandler, true);
        GLOBAL.removeEventListener('keyup', this._onKeyUpHandler, true);

        canvas.removeEventListener('pointerover', this._onPointerEnterHandler, passive);
        canvas.removeEventListener('pointerleave', this._onPointerLeaveHandler, passive);
        canvas.removeEventListener('pointercancel', this._onPointerCancelHandler, passive);
        canvas.removeEventListener('pointermove', this._onPointerMoveHandler, passive);
        canvas.removeEventListener('pointerdown', this._onPointerDownHandler, active);
        canvas.removeEventListener('pointerup', this._onPointerUpHandler, active);
        canvas.removeEventListener('wheel', this._onMouseScrollHandler, active);
        canvas.removeEventListener('contextmenu', stopEvent, active);
        canvas.removeEventListener('selectstart', stopEvent, active);

        this._onKeyDownHandler = null;
        this._onKeyUpHandler = null;
        this._onPointerEnterHandler = null;
        this._onPointerLeaveHandler = null;
        this._onPointerMoveHandler = null;
        this._onPointerDownHandler = null;
        this._onPointerUpHandler = null;
        this._onPointerCancelHandler = null;
        this._onMouseScrollHandler = null;
    }

    /**
     * @private
     * @param {Event} event
     */
    _onKeyDown(event) {
        const channel = (CHANNEL_OFFSET.KEYBOARD + event.keyCode);

        this._channels[channel] = 1;
        this._keyDownChannels.push(channel);
        this._flags.add(FLAGS.KEY_DOWN);
    }

    /**
     * @private
     * @param {Event} event
     */
    _onKeyUp(event) {
        const channel = (CHANNEL_OFFSET.KEYBOARD + event.keyCode);

        this._channels[channel] = 0;
        this._keyUpChannels.push(channel);
        this._flags.add(FLAGS.KEY_UP);
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _onPointerEnter(event) {
        const pointer = new Pointer(event);

        this._pointers.set(pointer.id, pointer);
        this._pointersEntered.push(pointer);
        this._flags.add(FLAGS.POINTER_ENTER);
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _onPointerLeave(event) {
        const pointer = this._pointers
            .get(event.pointerId)
            .setEventData(event);

        this._pointers.delete(pointer.id);
        this._pointersLeft.push(pointer);
        this._flags.add(FLAGS.POINTER_LEAVE);
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _onPointerDown(event) {
        const pointer = this._pointers.get(event.pointerId);

        pointer.setEventData(event);
        pointer.downPosition.set(pointer.x, pointer.y);

        this._pointersDown.push(pointer);
        this._flags.add(FLAGS.POINTER_DOWN);

        event.preventDefault();
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _onPointerUp(event) {
        const pointer = this._pointers
            .get(event.pointerId)
            .setEventData(event);

        this._pointersUp.push(pointer);
        this._flags.add(FLAGS.POINTER_UP);

        event.preventDefault();
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _onPointerCancel(event) {
        const pointer = this._pointers
            .get(event.pointerId)
            .setEventData(event);

        this._pointersCancelled.push(pointer);
        this._flags.add(FLAGS.POINTER_CANCEL);
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _onPointerMove(event) {
        const pointer = this._pointers
            .get(event.pointerId)
            .setEventData(event);

        this._pointersMoved.push(pointer);
        this._flags.add(FLAGS.POINTER_MOVE);
    }

    /**
     * @private
     * @param {WheelEvent} event
     */
    _onMouseScroll(event) {
        this._scrollDelta.set(event.deltaX, event.deltaY);
        this._flags.add(FLAGS.MOUSE_SCROLL);
    }

    /**
     * @private
     * @param {String} event
     * @param {Pointer[]} pointers
     * @param {Object} [overrides]
     * @param {String} [overrides.pointerEvent]
     * @param {String} [overrides.mouseEvent]
     * @param {String} [overrides.touchEvent]
     * @param {String} [overrides.penEvent]
     */
    _triggerPointerEvents(event, pointers, overrides) {
        for (const pointer of pointers) {
            this._triggerPointerEvent(event, pointer, overrides);
        }
    }

    /**
     * @private
     * @param {String} event
     * @param {Pointer} pointer
     * @param {Object} [overrides]
     * @param {String} [overrides.pointerEvent]
     * @param {String} [overrides.mouseEvent]
     * @param {String} [overrides.touchEvent]
     * @param {String} [overrides.penEvent]
     */
    _triggerPointerEvent(event, pointer, { pointerEvent, mouseEvent, touchEvent, penEvent } = {}) {
        this.trigger(`pointer:${pointerEvent || event}`, pointer, this._pointers);

        if (pointer.type === 'mouse') {
            this.trigger(`mouse:${mouseEvent || event}`, pointer, this._pointers);
        } else if (pointer.type === 'touch') {
            this.trigger(`touch:${touchEvent || event}`, pointer, this._pointers);
        } else if (pointer.type === 'pen') {
            this.trigger(`pen:${penEvent || event}`, pointer, this._pointers);
        }
    }

    /**
     * @private
     */
    _updateGamepads() {
        const activeGamepads = GLOBAL.navigator.getGamepads();

        for (const gamepad of this._gamepads) {
            const activGamepad = activeGamepads[gamepad.index];

            if (!!activGamepad !== gamepad.connected) {
                if (activGamepad) {
                    gamepad.connect(activGamepad);
                    this.trigger('gamepad:connected', gamepad, this._gamepads);
                } else {
                    gamepad.disconnect();
                    this.trigger('gamepad:disconnected', gamepad, this._gamepads);
                }

                this.trigger('gamepad:updated', gamepad, this._gamepads);
            }

            gamepad.update();
        }
    }

    /**
     * @private
     */
    _updateState() {
        if (!this._flags.value) {
            return;
        }

        if (this._flags.has(FLAGS.KEY_DOWN)) {
            this.trigger('key:down', this._keyDownChannels, this);
            this._keyDownChannels.length = 0;
            this._flags.remove(FLAGS.KEY_DOWN);
        }

        if (this._flags.has(FLAGS.KEY_UP)) {
            this.trigger('key:up', this._keyUpChannels, this);
            this._keyUpChannels.length = 0;
            this._flags.remove(FLAGS.KEY_UP);
        }

        if (this._flags.has(FLAGS.POINTER_ENTER)) {
            this._triggerPointerEvents('enter', this._pointersEntered);
            this._pointersEntered.length = 0;
            this._flags.remove(FLAGS.POINTER_ENTER);
        }

        if (this._flags.has(FLAGS.POINTER_LEAVE)) {
            this._triggerPointerEvents('leave', this._pointersLeft);
            this._pointersLeft.length = 0;
            this._flags.remove(FLAGS.POINTER_LEAVE);
        }

        if (this._flags.has(FLAGS.POINTER_MOVE)) {
            this._triggerPointerEvents('move', this._pointersMoved);
            this._pointersMoved.length = 0;
            this._flags.remove(FLAGS.POINTER_MOVE);
        }

        if (this._flags.has(FLAGS.POINTER_DOWN)) {
            this._triggerPointerEvents('down', this._pointersDown, { touchEvent: 'start' });
            this._pointersDown.length = 0;
            this._flags.remove(FLAGS.POINTER_DOWN);
        }

        if (this._flags.has(FLAGS.POINTER_UP)) {
            for (const pointer of this._pointersUp) {
                const { x, y } = pointer.downPosition;

                this._triggerPointerEvent('up', pointer, { touchEvent: 'end' });

                if (x > 0 && y > 0 && pointer.position.distanceTo(x, y) < 10) {
                    this._triggerPointerEvent('tap', pointer, { mouseEvent: 'click' });
                } else {
                    this._triggerPointerEvent('tapoutside', pointer, { mouseEvent: 'clickoutside' });
                }

                pointer.downPosition.set(-1, -1);
            }

            this._pointersUp.length = 0;
            this._flags.remove(FLAGS.POINTER_UP);
        }

        if (this._flags.has(FLAGS.POINTER_CANCEL)) {
            this._triggerPointerEvents('cancel', this._pointersCancelled);
            this._pointersCancelled.length = 0;
            this._flags.remove(FLAGS.POINTER_CANCEL);
        }

        if (this._flags.has(FLAGS.MOUSE_SCROLL)) {
            this.trigger('mouse:scroll', this._scrollDelta, this._pointers);
            this._scrollDelta.set(0, 0);
            this._flags.remove(FLAGS.MOUSE_SCROLL);
        }
    }
}
