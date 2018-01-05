const

    /**
     * @public
     * @constant
     * @type {GeneratorFunction}
     * @param {ArrayBufferView|Number[]} pattern
     * @param {Number} size
     * @returns {Generator}
     */
    patternIterator = function* (pattern, size = Infinity) {
        for (let i = 0, len = pattern.length * size; i < len; i++) {
            yield pattern[i % pattern.length];
        }
    },

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} size
     * @returns {ArrayBufferView}
     */
    createQuadIndices = (size) => {
        const data = new Uint16Array(size * 6),
            len = data.length;

        for (let i = 0, offset = 0; i < len; i += 6, offset += 4) {
            data[i + 0] = offset + 0;
            data[i + 1] = offset + 1;
            data[i + 2] = offset + 2;
            data[i + 3] = offset + 0;
            data[i + 4] = offset + 2;
            data[i + 5] = offset + 3;
        }

        return data;
    };

/**
 * @namespace Exo
 */
export {
    createQuadIndices,
};
