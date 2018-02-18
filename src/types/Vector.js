import { getDistance } from '../utils/math';

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
     * @member {Number}
     */
    get direction() {
        return Math.atan2(this._x, this._y);
    }

    set direction(angle) {
        const length = this.length;

        this._x = Math.cos(angle) * length;
        this._y = Math.sin(angle) * length;
    }

    /**
     * @public
     * @member {Number}
     */
    get angle() {
        return this.direction;
    }

    set angle(angle) {
        this.direction = angle;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get length() {
        return Math.sqrt((this._x * this._x) + (this._y * this._y));
    }

    set length(magnitude) {
        var direction = this.direction;

        this._x = Math.cos(direction) * magnitude;
        this._y = Math.sin(direction) * magnitude;
    }

    /**
     * @public
     * @member {Number}
     */
    get lengthSq() {
        return (this._x * this._x) + (this._y * this._y);
    }

    set lengthSq(lengthSquared) {
        this.length = Math.sqrt(lengthSquared);
    }

    /**
     * @public
     * @member {Number}
     */
    get magnitude() {
        return this.length;
    }

    set magnitude(magnitude) {
        this.length = magnitude;
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
    multiply(x, y = x) {
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
        if (x !== 0 && y !== 0) {
            this._x /= x;
            this._y /= y;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {Vector}
     */
    min(x, y = x) {
        this._x = Math.min(this._x, x);
        this._y = Math.min(this._y, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {Vector}
     */
    max(x, y = x) {
        this._x = Math.max(this._x, x);
        this._y = Math.max(this._y, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {Vector}
     */
    modulo(x, y = x) {
        this._x = this._x % x;
        this._y = this._y % y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Vector}
     */
    normalize() {
        return this.divide(this.length);
    }

    /**
     * @public
     * @chainable
     * @returns {Vector}
     */
    invert() {
        return this.multiply(-1, -1);
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
    perp(result = this) {
        return result.set(-this._y, this._x);
    }

    /**
     * @public
     * @param {Vector} [result=this]
     * @returns {Vector}
     */
    rperp(result = this) {
        return result.set(this._y, -this._x);
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
    distanceTo(vector) {
        return getDistance(this._x, this._y, vector.x, vector.y);
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
     * @param {Array} array
     * @param {Vector} [result=new Vector()]
     * @returns {Vector}
     */
    static fromArray(array, result = new Vector()) {
        return result.set(
            array[0] || 0,
            array[1] || 0
        );
    }

    /**
     * @public
     * @static
     * @param {Object} object
     * @param {Number} object.x=0
     * @param {Number} object.y=0
     * @param {Vector} [result=new Vector()]
     * @returns {Vector}
     */
    static fromObject({ x = 0, y = 0 } = {}, result = new Vector()) {
        return result.set(x, y);
    }

    /**
     * @public
     * @static
     * @param {Vector} vecA
     * @param {Vector} vecB
     * @param {Vector} [result=new Vector()]
     * @returns {Vector}
     */
    static add(vecA, vecB, result = new Vector()) {
        return result.copy(vecA)
            .add(vecB.x, vecB.y);
    }

    /**
     * @public
     * @static
     * @param {Vector} vecA
     * @param {Vector} vecB
     * @param {Vector} [result=new Vector()]
     * @returns {Vector}
     */
    static subtract(vecA, vecB, result = new Vector()) {
        return result.copy(vecA)
            .subtract(vecB.x, vecB.y);
    }

    /**
     * @public
     * @static
     * @param {Vector} vecA
     * @param {Vector} vecB
     * @param {Vector} [result=new Vector()]
     * @returns {Vector}
     */
    static multiply(vecA, vecB, result = new Vector()) {
        return result.copy(vecA)
            .multiply(vecB.x, vecB.y);
    }

    /**
     * @public
     * @static
     * @param {Vector} vecA
     * @param {Vector} vecB
     * @param {Vector} [result=new Vector()]
     * @returns {Vector}
     */
    static divide(vecA, vecB, result = new Vector()) {
        return result.copy(vecA)
            .divide(vecB.x, vecB.y);
    }
}

/**
 * @public
 * @static
 * @constant
 * @type {Vector}
 */
Vector.Zero = new Vector(0, 0);

/**
 * @public
 * @static
 * @constant
 * @type {Vector}
 */
Vector.One = new Vector(1, 1);

/**
 * @public
 * @static
 * @constant
 * @type {Vector}
 */
Vector.Temp = new Vector();
