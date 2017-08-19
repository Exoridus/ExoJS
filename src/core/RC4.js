/**
 * @class RC4
 * @memberof Exo
 */
export default class RC4 {

    /**
     * @constructor
     * @param {Array} keys
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
         * @member {Array}
         */
        this._keys = [];

        this.setKeys(keys);
    }

    /**
     * @public
     * @param {Array} newKeys
     */
    setKeys(newKeys) {
        const keys = this._keys,
            width = 256,
            mask = 255;

        let len = newKeys.length,
            j = 0;

        this._i = 0;
        this._j = 0;

        keys.length = 0;

        if (!len) {
            newKeys = [len++];
        }

        for (let i = 0; i < width; i++) {
            keys[i] = i;
        }

        for (let i = 0; i < width; i++) {
            const t = keys[i];

            j = mask & (j + newKeys[i % len] + t);

            keys[i] = keys[j];
            keys[j] = t;
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

        let result = 0,
            i = this._i,
            j = this._j,
            t;

        while (count--) {
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
