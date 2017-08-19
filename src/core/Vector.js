/**
 * @class Vector
 * @memberof Exo
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
        this.x = x;

        /**
         * @public
         * @member {Number}
         */
        this.y = y;
    }

    /**
     * @public
     * @member {Number}
     */
    get magnitude() {
        return Math.sqrt((this.x * this.x) + (this.y * this.y));
    }

    set magnitude(value) {
        const direction = this.direction;

        this.x = Math.cos(direction) * value;
        this.y = Math.sin(direction) * value;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Exo.Vector}
     */
    set(x, y) {
        this.x = (typeof x === 'number') ? x : this.x;
        this.y = (typeof y === 'number') ? y : this.y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Vector|Number} x
     * @param {Number} y
     * @returns {Exo.Vector}
     */
    add(x, y) {
        if (x instanceof Exo.Vector) {
            this.x += x.x;
            this.y += x.y;

            return this;
        }

        this.x += (typeof x === 'number') ? x : 0;
        this.y += (typeof y === 'number') ? y : 0;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Vector|Number} x
     * @param {Number} y
     * @returns {Exo.Vector}
     */
    subtract(x, y) {
        if (x instanceof Exo.Vector) {
            this.x -= x.x;
            this.y -= x.y;

            return this;
        }

        this.x -= (typeof x === 'number') ? x : 0;
        this.y -= (typeof y === 'number') ? y : 0;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Vector|Number} x
     * @param {Number} y
     * @returns {Exo.Vector}
     */
    multiply(x, y) {
        if (x instanceof Exo.Vector) {
            this.x *= x.x;
            this.y *= x.y;

            return this;
        }

        this.x *= (typeof x === 'number') ? x : 1;
        this.y *= (typeof y === 'number') ? y : 1;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Vector|Number} x
     * @param {Number} y
     * @returns {Exo.Vector}
     */
    divide(x, y) {
        if (x instanceof Exo.Vector) {
            this.x /= x.x;
            this.y /= x.y;

            return this;
        }

        this.x /= (typeof x === 'number') ? x : 1;
        this.y /= (typeof y === 'number') ? y : 1;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Vector} vector
     * @returns {Exo.Vector}
     */
    min(vector) {
        this.x = Math.min(this.x, vector.x);
        this.y = Math.min(this.y, vector.y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Vector} vector
     * @returns {Exo.Vector}
     */
    max(vector) {
        this.x = Math.max(this.x, vector.x);
        this.y = Math.max(this.y, vector.y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.Vector}
     */
    normalize() {
        const mag = this.magnitude;

        this.x /= mag;
        this.y /= mag;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Vector} vector
     * @returns {Exo.Vector}
     */
    copy(vector) {
        this.x = vector.x;
        this.y = vector.y;

        return this;
    }

    /**
     * @public
     * @returns {Exo.Vector}
     */
    clone() {
        return new Vector(this.x, this.y);
    }

    /**
     * @public
     * @returns {Number[]}
     */
    toArray() {
        return [
            this.x,
            this.y,
        ];
    }

    /**
     * @public
     */
    destroy() {
        this.x = null;
        this.y = null;
    }
}
