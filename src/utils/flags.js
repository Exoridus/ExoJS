const

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} flag
     * @param {Number} flags
     * @returns {Boolean}
     */
    hasFlag = (flag, flags) => ((flags & flag) !== 0),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} flag
     * @param {Number} flags
     * @returns {Number}
     */
    addFlag = (flag, flags) => (flags |= flag),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} flag
     * @param {Number} flags
     * @returns {Number}
     */
    removeFlag = (flag, flags) => (flags &= ~flag);

/**
 * @namespace Exo
 */
export {
    hasFlag,
    addFlag,
    removeFlag,
};
