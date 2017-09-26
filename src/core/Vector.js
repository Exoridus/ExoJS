/**
 * @class Vector
 */
export default class Vector {

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     */
    constructor(x = 0, y = 0) {

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
         * @public
         * @member {?Float32Array}
         */
        this._array = null;
    }

    /**
     * @public
     * @member {Number}
     */
    get x() {
        return this._x;
    }

    set x(x) {
        this._x = x;
    }

    /**
     * @public
     * @member {Number}
     */
    get y() {
        return this._y;
    }

    set y(y) {
        this._y = y;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get array() {
        return this.toArray();
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get angle() {
        return Math.atan2(this._x, this._y);
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
     * @public
     * @chainable
     * @param {Number} [x]
     * @param {Number} [y]
     * @returns {Vector}
     */
    set(x = this._x, y = this._y) {
        this._x = x;
        this._y = y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Vector} vector
     * @returns {Vector}
     */
    copy(vector) {
        this._x = vector.x;
        this._y = vector.y;

        return this;
    }

    /**
     * @public
     * @returns {Vector}
     */
    clone() {
        return new Vector(this._x, this._y);
    }

    /**
     * @public
     * @chainable
     * @returns {Vector}
     */
    reset() {
        return this.set(0, 0);
    }

    /**
     * @public
     * @param {Vector} vector
     * @returns {Boolean}
     */
    equals(vector) {
        return (this._x === vector.x && this._y === vector.y);
    }

    /**
     * @public
     * @returns {Float32Array}
     */
    toArray() {
        const array = this._array || (this._array = new Float32Array(2));

        array[0] = this._x;
        array[1] = this._y;

        return array;
    }

    /**
     * @public
     * @chainable
     * @returns {Vector}
     */
    normalize() {
        const mag = this.magnitude;

        this._x /= mag;
        this._y /= mag;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Vector}
     */
    negate() {
        this._x = -this._x;
        this._y = -this._y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Vector|Object} [vector]
     * @param {Number} [vector.x=0]
     * @param {Number} [vector.y=0]
     * @returns {Vector}
     */
    add({ x = 0, y = 0 } = {}) {
        this._x += x;
        this._y += y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Vector|Object} [vector]
     * @param {Number} [vector.x=0]
     * @param {Number} [vector.y=0]
     * @returns {Vector}
     */
    subtract({ x = 0, y = 0 } = {}) {
        this._x -= x;
        this._y -= y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Vector|Object} [vector]
     * @param {Number} [vector.x=1]
     * @param {Number} [vector.y=1]
     * @returns {Vector}
     */
    multiply({ x = 1, y = 1 } = {}) {
        this._x *= x;
        this._y *= y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Vector|Object} [vector]
     * @param {Number} [vector.x=1]
     * @param {Number} [vector.y=1]
     * @returns {Vector}
     */
    divide({ x = 1, y = 1 } = {}) {
        this._x /= x;
        this._y /= y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Matrix} matrix
     * @returns {Vector}
     */
    transform(matrix) {
        return this.set(
            (matrix.a * this._x) + (matrix.c * this._y) + matrix.x,
            (matrix.b * this._x) + (matrix.d * this._y) + matrix.y,
        );
    }

    /**
     * @public
     * @param {Vector} vector
     * @returns {Number}
     */
    cross(vector) {
        return (this._x * vector.y) - (this._y * vector.x);
    }

    /**
     * @public
     * @param {Vector} vector
     * @returns {Number}
     */
    dot(vector) {
        return (this._x * vector.x) + (this._y * vector.y);
    }

    /**
     * @public
     * @param {Vector} vector
     * @returns {Number}
     */
    getDistance(vector) {
        const x = this._x - vector.x,
            y = this._y - vector.y;

        return Math.sqrt((x * x) + (y * y));
    }

    /**
     * @override
     */
    destroy() {
        if (this._array) {
            this._array.fill(0);
            this._array = null;
        }

        this._x = null;
        this._y = null;
    }
}
