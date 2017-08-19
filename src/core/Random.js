import RC4 from './RC4';

/**
 * @class Random
 * @memberof Exo
 */
export default class Random {

    /**
     * @public
     * @member {String}
     */
    get seed() {
        return this._seed;
    }

    set seed(value) {
        this._seed = (value === null) ? this.generateSeed() : value;
        this._rc4.setKeys(this.getMixedKeys(this.flatten(this._seed, 3), []));
    }

    /**
     * @constructor
     * @param {String} [seed]
     */
    constructor(seed) {

        /**
         * @private
         * @member {String}
         */
        this._seed = (typeof seed === 'undefined') ? this.generateSeed() : seed;

        /**
         * @private
         * @member {RC4}
         */
        this._rc4 = new RC4(this.getMixedKeys(this.flatten(this._seed, 3), []));
    }

    /**
     * @private
     * @param {*} obj
     * @param {Number} depth
     * @returns {String}
     */
    flatten(obj, depth) {
        const result = [];

        if (depth >= 0 && typeof obj === 'object') {
            Object.keys(obj).forEach((key) => {
                result.push(this.flatten(obj[key], depth - 1));
            });
        }

        if (result.length) {
            return this.arrayToString(result);
        }

        return (typeof obj === 'string') ? obj : `${obj}\0`;
    }

    /**
     * @private
     * @param {String} seed
     * @param {Array} keys
     * @returns {Array}
     */
    getMixedKeys(seed, keys) {
        const result = [],
            seedString = `${seed}`,
            len = seedString.length;

        let smear = 0;

        for (let i = 0; i < len; i++) {
            result[255 & i] = 255 & ((smear ^= keys[255 & i] * 19) + seedString.charCodeAt(i));
        }

        return result;
    }

    /**
     * @private
     * @returns {String}
     */
    generateSeed() {
        const seed = new Uint8Array(256);

        try {
            crypto.getRandomValues(seed);
        } catch (e) {
            seed.forEach((value, index) => {
                seed[index] = (Math.random() * 256) | 0;
            });
        }

        return this.arrayToString(seed);
    }

    /**
     * @private
     * @param {Uint8Array|Number[]} array
     * @returns {String}
     */
    arrayToString(array) {
        return String.fromCharCode(...array);
    }

    /**
     * @public
     * @param {Number} [min=0]
     * @param {Number} [max=1]
     * @returns {Number}
     */
    next(min = 0, max = 1) {
        const rc4 = this._rc4,
            significance = Math.pow(2, 52),
            overflow = significance * 2;

        let n = rc4.next(6),
            denom = Math.pow(256, 6),
            x = 0;

        while (n < significance) {
            n = (n + x) * 256;
            denom *= 256;
            x = rc4.next(1);
        }

        while (n >= overflow) {
            n /= 2;
            denom /= 2;
            x >>>= 1;
        }

        return (((n + x) / denom) * (max - min)) + min;
    }
}
