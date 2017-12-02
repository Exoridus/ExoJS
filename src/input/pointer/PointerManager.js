import { INPUT_CHANNELS_DEVICE, INPUT_OFFSET_POINTER } from '../../const';
import support from '../../support';
import ChannelManager from '../ChannelManager';
import Pointer from './Pointer';
import Vector from '../../math/Vector';
import { addFlag, hasFlag, removeFlag, stopEvent } from '../../utils';

const FLAGS = {
        NONE: 0,
        ENTER: 1 << 0,
        LEAVE: 1 << 1,
        MOVE: 1 << 2,
        DOWN: 1 << 3,
        UP: 1 << 4,
        CANCEL: 1 << 5,
        SCROLL: 1 << 6,
    },
    passive = (support.eventOptions ? {
        capture: true,
        passive: true,
    } : true),
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
 * @class PointerManager
 * @extends ChannelManager
 */
export default class PointerManager extends ChannelManager {

    /**
     * @constructor
     * @param {Application} app
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(app, channelBuffer) {
        super(channelBuffer, INPUT_OFFSET_POINTER, INPUT_CHANNELS_DEVICE);

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

        /**
         * @private
         * @member {Map<Number, Pointer>}
         */
        this._pointers = new Map();

        /**
         * @private
         * @member {Set<Pointer>}
         */
        this._pointersEntered = new Set();

        /**
         * @private
         * @member {Set<Pointer>}
         */
        this._pointersLeft = new Set();

        /**
         * @private
         * @member {Set<Pointer>}
         */
        this._pointersMoved = new Set();

        /**
         * @private
         * @member {Set<Pointer>}
         */
        this._pointersDown = new Set();

        /**
         * @private
         * @member {Set<Pointer>}
         */
        this._pointersUp = new Set();

        /**
         * @private
         * @member {Set<Pointer>}
         */
        this._pointersCancelled = new Set();

        /**
         * @private
         * @member {Vector}
         */
        this._scrollDelta = new Vector(0, 0);

        /**
         * @private
         * @member {Number}
         */
        this._flags = FLAGS.NONE;

        this._addEventListeners();
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
     * @member {Vector}
     */
    get scrollDelta() {
        return this._scrollDelta;
    }

    /**
     * @override
     */
    update() {
        if (this._flags) {
            if (hasFlag(FLAGS.ENTER, this._flags)) {
                this._triggerPointerEvents('enter', this._pointersEntered);
                this._pointersEntered.clear();
                this._flags = removeFlag(FLAGS.ENTER, this._flags);
            }

            if (hasFlag(FLAGS.LEAVE, this._flags)) {
                this._triggerPointerEvents('leave', this._pointersLeft);
                this._pointersLeft.clear();
                this._flags = removeFlag(FLAGS.LEAVE, this._flags);
            }

            if (hasFlag(FLAGS.MOVE, this._flags)) {
                this._triggerPointerEvents('move', this._pointersMoved);
                this._pointersMoved.clear();
                this._flags = removeFlag(FLAGS.MOVE, this._flags);
            }

            if (hasFlag(FLAGS.DOWN, this._flags)) {
                this._triggerPointerEvents('down', this._pointersDown, { touchEvent: 'start' });
                this._pointersDown.clear();

                this._flags = removeFlag(FLAGS.DOWN, this._flags);
            }

            if (hasFlag(FLAGS.UP, this._flags)) {
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

                this._pointersUp.clear();

                this._flags = removeFlag(FLAGS.UP, this._flags);
            }

            if (hasFlag(FLAGS.CANCEL, this._flags)) {
                this._triggerPointerEvents('cancel', this._pointersCancelled);
                this._pointersCancelled.clear();

                this._flags = removeFlag(FLAGS.CANCEL, this._flags);
            }

            if (hasFlag(FLAGS.SCROLL, this._flags)) {
                this._app.trigger('mouse:scroll', this._scrollDelta, this._pointers);
                this._scrollDelta.set(0, 0);

                this._flags = removeFlag(FLAGS.SCROLL, this._flags);
            }
        }

        for (const pointer of this._pointers.values()) {
            pointer.update();
        }
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

        this._pointers.clear();
        this._pointers = null;

        this._pointersEntered.clear();
        this._pointersEntered = null;

        this._pointersLeft.clear();
        this._pointersLeft = null;

        this._pointersDown.clear();
        this._pointersDown = null;

        this._pointersUp.clear();
        this._pointersUp = null;

        this._pointersCancelled.clear();
        this._pointersCancelled = null;

        this._scrollDelta.destroy();
        this._scrollDelta = null;

        this._flags = null;
        this._app = null;
    }

