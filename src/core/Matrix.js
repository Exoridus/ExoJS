import { degreesToRadians } from '../utils';

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
    constructor(
        a = 1, b = 0, x = 0,
        c = 0, d = 1, y = 0,
        e = 0, f = 0, z = 1
    ) {

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
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get array() {
        const array = this._array || (this._array = new Float32Array(9));

        array[0] = this.a;
        array[1] = this.c;
        array[2] = this.e;

        array[3] = this.b;
        array[4] = this.d;
        array[5] = this.f;

        array[6] = this.x;
        array[7] = this.y;
        array[8] = this.z;

        return array;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get transposedArray() {
        const array = this._array || (this._array = new Float32Array(9));

        array[0] = this.a;
        array[1] = this.b;
        array[2] = this.x;

        array[3] = this.c;
        array[4] = this.d;
        array[5] = this.y;

        array[6] = this.e;
        array[7] = this.f;
        array[8] = this.z;

        return array;
    }

    /**
     * | a | b | x |
     * | c | d | y |
     * | e | f | z |
     *
     * @public
     * @chainable
     * @param {Number} a
     * @param {Number} b
     * @param {Number} x
     * @param {Number} c
     * @param {Number} d
     * @param {Number} y
     * @param {Number} e
     * @param {Number} f
     * @param {Number} z
     * @returns {Matrix}
     */
    set(
        a = this.a, b = this.b, x = this.x,
        c = this.c, d = this.d, y = this.y,
        e = this.e, f = this.f, z = this.z
    ) {
        this.a = a; this.c = c; this.e = e;
        this.b = b; this.d = d; this.f = f;
        this.x = x; this.y = y; this.z = z;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Matrix} matrix
     * @returns {Matrix}
     */
    copy(matrix) {
        this.a = matrix.a; this.c = matrix.c; this.e = matrix.e;
        this.b = matrix.b; this.d = matrix.d; this.f = matrix.f;
        this.x = matrix.x; this.y = matrix.y; this.z = matrix.z;

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
     * @public
     * @chainable
     * @param {Matrix} matrix
     * @returns {Matrix}
     */
    multiply(matrix) {
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
     * @param {Vector} vector
     * @returns {Matrix}
     */
    translate(translation) {
        return this.multiply(new Matrix(
            1, 0, translation.x,
            0, 1, translation.y,
            0, 0, 1
        ));
    }

    /**
     * @public
     * @param {Number} angle
     * @returns {Matrix}
     */
    rotate(angle) {
        const radian = degreesToRadians(angle),
            cos = Math.cos(radian),
            sin = Math.sin(radian);

        return this.multiply(new Matrix(
            cos, -sin, 0,
            sin, cos, 0,
            0, 0, 1,
        ));
    }

    /**
     * @public
     * @param {Number} angle
     * @returns {Matrix}
     */
    scale(scale) {
        return this.multiply(new Matrix(
            scale.x, 0, 0,
            0, scale.y, 0,
            0, 0, 1
        ));
    }

    /**
     * @public
     * @returns {Matrix}
     */
    reset() {
        return this.set(
            1, 0, 0,
            0, 1, 0,
            0, 0, 1
        );
    }

    /**
     * @public
     * @param {Boolean} [transpose=false]
     * @returns {Float32Array}
     */
    toArray(transpose = false) {
        return transpose ? this.transposedArray : this.array;
    }

    /**
     * @public
     */
    destroy() {
        if (this._array) {
            this._array.fill(0);
            this._array = null;
        }

        this.a = null;
        this.b = null;
        this.x = null;

        this.c = null;
        this.d = null;
        this.y = null;

        this.e = null;
        this.f = null;
        this.z = null;
    }

    /**
     * @public
     * @static
     * @member {Matrix}
     */
    static get Identity() {
        return new Matrix(
            1, 0, 0,
            0, 1, 0,
            0, 0, 1
        );
    }
}
