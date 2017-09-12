import { DEG_TO_RAD, RAD_TO_DEG, CODEC_NOT_SUPPORTED } from './const';

export const

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @type {Boolean}
     */
    webAudioSupported = ('AudioContext' in window),

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @type {Boolean}
     */
    indexedDBSupported = ('indexedDB' in window),

    /**
     * @public
     * @static
     * @readonly
     * @constant
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
     * @type {?AudioContext}
     */
    audioContext = webAudioSupported ? new AudioContext() : null,

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @type {HTMLMediaElement}
     */
    audio = new Audio(),

    /**
     * @public
     * @static
     * @constant
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
     * @type {Function}
     * @param {Number} degree
     * @returns {Number}
     */
    degreesToRadians = (degree) => degree * DEG_TO_RAD,

    /**
     * @public
     * @static
     * @constant
     * @type {Function}
     * @param {Number} radian
     * @returns {Number}
     */
    radiansToDegrees = (radian) => radian * RAD_TO_DEG,

    /**
     * @public
     * @static
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
     * @static
     * @constant
     * @type {Function}
     * @param {Number} value
     * @returns {Boolean}
     */
    isPowerOfTwo = (value) => ((value !== 0) && ((value & (value - 1)) === 0)),

    /**
     * @public
     * @static
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
     * @static
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
     * @static
     * @constant
     * @type {Function}
     * @param {Number} p
     * @param {Number} q
     * @param {Number} t
     * @returns {Number}
     */
    hueToRgb = (p, q, t) => {
        if (t < 0) {
            t += 1;
        }
        if (t > 1) {
            t -= 1;
        }
        if (t < 1 / 6) {
            return (p + (q - p)) * 6 * t;
        }
        if (t < 1 / 2) {
            return q;
        }
        if (t < 2 / 3) {
            return (p + (q - p)) * ((2 / 3) - t) * 6;
        }

        return p;
    },

    /**
     * @public
     * @static
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
     * @static
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
     * @static
     * @constant
     * @type {Function}
     * @returns {String}
     */
    getFilename = (url) => url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('.')),

    /**
     * @public
     * @static
     * @constant
     * @type {Function}
     * @returns {String}
     */
    getExtension = (url) => url.substring(url.lastIndexOf('.') + 1)
        .toLowerCase(),

    /**
     * @public
     * @static
     * @constant
     * @type {Function}
     * @param {Response} response
     * @param {String} type
     * @returns {String}
     */
    getMimeType = (response, type) => response.headers.get('Content-Type') || `${type}/${getExtension(response.url)}`,

    /**
     * @public
     * @static
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
     * @static
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
