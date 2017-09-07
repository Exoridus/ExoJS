import Vector from './Vector';

/**
 * @class ObservableVector
 * @extends {Exo.Vector}
 * @memberof Exo
 */
export default class ObservableVector extends Vector {

    /**
     * @constructor
     * @param {Function} callback
     * @param {*} scope
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     */
    constructor(callback, scope, x = 0, y = 0) {
        super(x, y);

        /**
         * @private
         * @member {Function}
         */
        this._callback = callback;

        /**
         * @private
         * @member {*}
         */
        this._scope = scope || this;
    }

    /**
     * @public
     * @member {Number}
     */
    get x() {
        return this._x;
    }

    set x(value) {
        if (this._x !== value) {
            this._x = value;
            this._callback.call(this._scope);
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get y() {
        return this._y;
    }

    set y(value) {
        if (this._y !== value) {
            this._y = value;
            this._callback.call(this._scope);
        }
    }

    /**
     * @override
     */
    set (x = this._x, y = this._y) {
        if (this._x !== x || this._y !== y) {
            this._x = x;
            this._y = y;
            this._callback.call(this._scope);
        }

        return this;
    }

    /**
     * @override
     */
    add(x = 0, y = 0) {
        this._x += x;
        this._y += y;
        this._callback.call(this._scope);

        return this;
    }

    /**
     * @override
     */
    subtract(x = 0, y = 0) {
        this._x -= x;
        this._y -= y;
        this._callback.call(this._scope);

        return this;
    }

    /**
     * @override
     */
    multiply(x = 1, y = 1) {
        this._x *= x;
        this._y *= y;
        this._callback.call(this._scope);

        return this;
    }

    /**
     * @override
     */
    divide(x = 1, y = 1) {
        this._x /= x;
        this._y /= y;
        this._callback.call(this._scope);

        return this;
    }

    /**
     * @override
     */
    normalize() {
        const mag = this.magnitude;

        this._x /= mag;
        this._y /= mag;

        this._callback.call(this._scope);

        return this;
    }

    /**
     * @override
     */
    copy(vector) {
        if (this._x !== vector.x || this._y !== vector.y) {
            this._x = vector.x;
            this._y = vector.y;
            this._callback.call(this._scope);
        }

        return this;
    }

    /**
     * @override
     */
    clone() {
        return new ObservableVector(this._callback, this._scope, this._x, this._y);
    }

    /**
     * @override
     */
    destroy() {
        this._x = null;
        this._y = null;
        this._callback = null;
        this._scope = null;
    }
}
