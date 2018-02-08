const

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
    },

    /**
     * @private
     * @param {String} color
     * @param {Object} [options]
     * @param {HTMLCanvasElement} [options.canvas=document.createElement('canvas')]
     * @param {Number} [options.width=10]
     * @param {Number} [options.height=10]
     * @returns {HTMLCanvasElement}
     */
    createCanvas = function (color, { canvas = document.createElement('canvas'), width = 10, height = 10 } = {}) {
        const context = canvas.getContext('2d');

        canvas.width = width;
        canvas.height = height;

        context.fillStyle = color;
        context.fillRect(0, 0, width, height);

        return canvas;
    };

/**
 * @namespace Exo
 */
export {
    createQuadIndices,
    createCanvas,
};
