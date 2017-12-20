import Vector from '../math/Vector';
import Size from '../math/Size';
import Flags from '../math/Flags';
import EventEmitter from '../core/EventEmitter';

/**
 * @private
 * @type {Object<String, Number>}
 * @property {Number} NONE
 * @property {Number} POSITION
 * @property {Number} SIZE
 * @property {Number} TILT
 * @property {Number} BUTTONS
 * @property {Number} PRESSURE
 * @property {Number} ROTATION
 */
const FLAGS = {
    NONE: 0,
    POSITION: 1 << 0,
    SIZE: 1 << 1,
    TILT: 1 << 2,
    BUTTONS: 1 << 3,
    PRESSURE: 1 << 4,
    ROTATION: 1 << 5,
};

/**
 * @class Pointer
 * @extends EventEmitter
 */
export default class Pointer extends EventEmitter {

    /**
     * @constructor
     * @param {PointerEvent} event
     */
    constructor(event) {
        super();

        const bounds = event.target.getBoundingClientRect();

        /**
         * @private
         * @member {Number}
         */
        this._id = event.pointerId;

        /**
         * @private
         * @member {String}
         */
        this._type = event.pointerType;

        /**
         * @private
         * @member {Vector}
         */
        this._position = new Vector(event.clientX - bounds.left, event.clientY - bounds.top);

        /**
         * @private
         * @member {Vector}
         */
        this._downPosition = new Vector(-1, -1);

        /**
         * @private
         * @member {Size}
         */
        this._size = new Size(event.width, event.height);

        /**
         * @private
         * @member {Vector}
         */
        this._tilt = new Vector(event.tiltX, event.tiltY);

        /**
         * @private
         * @member {Number}
         */
        this._buttons = event.buttons;

        /**
         * @private
         * @member {Number}
         */
        this._pressure = event.pressure;

        /**
         * @private
         * @member {Number}
         */
        this._rotation = event.twist;

        /**
         * @private
         * @member {Flags}
         */
        this._flags = new Flags();
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get id() {
        return this._id;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get type() {
        return this._type;
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
     * @member {Vector}
     */
    get downPosition() {
        return this._downPosition;
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
     * @member {Size}
     */
    get size() {
        return this._size;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get width() {
        return this._size.width;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get height() {
        return this._size.height;
    }

    /**
     * @public
     * @readonly
     * @member {Vector}
     */
    get tilt() {
        return this._tilt;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get buttons() {
        return this._buttons;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get pressure() {
        return this._pressure;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get rotation() {
        return this._rotation;
    }

    /**
     * @public
     * @chainable
     * @param {PointerEvent} event
     * @returns {Pointer}
     */
    setEventData(event) {
        const bounds = event.target.getBoundingClientRect(),
            x = event.clientX - bounds.left,
            y = event.clientY - bounds.top;

        if ((this._position.x !== x) || (this._position.y !== y)) {
            this._position.set(x, y);
            this._flags.add(FLAGS.POSITION);
        }

        if ((this._size.width !== event.width) || (this._size.height !== event.height)) {
            this._size.set(event.width, event.height);
            this._flags.add(FLAGS.SIZE);
        }

        if ((this._tilt.x !== event.tiltX) || (this._tilt.y !== event.tiltY)) {
            this._tilt.set(event.tiltX, event.tiltY);
            this._flags.add(FLAGS.TILT);
        }

        if (this._buttons !== event.buttons) {
            this._buttons = event.buttons;
            this._flags.add(FLAGS.BUTTONS);
        }

        if (this._pressure !== event.pressure) {
            this._pressure = event.pressure;
            this._flags.add(FLAGS.PRESSURE);
        }

        if (this._rotation !== event.twist) {
            this._rotation = event.twist;
            this._flags.add(FLAGS.ROTATION);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Pointer}
     */
    update() {
        if (this._flags.value) {
            if (this._flags.has(FLAGS.POSITION)) {
                this.trigger('move', this._position, this);
                this._flags.remove(FLAGS.POSITION);
            }

            if (this._flags.has(FLAGS.SIZE)) {
                this.trigger('resize', this._size, this);
                this._flags.remove(FLAGS.SIZE);
            }

            if (this._flags.has(FLAGS.TILT)) {
                this.trigger('tilt', this._tilt, this);
                this._flags.remove(FLAGS.TILT);
            }

            if (this._flags.has(FLAGS.ROTATION)) {
                this.trigger('rotate', this._rotation, this);
                this._flags.remove(FLAGS.ROTATION);
            }

            if (this._flags.has(FLAGS.BUTTONS)) {
                this.trigger('buttonsChanged', this._buttons, this);
                this._flags.remove(FLAGS.BUTTONS);
            }

            if (this._flags.has(FLAGS.PRESSURE)) {
                this.trigger('pressureChanged', this._pressure, this);
                this._flags.remove(FLAGS.PRESSURE);
            }
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._position.destroy();
        this._position = null;

        this._downPosition.destroy();
        this._downPosition = null;

        this._size.destroy();
        this._size = null;

        this._tilt.destroy();
        this._tilt = null;

        this._flags.destroy();
        this._flags = null;

        this._id = null;
        this._type = null;
        this._buttons = null;
        this._pressure = null;
        this._rotation = null;
    }
}
