import RC4 from './RC4';

/**
 * @class Random
 */
export default class Random {

    /**
     * @constructor
     * @param {String} [seed=Random.generateSeed()]
     */
    constructor(seed = Random.generateSeed()) {

        /**
         * @private
         * @member {String}
         */
        this._seed = seed;

        /**
         * @private
         * @member {RC4}
         */
        this._rc4 = new RC4(Random.getMixedKeys(this.flatten(seed)));
    }

    /**
     * @public
     * @member {String}
     */
    get seed() {
        return this._seed;
    }

    set seed(seed) {
        this._seed = seed;
        this._rc4.setKeys(Random.getMixedKeys(this.flatten(seed)));
    }

    /**
     * @private
     * @param {*} object
     * @param {Number} [depth=3]
     * @returns {String}
     */
    flatten(object, depth = 3) {
        const result = [];

        if (depth >= 0 && typeof object === 'object') {
            for (const value of Object.values(object)) {
                result.push(this.flatten(value, depth - 1));
            }
        }

        if (result.length) {
            return String.fromCharCode(...result);
        }

        return (typeof object === 'string') ? object : `${object}\0`;
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

    /**
     * @public
     */
    destroy() {
        this._seed = null;

        this._rc4.destroy();
        this._rc4 = null;
    }

    /**
     * @private
     * @static
     * @param {String} seed
     * @param {Number[]} [keys=[]]
     * @returns {Number[]}
     */
    static getMixedKeys(seed, keys = []) {
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
    static generateSeed() {
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
}
