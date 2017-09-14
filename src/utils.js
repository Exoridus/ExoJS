import { DEG_TO_RAD, RAD_TO_DEG, CODEC_NOT_SUPPORTED, FILE_FORMATS, IMAGE_TYPES, TYPE_PATTERN } from './const';
import support from './support';

const audio = document.createElement('audio'),
    audioContext = support.webAudio ? new AudioContext() : null;

export const

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {...String} codecs
     * @returns {Boolean}
     */
    supportsCodec = (...codecs) => {
        for (const codec of codecs) {
            if (audio.canPlayType(codec)
                    .replace(CODEC_NOT_SUPPORTED, '')) {
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
    degreesToRadians = (degree) => degree * DEG_TO_RAD,

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} radian
     * @returns {Number}
     */
    radiansToDegrees = (radian) => radian * RAD_TO_DEG,

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} value
     * @param {Number} min
     * @param {Number} max
     * @returns {Number}
     */
    clamp = (value, min, max) => Math.min(Math.max(value, Math.min(max, value)), Math.max(min, max)),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} value
     * @returns {Boolean}
     */
    isPowerOfTwo = (value) => ((value !== 0) && ((value & (value - 1)) === 0)),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} value
     * @param {Number} min
     * @param {Number} max
     * @returns {Boolean}
     */
    inRange = (value, min, max) => (value >= Math.min(min, max)) && (value <= Math.max(min, max)),

    /**
     * @public
     * @constant
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
     * @constant
     * @type {Function}
     * @returns {String}
     */
    getFilename = (url) => url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('.')),

    /**
     * @public
     * @constant
     * @type {Function}
     * @returns {String}
     */
    getExtension = (url) => url.substring(url.lastIndexOf('.') + 1).toLowerCase(),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {ArrayBuffer} arrayBuffer
     * @returns {String}
     */
    determineMimeType = (arrayBuffer) => {
        const header = new Uint8Array(arrayBuffer);

        for (const type of TYPE_PATTERN) {
            if (header.length < type.pattern.length) {
                continue;
            }

            if (type.pattern.every((item, index) => (header[index] & type.mask[index]) === item)) {
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
     * @param {ArrayBuffer} arrayBuffer
     * @returns {Boolean}
     */
    matchesMP4Video = (arrayBuffer) => {
        const header = new Uint8Array(arrayBuffer),
            view = new DataView(arrayBuffer),
            boxSize = view.getUint32(0, false);

        if (header.length < 12 || header.length < boxSize || boxSize % 4 !== 0) {
            return false;
        }

        return String.fromCharCode(...header.subarray(4, 11)) === 'ftypmp4';
    },

    /**
     * @public
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
     * @param {WebGLRenderingContext} gl
     * @param {Number} type
     * @param {String} source
     * @returns {WebGLShader}
     */
    compileShader = (gl, type, source) => {
        const shader = gl.createShader(type);

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.log(gl.getShaderInfoLog(shader));

            return null;
        }

        return shader;
    },

    /**
     * @public
     * @constant
     * @param {WebGLRenderingContext} gl
     * @param {String} vertexSource
     * @param {String} fragmentSource
     * @returns {?WebGLProgram}
     */
    compileProgram = (gl, vertexSource, fragmentSource) => {
        const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource),
            fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource),
            program = gl.createProgram();

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);

        gl.linkProgram(program);

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.deleteProgram(program);

            console.error('gl.VALIDATE_STATUS', gl.getProgramParameter(program, gl.VALIDATE_STATUS));
            console.error('gl.getError()', gl.getError());

            if (gl.getProgramInfoLog(program)) {
                console.warn('gl.getProgramInfoLog()', gl.getProgramInfoLog(program));
            }

            return null;
        }

        return program;
    };
