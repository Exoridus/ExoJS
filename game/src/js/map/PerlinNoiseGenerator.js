/**
 * @class PerlinNoiseGenerator
 */
export default class PerlinNoiseGenerator {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {?Float32Array}
         */
        this._noise = null;

        /**
         * @private
         * @member {Number}
         */
        this._width = 0;

        /**
         * @private
         * @member {Number}
         */
        this._height = 0;
    }

    /**
     * @public
     * @param {Number} width
     * @param {Number} height
     * @param {Number} frequency
     * @param {Number} octaves
     * @returns {Number[]}
     */
    generate(width, height, frequency, octaves) {
        const result = [],
            length = width * height;

        if (!this._noise || width !== this._width || height !== this._height) {
            this._noise = new Float32Array(length);
            this._width = width;
            this._height = height;
        }

        for (let i = 0; i < length; i++) {
            this._noise[i] = Math.random();
        }

        for (let i = 0; i < length; i++) {
            result[i] = (this.turbulence((i % width) * frequency, (i / width) * frequency, octaves)) | 0;
        }

        return result;
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @param {Number} size
     * @returns {Number}
     */
    turbulence(x, y, size) {
        const initialSize = size;
        let value = 0;

        while (size >= 1) {
            value += this.getSmoothNoise(x / size, y / size) * size;
            size /= 2;
        }

        return 128 * value / initialSize;
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @returns {Number}
     */
    getSmoothNoise(x, y) {
        const noise = this._noise,
            width = this._width,
            height = this._height,
            roundX = ~~(x),
            roundY = ~~(y),
            fractalX = x - roundX,
            fractalY = y - roundY,
            x1 = (roundX + width) % width,
            y1 = (roundY + height) % height,
            x2 = (x1 + width - 1) % width,
            y2 = (y1 + height - 1) % height;

        let value = fractalX * fractalY * noise[(y1 * width) + x1];

        value += fractalX * (1 - fractalY) * noise[(y2 * width) + x1];
        value += (1 - fractalX) * fractalY * noise[(y1 * width) + x2];
        value += (1 - fractalX) * (1 - fractalY) * noise[(y2 * width) + x2];

        return value;
    }
}
