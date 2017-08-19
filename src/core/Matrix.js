/**
 * | a | b | x |
 * | c | d | y |
 * | e | f | z |
 *
 * @class Matrix
 * @memberof Exo
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
    constructor(a = 1, b = 0, x = 0, c = 0, d = 1, y = 0, e = 0, f = 0, z = 1) {

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
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get array() {
        return this._array || (this._array = new Float32Array(9));
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
     * @returns {Exo.Matrix}
     */
    set(a, b, x, c, d, y, e, f, z) {
        this.a = a;
        this.b = b;
        this.x = x;
        this.c = c;
        this.d = d;
        this.y = y;
        this.e = e;
        this.f = f;
        this.z = z;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Matrix} matrix
     * @returns {Exo.Matrix}
     */
    copy(matrix) {
        return this.set(
            matrix.a, matrix.b, matrix.x,
            matrix.c, matrix.d, matrix.y,
            matrix.e, matrix.f, matrix.z
        );
    }

    /**
     * @public
     * @returns {Exo.Matrix}
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
     * @param {Exo.Matrix} matrix
     * @returns {Exo.Matrix}
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
     * @param {Boolean} [transpose=false]
     * @returns {Float32Array}
     */
    toArray(transpose = false) {
        const array = this.array;

        if (transpose) {
            array[0] = this.a;
            array[1] = this.b;
            array[2] = this.x;
            array[3] = this.c;
            array[4] = this.d;
            array[5] = this.y;
            array[6] = this.e;
            array[7] = this.f;
            array[8] = this.z;
        } else {
            array[0] = this.a;
            array[1] = this.c;
            array[2] = this.e;
            array[3] = this.b;
            array[4] = this.d;
            array[5] = this.f;
            array[6] = this.x;
            array[7] = this.y;
            array[8] = this.z;
        }

        return array;
    }

    /**
     * @public
     * @returns {Exo.Matrix}
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
     * @static
     * @param {Exo.Matrix[]|Exo.Matrix} matrices
     * @returns {Exo.Matrix}
     */
    static add(...matrices) {
        const result = new Matrix();

        matrices.forEach((matrix) => {
            result.add(matrix);
        });

        return result;
    }

    /**
     * @public
     * @static
     * @param {Exo.Matrix[]|Exo.Matrix} matrices
     * @returns {Exo.Matrix}
     */
    static subtract(...matrices) {
        const result = new Matrix();

        matrices.forEach((matrix) => {
            result.subtract(matrix);
        });

        return result;
    }

    /**
     * @public
     * @static
     * @param {Exo.Matrix[]|Exo.Matrix} matrices
     * @returns {Exo.Matrix}
     */
    static multiply(...matrices) {
        const result = new Matrix();

        matrices.forEach((matrix) => {
            result.multiply(matrix);
        });

        return result;
    }
}

/**
 * @public
 * @static
 * @readonly
 * @member {Exo.Matrix}
 */
Matrix.Identity = new Matrix();
