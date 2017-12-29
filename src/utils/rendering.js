const

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Uint16Array} data
     * @returns {ArrayBufferView}
     */
    setQuadIndices = (data) => {
        const len = data.length;

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
    setQuadIndices,
};
