import { INPUT_CHANNELS_DEVICE, INPUT_OFFSET } from '../../const';
import support from '../../support';
import ChannelManager from '../ChannelManager';
import Pointer from './Pointer';
import Vector from '../../math/Vector';
import { addFlag, hasFlag, removeFlag } from '../../utils';

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
 * @extends {ChannelManager}
 */
export default class PointerManager extends ChannelManager {

    /**
     * @constructor
     * @param {Application} app
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(app, channelBuffer) {
        super(channelBuffer, INPUT_OFFSET.POINTER, INPUT_CHANNELS_DEVICE);

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
        for (const pointer of this._pointers.values()) {
            pointer.update();
        }

        if (!this._flags) {
            return;
        }

        if (hasFlag(FLAGS.ENTER, this._flags)) {
            this._app.trigger('pointer:enter', this._pointersEntered, this._pointers);
            this._pointersEntered.clear();

            this._flags = removeFlag(FLAGS.ENTER, this._flags);
        }

        if (hasFlag(FLAGS.LEAVE, this._flags)) {
            this._app.trigger('pointer:leave', this._pointersLeft, this._pointers);

            for (const pointer of this._pointersLeft) {
                pointer.destroy();
            }

            this._pointersLeft.clear();
            this._flags = removeFlag(FLAGS.LEAVE, this._flags);
        }

        if (hasFlag(FLAGS.MOVE, this._flags)) {
            this._app.trigger('pointer:move', this._pointersMoved, this._pointers);
            this._pointersMoved.clear();

            this._flags = removeFlag(FLAGS.MOVE, this._flags);
        }

        if (hasFlag(FLAGS.DOWN, this._flags)) {
            this._app.trigger('pointer:down', this._pointersDown, this._pointers);
            this._pointersDown.clear();

            this._flags = removeFlag(FLAGS.DOWN, this._flags);
        }

        if (hasFlag(FLAGS.UP, this._flags)) {
            this._app.trigger('pointer:up', this._pointersUp, this._pointers);
            this._pointersUp.clear();

            this._flags = removeFlag(FLAGS.UP, this._flags);
        }

        if (hasFlag(FLAGS.CANCEL, this._flags)) {
            this._app.trigger('pointer:cancel', this._pointersCancelled, this._pointers);
            this._pointersCancelled.clear();

            this._flags = removeFlag(FLAGS.CANCEL, this._flags);
        }

        if (hasFlag(FLAGS.SCROLL, this._flags)) {
            this._app.trigger('pointer:scroll', this._scrollDelta, this._pointers);
            this._scrollDelta.set(0, 0);

            this._flags = removeFlag(FLAGS.SCROLL, this._flags);
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
        this._stopEventHandler = this._stopEvent.bind(this);

        canvas.addEventListener('pointerover', this._onEnterHandler, passive);
        canvas.addEventListener('pointerleave', this._onLeaveHandler, passive);
        canvas.addEventListener('pointercancel', this._onCancelHandler, passive);
        canvas.addEventListener('pointermove', this._onMoveHandler, passive);
        canvas.addEventListener('pointerdown', this._onDownHandler, active);
        canvas.addEventListener('pointerup', this._onUpHandler, passive);
        canvas.addEventListener('wheel', this._onScrollHandler, active);
        canvas.addEventListener('contextmenu', this._stopEventHandler, active);
        canvas.addEventListener('selectstart', this._stopEventHandler, active);
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
        canvas.removeEventListener('pointerup', this._onUpHandler, passive);
        canvas.removeEventListener('wheel', this._onScrollHandler, active);
        canvas.removeEventListener('contextmenu', this._stopEventHandler, active);
        canvas.removeEventListener('selectstart', this._stopEventHandler, active);

        this._onEnterHandler = null;
        this._onLeaveHandler = null;
        this._onMoveHandler = null;
        this._onDownHandler = null;
        this._onUpHandler = null;
        this._onCancelHandler = null;
        this._stopEventHandler = null;
    }

    /**
     * @private
     * @param {PointerEvent} event
     * @fires Pointer#enter
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
     * @fires Pointer#leave
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
     * @fires Pointer#down
     */
    _onDown(event) {
        this._pointersDown.add(this._updatePointer(event));
        this._flags = addFlag(FLAGS.DOWN, this._flags);

        event.preventDefault();
    }

    /**
     * @private
     * @param {PointerEvent} event
     * @fires Pointer#up
     */
    _onUp(event) {
        this._pointersUp.add(this._updatePointer(event));
        this._flags = addFlag(FLAGS.UP, this._flags);

        event.preventDefault();
    }

    /**
     * @private
     * @param {PointerEvent} event
     * @fires Pointer#cancel
     */
    _onCancel(event) {
        this._pointersCancelled.add(this._updatePointer(event));
        this._flags = addFlag(FLAGS.CANCEL, this._flags);
    }

    /**
     * @private
     * @param {PointerEvent} event
     * @fires Pointer#move
     */
    _onMove(event) {
        this._pointersMoved.add(this._updatePointer(event));
        this._flags = addFlag(FLAGS.MOVE, this._flags);
    }

    /**
     * @private
     * @param {WheelEvent} event
     * @fires Pointer#scroll
     */
    _onScroll(event) {
        this._scrollDelta.add(event.deltaX, event.deltaY);
        this._flags = addFlag(FLAGS.SCROLL, this._flags);
    }

    /**
     * @private
     * @param {PointerEvent} event
     */
    _stopEvent(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
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
}
