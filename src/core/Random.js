const limit = (2 ** 32) - 1;

/**
 * @class Random
 */
export default class Random {

    /**
     * @constructor
     * @param {Number} [seed]
     */
    constructor(seed) {

        /**
         * @private
         * @type {Number[]}
         */
        this._state = new Uint32Array(624);

        /**
         * @private
         * @type {Number}
         */
        this._iteration = 0;

        /**
         * @private
         * @type {?Number}
         */
        this._seed = null;

        /**
         * @private
         * @type {?Number}
         */
        this._value = null;

        this.seed = seed;

        this._twist();
    }

    /**
     * @public
     * @readonly
     * @member {?Number}
     */
    get seed() {
        return this._value;
    }

    set seed(seed) {
        this._seed = seed;
        this.reset();

        return this;
    }

    /**
     * @public
     * @readonly
     * @member {?Number}
     */
    get value() {
        return this._value;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get iteration() {
        return this._iteration;
    }

    /**
     * @public
     * @returns {Random}
     */
    reset() {
        this._state[0] = this._seed;

        for (let i = 1; i < 624; i++) {
            const s = this._state[i - 1] ^ (this._state[i - 1] >>> 30);

            this._state[i] = (((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253) + i;
            this._state[i] |= 0;
        }

        this._iteration = 0;

        return this;
    }

    /**
     * @public
     * @param {Number} [min=0]
     * @param {Number} [max=1]
     * @returns {Number}
     */
    next(min = 0, max = 1) {
        if (this._iteration >= 624) {
            this._twist();
        }

        this._value = this._state[this._iteration++];
        this._value ^= (this._value >>> 11);
        this._value ^= (this._value << 7) & 0x9d2c5680;
        this._value ^= (this._value << 15) & 0xefc60000;
        this._value ^= (this._value >>> 18);
        this._value = (((this._value >>> 0) / limit) * (max - min)) + min;

        return this._value;
    }

    /**
     * @private
     */
    _twist() {
        const state = this._state;

        // first 624-397=227 words
        for (let i = 0; i < 227; i++) {
            var bits = (state[i] & 0x80000000) | (state[i + 1] & 0x7fffffff);

            state[i] = state[i + 397] ^ (bits >>> 1) ^ ((bits & 1) * 0x9908b0df);
        }

        // remaining words (except the very last one)
        for (let i = 227; i < 623; i++) {
            var bits = (state[i] & 0x80000000) | (state[i + 1] & 0x7fffffff);

            state[i] = state[i - 227] ^ (bits >>> 1) ^ ((bits & 1) * 0x9908b0df);
        }

        // last word is computed pretty much the same way, but i + 1 must wrap around to 0
        var bits = (state[623] & 0x80000000) | (state[0] & 0x7fffffff);

        state[623] = state[396] ^ (bits >>> 1) ^ ((bits & 1) * 0x9908b0df);

        // word used for next random number
        this._iteration = 0;
        this._value = null;
    }
}
