import { CODEC_NOT_SUPPORTED, FILE_TYPES, RAD_PER_DEG, DEG_PER_RAD, VORONOI } from './const';
import support from './support';
import Size from './math/Size';
import Random from './math/Random';

const

    /**
     * @inner
     * @constant
     * @type {Audio}
     */
    audio = new Audio(),

    /**
     * @inner
     * @constant
     * @type {AudioContext}
     */
    audioContext = support.webAudio ? new AudioContext() : null,

    /**
     * @inner
     * @constant
     * @type {HTMLCanvasElement}
     */
    canvas = document.createElement('canvas'),

    /**
     * @inner
     * @constant
     * @type {CanvasRenderingContext2D}
     */
    canvasContext = canvas.getContext('2d'),

    /**
     * @inner
     * @constant
     * @type {Random}
     */
    rng = new Random(),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {...String} codecs
     * @returns {Boolean}
     */
    supportsCodec = (...codecs) => {
        for (const codec of codecs) {
            if (audio.canPlayType(codec).replace(CODEC_NOT_SUPPORTED, '')) {
                return true;
            }
        }

        return false;
    },

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {ArrayBuffer} arrayBuffer
     * @returns {Promise<AudioBuffer>}
     */
    decodeAudioBuffer = (arrayBuffer) => {
        if (!support.webAudio) {
            return Promise.reject(Error('Web Audio is not supported!'));
        }

        return new Promise((resolve, reject) => {
            audioContext.decodeAudioData(arrayBuffer, resolve, reject);
        });
    },

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} degree
     * @returns {Number}
     */
    degreesToRadians = (degree) => degree * RAD_PER_DEG,

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} radian
     * @returns {Number}
     */
    radiansToDegrees = (radian) => radian * DEG_PER_RAD,

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} value
     * @param {Number} min
     * @param {Number} max
     * @returns {Number}
     */
    clamp = (value, min, max) => Math.min(max, Math.max(min, value)),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} value
     * @returns {Number}
     */
    sign = (value) => (
        value && (value < 0 ? -1 : 1)
    ),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Vector} line
     * @param {Vector} point
     * @returns {Number}
     */
    getVornoiRegion = (line, point) => {
        var dp = point.dot(line.x, line.y);

        if (dp < 0) {
            return VORONOI.LEFT;
        } else if (dp > line.len2) {
            return VORONOI.RIGHT;
        } else {
            return VORONOI.MIDDLE;
        }
    },

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} value
     * @returns {Boolean}
     */
    isPowerOfTwo = (value) => (
        (value !== 0) && ((value & (value - 1)) === 0)
    ),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} value
     * @param {Number} min
     * @param {Number} max
     * @returns {Boolean}
     */
    inRange = (value, min, max) => (
        (value >= Math.min(min, max)) && (value <= Math.max(min, max))
    ),

    /**
     * @public
     * @constant
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
     * @constant
     * @type {Function}
     * @param {Array} array
     * @param {Number} startIndex
     * @param {Number} amount
     */
    removeItems = (array, startIndex, amount) => {
        if (startIndex >= array.length || amount <= 0) {
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
     * @inner
     * @constant
     * @type {Function}
     * @param {ArrayBuffer} arrayBuffer
     * @returns {Boolean}
     */
    matchesMP4Video = (arrayBuffer) => {
        const header = new Uint8Array(arrayBuffer),
            view = new DataView(arrayBuffer),
            boxSize = view.getUint32(0, false);

        if (header.length < Math.max(12, boxSize) || boxSize % 4 !== 0) {
            return false;
        }

        return String.fromCharCode(...header.subarray(4, 11)) === 'ftypmp4';
    },

    /**
     * @inner
     * @constant
     * @type {Function}
     * @param {ArrayBuffer} arrayBuffer
     * @returns {Boolean}
     */
    matchesWebMVideo = (arrayBuffer) => {
        const header = new Uint8Array(arrayBuffer),
            matching = [0x1A, 0x45, 0xDF, 0xA3].every((byte, i) => (byte === header[i])),
            sliced = header.subarray(4, 4 + 4096),
            index = sliced.findIndex((el, i, arr) => (arr[i] === 0x42 && arr[i + 1] === 0x82));

        if (!matching || index === -1) {
            return false;
        }

        return String.fromCharCode(...sliced.subarray(index + 3, index + 7)) === 'webm';
    },

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {ArrayBuffer} arrayBuffer
     * @returns {String}
     */
    determineMimeType = (arrayBuffer) => {
        const header = new Uint8Array(arrayBuffer);

        if (!header.length) {
            throw new Error('Cannot determine mime type: No data.');
        }

        for (const type of FILE_TYPES) {
            if (header.length < type.pattern.length) {
                continue;
            }

            if (type.pattern.every((p, i) => (header[i] & type.mask[i]) === p)) {
                return type.mimeType;
            }
        }

        if (matchesMP4Video(arrayBuffer)) {
            return 'video/mp4';
        }

        if (matchesWebMVideo(arrayBuffer)) {
            return 'video/webm';
        }

        return 'text/plain';
    },

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
    removeFlag = (flag, flags) => (flags &= ~flag),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Event} event
     */
    stopEvent = (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
    },

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {HTMLMediaElement|HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} element
     * @returns {Number}
     */
    getMediaWidth = (element) => (element && (element.naturalWidth || element.videoWidth || element.width)) || 0,

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {HTMLMediaElement|HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} element
     * @returns {Number}
     */
    getMediaHeight = (element) => (element && (element.naturalHeight || element.videoHeight || element.height)) || 0,

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {HTMLMediaElement|HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} element
     * @returns {Size}
     */
    getMediaSize = (element) => new Size(getMediaWidth(element), getMediaHeight(element)),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} fromX
     * @param {Number} fromY
     * @param {Number} cpX1
     * @param {Number} cpY1
     * @param {Number} cpX2
     * @param {Number} cpY2
     * @param {Number} toX
     * @param {Number} toY
     * @param {Number[]} [path=[]]
     * @return {Number[]}
     */
    bezierCurveTo = (fromX, fromY, cpX1, cpY1, cpX2, cpY2, toX, toY, path = []) => {
        path.push(fromX, fromY);

        for (let i = 1, j = 0, dt1 = 0, dt2 = 0, dt3 = 0, t2 = 0, t3 = 0; i <= 20; i++) {
            j = i / 20;

            dt1 = (1 - j);
            dt2 = dt1 * dt1;
            dt3 = dt2 * dt1;

            t2 = j * j;
            t3 = t2 * j;

            path.push(
                (dt3 * fromX) + (3 * dt2 * j * cpX1) + (3 * dt1 * t2 * cpX2) + (t3 * toX),
                (dt3 * fromY) + (3 * dt2 * j * cpY1) + (3 * dt1 * t2 * cpY2) + (t3 * toY)
            );
        }

        return path;
    },

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} [min]
     * @param {Number} [max]
     * @return {Number}
     */
    random = (min, max) => rng.next(min, max),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {HTMLImageElement} image
     * @return {String}
     */
    imageToBase64 = (image) => {
        canvas.width = image.width;
        canvas.height = image.height;
        canvasContext.drawImage(image, 0,0);

        return canvas.toDataURL();
    };

export {
    audio,
    audioContext,
    canvas,
    canvasContext,
    rng,
    supportsCodec,
    decodeAudioBuffer,
    degreesToRadians,
    radiansToDegrees,
    getVornoiRegion,
    clamp,
    sign,
    isPowerOfTwo,
    inRange,
    rgbToHex,
    removeItems,
    determineMimeType,
    hasFlag,
    addFlag,
    removeFlag,
    stopEvent,
    getMediaWidth,
    getMediaHeight,
    getMediaSize,
    bezierCurveTo,
    random,
    imageToBase64,
};
