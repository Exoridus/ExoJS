import { degreesToRadians } from '../utils/math';

/**
 * | a | b | x |
 * | c | d | y |
 * | e | f | z |
 *
 * @class Matrix
 */
export default class Matrix {

    /**
     * @constructor
     * @param {Number} [a=1]
     * @param {Number} [b=0]
     * @param {Number} [x=0]
     * @param {Number} [c=0]
     * @param {Number} [d=1]
     * @param {Number} [y=0]
     * @param {Number} [e=0]
     * @param {Number} [f=0]
     * @param {Number} [z=1]
     */
    constructor(a = 1, b = 0, x = 0,
                c = 0, d = 1, y = 0,
                e = 0, f = 0, z = 1) {

        /**
         * @public
         * @member {Number}
         */
        this.a = a;

        /**
         * @public
         * @member {Number}
         */
        this.b = b;

        /**
         * @public
         * @member {Number}
         */
        this.x = x;

        /**
         * @public
         * @member {Number}
         */
        this.c = c;

        /**
         * @public
         * @member {Number}
         */
        this.d = d;

        /**
         * @public
         * @member {Number}
         */
        this.y = y;

        /**
         * @public
         * @member {Number}
         */
        this.e = e;

        /**
         * @public
         * @member {Number}
         */
        this.f = f;

        /**
         * @public
         * @member {Number}
         */
        this.z = z;

        /**
         * @private
         * @member {?Float32Array} _array
         */
        this._array = null;

        /**
         * @private
         * @member {Number}
         */
        this._updateId = 0;
    }

    /**
     * | a | b | x |
     * | c | d | y |
     * | e | f | z |
     *
     * @public
     * @chainable
     * @param {Number} [a=this.a]
     * @param {Number} [b=this.b]
     * @param {Number} [x=this.x]
     * @param {Number} [c=this.c]
     * @param {Number} [d=this.d]
     * @param {Number} [y=this.y]
     * @param {Number} [e=this.e]
     * @param {Number} [f=this.f]
     * @param {Number} [z=this.z]
     * @returns {Matrix}
     */
    set(
        a = this.a, b = this.b, x = this.x,
        c = this.c, d = this.d, y = this.y,
        e = this.e, f = this.f, z = this.z
    ) {
        this.a = a; this.b = b; this.x = x;
        this.c = c; this.d = d; this.y = y;
        this.e = e; this.f = f; this.z = z;

        this._updateId++;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Matrix} matrix
     * @returns {Matrix}
     */
    copy(matrix) {
        this.a = matrix.a; this.b = matrix.b; this.x = matrix.x;
        this.c = matrix.c; this.d = matrix.d; this.y = matrix.y;
        this.e = matrix.e; this.f = matrix.f; this.z = matrix.z;

        return this;
    }

    /**
     * @public
     * @returns {Matrix}
     */
    clone() {
        return new Matrix(
            this.a, this.b, this.x,
            this.c, this.d, this.y,
            this.e, this.f, this.z
        );
    }

    /**
     * | a | b | x |
     * | c | d | y |
     * | e | f | z |
     *
     * @public
     * @param {Matrix|Object} matrix
     * @param {Number} [matrix.a]
     * @param {Number} [matrix.b]
     * @param {Number} [matrix.x]
     * @param {Number} [matrix.c]
     * @param {Number} [matrix.d]
     * @param {Number} [matrix.y]
     * @param {Number} [matrix.e]
     * @param {Number} [matrix.f]
     * @param {Number} [matrix.z]
     * @returns {Boolean}
     */
    equals({
        a, b, x,
        c, d, y,
        e, f, z
    } = {}) {
        return (a === undefined || this.a === a)
            && (b === undefined || this.b === b)
            && (x === undefined || this.x === x)
            && (c === undefined || this.c === c)
            && (d === undefined || this.d === d)
            && (y === undefined || this.y === y)
            && (e === undefined || this.e === e)
            && (f === undefined || this.f === f)
            && (z === undefined || this.z === z);
    }

