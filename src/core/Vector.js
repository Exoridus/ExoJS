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
     * @member {Number}
     */
    get magnitude() {
        return Math.sqrt((this._x * this._x) + (this._y * this._y));
    }

    /**
     * @override
     */
    set(x, y) {
        this._x = (typeof x === 'number') ? x : this._x;
        this._y = (typeof y === 'number') ? y : this._y;

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
    toArray() {
        return [
            this._x,
            this._y,
        ];
    }

    /**
     * @override
     */
    contains(x, y) {
        return this._x === x && this._y === y;
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
     * @param {Number} x
     * @param {Number} y
     * @returns {Exo.Vector}
     */
    add(x, y) {
        this._x += (typeof x === 'number') ? x : 0;
        this._y += (typeof y === 'number') ? y : 0;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Exo.Vector}
     */
    subtract(x, y) {
        this._x -= (typeof x === 'number') ? x : 0;
        this._y -= (typeof y === 'number') ? y : 0;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Exo.Vector}
     */
    multiply(x, y) {
        this._x *= (typeof x === 'number') ? x : 1;
        this._y *= (typeof y === 'number') ? y : 1;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Exo.Vector}
     */
    divide(x, y) {
        this._x /= (typeof x === 'number') ? x : 1;
        this._y /= (typeof y === 'number') ? y : 1;

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
    getBounds() {
        return new Rectangle(this.x, this.y, 0, 0);
    }

    /**
     * @override
     */
    destroy() {
        this._x = null;
        this._y = null;
    }

    /**
     * @public
     * @static
     * @returns {Exo.Vector}
     */
    static get Empty() {
        return new Vector(0, 0);
    }
}
