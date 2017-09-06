import RC4 from './RC4';

/**
 * @class Random
 * @memberof Exo
 */
export default class Random {

    /**
     * @constructor
     * @param {String} [seed]
     */
    constructor(seed = this.generateSeed()) {

        /**
         * @private
         * @member {String}
         */
        this._seed = seed;

        /**
         * @private
         * @member {RC4}
         */
        this._rc4 = new RC4(this.getMixedKeys(this.flatten(this._seed, 3), []));
    }

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
     * @private
     * @param {*} obj
     * @param {Number} depth
     * @returns {String}
     */
    flatten(obj, depth) {
        const result = [];

        if (depth >= 0 && typeof obj === 'object') {
            for (const value of Object.values(obj)) {
                result.push(this.flatten(value, depth - 1));
            }
        }

        if (result.length) {
            return String.fromCharCode(...result);
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

        for (let i = 0, smear = 0; i < len; i++) {
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

        if (crypto) {
            crypto.getRandomValues(seed);
        } else {
            for (let i = 0; i < 256; i++) {
                seed[i] = (Math.random() * 256) & 255;
            }
        }

        return String.fromCharCode(...seed);
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
