import {DEG_TO_RAD, RAD_TO_DEG, SCALE_MODE, WRAP_MODE, CODEC_NOT_SUPPORTED} from './const';

export const

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @memberof Exo.utils
     * @type {Boolean}
     */
    webAudioSupported = ('AudioContext' in window),

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @memberof Exo.utils
     * @type {Boolean}
     */
    indexedDBSupported = ('indexedDB' in window),

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @memberof Exo.utils
     * @type {Boolean}
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
     * @public
     * @static
     * @readonly
     * @constant
     * @memberof Exo.utils
     * @type {?AudioContext}
     */
    audioContext = webAudioSupported ? new AudioContext() : null,

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @memberof Exo.utils
     * @type {HTMLMediaElement}
     */
    audio = new Audio(),

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {...String} codecs
     * @returns {Boolean}
     */
    isCodecSupported = (...codecs) => {
        for (const codec of codecs) {
            if (audio.canPlayType(codec).replace(CODEC_NOT_SUPPORTED, '')) {
                return true;
            }
        }

        return false;
    },

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Object.<String, Boolean>}
     */
    supportedAudioCodecs = {
        mp3: isCodecSupported('audio/mpeg;', 'audio/mp3;'),
        mpeg: isCodecSupported('audio/mpeg;'),
        opus: isCodecSupported('audio/ogg; codecs="opus"'),
        ogg: isCodecSupported('audio/ogg; codecs="vorbis"'),
        wav: isCodecSupported('audio/wav; codecs="1"'),
        aac: isCodecSupported('audio/aac;'),
        m4a: isCodecSupported('audio/x-m4a;', 'audio/m4a;', 'audio/aac;'),
        mp4: isCodecSupported('audio/x-mp4;', 'audio/mp4;', 'audio/aac;'),
        weba: isCodecSupported('audio/webm; codecs="vorbis"'),
        webm: isCodecSupported('audio/webm; codecs="vorbis"'),
    },

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {ArrayBuffer} arrayBuffer
     * @returns {Promise<AudioBuffer>}
     */
    decodeAudioBuffer = (arrayBuffer) => {
        if (!webAudioSupported) {
            return Promise.reject();
        }

        return new Promise((resolve, reject) => {
            audioContext.decodeAudioData(arrayBuffer, resolve, reject);
        });
    },

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {Number} degree
     * @returns {Number}
     */
    degreesToRadians = (degree) => degree * DEG_TO_RAD,

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {Number} radian
     * @returns {Number}
     */
    radiansToDegrees = (radian) => radian * RAD_TO_DEG,

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {...Number} values
     * @returns {Number}
     */
    average = (...values) => values.reduce((sum, value) => sum + value, 0) / values.length,

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {Number} value
     * @param {Number} min
     * @param {Number} max
     * @returns {Number}
     */
    clamp = (value, min, max) => Math.min(Math.max(value, Math.min(max, value)), Math.max(min, max)),

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {Number} value
     * @returns {Boolean}
     */
    isPowerOfTwo = (value) => ((value !== 0) && ((value & (value - 1)) === 0)),

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {Number} value
     * @param {Number} min
     * @param {Number} max
     * @returns {Boolean}
     */
    inRange = (value, min, max) => (value >= Math.min(min, max)) && (value <= Math.max(min, max)),

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {Number} minA
     * @param {Number} maxA
     * @param {Number} minB
     * @param {Number} maxB
     * @returns {Boolean}
     */
    rangeIntersect = (minA, maxA, minB, maxB) => Math.max(minA, maxA) >= Math.min(minB, maxB) && Math.min(minA, maxB) <= Math.max(minB, maxB),

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
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
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {Number} r
     * @param {Number} g
     * @param {Number} b
     * @param {Boolean} [prefixed=true]
     * @returns {String}
     */
    rgbToHex = (r, g, b, prefixed = true) => {
        const color = ((1 << 24) + (r << 16) + (g << 8) + b)
            .toString(16)
            .substr(1);

        return prefixed ? `#${color}` : color;
    },

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {Array} array
     * @param {Number} startIndex
     * @param {Number} amount
     */
    removeItems = (array, startIndex, amount) => {
        if (startIndex >= array.length || !amount) {
            return;
        }

        const length = array.length,
            removeCount = (startIndex + amount > length) ? (length - startIndex) : amount,
            newLen = (length - removeCount);

        for (let i = startIndex; i < newLen; i++) {
            array[i] = array[i + removeCount];
        }

        array.length = newLen;
    },

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {WebGLRenderingContext} gl
     * @param {Number} scaleMode
     * @returns {Number}
     */
    getScaleModeEnum = (gl, scaleMode) => (scaleMode === SCALE_MODE.LINEAR) ? gl.LINEAR : gl.NEAREST,

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {WebGLRenderingContext} gl
     * @param {Number} wrapMode
     * @returns {Number}
     */
    getWrapModeEnum = (gl, wrapMode) => {
        if (wrapMode === WRAP_MODE.CLAMP_TO_EDGE) {
            return gl.CLAMP_TO_EDGE;
        }

        return (wrapMode === WRAP_MODE.REPEAT) ? gl.REPEAT : gl.MIRRORED_REPEAT;
    },

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @returns {String}
     */
    getFilename = (url) => url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('.')),

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @returns {String}
     */
    getExtension = (url) => url.substring(url.lastIndexOf('.') + 1).toLowerCase(),

    /**
     * @public
     * @static
     * @constant
     * @memberof Exo.utils
     * @type {Function}
     * @param {Response} response
     * @param {String} type
     * @returns {?String}
     */
    getMimeType = (response, type) => response.headers.get('Content-Type') || `${type}/${getExtension(response.url)}`;