/**
 * @class RC4
 */
export default class RC4 {

    /**
     * @constructor
     * @param {Number[]} keys
     */
    constructor(keys) {

        /**
         * @private
         * @member {Number}
         */
        this._i = 0;

        /**
         * @private
         * @member {Number}
         */
        this._j = 0;

        /**
         * @private
         * @member {Number[]}
         */
        this._keys = [];

        this.setKeys(keys);
    }

    /**
     * @public
     * @param {Number[]} keys
     */
    setKeys(keys) {
        const oldKeys = this._keys,
            newKeys = (keys && keys.length) || [1],
            len = newKeys.length,
            width = 256,
            mask = 255;

        this._i = 0;
        this._j = 0;

        oldKeys.length = 0;

        for (let i = 0; i < width; i++) {
            oldKeys[i] = i;
        }

        for (let i = 0, j = 0; i < width; i++) {
            const t = oldKeys[i];

            j = mask & (j + newKeys[i % len] + t);

            oldKeys[i] = oldKeys[j];
            oldKeys[j] = t;
        }

        this.next(width);
    }

    /**
     * @public
     * @param {Number} count
     * @returns {Number}
     */
    next(count) {
        const keys = this._keys;

        let c = count,
            result = 0,
            i = this._i,
            j = this._j,
            t;

        while (c--) {
            i = 255 & (i + 1);
            t = keys[i];
            j = 255 & (j + t);

            keys[i] = keys[j];
            keys[j] = t;

            result = (result * 256) + keys[255 & (keys[i] + keys[j])];
        }

        this._i = i;
        this._j = j;

        return result;
    }
}
