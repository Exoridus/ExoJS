import Shape from './Shape';
import Rectangle from './Rectangle';
import {SHAPE} from '../const';

/**
 * @class Vector
 * @implements {Exo.Shape}
 * @memberof Exo
 */
export default class Vector extends Shape {

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     */
    constructor(x = 0, y = 0) {
        super();

        /**
         * @public
         * @member {Number}
         */
        this._x = x;

        /**
         * @public
         * @member {Number}
         */
        this._y = y;

        /**
         * @private
         * @member {Float32Array} _array
         */

        /**
         * @private
         * @member {Exo.Rectangle} _bounds
         */
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get type() {
        return SHAPE.POINT;
    }

    /**
     * @public
     * @member {Number}
     */
    get x() {
        return this._x;
    }

    set x(value) {
        return this._x = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get y() {
        return this._y;
    }

    set y(value) {
        return this._y = value;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get array() {
        const array = this._array || (this._array = new Float32Array(2));

        array[0] = this._x;
        array[1] = this._y;

        return array;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Rectangle}
     */
    get bounds() {
        return this.getBounds();
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get magnitude() {
        return Math.sqrt((this._x * this._x) + (this._y * this._y));
    }

    /**
     * @override
     */
    set(x = this._x, y = this._y) {
        this._x = x;
        this._y = y;

        return this;
    }

    /**
     * @override
     */
    copy(vector) {
        this._x = vector.x;
        this._y = vector.y;

        return this;
    }

    /**
     * @override
     */
    clone() {
        return new Vector(this._x, this._y);
    }

    /**
     * @override
     */
    reset() {
        this.set(0, 0);
    }

    /**
     * @override
     */
    toArray() {
        return this.array;
    }

    /**
     * @override
     */
    getBounds() {
        if (!this._bounds) {
            this._bounds = new Rectangle();
        }

        return this._bounds.set(this._x, this._y, 0, 0);
    }

    /**
     * @override
     */
    contains(shape) {
        return shape.type === SHAPE.POINT && (this._x === shape.x && this._y === shape.y);
    }

    /**
     * @public
     * @param {Exo.Vector} vector
     * @returns {Number}
     */
    distanceTo(vector) {
        const x = this._x - vector.x,
            y = this._y - vector.y;

        return Math.sqrt((x * x) + (y * y));
    }

    /**
     * @public
     * @chainable
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     * @returns {Exo.Vector}
     */
    add(x = 0, y = 0) {
        this._x += x;
        this._y += y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     * @returns {Exo.Vector}
     */
    subtract(x = 0, y = 0) {
        this._x -= x;
        this._y -= y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [x=1]
     * @param {Number} [y=1]
     * @returns {Exo.Vector}
     */
    multiply(x = 1, y = 1) {
        this._x *= x;
        this._y *= y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [x=1]
     * @param {Number} [y=1]
     * @returns {Exo.Vector}
     */
    divide(x = 1, y = 1) {
        this._x /= x;
        this._y /= y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.Vector}
     */
    normalize() {
        const mag = this.magnitude;

        this._x /= mag;
        this._y /= mag;

        return this;
    }

    /**
     * @override
     */
    destroy() {
        if (this._array) {
            this._array = null;
        }

        if (this._bounds) {
            this._bounds.destroy();
            this._bounds = null;
        }

        this._x = null;
        this._y = null;
    }
}
