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
        return this.len;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get len() {
        return Math.sqrt(this.len2);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get len2() {
        return (this._x * this._x) + (this._y * this._y);
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {Vector}
     */
    set(x, y = x) {
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
     * @param {Vector|Object} vector
     * @param {Number} [vector.x]
     * @param {Number} [vector.y]
     * @returns {Boolean}
     */
    equals({ x, y } = {}) {
        return (x === undefined || this.x === x)
            && (y === undefined || this.y === y);
    }

    /**
     * @public
     * @chainable
     * @returns {Vector}
     */
    normalize() {
        const mag = this.magnitude;

        if (mag > 0) {
            this._x /= mag;
            this._y /= mag;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Vector}
     */
    reverse() {
        this._x *= -1;
        this._y *= -1;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {Vector}
     */
    add(x, y = x) {
        this._x += x;
        this._y += y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {Vector}
     */
    subtract(x, y = x) {
        this._x -= x;
        this._y -= y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {Vector}
     */
    scale(x, y = x) {
        this._x *= x;
        this._y *= y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {Vector}
     */
    divide(x, y = x) {
        this._x /= x;
        this._y /= y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Matrix} matrix
     * @param {Vector} [result=this]
     * @returns {Vector}
     */
    transform(matrix, result = this) {
        return result.set(
            (this._x * matrix.a) + (this._y * matrix.b) + matrix.x,
            (this._x * matrix.c) + (this._y * matrix.d) + matrix.y
        );
    }

    /**
     * @public
     * @chainable
     * @param {Matrix} matrix
     * @param {Vector} [result=this]
     * @returns {Vector}
     */
    transformInverse(matrix, result = this) {
        const id = 1 / ((this.a * this.d) + (this.c * -this.b));

        return result.set(
            (this._x * matrix.d * id) + (this._y * -matrix.c * id) + (((matrix.y * matrix.c) - (matrix.x * matrix.d)) * id),
            (this._y * matrix.a * id) + (this._x * -matrix.b * id) + (((-matrix.y * matrix.a) + (matrix.x * matrix.b)) * id)
        );
    }

    /**
     * @public
     * @param {Vector} [result=this]
     * @returns {Vector}
     */
    perpLeft(result = this) {
        return result.set(this._y, -this._x);
    }

    /**
     * @public
     * @param {Vector} [result=this]
     * @returns {Vector}
     */
    perpRight(result = this) {
        return result.set(-this._y, this._x);
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @returns {Number}
     */
    distanceTo(x, y) {
        const offsetX = this._x - x,
            offsetY = this._y - y;

        return Math.sqrt((offsetX * offsetX) + (offsetY * offsetY));
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
     * @param {Number} x
     * @param {Number} y
     * @returns {Number}
     */
    dot(x, y) {
        return (this._x * x) + (this._y * y);
    }

    /**
     * @public
     * @chainable
     * @param {Vector} vector
     * @param {Vector} [result=this]
     * @returns {Vector}
     */
    project(vector, result = this) {
        const amt = this.dot(vector.x, vector.y) / vector.len2;

        return result.set(amt * vector.x, amt * vector.y);
    }

    /**
     * @public
     * @chainable
     * @param {Vector} axis
     * @returns {Vector}
     */
    reflect(axis, result = this) {
        const x = this._x,
            y = this._y;

        return this
            .project(axis, result)
            .scale(2)
            .subtract(x, y);
    }

    /**
     * @override
     */
    destroy() {
        this._x = null;
        this._y = null;
    }
}

/**
 * @public
 * @static
 * @constant
 * @type {Vector}
 */
Vector.Empty = new Vector(0, 0);

/**
 * @public
 * @static
 * @constant
 * @type {Vector}
 */
Vector.Temp = new Vector();
