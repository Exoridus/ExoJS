import Vector from './Vector';

/**
 * @class ObservableVector
 * @extends Vector
 */
export default class ObservableVector extends Vector {

    /**
     * @constructor
     * @param {Function} callback
     * @param {?Object} context
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     */
    constructor(callback, context, x = 0, y = 0) {
        super(x, y);

        /**
         * @private
         * @member {Function}
         */
        this._callback = callback;

        /**
         * @private
         * @member {?Object}
         */
        this._context = context || this;
    }

    /**
     * @public
     * @member {Number}
     */
    get x() {
        return this._x;
    }

    set x(x) {
        if (this._x !== x) {
            this._x = x;
            this._callback.call(this._context);
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get y() {
        return this._y;
    }

    set y(y) {
        if (this._y !== y) {
            this._y = y;
            this._callback.call(this._context);
        }
    }

    /**
     * @override
     */
    set(x = this._x, y = this._y) {
        if (this._x !== x || this._y !== y) {
            this._x = x;
            this._y = y;
            this._callback.call(this._context);
        }

        return this;
    }

    /**
     * @override
     */
    add(x, y = x) {
        return this.set(this._x + x, this._y + y);
    }

    /**
     * @override
     */
    subtract(x, y = x) {
        return this.set(this._x - x, this._y - y);
    }

    /**
     * @override
     */
    scale(x, y = x) {
        return this.set(this._x * x, this._y * y);
    }

    /**
     * @override
     */
    divide(x, y = x) {
        return this.set(this._x / x, this._y / y);
    }

    /**
     * @override
     */
    normalize() {
        return this.divide(this.magnitude);
    }

    /**
     * @override
     */
    copy(vector) {
        return this.set(vector.x, vector.y);
    }

    /**
     * @override
     */
    clone() {
        return new ObservableVector(this._callback, this._context, this._x, this._y);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._callback = null;
        this._context = null;
    }
}
