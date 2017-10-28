import PerlinNoiseGenerator from './PerlinNoiseGenerator';

/**
 * @class MapGenerator
 */
export default class MapGenerator {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {PerlinNoiseGenerator}
         */
        this._noiseGenerator = new PerlinNoiseGenerator();

        /**
         * @private
         * @member {Number}
         */
        this._frequency = 1;

        /**
         * @private
         * @member {Number}
         */
        this._octaves = 16;
    }

    /**
     * @public
     * @param {Number} width
     * @param {Number} height
     * @returns {Number[]}
     */
    generate(width, height) {
        const particleMap = new Uint8Array(width * height),
            map = this._noiseGenerator.generate(width, height, this._frequency, this._octaves);

        for (let i = 0; i < ~~((width * height) * (0.85)); i++) {
            const choices = [];

            let x = MapGenerator.getRandomInt(15, width - 16),
                y = MapGenerator.getRandomInt(15, height - 16),
                choice;

            for (let j = 0; j < ~~((width * height) * (0.05)); j++) {
                const index = (y * width) + x,
                    currentValue = particleMap[index] = Math.max(0, Math.min(255, particleMap[index] + 7));

                choices.length = 0;

                if ((x - 1 > 0) && (particleMap[index - 1] <= currentValue)) {
                    choices.push({
                        x: -1,
                        y: 0,
                    });
                }

                if ((x + 1 < width - 1) && (particleMap[index + 1] <= currentValue)) {
                    choices.push({
                        x: 1,
                        y: 0,
                    });
                }

                if ((y - 1 > 0) && (particleMap[index - width] <= currentValue)) {
                    choices.push({
                        x: 0,
                        y: -1,
                    });
                }

                if ((y + 1 < height - 1) && (particleMap[index + width] <= currentValue)) {
                    choices.push({
                        x: 0,
                        y: 1,
                    });
                }

                if (choices.length === 0) {
                    break;
                }

                choice = MapGenerator.getRandomChoice(choices);

                x += choice.x;
                y += choice.y;
            }
        }

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width) + x;

                map[index] *= (particleMap[index] / 255);
            }
        }

        MapGenerator.smoothen(map, width, height);

        return map;
    }

    /**
     * @public
     * @static
     * @param {Number[]} map
     * @param {Number} width
     * @param {Number} height
     */
    static smoothen(map, width, height) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const lowX = x - 1,
                    highX = x + 1,
                    lowY = y - 1,
                    highY = y + 1;

                let average = 0,
                    times = 0;

                if (lowX >= 0) {
                    average += map[(y * width) + lowX];
                    times++;
                }

                if (highX < width - 1) {
                    average += map[(y * width) + highX];
                    times++;
                }

                if (lowY >= 0) {
                    average += map[(lowY * width) + x];
                    times++;
                }

                if (highY < height - 1) {
                    average += map[(highY * width) + x];
                    times++;
                }

                if (lowX >= 0 && lowY >= 0) {
                    average += map[(lowY * width) + lowX];
                    times++;
                }

                if (highX < width && lowY >= 0) {
                    average += map[(lowY * width) + highX];
                    times++;
                }

                if (lowX >= 0 && highY < height) {
                    average += map[(highY * width) + lowX];
                    times++;
                }

                if (highX < width && highY < height) {
                    average += map[(highY * width) + highX];
                    times++;
                }

                average += map[(y * width) + x];
                times++;

                map[(y * width) + x] = average / times;
            }
        }
    }

    /**
     * @public
     * @static
     * @param {Number} min
     * @param {Number} max
     * @returns {Number}
     */
    static getRandomInt(min, max) {
        return (Math._random() * (max - min + 1) | 0) + min;
    }

    /**
     * @public
     * @static
     * @param {Object[]} choices
     * @returns {Object}
     */
    static getRandomChoice(choices) {
        return choices[(Math._random() * choices.length) | 0];
    }
}
