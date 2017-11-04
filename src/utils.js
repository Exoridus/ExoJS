import { CODEC_NOT_SUPPORTED, FILE_TYPES, RAD_PER_DEG, DEG_PER_RAD } from './const';
import support from './support';

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
    };

export {
    audio,
    audioContext,
    supportsCodec,
    decodeAudioBuffer,
    degreesToRadians,
    radiansToDegrees,
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
};