    /**
     * @public
     * @chainable
     * @param {Matrix} matrix
     * @returns {Matrix}
     */
    combine(matrix) {
        return this.set(
            (this.a * matrix.a) + (this.c * matrix.b) + (this.e * matrix.x),
            (this.b * matrix.a) + (this.d * matrix.b) + (this.f * matrix.x),
            (this.x * matrix.a) + (this.y * matrix.b) + (this.z * matrix.x),

            (this.a * matrix.c) + (this.c * matrix.d) + (this.e * matrix.y),
            (this.b * matrix.c) + (this.d * matrix.d) + (this.f * matrix.y),
            (this.x * matrix.c) + (this.y * matrix.d) + (this.z * matrix.y),

            (this.a * matrix.e) + (this.c * matrix.f) + (this.e * matrix.z),
            (this.b * matrix.e) + (this.d * matrix.f) + (this.f * matrix.z),
            (this.x * matrix.e) + (this.y * matrix.f) + (this.z * matrix.z)
        );
    }

    /**
     * @public
     * @chainable
     * @param {Matrix} [result=this]
     * @returns {Matrix}
     */
    getInverse(result = this) {
        const determinant =
            (this.a * (this.z * this.d - this.y * this.f)) -
            (this.b * (this.z * this.c - this.y * this.e)) +
            (this.x * (this.f * this.c - this.d * this.e));

        if (determinant === 0) {
            return result.copy(Matrix.Identity);
        }

        return result.set(
            ((this.z * this.d) - (this.y * this.f)) /  determinant,
            ((this.z * this.c) - (this.y * this.e)) / -determinant,
            ((this.f * this.c) - (this.d * this.e)) /  determinant,

            ((this.z * this.b) - (this.x * this.f)) / -determinant,
            ((this.z * this.a) - (this.x * this.e)) /  determinant,
            ((this.f * this.a) - (this.b * this.e)) / -determinant,

            ((this.y * this.b) - (this.x * this.d)) /  determinant,
            ((this.y * this.a) - (this.x * this.c)) / -determinant,
            ((this.d * this.a) - (this.b * this.c)) /  determinant
        );
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {Matrix}
     */
    translate(x, y = x) {
        return this.combine(Matrix.Temp.set(
            1, 0, x,
            0, 1, y,
            0, 0, 1
        ));
    }

    /**
     * @public
     * @chainable
     * @param {Number} angle
     * @param {Number} [centerX=0]
     * @param {Number} [centerY=centerX]
     * @returns {Matrix}
     */
    rotate(angle, centerX = 0, centerY = centerX) {
        const radian = degreesToRadians(angle),
            cos = Math.cos(radian),
            sin = Math.sin(radian);

        return this.combine(Matrix.Temp.set(
            cos, -sin, (centerX * (1 - cos)) + (centerY * sin),
            sin,  cos, (centerY * (1 - cos)) - (centerX * sin),
            0, 0, 1
        ));
    }

    /**
     * @public
     * @chainable
     * @param {Number} scaleX
     * @param {Number} [scaleY=scaleX]
     * @param {Number} [centerX=0]
     * @param {Number} [centerY=centerX]
     * @returns {Matrix}
     */
    scale(scaleX, scaleY = scaleX, centerX = 0, centerY = centerX) {
        return this.combine(Matrix.Temp.set(
            scaleX, 0, (centerX * (1 - scaleX)),
            0, scaleY, (centerY * (1 - scaleY)),
            0, 0, 1
        ));
    }

    /**
     * @public
     * @param {Boolean} [transpose=false]
     * @returns {Float32Array}
     */
    toArray(transpose = false) {
        const array = this._array || (this._array = new Float32Array(9));

        if (transpose) {
            array[0] = this.a; array[1] = this.b; array[2] = this.x;
            array[3] = this.c; array[4] = this.d; array[5] = this.y;
            array[6] = this.e; array[7] = this.f; array[8] = this.z;
        } else {
            array[0] = this.a; array[1] = this.c; array[2] = this.e;
            array[3] = this.b; array[4] = this.d; array[5] = this.f;
            array[6] = this.x; array[7] = this.y; array[8] = this.z;
        }

        return array;
    }

    /**
     * @public
     */
    destroy() {
        if (this._array) {
            this._array = null;
        }

        this.a = null; this.b = null; this.x = null;
        this.c = null; this.d = null; this.y = null;
        this.e = null; this.f = null; this.z = null;
    }
}

/**
 * @public
 * @static
 * @readonly
 * @member {Matrix}
 */
Matrix.Identity = new Matrix(
    1, 0, 0,
    0, 1, 0,
    0, 0, 1
);

/**
 * @public
 * @static
 * @constant
 * @member {Matrix}
 */
Matrix.Temp = new Matrix();
