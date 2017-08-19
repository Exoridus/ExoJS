import Random from './Random';

/**
 * @static
 * @constant
 * @member {Function}
 * @memberof Exo.Utils
 */
export const emptyFunction = () => { /* do nothing */ },

    /**
     * @static
     * @constant
     * @member {Number}
     * @memberof Exo.Utils
     */
    TAU = Math.PI * 2,

    /**
     * @static
     * @constant
     * @member {Number}
     * @memberof Exo.Utils
     */
    DEG_TO_RAD = Math.PI / 180,

    /**
     * @static
     * @constant
     * @member {Number}
     * @memberof Exo.Utils
     */
    RAD_TO_DEG = 180 / Math.PI,

    /**
     * @static
     * @constant
     * @member {Random}
     * @memberof Exo.Utils
     */
    RNG = new Random(),

    /**
     * @static
     * @constant
     * @member {Boolean}
     * @memberof Exo.Utils
     */
    webGLSupported = (() => {
        const canvas = document.createElement('canvas'),
            supports = ('probablySupportsContext' in canvas) ? 'probablySupportsContext' : 'supportsContext';

        if (supports in canvas) {
            return canvas[supports]('webgl') || canvas[supports]('experimental-webgl');
        }

        return ('WebGLRenderingContext' in window);
    })(),

    /**
     * @static
     * @constant
     * @member {Boolean}
     * @memberof Exo.Utils
     */
    webAudioSupported = ('AudioContext' in window),

    /**
     * @static
     * @constant
     * @member {Boolean}
     * @memberof Exo.Utils
     */
    indexedDBSupported = ('indexedDB' in window),

    /**
     * @static
     * @constant
     * @member {Map<String, Boolean>}
     * @memberof Exo.Utils
     */
    supportedCodecs = (() => {
        const audio = new Audio(),
            regex = /^no$/,
            supports = (...codecs) => {
                let support = '';

                codecs.forEach((codec) => !(support = audio.canPlayType(codec)));

                return !!support.replace(regex, '');
            };

        return new Map([
            ['mp3', supports('audio/mpeg;', 'audio/mp3;')],
            ['mpeg', supports('audio/mpeg;')],
            ['opus', supports('audio/ogg; codecs="opus"')],
            ['ogg', supports('audio/ogg; codecs="vorbis"')],
            ['wav', supports('audio/wav; codecs="1"')],
            ['aac', supports('audio/aac;')],
            ['m4a', supports('audio/x-m4a;', 'audio/m4a;', 'audio/aac;')],
            ['mp4', supports('audio/x-mp4;', 'audio/mp4;', 'audio/aac;')],
            ['weba', supports('audio/webm; codecs="vorbis"')],
            ['webm', supports('audio/webm; codecs="vorbis"')],
        ]);
    })(),

    /**
     * @static
     * @constant
     * @member {Function}
     * @memberof Exo.Utils
     * @param {Number} degree
     * @returns {Number}
     */
    degreesToRadians = (degree) => degree * DEG_TO_RAD,

    /**
     * @static
     * @constant
     * @member {Function}
     * @memberof Exo.Utils
     * @param {Number} radian
     * @returns {Number}
     */
    radiansToDegrees = (radian) => radian * RAD_TO_DEG,

    /**
     * @static
     * @constant
     * @member {Function}
     * @memberof Exo.Utils
     * @param {Number} min
     * @param {Number} max
     * @returns {Number}
     */
    random = (min, max) => RNG.next(min, max),

    /**
     * @static
     * @constant
     * @member {Function}
     * @memberof Exo.Utils
     * @param {Number[]|Number} values
     * @returns {Number}
     */
    average = (...values) => values.reduce((sum, value) => sum + value, 0) / values.length,

    /**
     * @static
     * @constant
     * @member {Function}
     * @memberof Exo.Utils
     * @param {Number} value
     * @param {Number} min
     * @param {Number} max
     * @returns {Number}
     */
    clamp = (value, min, max) => Math.min(Math.max(value, Math.min(max, value)), Math.max(min, max)),

    /**
     * @static
     * @constant
     * @member {Function}
     * @memberof Exo.Utils
     * @param {Number} value
     * @returns {Boolean}
     */
    isPowerOfTwo = (value) => ((value !== 0) && ((value & (value - 1)) === 0)),

    /**
     * @static
     * @constant
     * @member {Function}
     * @memberof Exo.Utils
     * @param {Exo.Vector} vecA
     * @param {Exo.Vector} vecB
     * @returns {Number}
     */
    dotProduct = (vecA, vecB) => ((vecA.x * vecB.x) + (vecA.y * vecB.y)),

    /**
     * @static
     * @constant
     * @member {Function}
     * @memberof Exo.Utils
     * @param {Number} value
     * @param {Number} min
     * @param {Number} max
     * @returns {Boolean}
     */
    inRange = (value, min, max) => (value >= Math.min(min, max)) && (value <= Math.max(min, max)),

    /**
     * @static
     * @constant
     * @member {Function}
     * @memberof Exo.Utils
     * @param {Number} minA
     * @param {Number} maxA
     * @param {Number} minB
     * @param {Number} maxB
     * @returns {Boolean}
     */
    rangeIntersect = (minA, maxA, minB, maxB) => Math.max(minA, maxA) >= Math.min(minB, maxB) && Math.min(minA, maxB) <= Math.max(minB, maxB),

    /**
     * @static
     * @constant
     * @member {Function}
     * @memberof Exo.Utils
     * @param {Number} p
     * @param {Number} q
     * @param {Number} t
     * @returns {Number}
     */
    hueToRgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return (p + (q - p)) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return (p + (q - p)) * ((2 / 3) - t) * 6;

        return p;
    },

    /**
     * @static
     * @constant
     * @member {Function}
     * @memberof Exo.Utils
     * @param {Number} r
     * @param {Number} g
     * @param {Number} b
     * @returns {String}
     */
    rgbToHex = (r, g, b) => `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).substr(1)}`,

    /**
     * @static
     * @constant
     * @member {Function}
     * @memberof Exo.Utils
     * @param {Array} array
     * @param {Number} startIndex
     * @param {Number} amount
     */
    removeItems = (array, startIndex, amount) => {
        if (startIndex >= array.length || !amount) {
            return;
        }

        const length = array.length,
            removeCount = startIndex + amount > length ? length - startIndex : amount,
            newLen = length - removeCount;

        for (let i = startIndex; i < newLen; ++i) {
            array[i] = array[i + removeCount];
        }

        array.length = newLen;
    };
