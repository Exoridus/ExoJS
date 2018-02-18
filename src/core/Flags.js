/**
 * @class Flags
 */
export default class Flags {

    /**
     * @constructor
     * @param {...Number} [flags]
     */
    constructor(...flags) {

        /**
         * @private
         * @member {Number}
         */
        this._value = 0;

        if (flags.length) {
            this.add(...flags);
        }
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get value() {
        return this._value;
    }

    /**
     * @public
     * @chainable
     * @param {...Number} flags
     * @returns {Flags}
     */
    add(...flags) {
        for (const flag of flags) {
            this._value |= flag;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {...Number} flags
     * @returns {Flags}
     */
    remove(...flags) {
        for (const flag of flags) {
            this._value &= ~flag;
        }

        return this;
    }

    /**
     * @public
     * @param {...Number} flags
     * @returns {Boolean}
     */
    has(...flags) {
        return flags.every((flag) => ((this._value & flag) !== 0));
    }

    /**
     * @public
     */
    destroy() {
        this._value = null;
    }
}