    /**
     * @private
     */
    _addEventListeners() {
        const canvas = this._app.canvas;

        this._onEnterHandler = this._onEnter.bind(this);
        this._onLeaveHandler = this._onLeave.bind(this);
        this._onMoveHandler = this._onMove.bind(this);
        this._onDownHandler = this._onDown.bind(this);
        this._onUpHandler = this._onUp.bind(this);
        this._onCancelHandler = this._onCancel.bind(this);
        this._onScrollHandler = this._onScroll.bind(this);

        canvas.addEventListener('pointerover', this._onEnterHandler, passive);
        canvas.addEventListener('pointerleave', this._onLeaveHandler, passive);
        canvas.addEventListener('pointercancel', this._onCancelHandler, passive);
        canvas.addEventListener('pointermove', this._onMoveHandler, passive);
        canvas.addEventListener('pointerdown', this._onDownHandler, active);
        canvas.addEventListener('pointerup', this._onUpHandler, active);
        canvas.addEventListener('wheel', this._onScrollHandler, active);
        canvas.addEventListener('contextmenu', stopEvent, active);
        canvas.addEventListener('selectstart', stopEvent, active);
    }

    /**
     * @private
     */
    _removeEventListeners() {
        const canvas = this._app.canvas;

        canvas.removeEventListener('pointerover', this._onEnterHandler, passive);
        canvas.removeEventListener('pointerleave', this._onLeaveHandler, passive);
        canvas.removeEventListener('pointercancel', this._onCancelHandler, passive);
        canvas.removeEventListener('pointermove', this._onMoveHandler, passive);
        canvas.removeEventListener('pointerdown', this._onDownHandler, active);
        canvas.removeEventListener('pointerup', this._onUpHandler, active);
        canvas.removeEventListener('wheel', this._onScrollHandler, active);
        canvas.removeEventListener('contextmenu', stopEvent, active);
        canvas.removeEventListener('selectstart', stopEvent, active);

        this._onEnterHandler = null;
        this._onLeaveHandler = null;
        this._onMoveHandler = null;
        this._onDownHandler = null;
        this._onUpHandler = null;
        this._onCancelHandler = null;
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _onEnter(event) {
        const pointer = new Pointer(event, this.channelBuffer);

        this._pointers.set(pointer.id, pointer);
        this._pointersEntered.add(pointer);
        this._flags = addFlag(FLAGS.ENTER, this._flags);
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _onLeave(event) {
        const pointer = this._updatePointer(event);

        this._pointers.delete(pointer.id);
        this._pointersLeft.add(pointer);
        this._flags = addFlag(FLAGS.LEAVE, this._flags);
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _onDown(event) {
        const pointer = this._updatePointer(event);

        pointer.downPosition.set(pointer.x, pointer.y);

        this._pointersDown.add(pointer);
        this._flags = addFlag(FLAGS.DOWN, this._flags);

        event.preventDefault();
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _onUp(event) {
        this._pointersUp.add(this._updatePointer(event));
        this._flags = addFlag(FLAGS.UP, this._flags);

        event.preventDefault();
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _onCancel(event) {
        this._pointersCancelled.add(this._updatePointer(event));
        this._flags = addFlag(FLAGS.CANCEL, this._flags);
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _onMove(event) {
        this._pointersMoved.add(this._updatePointer(event));
        this._flags = addFlag(FLAGS.MOVE, this._flags);
    }

    /**
     * @private
     * @param {WheelEvent} event
     */
    _onScroll(event) {
        this._scrollDelta.add(event.deltaX, event.deltaY);
        this._flags = addFlag(FLAGS.SCROLL, this._flags);
    }

    /**
     * @private
     * @param {PointerEvent} event
     * @returns {Pointer}
     */
    _updatePointer(event) {
        if (!this._pointers.has(event.pointerId)) {
            throw new Error(`Could not find Pointer with id "${event.pointerId}".`);
        }

        return this._pointers
            .get(event.pointerId)
            .setEventData(event);
    }

    /**
     * @private
     * @param {String} event
     * @param {Set<Pointer>} pointers
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
        this._app.trigger(`pointer:${pointerEvent || event}`, pointer, this._pointers);

        if (pointer.type === 'mouse') {
            this._app.trigger(`mouse:${mouseEvent || event}`, pointer, this._pointers);
        } else if (pointer.type === 'touch') {
            this._app.trigger(`touch:${touchEvent || event}`, pointer, this._pointers);
        } else if (pointer.type === 'pen') {
            this._app.trigger(`pen:${penEvent || event}`, pointer, this._pointers);
        }
    }
}
