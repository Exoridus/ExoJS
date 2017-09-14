var Exo =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 57);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});
var

/**
 * @public
 * @static
 * @readonly
 * @constant
 * @type {String}
 */
VERSION = exports.VERSION = "1.0.0",


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @type {Number}
 */
TAU = exports.TAU = Math.PI * 2,


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @type {Number}
 */
DEG_TO_RAD = exports.DEG_TO_RAD = Math.PI / 180,


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @type {Number}
 */
RAD_TO_DEG = exports.RAD_TO_DEG = 180 / Math.PI,


/**
 * @public
 * @constant
 * @name SHAPE
 * @type {Object<String, Number>}
 * @property {Number} NONE
 * @property {Number} POLYGON
 * @property {Number} RECTANGLE
 * @property {Number} CIRCLE
 * @property {Number} ELLIPSIS
 * @property {Number} POINT
 */
SHAPE = exports.SHAPE = {
    NONE: 0,
    POLYGON: 1,
    RECTANGLE: 2,
    CIRCLE: 3,
    ELLIPSIS: 4,
    POINT: 5
},


/**
 * @public
 * @constant
 * @name SCALE_MODE
 * @type {Object<String, Number>}
 * @property {Number} NEAREST
 * @property {Number} LINEAR
 */
SCALE_MODE = exports.SCALE_MODE = {
    NEAREST: 0x2600,
    LINEAR: 0x2601
},


/**
 * @public
 * @constant
 * @name WRAP_MODE
 * @type {Object<String, Number>}
 * @property {Number} REPEAT
 * @property {Number} CLAMP_TO_EDGE
 * @property {Number} MIRRORED_REPEAT
 */
WRAP_MODE = exports.WRAP_MODE = {
    REPEAT: 0x2901,
    CLAMP_TO_EDGE: 0x812F,
    MIRRORED_REPEAT: 0x8370
},


/**
 * @public
 * @constant
 * @name ATTRIBUTE_TYPE
 * @type {Object<String, Number>}
 * @property {Number} BYTE
 * @property {Number} UNSIGNED_BYTE
 * @property {Number} SHORT
 * @property {Number} UNSIGNED_SHORT
 * @property {Number} INT
 * @property {Number} UNSIGNED_INT
 * @property {Number} FLOAT
 */
ATTRIBUTE_TYPE = exports.ATTRIBUTE_TYPE = {
    BYTE: 0x1400,
    UNSIGNED_BYTE: 0x1401,
    SHORT: 0x1402,
    UNSIGNED_SHORT: 0x1403,
    INT: 0x1404,
    UNSIGNED_INT: 0x1405,
    FLOAT: 0x1406
},


/**
 * @public
 * @constant
 * @name INPUT_DEVICE
 * @type {Object<String, Number>}
 * @property {Number} KEYBOARD
 * @property {Number} MOUSE
 * @property {Number} GAMEPAD
 * @property {Number} POINTER
 */
INPUT_DEVICE = exports.INPUT_DEVICE = {
    KEYBOARD: 0,
    MOUSE: 1,
    GAMEPAD: 2,
    POINTER: 3
},


/**
 * @public
 * @constant
 * @name CHANNEL_LENGTH
 * @type {Object}
 * @property {Number} GLOBAL
 * @property {Number} DEVICE
 * @property {Number} CHILD
 */
CHANNEL_LENGTH = exports.CHANNEL_LENGTH = {
    GLOBAL: 1024,
    DEVICE: 256,
    CHILD: 32
},


/**
 * @public
 * @constant
 * @name CHANNEL_OFFSET
 * @type {Object<String, Number>}
 * @property {Number} KEYBOARD
 * @property {Number} MOUSE
 * @property {Number} GAMEPAD
 * @property {Number} POINTER
 */
CHANNEL_OFFSET = exports.CHANNEL_OFFSET = {
    KEYBOARD: INPUT_DEVICE.KEYBOARD * CHANNEL_LENGTH.DEVICE,
    MOUSE: INPUT_DEVICE.MOUSE * CHANNEL_LENGTH.DEVICE,
    GAMEPAD: INPUT_DEVICE.GAMEPAD * CHANNEL_LENGTH.DEVICE,
    POINTER: INPUT_DEVICE.POINTER * CHANNEL_LENGTH.DEVICE
},


/**
 * @public
 * @constant
 * @name UNIFORM_TYPE
 * @type {Object<String, Number>}
 * @property {Number} INT
 * @property {Number} FLOAT
 * @property {Number} FLOAT_VEC2
 * @property {Number} FLOAT_VEC3
 * @property {Number} FLOAT_VEC4
 * @property {Number} INT_VEC2
 * @property {Number} INT_VEC3
 * @property {Number} INT_VEC4
 * @property {Number} BOOL
 * @property {Number} BOOL_VEC2
 * @property {Number} BOOL_VEC3
 * @property {Number} BOOL_VEC4
 * @property {Number} FLOAT_MAT2
 * @property {Number} FLOAT_MAT3
 * @property {Number} FLOAT_MAT4
 * @property {Number} SAMPLER_2D
 */
UNIFORM_TYPE = exports.UNIFORM_TYPE = {
    INT: 0x1404,
    INT_VEC2: 0x8B53,
    INT_VEC3: 0x8B54,
    INT_VEC4: 0x8B55,

    FLOAT: 0x1406,
    FLOAT_VEC2: 0x8B50,
    FLOAT_VEC3: 0x8B51,
    FLOAT_VEC4: 0x8B52,

    BOOL: 0x8B56,
    BOOL_VEC2: 0x8B57,
    BOOL_VEC3: 0x8B58,
    BOOL_VEC4: 0x8B59,

    FLOAT_MAT2: 0x8B5A,
    FLOAT_MAT3: 0x8B5B,
    FLOAT_MAT4: 0x8B5C,

    SAMPLER_2D: 0x8B5E
},


/**
 * @public
 * @constant
 * @name BLEND_MODE
 * @type {Object<String, Number>}
 * @property {Number} SOURCE_OVER
 * @property {Number} ADD
 * @property {Number} MULTIPLY
 * @property {Number} SCREEN
 * @property {Number} OVERLAY
 * @property {Number} DARKEN
 * @property {Number} LIGHTEN
 * @property {Number} COLOR_DODGE
 * @property {Number} COLOR_BURN
 * @property {Number} HARD_LIGHT
 * @property {Number} SOFT_LIGHT
 * @property {Number} DIFFERENCE
 * @property {Number} EXCLUSION
 * @property {Number} HUE
 * @property {Number} SATURATION
 * @property {Number} COLOR
 * @property {Number} LUMINOSITY
 */
BLEND_MODE = exports.BLEND_MODE = {
    SOURCE_OVER: 0,
    ADD: 1,
    MULTIPLY: 2,
    SCREEN: 3,
    OVERLAY: 4,
    DARKEN: 5,
    LIGHTEN: 6,
    COLOR_DODGE: 7,
    COLOR_BURN: 8,
    HARD_LIGHT: 9,
    SOFT_LIGHT: 10,
    DIFFERENCE: 11,
    EXCLUSION: 12,
    HUE: 13,
    SATURATION: 14,
    COLOR: 15,
    LUMINOSITY: 16
},


/**
 * @public
 * @constant
 * @name DATABASE_TYPES
 * @type {String[]}
 */
DATABASE_TYPES = exports.DATABASE_TYPES = ['arrayBuffer', 'audioBuffer', 'audio', 'blob', 'font', 'image', 'json', 'music', 'sound', 'string'],


/**
 * @public
 * @constant
 * @name CODEC_NOT_SUPPORTED
 * @type {RegExp}
 */
CODEC_NOT_SUPPORTED = exports.CODEC_NOT_SUPPORTED = /^no$/,


/**
 * @public
 * @constant
 * @name NEWLINE
 * @type {RegExp}
 */
NEWLINE = exports.NEWLINE = /(?:\r\n|\r|\n)/,
    TYPE_PATTERN = exports.TYPE_PATTERN = [{
    mimeType: 'image/x-icon',
    pattern: [0x00, 0x00, 0x01, 0x00],
    mask: [0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'image/x-icon',
    pattern: [0x00, 0x00, 0x02, 0x00],
    mask: [0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'image/bmp',
    pattern: [0x42, 0x4D],
    mask: [0xFF, 0xFF]
}, {
    mimeType: 'image/gif',
    pattern: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'image/gif',
    pattern: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'image/webp',
    pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'image/png',
    pattern: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'image/jpeg',
    pattern: [0xFF, 0xD8, 0xFF],
    mask: [0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'audio/basic',
    pattern: [0x2E, 0x73, 0x6E, 0x64],
    mask: [0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'audio/mpeg',
    pattern: [0x49, 0x44, 0x33],
    mask: [0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'audio/wave',
    pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'audio/midi',
    pattern: [0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'audio/aiff',
    pattern: [0x46, 0x4F, 0x52, 0x4D, 0x00, 0x00, 0x00, 0x00, 0x41, 0x49, 0x46, 0x46],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'video/avi',
    pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'application/ogg',
    pattern: [0x4F, 0x67, 0x67, 0x53, 0x00],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
}];

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.compileProgram = exports.compileShader = exports.matchesWebMVideo = exports.matchesMP4Video = exports.determineMimeType = exports.getExtension = exports.getFilename = exports.removeItems = exports.rgbToHex = exports.rangeIntersect = exports.inRange = exports.isPowerOfTwo = exports.clamp = exports.radiansToDegrees = exports.degreesToRadians = exports.decodeAudioBuffer = exports.supportsCodec = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _const = __webpack_require__(0);

var _support = __webpack_require__(5);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var audio = document.createElement('audio'),
    audioContext = _support2.default.webAudio ? new AudioContext() : null;

var

/**
 * @public
 * @constant
 * @type {Function}
 * @param {...String} codecs
 * @returns {Boolean}
 */
supportsCodec = exports.supportsCodec = function supportsCodec() {
    for (var _len = arguments.length, codecs = Array(_len), _key = 0; _key < _len; _key++) {
        codecs[_key] = arguments[_key];
    }

    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
        for (var _iterator = codecs[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var codec = _step.value;

            if (audio.canPlayType(codec).replace(_const.CODEC_NOT_SUPPORTED, '')) {
                return true;
            }
        }
    } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
    } finally {
        try {
            if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
            }
        } finally {
            if (_didIteratorError) {
                throw _iteratorError;
            }
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
decodeAudioBuffer = exports.decodeAudioBuffer = function decodeAudioBuffer(arrayBuffer) {
    if (!_support2.default.webAudio) {
        return Promise.reject(Error('Web Audio is not supported!'));
    }

    return new Promise(function (resolve, reject) {
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
degreesToRadians = exports.degreesToRadians = function degreesToRadians(degree) {
    return degree * _const.DEG_TO_RAD;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} radian
 * @returns {Number}
 */
radiansToDegrees = exports.radiansToDegrees = function radiansToDegrees(radian) {
    return radian * _const.RAD_TO_DEG;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} value
 * @param {Number} min
 * @param {Number} max
 * @returns {Number}
 */
clamp = exports.clamp = function clamp(value, min, max) {
    return Math.min(Math.max(value, Math.min(max, value)), Math.max(min, max));
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} value
 * @returns {Boolean}
 */
isPowerOfTwo = exports.isPowerOfTwo = function isPowerOfTwo(value) {
    return value !== 0 && (value & value - 1) === 0;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} value
 * @param {Number} min
 * @param {Number} max
 * @returns {Boolean}
 */
inRange = exports.inRange = function inRange(value, min, max) {
    return value >= Math.min(min, max) && value <= Math.max(min, max);
},


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
rangeIntersect = exports.rangeIntersect = function rangeIntersect(minA, maxA, minB, maxB) {
    return Math.max(minA, maxA) >= Math.min(minB, maxB) && Math.min(minA, maxB) <= Math.max(minB, maxB);
},


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
rgbToHex = exports.rgbToHex = function rgbToHex(r, g, b) {
    var prefixed = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;

    var color = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).substr(1);

    return prefixed ? '#' + color : color;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Array} array
 * @param {Number} startIndex
 * @param {Number} amount
 */
removeItems = exports.removeItems = function removeItems(array, startIndex, amount) {
    if (startIndex >= array.length || !amount) {
        return;
    }

    var length = array.length,
        removeCount = startIndex + amount > length ? length - startIndex : amount,
        newLen = length - removeCount;

    for (var i = startIndex; i < newLen; i++) {
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
getFilename = exports.getFilename = function getFilename(url) {
    return url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('.'));
},


/**
 * @public
 * @constant
 * @type {Function}
 * @returns {String}
 */
getExtension = exports.getExtension = function getExtension(url) {
    return url.substring(url.lastIndexOf('.') + 1).toLowerCase();
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {ArrayBuffer} arrayBuffer
 * @returns {String}
 */
determineMimeType = exports.determineMimeType = function determineMimeType(arrayBuffer) {
    var header = new Uint8Array(arrayBuffer);

    var _loop = function _loop(type) {
        if (header.length < type.pattern.length) {
            return 'continue';
        }

        if (type.pattern.every(function (item, index) {
            return (header[index] & type.mask[index]) === item;
        })) {
            return {
                v: type.mimeType
            };
        }
    };

    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
        for (var _iterator2 = _const.TYPE_PATTERN[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
            var type = _step2.value;

            var _ret = _loop(type);

            switch (_ret) {
                case 'continue':
                    continue;

                default:
                    if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
            }
        }
    } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
    } finally {
        try {
            if (!_iteratorNormalCompletion2 && _iterator2.return) {
                _iterator2.return();
            }
        } finally {
            if (_didIteratorError2) {
                throw _iteratorError2;
            }
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
matchesMP4Video = exports.matchesMP4Video = function matchesMP4Video(arrayBuffer) {
    var header = new Uint8Array(arrayBuffer),
        view = new DataView(arrayBuffer),
        boxSize = view.getUint32(0, false);

    if (header.length < 12 || header.length < boxSize || boxSize % 4 !== 0) {
        return false;
    }

    return String.fromCharCode.apply(String, _toConsumableArray(header.subarray(4, 11))) === 'ftypmp4';
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Boolean}
 */
matchesWebMVideo = exports.matchesWebMVideo = function matchesWebMVideo(arrayBuffer) {
    var header = new Uint8Array(arrayBuffer),
        matching = [0x1A, 0x45, 0xDF, 0xA3].every(function (byte, i) {
        return byte === header[i];
    }),
        sliced = header.subarray(4, 4 + 4096),
        index = sliced.findIndex(function (el, i, arr) {
        return arr[i] === 0x42 && arr[i + 1] === 0x82;
    });

    if (!matching || index === -1) {
        return false;
    }

    return String.fromCharCode.apply(String, _toConsumableArray(sliced.subarray(index + 3, index + 7))) === 'webm';
},


/**
 * @public
 * @constant
 * @param {WebGLRenderingContext} gl
 * @param {Number} type
 * @param {String} source
 * @returns {WebGLShader}
 */
compileShader = exports.compileShader = function compileShader(gl, type, source) {
    var shader = gl.createShader(type);

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
compileProgram = exports.compileProgram = function compileProgram(gl, vertexSource, fragmentSource) {
    var vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource),
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

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Shape2 = __webpack_require__(9);

var _Shape3 = _interopRequireDefault(_Shape2);

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Vector
 * @extends {Shape}
 */
var Vector = function (_Shape) {
    _inherits(Vector, _Shape);

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     */
    function Vector() {
        var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

        _classCallCheck(this, Vector);

        /**
         * @public
         * @member {Number}
         */
        var _this = _possibleConstructorReturn(this, (Vector.__proto__ || Object.getPrototypeOf(Vector)).call(this));

        _this._x = x;

        /**
         * @public
         * @member {Number}
         */
        _this._y = y;
        return _this;
    }

    /**
     * @override
     */


    _createClass(Vector, [{
        key: 'set',


        /**
         * @override
         */
        value: function set() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._x;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._y;

            this._x = x;
            this._y = y;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(vector) {
            this._x = vector.x;
            this._y = vector.y;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new Vector(this._x, this._y);
        }

        /**
         * @override
         */

    }, {
        key: 'reset',
        value: function reset() {
            this.set(0, 0);
        }

        /**
         * @override
         */

    }, {
        key: 'toArray',
        value: function toArray() {
            var array = this._array || (this._array = new Float32Array(2));

            array[0] = this._x;
            array[1] = this._y;

            return array;
        }

        /**
         * @override
         */

    }, {
        key: 'getBounds',
        value: function getBounds() {
            if (!this._bounds) {
                this._bounds = new _Rectangle2.default();
            }

            return this._bounds.set(this._x, this._y, 0, 0);
        }

        /**
         * @override
         */

    }, {
        key: 'contains',
        value: function contains(shape) {
            return shape.type === _const.SHAPE.POINT && this._x === shape.x && this._y === shape.y;
        }

        /**
         * @public
         * @param {Vector} vector
         * @returns {Number}
         */

    }, {
        key: 'distanceTo',
        value: function distanceTo(vector) {
            var x = this._x - vector.x,
                y = this._y - vector.y;

            return Math.sqrt(x * x + y * y);
        }

        /**
         * @public
         * @chainable
         * @param {Number} [x=0]
         * @param {Number} [y=0]
         * @returns {Vector}
         */

    }, {
        key: 'add',
        value: function add() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

            this._x += x;
            this._y += y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} [x=0]
         * @param {Number} [y=0]
         * @returns {Vector}
         */

    }, {
        key: 'subtract',
        value: function subtract() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

            this._x -= x;
            this._y -= y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} [x=1]
         * @param {Number} [y=1]
         * @returns {Vector}
         */

    }, {
        key: 'multiply',
        value: function multiply() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

            this._x *= x;
            this._y *= y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} [x=1]
         * @param {Number} [y=1]
         * @returns {Vector}
         */

    }, {
        key: 'divide',
        value: function divide() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

            this._x /= x;
            this._y /= y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Vector}
         */

    }, {
        key: 'normalize',
        value: function normalize() {
            var mag = this.magnitude;

            this._x /= mag;
            this._y /= mag;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Vector.prototype.__proto__ || Object.getPrototypeOf(Vector.prototype), 'destroy', this).call(this);

            this._x = null;
            this._y = null;
        }
    }, {
        key: 'type',
        get: function get() {
            return _const.SHAPE.POINT;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'x',
        get: function get() {
            return this._x;
        },
        set: function set(x) {
            this._x = x;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'y',
        get: function get() {
            return this._y;
        },
        set: function set(y) {
            this._y = y;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'magnitude',
        get: function get() {
            return Math.sqrt(this._x * this._x + this._y * this._y);
        }
    }]);

    return Vector;
}(_Shape3.default);

exports.default = Vector;

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Shape2 = __webpack_require__(9);

var _Shape3 = _interopRequireDefault(_Shape2);

var _utils = __webpack_require__(1);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Rectangle
 * @extends {Shape}
 */
var Rectangle = function (_Shape) {
    _inherits(Rectangle, _Shape);

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     * @param {Number} [width=1]
     * @param {Number} [height=1]
     */
    function Rectangle() {
        var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        var width = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;
        var height = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;

        _classCallCheck(this, Rectangle);

        /**
         * @public
         * @member {Vector}
         */
        var _this = _possibleConstructorReturn(this, (Rectangle.__proto__ || Object.getPrototypeOf(Rectangle)).call(this));

        _this._position = new _Vector2.default(x, y);

        /**
         * @public
         * @member {Vector}
         */
        _this._size = new _Vector2.default(width, height);
        return _this;
    }

    /**
     * @override
     */


    _createClass(Rectangle, [{
        key: 'set',


        /**
         * @override
         */
        value: function set(x, y, width, height) {
            this._position.set(x, y);
            this._size.set(width, height);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(rectangle) {
            this._position.copy(rectangle.position);
            this._size.copy(rectangle.size);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new Rectangle(this.x, this.y, this.width, this.height);
        }

        /**
         * @override
         */

    }, {
        key: 'reset',
        value: function reset() {
            this.set(0, 0, 1, 1);
        }

        /**
         * @override
         */

    }, {
        key: 'toArray',
        value: function toArray() {
            var array = this._array || (this._array = new Float32Array(4));

            array[0] = this.x;
            array[1] = this.y;
            array[2] = this.width;
            array[3] = this.height;

            return array;
        }

        /**
         * @override
         */

    }, {
        key: 'getBounds',
        value: function getBounds() {
            if (!this._bounds) {
                this._bounds = new Rectangle();
            }

            return this._bounds.copy(this);
        }

        /**
         * @override
         */

    }, {
        key: 'contains',
        value: function contains(shape) {
            switch (shape.type) {
                case _const.SHAPE.POINT:
                    return (0, _utils.inRange)(shape.x, this.left, this.right) && (0, _utils.inRange)(shape.y, this.top, this.bottom);
                case _const.SHAPE.CIRCLE:
                    return this.contains(shape.bounds);
                case _const.SHAPE.RECTANGLE:
                    return (0, _utils.inRange)(shape.left, this.left, this.right) && (0, _utils.inRange)(shape.right, this.left, this.right) && (0, _utils.inRange)(shape.top, this.top, this.bottom) && (0, _utils.inRange)(shape.bottom, this.top, this.bottom);
                case _const.SHAPE.POLYGON:
                default:
                    return false;
            }

            throw new Error('Passed item is not a valid shape!', shape);
        }

        /**
         * @override
         */

    }, {
        key: 'intersects',
        value: function intersects(shape) {
            switch (shape.type) {
                case _const.SHAPE.POINT:
                    return this.contains(shape);
                case _const.SHAPE.CIRCLE:
                    return this.intersects(shape.bounds);
                case _const.SHAPE.RECTANGLE:
                    return (0, _utils.rangeIntersect)(this.left, this.right, shape.left, shape.right) && (0, _utils.rangeIntersect)(this.top, this.bottom, shape.top, shape.bottom);
                case _const.SHAPE.POLYGON:
                default:
                    return false;
            }

            throw new Error('Passed item is not a valid shape!', shape);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Rectangle.prototype.__proto__ || Object.getPrototypeOf(Rectangle.prototype), 'destroy', this).call(this);

            this._position.destroy();
            this._position = null;

            this._size.destroy();
            this._size = null;
        }
    }, {
        key: 'type',
        get: function get() {
            return _const.SHAPE.RECTANGLE;
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'position',
        get: function get() {
            return this._position;
        },
        set: function set(position) {
            this._position.copy(position);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'x',
        get: function get() {
            return this._position.x;
        },
        set: function set(x) {
            this._position.x = x;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'y',
        get: function get() {
            return this._position.y;
        },
        set: function set(y) {
            this._position.y = y;
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(size) {
            this._size.copy(size);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return this._size.x;
        },
        set: function set(width) {
            this._size.x = width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._size.y;
        },
        set: function set(height) {
            this._size.y = height;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'left',
        get: function get() {
            return this.x;
        },
        set: function set(left) {
            this.x = left;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'right',
        get: function get() {
            return this.x + this.width;
        },
        set: function set(right) {
            this.x = right - this.width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'top',
        get: function get() {
            return this.y;
        },
        set: function set(top) {
            this.y = top;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'bottom',
        get: function get() {
            return this.y + this.height;
        },
        set: function set(bottom) {
            this.y = bottom - this.height;
        }
    }]);

    return Rectangle;
}(_Shape3.default);

exports.default = Rectangle;

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _const = __webpack_require__(0);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.default = {

    /**
     * @static
     * @type {Object}
     * @property {String} basePath=''
     * @property {Number} width=800
     * @property {Number} height=600
     * @property {Number} soundVolume=1
     * @property {Number} musicVolume=1
     * @property {Number} masterVolume=1
     * @property {Number} videoVolume=1
     * @property {?HTMLCanvasElement|?String} canvas=null
     * @property {?HTMLCanvasElement|?String} canvasParent=null
     * @property {Color} clearColor=Color.White
     * @property {Boolean} clearBeforeRender=true
     * @property {Object} contextOptions
     * @property {Boolean} contextOptions.alpha=false
     * @property {Boolean} contextOptions.antialias=false
     * @property {Boolean} contextOptions.premultipliedAlpha=false
     * @property {Boolean} contextOptions.preserveDrawingBuffer=false
     * @property {Boolean} contextOptions.stencil=false
     * @property {Boolean} contextOptions.depth=false
     */
    GAME_CONFIG: {
        basePath: '',
        width: 800,
        height: 600,
        soundVolume: 1,
        musicVolume: 1,
        masterVolume: 1,
        videoVolume: 1,
        canvas: null,
        canvasParent: null,
        clearColor: _Color2.default.White,
        clearBeforeRender: true,
        contextOptions: {
            alpha: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            stencil: false,
            depth: false
        }
    },

    /**
     * @public
     * @static
     * @type {Number}
     * @default WRAP_MODE.CLAMP_TO_EDGE
     */
    WRAP_MODE: _const.WRAP_MODE.CLAMP_TO_EDGE,

    /**
     * @public
     * @static
     * @type {Number}
     * @default SCALE_MODE.LINEAR
     */
    SCALE_MODE: _const.SCALE_MODE.LINEAR,

    /**
     * @public
     * @static
     * @type {Boolean}
     * @default true
     */
    PREMULTIPLY_ALPHA: true,

    /**
     * @public
     * @static
     * @type {Object}
     */
    TEXT_STYLE: {
        align: 'left',
        fill: 'black',
        stroke: 'black',
        strokeThickness: 0,
        fontSize: 20,
        fontWeight: 'bold',
        fontFamily: 'Arial',
        wordWrap: false,
        wordWrapWidth: 100,
        baseline: 'alphabetic',
        lineJoin: 'miter',
        miterLimit: 10,
        padding: 0
    },

    /**
     * @public
     * @static
     * @type {String}
     * @default 'image/png'
     */
    MIME_TYPE_IMAGE: 'image/png',

    /**
     * @public
     * @static
     * @type {String}
     * @default 'audio/ogg'
     */
    MIME_TYPE_AUDIO: 'audio/ogg',

    /**
     * @public
     * @static
     * @type {String}
     * @default 'video/ogg'
     */
    MIME_TYPE_VIDEO: 'video/ogg',

    /**
     * @public
     * @static
     * @type {Number}
     * @default 5
     */
    QUAD_TREE_MAX_LEVEL: 5,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 10
     */
    QUAD_TREE_MAX_ENTITIES: 10,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 2500
     */
    SPRITE_BATCH_SIZE: 2500,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 5000
     */
    PARTICLE_BATCH_SIZE: 5000
};

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = {

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    webAudio: 'AudioContext' in window,

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    indexedDB: 'indexedDB' in window,

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    webGL: function () {
        var canvas = document.createElement('canvas'),
            supports = 'probablySupportsContext' in canvas ? 'probablySupportsContext' : 'supportsContext';

        if (supports in canvas) {
            return canvas[supports]('webgl') || canvas[supports]('experimental-webgl');
        }

        return 'WebGLRenderingContext' in window;
    }()
};

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(7);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ChannelHandler
 * @extends {EventEmitter}
 */
var ChannelHandler = function (_EventEmitter) {
    _inherits(ChannelHandler, _EventEmitter);

    /**
     * @constructor
     * @param {ArrayBuffer} channelBuffer
     * @param {Number} offset
     * @param {Number} length
     */
    function ChannelHandler(channelBuffer, offset, length) {
        _classCallCheck(this, ChannelHandler);

        /**
         * @private
         * @member {ArrayBuffer}
         */
        var _this = _possibleConstructorReturn(this, (ChannelHandler.__proto__ || Object.getPrototypeOf(ChannelHandler)).call(this));

        _this._channelBuffer = channelBuffer;

        /**
         * @private
         * @member {Float32Array}
         */
        _this._channels = new Float32Array(channelBuffer, offset * 4, length);
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {ArrayBuffer}
     */


    _createClass(ChannelHandler, [{
        key: 'resetChannels',


        /**
         * @public
         */
        value: function resetChannels() {
            this._channels.fill(0);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(ChannelHandler.prototype.__proto__ || Object.getPrototypeOf(ChannelHandler.prototype), 'destroy', this).call(this);

            this.resetChannels();

            this._channelBuffer = null;
            this._channels = null;
        }
    }, {
        key: 'channelBuffer',
        get: function get() {
            return this._channelBuffer;
        }

        /**
         * @public
         * @readonly
         * @member {Float32Array}
         */

    }, {
        key: 'channels',
        get: function get() {
            return this._channels;
        }
    }]);

    return ChannelHandler;
}(_EventEmitter3.default);

exports.default = ChannelHandler;

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = __webpack_require__(1);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class EventEmitter
 */
var EventEmitter = function () {

    /**
     * @constructor
     */
    function EventEmitter() {
        _classCallCheck(this, EventEmitter);

        /**
         * @private
         * @member {Map<String, Object[]>}
         */
        this._events = new Map();
    }

    /**
     * @public
     * @readonly
     * @member {Map<String, Object[]>}
     */


    _createClass(EventEmitter, [{
        key: 'on',


        /**
         * @public
         * @chainable
         * @param {String} event
         * @param {Function} callback
         * @param {*} [context=this]
         * @returns {EventEmitter}
         */
        value: function on(event, callback) {
            var context = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : this;

            if (!this._events) {
                return this;
            }

            var events = this._events.get(event);

            if (!events) {
                this._events.set(event, [{
                    callback: callback,
                    context: context
                }]);
            } else {
                events.push({
                    callback: callback,
                    context: context
                });
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} event
         * @param {Function} callback
         * @param {*} [context=this]
         * @returns {EventEmitter}
         */

    }, {
        key: 'once',
        value: function once(event, callback) {
            var _this = this;

            var context = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : this;

            var once = function once() {
                for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
                    args[_key] = arguments[_key];
                }

                _this.off(event, once, context);
                callback.call.apply(callback, [context].concat(args));
            };

            return this.on(event, once, context);
        }

        /**
         * @public
         * @chainable
         * @param {String} [event='*']
         * @param {Function} [callback]
         * @param {*} [context]
         * @returns {EventEmitter}
         */

    }, {
        key: 'off',
        value: function off() {
            var event = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '*';
            var callback = arguments[1];
            var context = arguments[2];

            if (!this._events) {
                return this;
            }

            var mapping = this._events,
                names = event === '*' ? Object.keys(mapping) : [event],
                lenNames = names.length;

            for (var i = 0; i < lenNames; i++) {
                var name = names[i],
                    events = mapping.get(name);

                /**
                 * Break for loop because only the one passed
                 * event name can be wrong / not available.
                 */
                if (!events) {
                    break;
                }

                if (!events.length) {
                    mapping.delete(name);
                    continue;
                }

                if (!callback && !context) {
                    (0, _utils.removeItems)(events, 0, events.length);
                    mapping.delete(name);
                    continue;
                }

                for (var j = events.length - 1; j >= 0; j--) {
                    if (callback && callback !== events[j].callback) {
                        continue;
                    }

                    if (context && context !== events[j].context) {
                        continue;
                    }

                    (0, _utils.removeItems)(events, j, 1);
                }

                if (!events.length) {
                    mapping.delete(name);
                }
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} event
         * @param {...*} args
         * @returns {EventEmitter}
         */

    }, {
        key: 'trigger',
        value: function trigger(event) {
            if (!this._events) {
                return this;
            }

            var events = this._events.get(event);

            if (events) {
                for (var _len2 = arguments.length, args = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                    args[_key2 - 1] = arguments[_key2];
                }

                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = events[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var _event$callback;

                        var _event = _step.value;

                        (_event$callback = _event.callback).call.apply(_event$callback, [_event.context].concat(args));
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion && _iterator.return) {
                            _iterator.return();
                        }
                    } finally {
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }
            }

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            if (this._events.size) {
                var _iteratorNormalCompletion2 = true;
                var _didIteratorError2 = false;
                var _iteratorError2 = undefined;

                try {
                    for (var _iterator2 = this._events.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                        var events = _step2.value;
                        var _iteratorNormalCompletion3 = true;
                        var _didIteratorError3 = false;
                        var _iteratorError3 = undefined;

                        try {
                            for (var _iterator3 = events[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                                var event = _step3.value;

                                event.callback = null;
                                event.context = null;
                            }
                        } catch (err) {
                            _didIteratorError3 = true;
                            _iteratorError3 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion3 && _iterator3.return) {
                                    _iterator3.return();
                                }
                            } finally {
                                if (_didIteratorError3) {
                                    throw _iteratorError3;
                                }
                            }
                        }

                        events.length = 0;
                    }
                } catch (err) {
                    _didIteratorError2 = true;
                    _iteratorError2 = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion2 && _iterator2.return) {
                            _iterator2.return();
                        }
                    } finally {
                        if (_didIteratorError2) {
                            throw _iteratorError2;
                        }
                    }
                }
            }
            this._events.clear();
            this._events = null;
        }
    }, {
        key: 'events',
        get: function get() {
            return this._events;
        }
    }]);

    return EventEmitter;
}();

exports.default = EventEmitter;

/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = __webpack_require__(1);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Color
 */
var Color = function () {

  /**
   * @constructor
   * @param {Number} [r=0]
   * @param {Number} [g=0]
   * @param {Number} [b=0]
   * @param {Number} [a=1]
   */
  function Color() {
    var r = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    var g = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    var b = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    var a = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;

    _classCallCheck(this, Color);

    /**
     * @private
     * @member {Number}
     */
    this._r = r & 255;

    /**
     * @private
     * @member {Number}
     */
    this._g = g & 255;

    /**
     * @private
     * @member {Number}
     */
    this._b = b & 255;

    /**
     * @private
     * @member {Number}
     */
    this._a = (0, _utils.clamp)(a, 0, 1);

    /**
     * @private
     * @member {Float32Array} _array
     */
  }

  /**
   * @public
   * @member {Number}
   */


  _createClass(Color, [{
    key: 'set',


    /**
     * @public
     * @chainable
     * @param {Number} [r]
     * @param {Number} [g]
     * @param {Number} [b]
     * @param {Number} [a]
     * @returns {Color}
     */
    value: function set() {
      var r = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._r;
      var g = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._g;
      var b = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : this._b;
      var a = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : this._a;

      this.r = r;
      this.g = g;
      this.b = b;
      this.a = a;

      return this;
    }

    /**
     * @public
     * @returns {Object<String, Number>}
     */

  }, {
    key: 'getHsl',
    value: function getHsl() {
      var r = this.r / 255,
          g = this.g / 255,
          b = this.b / 255,
          min = Math.min(r, g, b),
          max = Math.max(r, g, b),
          d = max - min,
          l = (max + min) / 2;

      var h = 0,
          s = 0;

      if (max !== min) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
          case r:
            h = (g - b) / (d + (g < b ? 6 : 0));
            break;
          case g:
            h = (b - r) / (d + 2);
            break;
          case b:
            h = (r - g) / (d + 4);
            break;
        }

        h /= 6;
      }

      return {
        h: h,
        s: s,
        l: l
      };
    }

    /**
     * @public
     * @chainable
     * @param {Number} h
     * @param {Number} s
     * @param {Number} l
     * @returns {Color}
     */

  }, {
    key: 'setHsl',
    value: function setHsl(h, s, l) {
      if (s === 0) {
        this.r = this.g = this.b = 255;
      } else {
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s,
            p = 2 * l - q;

        this.r = this._hueToRgb(p, q, h + 1 / 3) * 255;
        this.g = this._hueToRgb(p, q, h) * 255;
        this.b = this._hueToRgb(p, q, h - 1 / 3) * 255;
      }

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} percentage
     * @returns {Color}
     */

  }, {
    key: 'darken',
    value: function darken(percentage) {
      var value = Math.round(255 / 100 * percentage);

      this.r = Math.max(0, this.r - value);
      this.g = Math.max(0, this.g - value);
      this.b = Math.max(0, this.b - value);

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} percentage
     * @returns {Color}
     */

  }, {
    key: 'lighten',
    value: function lighten(percentage) {
      var value = Math.round(255 / 100 * percentage);

      this.r = Math.min(255, this.r + value);
      this.g = Math.min(255, this.g + value);
      this.b = Math.min(255, this.b + value);

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Color} color
     * @returns {Color}
     */

  }, {
    key: 'copy',
    value: function copy(color) {
      this._r = color.r;
      this._g = color.g;
      this._b = color.b;
      this._a = color.a;

      return this;
    }

    /**
     * @public
     * @returns {Color}
     */

  }, {
    key: 'clone',
    value: function clone() {
      return new Color(this._r, this._g, this._b, this._a);
    }

    /**
     * @public
     * @returns {Boolean}
     * @param {Color} color
     * @param {Boolean} [ignoreAlpha=false]
     */

  }, {
    key: 'equals',
    value: function equals(color) {
      var ignoreAlpha = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

      return this._r === color.r && this._g === color.g && this._b === color.b && (ignoreAlpha || this._a === color.a);
    }

    /**
     * @public
     * @param {Boolean} [normalized=false]
     * @returns {Float32Array}
     */

  }, {
    key: 'toArray',
    value: function toArray() {
      var normalized = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

      return normalized ? this.normalizedArray : this.array;
    }

    /**
     * @public
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      if (this._array) {
        this._array = null;
      }

      this._r = null;
      this._g = null;
      this._b = null;
      this._a = null;
    }

    /**
     * @private
     * @param {Number} p
     * @param {Number} q
     * @param {Number} t
     * @returns {Number}
     */

  }, {
    key: '_hueToRgb',
    value: function _hueToRgb(p, q, t) {
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
        return (p + (q - p)) * (2 / 3 - t) * 6;
      }

      return p;
    }
  }, {
    key: 'r',
    get: function get() {
      return this._r;
    },
    set: function set(red) {
      this._r = red & 255;
    }

    /**
     * @public
     * @member {Number}
     */

  }, {
    key: 'g',
    get: function get() {
      return this._g;
    },
    set: function set(green) {
      this._g = green & 255;
    }

    /**
     * @public
     * @member {Number}
     */

  }, {
    key: 'b',
    get: function get() {
      return this._b;
    },
    set: function set(blue) {
      this._b = blue & 255;
    }

    /**
     * @public
     * @member {Number}
     */

  }, {
    key: 'a',
    get: function get() {
      return this._a;
    },
    set: function set(alpha) {
      this._a = (0, _utils.clamp)(alpha, 0, 1);
    }

    /**
     * @public
     * @member {Number}
     */

  }, {
    key: 'rgb',
    get: function get() {
      return ((this._r & 255) << 16) + ((this._g & 255) << 8) + (this._b & 255);
    },
    set: function set(rgb) {
      this._r = rgb >> 16 & 255;
      this._g = rgb >> 8 & 255;
      this._b = rgb & 255;
    }

    /**
     * @public
     * @member {Number}
     */

  }, {
    key: 'rgba',
    get: function get() {
      return ((this._a * 255 | 0) << 24) + (this._b << 16) + (this._g << 8) + this._r >>> 0;
    },
    set: function set(rgba) {
      this._a = (rgba >> 24 & 255) / 255;
      this._r = rgba >> 16 & 255;
      this._g = rgba >> 8 & 255;
      this._b = rgba & 255;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */

  }, {
    key: 'hex',
    get: function get() {
      return (0, _utils.rgbToHex)(this._r, this._g, this._b);
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */

  }, {
    key: 'array',
    get: function get() {
      var array = this._array || (this._array = new Float32Array(4));

      array[0] = this._r;
      array[1] = this._g;
      array[2] = this._b;
      array[3] = this._a;

      return array;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */

  }, {
    key: 'normalizedArray',
    get: function get() {
      var array = this._array || (this._array = new Float32Array(4));

      array[0] = this._r / 255;
      array[1] = this._g / 255;
      array[2] = this._b / 255;
      array[3] = this._a;

      return array;
    }
  }]);

  return Color;
}();

/**
 * @public
 * @static
 * @member {Color}
 */


exports.default = Color;
Color.AliceBlue = new Color(240, 248, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.AntiqueWhite = new Color(250, 235, 215, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Aqua = new Color(0, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Aquamarine = new Color(127, 255, 212, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Azure = new Color(240, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Beige = new Color(245, 245, 220, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Bisque = new Color(255, 228, 196, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Black = new Color(0, 0, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.BlanchedAlmond = new Color(255, 235, 205, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Blue = new Color(0, 0, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.BlueViolet = new Color(138, 43, 226, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Brown = new Color(165, 42, 42, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.BurlyWood = new Color(222, 184, 135, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.CadetBlue = new Color(95, 158, 160, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Chartreuse = new Color(127, 255, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Chocolate = new Color(210, 105, 30, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Coral = new Color(255, 127, 80, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.CornflowerBlue = new Color(100, 149, 237, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Cornsilk = new Color(255, 248, 220, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Crimson = new Color(220, 20, 60, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Cyan = new Color(0, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkBlue = new Color(0, 0, 139, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkCyan = new Color(0, 139, 139, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkGoldenrod = new Color(184, 134, 11, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkGray = new Color(169, 169, 169, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkGreen = new Color(0, 100, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkKhaki = new Color(189, 183, 107, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkMagenta = new Color(139, 0, 139, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkOliveGreen = new Color(85, 107, 47, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkOrange = new Color(255, 140, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkOrchid = new Color(153, 50, 204, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkRed = new Color(139, 0, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkSalmon = new Color(233, 150, 122, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkSeaGreen = new Color(143, 188, 139, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkSlateBlue = new Color(72, 61, 139, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkSlateGray = new Color(47, 79, 79, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkTurquoise = new Color(0, 206, 209, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkViolet = new Color(148, 0, 211, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DeepPink = new Color(255, 20, 147, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DeepSkyBlue = new Color(0, 191, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DimGray = new Color(105, 105, 105, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DodgerBlue = new Color(30, 144, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Firebrick = new Color(178, 34, 34, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.FloralWhite = new Color(255, 250, 240, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.ForestGreen = new Color(34, 139, 34, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Fuchsia = new Color(255, 0, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Gainsboro = new Color(220, 220, 220, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.GhostWhite = new Color(248, 248, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Gold = new Color(255, 215, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Goldenrod = new Color(218, 165, 32, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Gray = new Color(128, 128, 128, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Green = new Color(0, 128, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.GreenYellow = new Color(173, 255, 47, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Honeydew = new Color(240, 255, 240, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.HotPink = new Color(255, 105, 180, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.IndianRed = new Color(205, 92, 92, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Indigo = new Color(75, 0, 130, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Ivory = new Color(255, 255, 240, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Khaki = new Color(240, 230, 140, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Lavender = new Color(230, 230, 250, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LavenderBlush = new Color(255, 240, 245, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LawnGreen = new Color(124, 252, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LemonChiffon = new Color(255, 250, 205, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightBlue = new Color(173, 216, 230, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightCoral = new Color(240, 128, 128, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightCyan = new Color(224, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightGoldenrodYellow = new Color(250, 250, 210, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightGray = new Color(211, 211, 211, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightGreen = new Color(144, 238, 144, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightPink = new Color(255, 182, 193, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightSalmon = new Color(255, 160, 122, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightSeaGreen = new Color(32, 178, 170, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightSkyBlue = new Color(135, 206, 250, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightSlateGray = new Color(119, 136, 153, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightSteelBlue = new Color(176, 196, 222, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightYellow = new Color(255, 255, 224, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Lime = new Color(0, 255, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LimeGreen = new Color(50, 205, 50, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Linen = new Color(250, 240, 230, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Magenta = new Color(255, 0, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Maroon = new Color(128, 0, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumAquamarine = new Color(102, 205, 170, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumBlue = new Color(0, 0, 205, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumOrchid = new Color(186, 85, 211, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumPurple = new Color(147, 112, 219, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumSeaGreen = new Color(60, 179, 113, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumSlateBlue = new Color(123, 104, 238, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumSpringGreen = new Color(0, 250, 154, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumTurquoise = new Color(72, 209, 204, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumVioletRed = new Color(199, 21, 133, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MidnightBlue = new Color(25, 25, 112, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MintCream = new Color(245, 255, 250, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MistyRose = new Color(255, 228, 225, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Moccasin = new Color(255, 228, 181, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.NavajoWhite = new Color(255, 222, 173, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Navy = new Color(0, 0, 128, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.OldLace = new Color(253, 245, 230, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Olive = new Color(128, 128, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.OliveDrab = new Color(107, 142, 35, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Orange = new Color(255, 165, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.OrangeRed = new Color(255, 69, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Orchid = new Color(218, 112, 214, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PaleGoldenrod = new Color(238, 232, 170, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PaleGreen = new Color(152, 251, 152, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PaleTurquoise = new Color(175, 238, 238, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PaleVioletRed = new Color(219, 112, 147, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PapayaWhip = new Color(255, 239, 213, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PeachPuff = new Color(255, 218, 185, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Peru = new Color(205, 133, 63, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Pink = new Color(255, 192, 203, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Plum = new Color(221, 160, 221, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PowderBlue = new Color(176, 224, 230, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Purple = new Color(128, 0, 128, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Red = new Color(255, 0, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.RosyBrown = new Color(188, 143, 143, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.RoyalBlue = new Color(65, 105, 225, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SaddleBrown = new Color(139, 69, 19, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Salmon = new Color(250, 128, 114, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SandyBrown = new Color(244, 164, 96, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SeaGreen = new Color(46, 139, 87, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SeaShell = new Color(255, 245, 238, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Sienna = new Color(160, 82, 45, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Silver = new Color(192, 192, 192, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SkyBlue = new Color(135, 206, 235, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SlateBlue = new Color(106, 90, 205, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SlateGray = new Color(112, 128, 144, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Snow = new Color(255, 250, 250, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SpringGreen = new Color(0, 255, 127, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SteelBlue = new Color(70, 130, 180, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Tan = new Color(210, 180, 140, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Teal = new Color(0, 128, 128, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Thistle = new Color(216, 191, 216, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Tomato = new Color(255, 99, 71, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.TransparentBlack = new Color(0, 0, 0, 0);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.TransparentWhite = new Color(255, 255, 255, 0);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Turquoise = new Color(64, 224, 208, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Violet = new Color(238, 130, 238, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Wheat = new Color(245, 222, 179, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.White = new Color(255, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.WhiteSmoke = new Color(245, 245, 245, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Yellow = new Color(255, 255, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.YellowGreen = new Color(154, 205, 50, 1);

/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @abstract
 * @class Shape
 */
var Shape = function () {
    function Shape() {
        _classCallCheck(this, Shape);
    }

    _createClass(Shape, [{
        key: 'set',


        /**
         * @public
         * @chainable
         * @abstract
         */
        value: function set() {
            throw new Error('Method not implemented!');
        }

        /**
         * @public
         * @abstract
         * @param {Shape|Vector|Rectangle|Cirlce|Polygon} shape
         */

    }, {
        key: 'copy',
        value: function copy(shape) {
            throw new Error('Method not implemented!');
        }

        /**
         * @public
         * @abstract
         * @returns {Shape|Vector|Rectangle|Cirlce|Polygon}
         */

    }, {
        key: 'clone',
        value: function clone() {
            throw new Error('Method not implemented!');
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'reset',
        value: function reset() {
            throw new Error('Method not implemented!');
        }

        /**
         * @public
         * @abstract
         * @returns {Float32Array}
         */

    }, {
        key: 'toArray',
        value: function toArray() {
            throw new Error('Method not implemented!');
        }

        /**
         * @public
         * @abstract
         * @returns {Rectangle}
         */

    }, {
        key: 'getBounds',
        value: function getBounds() {
            throw new Error('Method not implemented!');
        }

        /**
         * @public
         * @abstract
         * @param {Shape|Vector|Rectangle|Cirlce|Polygon} shape
         * @returns {Boolean}
         */

    }, {
        key: 'contains',
        value: function contains(shape) {
            throw new Error('Method not implemented!');
        }

        /**
         * @public
         * @abstract
         * @param {Shape|Vector|Rectangle|Cirlce|Polygon} shape
         * @returns {Boolean}
         */

    }, {
        key: 'intersects',
        value: function intersects(shape) {
            throw new Error('Method not implemented!');
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            if (this._array) {
                this._array.fill(0);
                this._array = null;
            }

            if (this._bounds) {
                this._bounds.destroy();
                this._bounds = null;
            }
        }
    }, {
        key: 'type',


        /**
         * @private
         * @member {Float32Array} _array
         */

        /**
         * @private
         * @member {Rectangle} _bounds
         */

        /**
         * @public
         * @abstract
         * @readonly
         * @member {Number}
         */
        get: function get() {
            return _const.SHAPE.NONE;
        }

        /**
         * @public
         * @abstract
         * @readonly
         * @member {Rectangle}
         */

    }, {
        key: 'bounds',
        get: function get() {
            return this.getBounds();
        }

        /**
         * @public
         * @abstract
         * @readonly
         * @member {Float32Array}
         */

    }, {
        key: 'array',
        get: function get() {
            return this.toArray();
        }
    }]);

    return Shape;
}();

exports.default = Shape;

/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * | a | b | x |
 * | c | d | y |
 * | e | f | z |
 *
 * @class Matrix
 */
var Matrix = function () {

    /**
     * @constructor
     * @param {Number} [a=1]
     * @param {Number} [b=0]
     * @param {Number} [x=0]
     * @param {Number} [c=0]
     * @param {Number} [d=1]
     * @param {Number} [y=0]
     * @param {Number} [e=0]
     * @param {Number} [f=0]
     * @param {Number} [z=1]
     */
    function Matrix() {
        var a = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
        var b = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        var x = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
        var c = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;
        var d = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 1;
        var y = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : 0;
        var e = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : 0;
        var f = arguments.length > 7 && arguments[7] !== undefined ? arguments[7] : 0;
        var z = arguments.length > 8 && arguments[8] !== undefined ? arguments[8] : 1;

        _classCallCheck(this, Matrix);

        /**
         * @public
         * @member {Number}
         */
        this.a = a;

        /**
         * @public
         * @member {Number}
         */
        this.b = b;

        /**
         * @public
         * @member {Number}
         */
        this.x = x;

        /**
         * @public
         * @member {Number}
         */
        this.c = c;

        /**
         * @public
         * @member {Number}
         */
        this.d = d;

        /**
         * @public
         * @member {Number}
         */
        this.y = y;

        /**
         * @public
         * @member {Number}
         */
        this.e = e;

        /**
         * @public
         * @member {Number}
         */
        this.f = f;

        /**
         * @public
         * @member {Number}
         */
        this.z = z;

        /**
         * @private
         * @member {Float32Array} _array
         */
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */


    _createClass(Matrix, [{
        key: "set",


        /**
         * | a | b | x |
         * | c | d | y |
         * | e | f | z |
         *
         * @public
         * @chainable
         * @param {Number} a
         * @param {Number} b
         * @param {Number} x
         * @param {Number} c
         * @param {Number} d
         * @param {Number} y
         * @param {Number} e
         * @param {Number} f
         * @param {Number} z
         * @returns {Matrix}
         */
        value: function set(a, b, x, c, d, y, e, f, z) {
            this.a = a;
            this.b = b;
            this.x = x;
            this.c = c;
            this.d = d;
            this.y = y;
            this.e = e;
            this.f = f;
            this.z = z;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Matrix} matrix
         * @returns {Matrix}
         */

    }, {
        key: "copy",
        value: function copy(matrix) {
            return this.set(matrix.a, matrix.b, matrix.x, matrix.c, matrix.d, matrix.y, matrix.e, matrix.f, matrix.z);
        }

        /**
         * @public
         * @returns {Matrix}
         */

    }, {
        key: "clone",
        value: function clone() {
            return new Matrix(this.a, this.b, this.x, this.c, this.d, this.y, this.e, this.f, this.z);
        }

        /**
         * @public
         * @chainable
         * @param {Matrix} matrix
         * @returns {Matrix}
         */

    }, {
        key: "multiply",
        value: function multiply(matrix) {
            return this.set(this.a * matrix.a + this.c * matrix.b + this.e * matrix.x, this.b * matrix.a + this.d * matrix.b + this.f * matrix.x, this.x * matrix.a + this.y * matrix.b + this.z * matrix.x, this.a * matrix.c + this.c * matrix.d + this.e * matrix.y, this.b * matrix.c + this.d * matrix.d + this.f * matrix.y, this.x * matrix.c + this.y * matrix.d + this.z * matrix.y, this.a * matrix.e + this.c * matrix.f + this.e * matrix.z, this.b * matrix.e + this.d * matrix.f + this.f * matrix.z, this.x * matrix.e + this.y * matrix.f + this.z * matrix.z);
        }

        /**
         * @public
         * @param {Boolean} [transpose=false]
         * @returns {Float32Array}
         */

    }, {
        key: "toArray",
        value: function toArray() {
            var transpose = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

            return transpose ? this.transposedArray : this.array;
        }

        /**
         * @public
         * @returns {Matrix}
         */

    }, {
        key: "reset",
        value: function reset() {
            return this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);
        }

        /**
         * @public
         * @returns {Matrix}
         */

    }, {
        key: "destroy",
        value: function destroy() {
            if (this._array) {
                this._array.fill(0);
                this._array = null;
            }

            this.a = this.c = this.e = null;
            this.b = this.d = this.f = null;
            this.x = this.y = this.z = null;

            this.c = null;
            this.d = null;
            this.y = null;

            this.e = null;
            this.f = null;
            this.z = null;
        }

        /**
         * @public
         * @static
         * @param {...Matrix} matrices
         * @returns {Matrix}
         */

    }, {
        key: "array",
        get: function get() {
            var array = this._array || (this._array = new Float32Array(9));

            array[0] = this.a;
            array[1] = this.c;
            array[2] = this.e;

            array[3] = this.b;
            array[4] = this.d;
            array[5] = this.f;

            array[6] = this.x;
            array[7] = this.y;
            array[8] = this.z;

            return array;
        }

        /**
         * @public
         * @readonly
         * @member {Float32Array}
         */

    }, {
        key: "transposedArray",
        get: function get() {
            var array = this._array || (this._array = new Float32Array(9));

            array[0] = this.a;
            array[1] = this.b;
            array[2] = this.x;

            array[3] = this.c;
            array[4] = this.d;
            array[5] = this.y;

            array[6] = this.e;
            array[7] = this.f;
            array[8] = this.z;

            return array;
        }
    }], [{
        key: "multiply",
        value: function multiply() {
            var result = new Matrix();

            for (var _len = arguments.length, matrices = Array(_len), _key = 0; _key < _len; _key++) {
                matrices[_key] = arguments[_key];
            }

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = matrices[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var matrix = _step.value;

                    result.multiply(matrix);
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            return result;
        }

        /**
         * @public
         * @static
         * @member {Matrix}
         */

    }, {
        key: "Identity",
        get: function get() {
            return new Matrix(1, 0, 0, 0, 1, 0, 0, 0, 1);
        }
    }]);

    return Matrix;
}();

exports.default = Matrix;

/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Time
 */
var Time = function () {

    /**
     * @constructor
     * @param {Number} [time=0]
     * @param {Number} [factor=Time.Milliseconds]
     */
    function Time() {
        var time = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        var factor = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : Time.Milliseconds;

        _classCallCheck(this, Time);

        /**
         * @private
         * @member {Number}
         */
        this._milliseconds = time * factor;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(Time, [{
        key: "setMilliseconds",


        /**
         * @public
         * @chainable
         * @param {Number} milliseconds
         * @returns {Time}
         */
        value: function setMilliseconds(milliseconds) {
            this.milliseconds = milliseconds;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} seconds
         * @returns {Time}
         */

    }, {
        key: "setSeconds",
        value: function setSeconds(seconds) {
            this.seconds = seconds;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} minutes
         * @returns {Time}
         */

    }, {
        key: "setMinutes",
        value: function setMinutes(minutes) {
            this.minutes = minutes;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} hours
         * @returns {Time}
         */

    }, {
        key: "setHours",
        value: function setHours(hours) {
            this.hours = hours;

            return this;
        }

        /**
         * @public
         * @param {Time} time
         * @returns {Boolean}
         */

    }, {
        key: "equals",
        value: function equals(time) {
            return this._milliseconds === time.milliseconds;
        }

        /**
         * @public
         * @param {Time} time
         * @returns {Boolean}
         */

    }, {
        key: "greaterThan",
        value: function greaterThan(time) {
            return this._milliseconds > time.milliseconds;
        }

        /**
         * @public
         * @param {Time} time
         * @returns {Boolean}
         */

    }, {
        key: "lessThan",
        value: function lessThan(time) {
            return this._milliseconds < time.milliseconds;
        }

        /**
         * @public
         * @returns {Time}
         */

    }, {
        key: "clone",
        value: function clone() {
            return new Time(this._milliseconds);
        }

        /**
         * @public
         * @chainable
         * @param {Time} time
         * @returns {Time}
         */

    }, {
        key: "copy",
        value: function copy(time) {
            this._milliseconds = time.milliseconds;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Time} time
         * @returns {Time}
         */

    }, {
        key: "add",
        value: function add(time) {
            this._milliseconds += time.milliseconds;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Time} time
         * @returns {Time}
         */

    }, {
        key: "subtract",
        value: function subtract(time) {
            this._milliseconds -= time.milliseconds;

            return this;
        }

        /**
         * @public
         */

    }, {
        key: "destroy",
        value: function destroy() {
            this._milliseconds = null;
        }
    }, {
        key: "milliseconds",
        get: function get() {
            return this._milliseconds;
        },
        set: function set(milliseconds) {
            this._milliseconds = milliseconds;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: "seconds",
        get: function get() {
            return this._milliseconds / Time.Seconds;
        },
        set: function set(seconds) {
            this._milliseconds = seconds * Time.Seconds;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: "minutes",
        get: function get() {
            return this._milliseconds / Time.Minutes;
        },
        set: function set(minutes) {
            this._milliseconds = minutes * Time.Minutes;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: "hours",
        get: function get() {
            return this._milliseconds / Time.Hours;
        },
        set: function set(hours) {
            this._milliseconds = hours * Time.Hours;
        }
    }]);

    return Time;
}();

/**
 * @public
 * @static
 * @constant
 * @readonly
 * @member {Number}
 */


exports.default = Time;
Time.Milliseconds = 1;

/**
 * @public
 * @static
 * @constant
 * @readonly
 * @member {Number}
 */
Time.Seconds = 1000;

/**
 * @public
 * @static
 * @constant
 * @readonly
 * @member {Number}
 */
Time.Minutes = 60000;

/**
 * @public
 * @static
 * @constant
 * @readonly
 * @member {Number}
 */
Time.Hours = 3600000;

/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ResourceFactory2 = __webpack_require__(13);

var _ResourceFactory3 = _interopRequireDefault(_ResourceFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ArrayBufferFactory
 * @extends {ResourceFactory}
 */
var ArrayBufferFactory = function (_ResourceFactory) {
    _inherits(ArrayBufferFactory, _ResourceFactory);

    function ArrayBufferFactory() {
        _classCallCheck(this, ArrayBufferFactory);

        return _possibleConstructorReturn(this, (ArrayBufferFactory.__proto__ || Object.getPrototypeOf(ArrayBufferFactory)).apply(this, arguments));
    }

    _createClass(ArrayBufferFactory, [{
        key: 'process',


        /**
         * @override
         */
        value: function process(response) {
            return response.arrayBuffer();
        }

        /**
         * @override
         */

    }, {
        key: 'create',
        value: function create(source, options) {
            return Promise.resolve(source);
        }
    }, {
        key: 'storageType',


        /**
         * @override
         */
        get: function get() {
            return 'arrayBuffer';
        }
    }]);

    return ArrayBufferFactory;
}(_ResourceFactory3.default);

exports.default = ArrayBufferFactory;

/***/ }),
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @abstract
 * @class ResourceFactory
 */
var ResourceFactory = function () {
    function ResourceFactory() {
        _classCallCheck(this, ResourceFactory);
    }

    _createClass(ResourceFactory, [{
        key: 'request',


        /**
         * @public
         * @abstract
         * @param {String} path
         * @param {Object} [options]
         * @param {String} [options.method='GET']
         * @param {String} [options.mode='cors']
         * @param {String} [options.cache='default']
         * @returns {Promise<Response>}
         */
        value: function request(path) {
            var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
                method: 'GET',
                mode: 'cors',
                cache: 'default'
            };

            return fetch(path, options);
        }

        /**
         * @public
         * @abstract
         * @param {Response} response
         * @returns {Promise<*>}
         */

    }, {
        key: 'process',
        value: function process(response) {
            return Promise.resolve(null);
        }

        /**
         * @public
         * @abstract
         * @param {Response} source
         * @param {Object} [options]
         * @returns {Promise<*>}
         */

    }, {
        key: 'create',
        value: function create(source, options) {
            return Promise.resolve(source);
        }

        /**
         * @public
         * @abstract
         * @param {String} path
         * @param {Object} [request]
         * @param {Object} [options]
         * @returns {Promise<*>}
         */

    }, {
        key: 'load',
        value: function load(path, request, options) {
            var _this = this;

            return this.request(path, request).then(function (response) {
                return _this.process(response);
            }).then(function (source) {
                return _this.create(source, options);
            });
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            // do nothing
        }
    }, {
        key: 'storageType',


        /**
         * @public
         * @abstract
         * @readonly
         * @member {String}
         */
        get: function get() {
            return 'resource';
        }
    }]);

    return ResourceFactory;
}();

exports.default = ResourceFactory;

/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ArrayBufferFactory2 = __webpack_require__(12);

var _ArrayBufferFactory3 = _interopRequireDefault(_ArrayBufferFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class BlobFactory
 * @extends {ResourceFactory}
 */
var BlobFactory = function (_ArrayBufferFactory) {
    _inherits(BlobFactory, _ArrayBufferFactory);

    function BlobFactory() {
        _classCallCheck(this, BlobFactory);

        return _possibleConstructorReturn(this, (BlobFactory.__proto__ || Object.getPrototypeOf(BlobFactory)).apply(this, arguments));
    }

    _createClass(BlobFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(source) {
            var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
                _ref$mimeType = _ref.mimeType,
                mimeType = _ref$mimeType === undefined ? 'text/plain' : _ref$mimeType;

            return _get(BlobFactory.prototype.__proto__ || Object.getPrototypeOf(BlobFactory.prototype), 'create', this).call(this, source, null).then(function (arrayBuffer) {
                return new Blob([arrayBuffer], { type: mimeType });
            });
        }
    }, {
        key: 'storageType',


        /**
         * @override
         */
        get: function get() {
            return 'blob';
        }
    }]);

    return BlobFactory;
}(_ArrayBufferFactory3.default);

exports.default = BlobFactory;

/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = __webpack_require__(1);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @abstract
 * @class Playable
 */
var Playable = function () {

    /**
     * @constructor
     * @param {HTMLMediaElement|*} source
     */
    function Playable(source) {
        _classCallCheck(this, Playable);

        /**
         * @private
         * @member {HTMLMediaElement|*}
         */
        this._source = source;
    }

    /**
     * @public
     * @readonly
     * @member {HTMLMediaElement|*}
     */


    _createClass(Playable, [{
        key: 'connect',


        /**
         * @public
         * @abstract
         * @param {MediaManager} mediaManager
         */
        value: function connect(mediaManager) {}
        // do nothing


        /**
         * @public
         * @abstract
         * @param {Object} [options]
         * @param {Boolean} [options.loop]
         * @param {Number} [options.playbackRate]
         * @param {Number} [options.volume]
         * @param {Number} [options.time]
         */

    }, {
        key: 'play',
        value: function play(options) {
            if (this.paused) {
                this.applyOptions(options);
                this._source.play();
            }
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'pause',
        value: function pause() {
            if (this.playing) {
                this._source.pause();
            }
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'stop',
        value: function stop() {
            this.pause();
            this.currentTime = 0;
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'toggle',
        value: function toggle() {
            if (this.paused) {
                this.play();
            } else {
                this.pause();
            }
        }

        /**
         * @public
         * @abstract
         * @param {Object} [options]
         * @param {Boolean} [options.loop]
         * @param {Number} [options.playbackRate]
         * @param {Number} [options.volume]
         * @param {Number} [options.time]
         */

    }, {
        key: 'applyOptions',
        value: function applyOptions() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                loop = _ref.loop,
                playbackRate = _ref.playbackRate,
                volume = _ref.volume,
                time = _ref.time;

            if (loop !== undefined) {
                this.loop = loop;
            }

            if (playbackRate !== undefined) {
                this.playbackRate = playbackRate;
            }

            if (volume !== undefined) {
                this.volume = volume;
            }

            if (time !== undefined) {
                this.currentTime = time;
            }
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this.stop();

            this._source = null;
        }
    }, {
        key: 'source',
        get: function get() {
            return this._source;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'duration',
        get: function get() {
            return this._source.duration;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'volume',
        get: function get() {
            return this._source.volume;
        },
        set: function set(volume) {
            this._source.volume = (0, _utils.clamp)(volume, 0, 2);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'currentTime',
        get: function get() {
            return this._source.currentTime;
        },
        set: function set(currentTime) {
            this._source.currentTime = Math.max(0, currentTime);
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'loop',
        get: function get() {
            return this._source.loop;
        },
        set: function set(loop) {
            this._source.loop = loop;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'playbackRate',
        get: function get() {
            return this._source.playbackRate;
        },
        set: function set(playbackRate) {
            this._source.playbackRate = Math.max(0, playbackRate);
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'paused',
        get: function get() {
            return this._source.paused;
        },
        set: function set(paused) {
            if (paused) {
                this.pause();
            } else {
                this.play();
            }
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'playing',
        get: function get() {
            return !this.paused;
        },
        set: function set(playing) {
            if (playing) {
                this.play();
            } else {
                this.pause();
            }
        }

        /**
         * @public
         * @abstract
         * @readonly
         * @member {?AudioNode}
         */

    }, {
        key: 'analyserTarget',
        get: function get() {
            return null;
        }
    }]);

    return Playable;
}();

exports.default = Playable;

/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _settings = __webpack_require__(4);

var _settings2 = _interopRequireDefault(_settings);

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _GLTexture = __webpack_require__(67);

var _GLTexture2 = _interopRequireDefault(_GLTexture);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Texture
 */
var Texture = function () {

    /**
     * @constructor
     * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement} source
     * @param {Number} [options]
     * @param {Number} [options.scaleMode]
     * @param {Number} [options.wrapMode]
     * @param {Boolean} [options.premultiplyAlpha]
     */
    function Texture(source, options) {
        _classCallCheck(this, Texture);

        /**
         * @private
         * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
         */
        this._source = null;

        /**
         * @private
         * @member {Rectangle}
         */
        this._frame = new _Rectangle2.default();

        /**
         * @private
         * @member {GLTexture}
         */
        this._glTexture = new _GLTexture2.default(options);

        if (source !== undefined) {
            this.setSource(source);
        }
    }

    /**
     * @public
     * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
     */


    _createClass(Texture, [{
        key: 'setSource',


        /**
         * @public
         * @chainable
         * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement} source
         * @returns {Texture}
         */
        value: function setSource(source) {
            if (this._source !== source) {
                this._source = source;
                this._glTexture.setSource(source);
            }

            this.updateSource();
            this.updateFrame();

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Texture}
         */

    }, {
        key: 'updateFrame',
        value: function updateFrame() {
            var source = this._source;

            if (source) {
                this._frame.set(0, 0, source.videoWidth || source.width, source.videoHeight || source.height);
            } else {
                this._frame.reset();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Texture}
         */

    }, {
        key: 'updateSource',
        value: function updateSource() {
            this._glTexture.updateSource();

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._source = null;

            this._frame.destroy();
            this._frame = null;

            this._glTexture.destroy();
            this._glTexture = null;
        }
    }, {
        key: 'source',
        get: function get() {
            return this._source;
        },
        set: function set(source) {
            this.setSource(source);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'scaleMode',
        get: function get() {
            return this._glTexture.scaleMode;
        },
        set: function set(scaleMode) {
            this._glTexture.setScaleMode(scaleMode);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'wrapMode',
        get: function get() {
            return this._glTexture.wrapMode;
        },
        set: function set(wrapMode) {
            this._glTexture.setWrapMode(wrapMode);
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'premultiplyAlpha',
        get: function get() {
            return this._glTexture.premultiplyAlpha;
        },
        set: function set(premultiplyAlpha) {
            this._glTexture.setPremultiplyAlpha(premultiplyAlpha);
        }

        /**
         * @public
         * @readonly
         * @member {GLTexture}
         */

    }, {
        key: 'glTexture',
        get: function get() {
            return this._glTexture;
        }

        /**
         * @public
         * @readonly
         * @member {Rectangle}
         */

    }, {
        key: 'frame',
        get: function get() {
            return this._frame;
        }

        /**
         * @public
         * @readonly
         * @member {Vector}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._frame.size;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return this._frame.width;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._frame.height;
        }
    }]);

    return Texture;
}();

exports.default = Texture;

/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderable2 = __webpack_require__(24);

var _Renderable3 = _interopRequireDefault(_Renderable2);

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _ObservableVector = __webpack_require__(19);

var _ObservableVector2 = _interopRequireDefault(_ObservableVector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Sprite
 * @extends {Renderable}
 */
var Sprite = function (_Renderable) {
    _inherits(Sprite, _Renderable);

    /**
     * @constructor
     * @param {?Texture} texture
     */
    function Sprite(texture) {
        _classCallCheck(this, Sprite);

        /**
         * @private
         * @member {?Texture}
         */
        var _this = _possibleConstructorReturn(this, (Sprite.__proto__ || Object.getPrototypeOf(Sprite)).call(this));

        _this._texture = null;

        /**
         * 4 vertices with 5 properties:
         *
         * 2 = posCoordinates (x, y) +
         * 2 = texCoordinates (u, v) +
         * 1 = color     (ARGB uint)
         *
         * @private
         * @type {Float32Array}
         */
        _this._vertexData = new Float32Array(20);

        /**
         * @private
         * @member {Rectangle}
         */
        _this._textureRect = new _Rectangle2.default();

        /**
         * @private
         * @member {ObservableVector}
         */
        _this._size = new _ObservableVector2.default(_this._updatePositions, _this);

        /**
         * @private
         * @member {Color}
         */
        _this._tint = _Color2.default.White.clone();

        if (texture) {
            _this.texture = texture;
        }
        return _this;
    }

    /**
     * @public
     * @member {Texture}
     */


    _createClass(Sprite, [{
        key: 'getBounds',


        /**
         * @override
         */
        value: function getBounds() {
            return this._bounds.set(this.x, this.y, this.width, this.height);
        }

        /**
         * @override
         */

    }, {
        key: 'setOrigin',
        value: function setOrigin(x, y) {
            var absolute = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

            var bounds = this.bounds;

            this._dirtyTransform = true;

            if (absolute) {
                this._origin.set(x, y);
            } else {
                this._origin.set(x * bounds.width, y * bounds.height);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} width
         * @param {Number} height
         * @returns {Sprite}
         */

    }, {
        key: 'setSize',
        value: function setSize(width, height) {
            this._size.set(width, height);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Rectangle} rectangle
         * @param {Boolean} [updateSize=true]
         * @returns {Sprite}
         */

    }, {
        key: 'setTextureRect',
        value: function setTextureRect(rectangle) {
            var updateSize = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

            this._textureRect.copy(rectangle);

            if (updateSize) {
                this.setSize(rectangle.width, rectangle.height);
            }

            this._updatePositions();
            this._updateTexCoords();

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Rectangle} rectangle
         * @param {Boolean} [updateSize=true]
         * @returns {Sprite}
         */

    }, {
        key: 'setTexture',
        value: function setTexture(texture) {
            this._texture = texture;
            this.setTextureRect(texture.frame);

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Sprite}
         */

    }, {
        key: 'updateTexture',
        value: function updateTexture() {
            this._texture.updateSource();

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager, parentTransform) {
            if (!this.visible) {
                return this;
            }

            this._worldTransform.copy(parentTransform);
            this._worldTransform.multiply(this.transform);

            displayManager.getRenderer('sprite').render(this);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Sprite.prototype.__proto__ || Object.getPrototypeOf(Sprite.prototype), 'destroy', this).call(this);

            this._texture = null;
            this._vertexData = null;

            this._textureRect.destroy();
            this._textureRect = null;

            this._size.destroy();
            this._size = null;

            this._tint.destroy();
            this._tint = null;
        }

        /**
         * @private
         */

    }, {
        key: '_updatePositions',
        value: function _updatePositions() {
            var vertexData = this._vertexData,
                bounds = this.getBounds();

            vertexData[0] = vertexData[1] = vertexData[5] = vertexData[8] = 0;
            vertexData[4] = vertexData[12] = bounds.width;
            vertexData[9] = vertexData[13] = bounds.height;
        }

        /**
         * @private
         */

    }, {
        key: '_updateTexCoords',
        value: function _updateTexCoords() {
            var vertexData = this._vertexData,
                texture = this._texture,
                textureRect = this._textureRect,
                left = textureRect.x / texture.width,
                top = textureRect.y / texture.height;

            vertexData[2] = vertexData[10] = left;
            vertexData[3] = vertexData[7] = top;
            vertexData[6] = vertexData[14] = left + textureRect.width / texture.width;
            vertexData[11] = vertexData[15] = top + textureRect.height / texture.height;
        }
    }, {
        key: 'texture',
        get: function get() {
            return this._texture;
        },
        set: function set(texture) {
            this.setTexture(texture);
        }

        /**
         * @public
         * @member {Rectangle}
         */

    }, {
        key: 'textureRect',
        get: function get() {
            return this._textureRect;
        },
        set: function set(textureRect) {
            this.setTextureRect(textureRect);
        }

        /**
         * @public
         * @member {Color}
         */

    }, {
        key: 'tint',
        get: function get() {
            return this._tint;
        },
        set: function set(tint) {
            this._tint.copy(tint);
        }

        /**
         * @public
         * @readonly
         * @member {Float32Array}
         */

    }, {
        key: 'vertexData',
        get: function get() {
            return this._vertexData;
        }

        /**
         * @public
         * @readonly
         * @member {Rectangle}
         */

    }, {
        key: 'bounds',
        get: function get() {
            return this.getBounds();
        }

        /**
         * @public
         * @member {ObservableVector}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(size) {
            this._size.copy(size);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return this._size.x;
        },
        set: function set(width) {
            this._size.x = width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._size.y;
        },
        set: function set(height) {
            this._size.y = height;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'top',
        get: function get() {
            return this.y - this.height + this.origin.y;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'bottom',
        get: function get() {
            return this.y + this.height + this.origin.y;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'left',
        get: function get() {
            return this.x - this.width + this.origin.x;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'right',
        get: function get() {
            return this.x + this.width + this.origin.x;
        }
    }]);

    return Sprite;
}(_Renderable3.default);

exports.default = Sprite;

/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @interface ParticleModifier
 */
var ParticleModifier = function () {
  function ParticleModifier() {
    _classCallCheck(this, ParticleModifier);
  }

  _createClass(ParticleModifier, [{
    key: 'apply',


    /**
     * @public
     * @virtual
     * @param {Particle} particle
     * @param {Time} delta
     */
    value: function apply(particle, delta) {
      throw new Error('Method not implemented!');
    }
  }]);

  return ParticleModifier;
}();

exports.default = ParticleModifier;

/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Vector2 = __webpack_require__(2);

var _Vector3 = _interopRequireDefault(_Vector2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ObservableVector
 * @extends {Vector}
 */
var ObservableVector = function (_Vector) {
    _inherits(ObservableVector, _Vector);

    /**
     * @constructor
     * @param {Function} callback
     * @param {*} scope
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     */
    function ObservableVector(callback, scope) {
        var x = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
        var y = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;

        _classCallCheck(this, ObservableVector);

        /**
         * @private
         * @member {Function}
         */
        var _this = _possibleConstructorReturn(this, (ObservableVector.__proto__ || Object.getPrototypeOf(ObservableVector)).call(this, x, y));

        _this._callback = callback;

        /**
         * @private
         * @member {*}
         */
        _this._scope = scope || _this;
        return _this;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(ObservableVector, [{
        key: 'set',


        /**
         * @override
         */
        value: function set() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._x;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._y;

            if (this._x !== x || this._y !== y) {
                this._x = x;
                this._y = y;
                this._callback.call(this._scope);
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'add',
        value: function add() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

            return this.set(this._x + x, this._y + y);
        }

        /**
         * @override
         */

    }, {
        key: 'subtract',
        value: function subtract() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

            return this.set(this._x - x, this._y - y);
        }

        /**
         * @override
         */

    }, {
        key: 'multiply',
        value: function multiply() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

            return this.set(this._x * x, this._y * y);
        }

        /**
         * @override
         */

    }, {
        key: 'divide',
        value: function divide() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

            return this.set(this._x / x, this._y / y);
        }

        /**
         * @override
         */

    }, {
        key: 'normalize',
        value: function normalize() {
            var mag = this.magnitude;

            return this.set(this._x / mag, this._y / mag);
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(vector) {
            return this.set(vector.x, vector.y);
        }

        /**
         * @override
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new ObservableVector(this._callback, this._scope, this._x, this._y);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(ObservableVector.prototype.__proto__ || Object.getPrototypeOf(ObservableVector.prototype), 'destroy', this).call(this);

            this._callback = null;
            this._scope = null;
        }
    }, {
        key: 'x',
        get: function get() {
            return this._x;
        },
        set: function set(x) {
            if (this._x !== x) {
                this._x = x;
                this._callback.call(this._scope);
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'y',
        get: function get() {
            return this._y;
        },
        set: function set(y) {
            if (this._y !== y) {
                this._y = y;
                this._callback.call(this._scope);
            }
        }
    }]);

    return ObservableVector;
}(_Vector3.default);

exports.default = ObservableVector;

/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Time = __webpack_require__(11);

var _Time2 = _interopRequireDefault(_Time);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Clock
 */
var Clock = function () {

    /**
     * @constructor
     * @param {Boolean} [autoStart=false]
     */
    function Clock(autoStart) {
        _classCallCheck(this, Clock);

        /**
         * @private
         * @member {Number}
         */
        this._startTime = 0;

        /**
         * @private
         * @member {Number}
         */
        this._timeBuffer = 0;

        /**
         * @private
         * @member {Boolean}
         */
        this._isRunning = false;

        /**
         * @private
         * @member {Time}
         */
        this._time = new _Time2.default();

        if (autoStart) {
            this.start();
        }
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */


    _createClass(Clock, [{
        key: 'start',


        /**
         * @public
         * @chainable
         * @returns {Clock}
         */
        value: function start() {
            if (this._isRunning) {
                return this;
            }

            this._startTime = Date.now();
            this._isRunning = true;

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Clock}
         */

    }, {
        key: 'stop',
        value: function stop() {
            if (!this._isRunning) {
                return this;
            }

            this._timeBuffer += Date.now() - this._startTime;
            this._isRunning = false;

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Clock}
         */

    }, {
        key: 'reset',
        value: function reset() {
            this._timeBuffer = 0;
            this._isRunning = false;

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Clock}
         */

    }, {
        key: 'restart',
        value: function restart() {
            return this.reset().start();
        }

        /**
         * @public
         * @returns {Number}
         */

    }, {
        key: 'getElapsedMilliseconds',
        value: function getElapsedMilliseconds() {
            if (!this._isRunning) {
                return this._timeBuffer;
            }

            return this._timeBuffer + (Date.now() - this._startTime);
        }

        /**
         * @public
         * @returns {Number}
         */

    }, {
        key: 'getElapsedSeconds',
        value: function getElapsedSeconds() {
            return this.getElapsedMilliseconds() / _Time2.default.Seconds;
        }

        /**
         * @public
         * @returns {Number}
         */

    }, {
        key: 'getElapsedMinutes',
        value: function getElapsedMinutes() {
            return this.getElapsedMilliseconds() / _Time2.default.Minutes;
        }

        /**
         * @public
         * @returns {Time}
         */

    }, {
        key: 'getElapsedTime',
        value: function getElapsedTime() {
            return this._time.setMilliseconds(this.getElapsedMilliseconds());
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._startTime = null;
            this._timeBuffer = null;
            this._isRunning = null;

            this._time.destroy();
            this._time = null;
        }
    }, {
        key: 'isRunning',
        get: function get() {
            return this._isRunning;
        }
    }]);

    return Clock;
}();

exports.default = Clock;

/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Renderer
 */
var Renderer = function () {

    /**
     * @constructor
     */
    function Renderer() {
        _classCallCheck(this, Renderer);

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * Vertex buffer that will be fed by the vertexData.
         *
         * @private
         * @member {?WebGLBuffer}
         */
        this._vertexBuffer = null;

        /**
         * Index buffer that will be fed by the indexData.
         *
         * @private
         * @member {?WebGLBuffer}
         */
        this._indexBuffer = null;
    }

    /**
     * @public
     * @abstract
     * @param {WebGLRenderingContext} gl
     */


    _createClass(Renderer, [{
        key: "setContext",
        value: function setContext(gl) {
            if (!this._context) {
                this._context = gl;
                this._indexBuffer = gl.createBuffer();
                this._vertexBuffer = gl.createBuffer();
            }
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: "bind",
        value: function bind() {}
        // do nothing


        /**
         * @public
         * @abstract
         */

    }, {
        key: "unbind",
        value: function unbind() {}
        // do nothing


        /**
         * @public
         * @param {*} renderable
         */

    }, {
        key: "render",
        value: function render(renderable) {}
        // do nothing


        /**
         * @public
         */

    }, {
        key: "flush",
        value: function flush() {}
        // do nothing


        /**
         * @public
         */

    }, {
        key: "destroy",
        value: function destroy() {
            if (this._context) {
                this._context.deleteBuffer(this._indexBuffer);
                this._indexBuffer = null;

                this._context.deleteBuffer(this._vertexBuffer);
                this._vertexBuffer = null;

                this._context = null;
            }
        }

        /**
         * @public
         * @param {Number} length
         * @returns {Uint16Array}
         */

    }], [{
        key: "createIndexBuffer",
        value: function createIndexBuffer(length) {
            var buffer = new Uint16Array(length),
                len = buffer.length;

            for (var i = 0, offset = 0; i < len; i += 6, offset += 4) {
                buffer[i] = offset;
                buffer[i + 1] = offset + 1;
                buffer[i + 2] = offset + 3;
                buffer[i + 3] = offset;
                buffer[i + 4] = offset + 2;
                buffer[i + 5] = offset + 3;
            }

            return buffer;
        }
    }]);

    return Renderer;
}();

exports.default = Renderer;

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ShaderAttribute = __webpack_require__(33);

var _ShaderAttribute2 = _interopRequireDefault(_ShaderAttribute);

var _ShaderUniform = __webpack_require__(34);

var _ShaderUniform2 = _interopRequireDefault(_ShaderUniform);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Shader
 */
var Shader = function () {

    /**
     * @constructor
     * @param {String|String[]} [vertexSource]
     * @param {String|String[]} [fragmentSource]
     */
    function Shader(vertexSource, fragmentSource) {
        _classCallCheck(this, Shader);

        /**
         * @private
         * @member {?String}
         */
        this._vertexSource = null;

        /**
         * @private
         * @member {?String}
         */
        this._fragmentSource = null;

        /**
         * @private
         * @member {Map<String, ShaderUniform>}
         */
        this._uniforms = new Map();

        /**
         * @private
         * @member {Map<String, ShaderAttribute>}
         */
        this._attributes = new Map();

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLProgram}
         */
        this._program = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;

        /**
         * @private
         * @member {Number}
         */
        this._stride = 0;

        if (vertexSource !== undefined) {
            this.setVertexSource(vertexSource);
        }

        if (fragmentSource !== undefined) {
            this.setFragmentSource(fragmentSource);
        }
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */


    _createClass(Shader, [{
        key: 'setContext',


        /**
         * @public
         * @param {WebGLRenderingContext} gl
         */
        value: function setContext(gl) {
            if (this._context) {
                return;
            }

            this._context = gl;
            this._program = (0, _utils.compileProgram)(gl, this._vertexSource, this._fragmentSource);

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._attributes.values()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var attribute = _step.value;

                    attribute.setContext(gl, this._program);
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this._uniforms.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var uniform = _step2.value;

                    uniform.setContext(gl, this._program);
                }
            } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion2 && _iterator2.return) {
                        _iterator2.return();
                    }
                } finally {
                    if (_didIteratorError2) {
                        throw _iteratorError2;
                    }
                }
            }
        }

        /**
         * @public
         */

    }, {
        key: 'bind',
        value: function bind() {
            if (this._bound) {
                return;
            }

            this._context.useProgram(this._program);

            var offset = 0;

            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {
                for (var _iterator3 = this._attributes.values()[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                    var attribute = _step3.value;

                    attribute.bind(this._stride, offset);

                    offset += attribute.byteSize;
                }
            } catch (err) {
                _didIteratorError3 = true;
                _iteratorError3 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion3 && _iterator3.return) {
                        _iterator3.return();
                    }
                } finally {
                    if (_didIteratorError3) {
                        throw _iteratorError3;
                    }
                }
            }

            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
                for (var _iterator4 = this._uniforms.values()[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                    var uniform = _step4.value;

                    uniform.bind();
                }
            } catch (err) {
                _didIteratorError4 = true;
                _iteratorError4 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion4 && _iterator4.return) {
                        _iterator4.return();
                    }
                } finally {
                    if (_didIteratorError4) {
                        throw _iteratorError4;
                    }
                }
            }

            this._bound = true;
        }

        /**
         * @public
         */

    }, {
        key: 'unbind',
        value: function unbind() {
            if (!this._bound) {
                return;
            }

            var _iteratorNormalCompletion5 = true;
            var _didIteratorError5 = false;
            var _iteratorError5 = undefined;

            try {
                for (var _iterator5 = this._attributes.values()[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                    var attribute = _step5.value;

                    attribute.unbind();
                }
            } catch (err) {
                _didIteratorError5 = true;
                _iteratorError5 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion5 && _iterator5.return) {
                        _iterator5.return();
                    }
                } finally {
                    if (_didIteratorError5) {
                        throw _iteratorError5;
                    }
                }
            }

            var _iteratorNormalCompletion6 = true;
            var _didIteratorError6 = false;
            var _iteratorError6 = undefined;

            try {
                for (var _iterator6 = this._uniforms.values()[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                    var uniform = _step6.value;

                    uniform.unbind();
                }
            } catch (err) {
                _didIteratorError6 = true;
                _iteratorError6 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion6 && _iterator6.return) {
                        _iterator6.return();
                    }
                } finally {
                    if (_didIteratorError6) {
                        throw _iteratorError6;
                    }
                }
            }

            this._bound = false;
        }

        /**
         * @public
         * @param {String|String[]} source
         */

    }, {
        key: 'setVertexSource',
        value: function setVertexSource(source) {
            this._vertexSource = Array.isArray(source) ? source.join('\n') : source;
        }

        /**
         * @public
         * @param {String|String[]} source
         */

    }, {
        key: 'setFragmentSource',
        value: function setFragmentSource(source) {
            this._fragmentSource = Array.isArray(source) ? source.join('\n') : source;
        }

        /**
         * @public
         * @param {Object[]} attributes
         * @param {String} attributes[].name
         * @param {Number} attributes[].type
         * @param {Number} attributes[].size
         * @param {Number} attributes[].offset
         * @param {Number} attributes[].stride
         * @param {Boolean} [attributes[].normalized=false]
         * @param {Boolean} [attributes[].enabled=true]
         */

    }, {
        key: 'setAttributes',
        value: function setAttributes(attributes) {
            var _iteratorNormalCompletion7 = true;
            var _didIteratorError7 = false;
            var _iteratorError7 = undefined;

            try {
                for (var _iterator7 = attributes[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                    var item = _step7.value;

                    var attribute = item instanceof _ShaderAttribute2.default ? item : new _ShaderAttribute2.default(item);

                    this._attributes.set(attribute.name, attribute);
                    this._stride += attribute.byteSize;
                }
            } catch (err) {
                _didIteratorError7 = true;
                _iteratorError7 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion7 && _iterator7.return) {
                        _iterator7.return();
                    }
                } finally {
                    if (_didIteratorError7) {
                        throw _iteratorError7;
                    }
                }
            }
        }

        /**
         * @public
         * @param {Object[]} uniforms
         * @param {String} uniforms[].name
         * @param {Number} uniforms[].type
         * @param {Number} [uniforms[].unit=-1]
         * @param {Boolean} [uniforms[].transpose=false]
         */

    }, {
        key: 'setUniforms',
        value: function setUniforms(uniforms) {
            var _iteratorNormalCompletion8 = true;
            var _didIteratorError8 = false;
            var _iteratorError8 = undefined;

            try {
                for (var _iterator8 = uniforms[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
                    var item = _step8.value;

                    var uniform = item instanceof _ShaderUniform2.default ? item : new _ShaderUniform2.default(item);

                    this._uniforms.set(uniform.name, uniform);
                }
            } catch (err) {
                _didIteratorError8 = true;
                _iteratorError8 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion8 && _iterator8.return) {
                        _iterator8.return();
                    }
                } finally {
                    if (_didIteratorError8) {
                        throw _iteratorError8;
                    }
                }
            }
        }

        /**
         * @public
         * @param {String} name
         * @returns {ShaderUniform}
         */

    }, {
        key: 'getUniform',
        value: function getUniform(name) {
            if (!this._uniforms.has(name)) {
                throw new Error('Could not find Uniform "' + name + '".');
            }

            return this._uniforms.get(name);
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            if (this._bound) {
                this.unbind();
            }

            var _iteratorNormalCompletion9 = true;
            var _didIteratorError9 = false;
            var _iteratorError9 = undefined;

            try {
                for (var _iterator9 = this._attributes.values()[Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
                    var attribute = _step9.value;

                    attribute.destroy();
                }
            } catch (err) {
                _didIteratorError9 = true;
                _iteratorError9 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion9 && _iterator9.return) {
                        _iterator9.return();
                    }
                } finally {
                    if (_didIteratorError9) {
                        throw _iteratorError9;
                    }
                }
            }

            var _iteratorNormalCompletion10 = true;
            var _didIteratorError10 = false;
            var _iteratorError10 = undefined;

            try {
                for (var _iterator10 = this._uniforms.values()[Symbol.iterator](), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
                    var uniform = _step10.value;

                    uniform.destroy();
                }
            } catch (err) {
                _didIteratorError10 = true;
                _iteratorError10 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion10 && _iterator10.return) {
                        _iterator10.return();
                    }
                } finally {
                    if (_didIteratorError10) {
                        throw _iteratorError10;
                    }
                }
            }

            if (this._context) {
                this._context.deleteProgram(this._program);
                this._program = null;
                this._context = null;
            }

            this._attributes.clear();
            this._attributes = null;

            this._uniforms.clear();
            this._uniforms = null;

            this._vertexSource = null;
            this._fragmentSource = null;
            this._bound = null;
        }
    }, {
        key: 'vertexSource',
        get: function get() {
            return this._vertexSource;
        }

        /**
         * @public
         * @readonly
         * @member {String}
         */

    }, {
        key: 'fragmentSource',
        get: function get() {
            return this._fragmentSource;
        }
    }]);

    return Shader;
}();

exports.default = Shader;

/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ChannelHandler2 = __webpack_require__(6);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _DefaultGamepadMapping = __webpack_require__(43);

var _DefaultGamepadMapping2 = _interopRequireDefault(_DefaultGamepadMapping);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Gamepad
 * @extends {ChannelHandler}
 */
var Gamepad = function (_ChannelHandler) {
  _inherits(Gamepad, _ChannelHandler);

  /**
   * @constructor
   * @param {Gamepad} gamepad
   * @param {ArrayBuffer} channelBuffer
   */
  function Gamepad(gamepad, channelBuffer) {
    _classCallCheck(this, Gamepad);

    /**
     * @private
     * @member {Gamepad}
     */
    var _this = _possibleConstructorReturn(this, (Gamepad.__proto__ || Object.getPrototypeOf(Gamepad)).call(this, channelBuffer, _const.CHANNEL_OFFSET.GAMEPAD + gamepad.index * _const.CHANNEL_LENGTH.CHILD, _const.CHANNEL_LENGTH.CHILD));

    _this._gamepad = gamepad;

    /**
     * @private
     * @member {GamepadMapping}
     */
    _this._mapping = new _DefaultGamepadMapping2.default();
    return _this;
  }

  /**
   * @public
   * @readonly
   * @member {Gamepad}
   */


  _createClass(Gamepad, [{
    key: 'update',


    /**
     * @public
     */
    value: function update() {
      var channels = this.channels,
          buttonMapping = this._mapping.buttons,
          axesMapping = this._mapping.axes,
          gamepdaButtons = this._gamepad.buttons,
          gamepadAxes = this._gamepad.axes;

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = buttonMapping[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var button = _step.value;

          if (button.index in gamepdaButtons) {
            channels[button.key] = button.transformValue(gamepdaButtons[button.index].value);
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = axesMapping[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var axis = _step2.value;

          if (axis.index in gamepadAxes) {
            channels[axis.key] = axis.transformValue(gamepadAxes[axis.index]);
          }
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }
    }

    /**
     * @override
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      _get(Gamepad.prototype.__proto__ || Object.getPrototypeOf(Gamepad.prototype), 'destroy', this).call(this);

      this._mapping.destroy();
      this._mapping = null;

      this._gamepad = null;
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @param {Number} [index=0]
     * @returns {Number}
     */

  }, {
    key: 'gamepad',
    get: function get() {
      return this._gamepad;
    }

    /**
     * @public
     * @member {GamepadMapping}
     */

  }, {
    key: 'mapping',
    get: function get() {
      return this._mapping;
    },
    set: function set(mapping) {
      this._mapping = mapping;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */

  }, {
    key: 'id',
    get: function get() {
      return this._gamepad.id;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */

  }, {
    key: 'index',
    get: function get() {
      return this._gamepad.index;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */

  }, {
    key: 'connected',
    get: function get() {
      return this._gamepad.connected;
    }
  }], [{
    key: 'getChannelCode',
    value: function getChannelCode(key) {
      var index = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

      return _const.CHANNEL_OFFSET.GAMEPAD + index * _const.CHANNEL_LENGTH.CHILD + key % _const.CHANNEL_LENGTH.CHILD;
    }
  }]);

  return Gamepad;
}(_ChannelHandler3.default);

/**
 * @public
 * @static
 * @member {Number}
 */


exports.default = Gamepad;
Gamepad.FaceButtonBottom = _const.CHANNEL_OFFSET.GAMEPAD + 0;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonLeft = _const.CHANNEL_OFFSET.GAMEPAD + 1;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonRight = _const.CHANNEL_OFFSET.GAMEPAD + 2;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.FaceButtonTop = _const.CHANNEL_OFFSET.GAMEPAD + 3;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftTriggerBottom = _const.CHANNEL_OFFSET.GAMEPAD + 4;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightTriggerBottom = _const.CHANNEL_OFFSET.GAMEPAD + 5;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftTriggerTop = _const.CHANNEL_OFFSET.GAMEPAD + 6;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightTriggerTop = _const.CHANNEL_OFFSET.GAMEPAD + 7;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.Select = _const.CHANNEL_OFFSET.GAMEPAD + 8;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.Start = _const.CHANNEL_OFFSET.GAMEPAD + 9;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickButton = _const.CHANNEL_OFFSET.GAMEPAD + 10;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickButton = _const.CHANNEL_OFFSET.GAMEPAD + 11;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadUp = _const.CHANNEL_OFFSET.GAMEPAD + 12;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadDown = _const.CHANNEL_OFFSET.GAMEPAD + 13;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadLeft = _const.CHANNEL_OFFSET.GAMEPAD + 14;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.DPadRight = _const.CHANNEL_OFFSET.GAMEPAD + 15;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.Special = _const.CHANNEL_OFFSET.GAMEPAD + 16;

/**
 * Left analogue stick
 */

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickLeft = _const.CHANNEL_OFFSET.GAMEPAD + 17;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickRight = _const.CHANNEL_OFFSET.GAMEPAD + 18;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickUp = _const.CHANNEL_OFFSET.GAMEPAD + 19;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.LeftStickDown = _const.CHANNEL_OFFSET.GAMEPAD + 20;

/**
 * Right analogue stick
 */

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickLeft = _const.CHANNEL_OFFSET.GAMEPAD + 21;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickRight = _const.CHANNEL_OFFSET.GAMEPAD + 22;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickUp = _const.CHANNEL_OFFSET.GAMEPAD + 23;

/**
 * @public
 * @static
 * @member {Number}
 */
Gamepad.RightStickDown = _const.CHANNEL_OFFSET.GAMEPAD + 24;

/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Transformable2 = __webpack_require__(25);

var _Transformable3 = _interopRequireDefault(_Transformable2);

var _Matrix = __webpack_require__(10);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Renderable
 * @extends {Transformable}
 */
var Renderable = function (_Transformable) {
    _inherits(Renderable, _Transformable);

    /**
     * @constructor
     */
    function Renderable() {
        _classCallCheck(this, Renderable);

        /**
         * @private
         * @member {Matrix}
         */
        var _this = _possibleConstructorReturn(this, (Renderable.__proto__ || Object.getPrototypeOf(Renderable)).call(this));

        _this._worldTransform = new _Matrix2.default();

        /**
         * @private
         * @member {Rectangle}
         */
        _this._bounds = new _Rectangle2.default();

        /**
         * @private
         * @member {Boolean}
         */
        _this._visible = true;

        /**
         * @private
         * @member {?Renderable}
         */
        _this._parent = null;
        return _this;
    }

    /**
     * @public
     * @member {Matrix}
     */


    _createClass(Renderable, [{
        key: 'getBounds',


        /**
         * @public
         * @returns {Rectangle}
         */
        value: function getBounds() {
            return this._bounds.set(this.x, this.y, 0, 0);
        }

        /**
         * @public
         * @virtual
         * @chainable
         * @param {DisplayManager} renderManager
         * @param {Matrix} worldTransform
         * @returns {Renderable}
         */

    }, {
        key: 'render',
        value: function render(renderManager, worldTransform) {
            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Renderable.prototype.__proto__ || Object.getPrototypeOf(Renderable.prototype), 'destroy', this).call(this);

            this._worldTransform.destroy();
            this._worldTransform = null;

            this._bounds.destroy();
            this._bounds = null;

            this._visible = null;
            this._parent = null;
        }
    }, {
        key: 'worldTransform',
        get: function get() {
            return this._worldTransform;
        },
        set: function set(worldTransform) {
            this._worldTransform.copy(worldTransform);
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'visible',
        get: function get() {
            return this._visible;
        },
        set: function set(visible) {
            this._visible = visible;
        }

        /**
         * @public
         * @member {?Renderable}
         */

    }, {
        key: 'parent',
        get: function get() {
            return this._parent;
        },
        set: function set(parent) {
            this._parent = parent;
        }

        /**
         * @public
         * @member {Rectangle}
         */

    }, {
        key: 'bounds',
        get: function get() {
            return this.getBounds();
        }
    }]);

    return Renderable;
}(_Transformable3.default);

exports.default = Renderable;

/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(7);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _ObservableVector = __webpack_require__(19);

var _ObservableVector2 = _interopRequireDefault(_ObservableVector);

var _Matrix = __webpack_require__(10);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Transformable
 * @extends {EventEmitter}
 */
var Transformable = function (_EventEmitter) {
    _inherits(Transformable, _EventEmitter);

    /**
     * @constructor
     */
    function Transformable() {
        _classCallCheck(this, Transformable);

        /**
         * @private
         * @member {Matrix}
         */
        var _this = _possibleConstructorReturn(this, (Transformable.__proto__ || Object.getPrototypeOf(Transformable)).call(this));

        _this._transform = new _Matrix2.default();

        /**
         * @private
         * @member {ObservableVector}
         */
        _this._position = new _ObservableVector2.default(_this._setDirty, _this);

        /**
         * @private
         * @member {ObservableVector}
         */
        _this._scale = new _ObservableVector2.default(_this._setDirty, _this, 1, 1);

        /**
         * @private
         * @member {ObservableVector}
         */
        _this._origin = new _ObservableVector2.default(_this._setDirty, _this, 0, 0);

        /**
         * @private
         * @member {Number}
         */
        _this._rotation = 0;

        /**
         * @private
         * @member {Boolean}
         */
        _this._dirtyTransform = true;
        return _this;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(Transformable, [{
        key: 'setPosition',


        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Transformable}
         */
        value: function setPosition(x, y) {
            this._position.set(x, y);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Transformable}
         */

    }, {
        key: 'setScale',
        value: function setScale(x, y) {
            this._scale.set(x, y);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Transformable}
         */

    }, {
        key: 'setOrigin',
        value: function setOrigin(x, y) {
            this._origin.set(x, y);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} angle
         * @returns {Transformable}
         */

    }, {
        key: 'setRotation',
        value: function setRotation(angle) {
            var rotation = angle % 360;

            this._rotation = rotation < 0 ? rotation + 360 : rotation;
            this._dirtyTransform = true;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Transformable}
         */

    }, {
        key: 'move',
        value: function move(x, y) {
            return this.setPosition(this.x + x, this.y + y);
        }

        /**
         * @public
         * @chainable
         * @param {Number} angle
         * @returns {Transformable}
         */

    }, {
        key: 'rotate',
        value: function rotate(angle) {
            return this.setRotation(this._rotation + angle);
        }

        /**
         * @public
         * @chainable
         * @returns {Transformable}
         */

    }, {
        key: 'updateTransform',
        value: function updateTransform() {
            var transform = this._transform,
                position = this._position,
                scale = this._scale,
                origin = this._origin,
                angle = this._rotation * _const.DEG_TO_RAD,
                cos = Math.cos(angle),
                sin = Math.sin(angle),
                sxc = scale.x * cos,
                syc = scale.y * cos,
                sxs = scale.x * sin,
                sys = scale.y * sin;

            transform.a = sxc;
            transform.b = sys;
            transform.x = origin.x * -sxc - origin.y * sys + position.x;

            transform.c = -sxs;
            transform.d = syc;
            transform.y = origin.x * sxs - origin.y * syc + position.y;

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Transformable.prototype.__proto__ || Object.getPrototypeOf(Transformable.prototype), 'destroy', this).call(this);

            this._transform.destroy();
            this._transform = null;

            this._position.destroy();
            this._position = null;

            this._scale.destroy();
            this._scale = null;

            this._origin.destroy();
            this._origin = null;

            this._rotation = null;
            this._dirtyTransform = null;
        }

        /**
         * @private
         */

    }, {
        key: '_setDirty',
        value: function _setDirty() {
            this._dirtyTransform = true;
        }
    }, {
        key: 'x',
        get: function get() {
            return this._position.x;
        },
        set: function set(x) {
            this._position.x = x;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'y',
        get: function get() {
            return this._position.y;
        },
        set: function set(y) {
            this._position.y = y;
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'position',
        get: function get() {
            return this._position;
        },
        set: function set(position) {
            this._position.copy(position);
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'scale',
        get: function get() {
            return this._scale;
        },
        set: function set(scale) {
            this._scale.copy(scale);
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'origin',
        get: function get() {
            return this._origin;
        },
        set: function set(origin) {
            this._origin.copy(origin);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'rotation',
        get: function get() {
            return this._rotation;
        },
        set: function set(rotation) {
            this.setRotation(rotation);
        }

        /**
         * @public
         * @member {Matrix}
         */

    }, {
        key: 'transform',
        get: function get() {
            if (this._dirtyTransform) {
                this.updateTransform();
                this._dirtyTransform = false;
            }

            return this._transform;
        },
        set: function set(transform) {
            this._transform.copy(transform);
        }
    }]);

    return Transformable;
}(_EventEmitter3.default);

exports.default = Transformable;

/***/ }),
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
        value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class RC4
 */
var RC4 = function () {

        /**
         * @constructor
         * @param {Number[]} keys
         */
        function RC4(keys) {
                _classCallCheck(this, RC4);

                /**
                 * @private
                 * @member {Number}
                 */
                this._i = 0;

                /**
                 * @private
                 * @member {Number}
                 */
                this._j = 0;

                /**
                 * @private
                 * @member {Number[]}
                 */
                this._keys = [];

                this.setKeys(keys);
        }

        /**
         * @public
         * @param {Number[]} newKeys
         */


        _createClass(RC4, [{
                key: "setKeys",
                value: function setKeys(newKeys) {
                        var keys = this._keys,
                            width = 256,
                            mask = 255;

                        var len = newKeys.length,
                            j = 0;

                        this._i = 0;
                        this._j = 0;

                        keys.length = 0;

                        if (!len) {
                                newKeys = [len++];
                        }

                        for (var i = 0; i < width; i++) {
                                keys[i] = i;
                        }

                        for (var _i = 0; _i < width; _i++) {
                                var t = keys[_i];

                                j = mask & j + newKeys[_i % len] + t;

                                keys[_i] = keys[j];
                                keys[j] = t;
                        }

                        this.next(width);
                }

                /**
                 * @public
                 * @param {Number} count
                 * @returns {Number}
                 */

        }, {
                key: "next",
                value: function next(count) {
                        var keys = this._keys;

                        var result = 0,
                            i = this._i,
                            j = this._j,
                            t = void 0;

                        while (count--) {
                                i = 255 & i + 1;
                                t = keys[i];
                                j = 255 & j + t;

                                keys[i] = keys[j];
                                keys[j] = t;

                                result = result * 256 + keys[255 & keys[i] + keys[j]];
                        }

                        this._i = i;
                        this._j = j;

                        return result;
                }
        }]);

        return RC4;
}();

exports.default = RC4;

/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class SceneManager
 */
var SceneManager = function () {

    /**
     * @constructor
     * @param {Game} game
     */
    function SceneManager(game) {
        _classCallCheck(this, SceneManager);

        /**
         * @private
         * @member {Game}
         */
        this._game = game;

        /**
         * @private
         * @member {?Scene}
         */
        this._currentScene = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._sceneActive = false;

        game.on('scene:change', this.onSceneChange, this).on('scene:start', this.onSceneStart, this).on('scene:stop', this.onSceneStop, this);
    }

    /**
     * @public
     * @param {Time} delta
     */


    _createClass(SceneManager, [{
        key: 'update',
        value: function update(delta) {
            if (!this._currentScene || !this._sceneActive) {
                return;
            }

            this._currentScene.update(delta);
        }

        /**
         * @private
         * @param {Scene} scene
         */

    }, {
        key: 'onSceneChange',
        value: function onSceneChange(scene) {
            this._game.trigger('scene:stop');

            this._currentScene = scene;
            this._currentScene.game = this._game;
            this._currentScene.load(this._game.loader);
        }

        /**
         * @private
         */

    }, {
        key: 'onSceneStart',
        value: function onSceneStart() {
            if (!this._currentScene) {
                throw new Error('No scene was specified, use scene:change!');
            }

            if (this._sceneActive) {
                throw new Error('Scene can only be started once!');
            }

            this._sceneActive = true;
            this._currentScene.init();
        }

        /**
         * @private
         */

    }, {
        key: 'onSceneStop',
        value: function onSceneStop() {
            if (!this._currentScene) {
                return;
            }

            if (this._sceneActive) {
                this._currentScene.unload();
                this._sceneActive = false;
            }

            this._currentScene.destroy();
            this._currentScene = null;

            this._game.loader.off();
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._game.trigger('scene:stop').off('scene:change', this.onSceneChange, this).off('scene:start', this.onSceneStart, this).off('scene:stop', this.onSceneStop, this);

            this._game = null;
        }
    }]);

    return SceneManager;
}();

exports.default = SceneManager;

/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _RenderTarget = __webpack_require__(29);

var _RenderTarget2 = _interopRequireDefault(_RenderTarget);

var _SpriteRenderer = __webpack_require__(31);

var _SpriteRenderer2 = _interopRequireDefault(_SpriteRenderer);

var _ParticleRenderer = __webpack_require__(35);

var _ParticleRenderer2 = _interopRequireDefault(_ParticleRenderer);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _Matrix = __webpack_require__(10);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _const = __webpack_require__(0);

var _BlendMode = __webpack_require__(37);

var _BlendMode2 = _interopRequireDefault(_BlendMode);

var _support = __webpack_require__(5);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class DisplayManager
 */
var DisplayManager = function () {

    /**
     * @constructor
     * @param {Game} game
     * @param {Object} [config]
     * @param {Number} [config.width=800]
     * @param {Number} [config.height=600]
     * @param {Color} [config.clearColor=Color.White]
     * @param {Boolean} [config.clearBeforeRender=true]
     * @param {Object} [config.contextOptions]
     */
    function DisplayManager(game) {
        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            _ref$width = _ref.width,
            width = _ref$width === undefined ? 800 : _ref$width,
            _ref$height = _ref.height,
            height = _ref$height === undefined ? 600 : _ref$height,
            _ref$clearColor = _ref.clearColor,
            clearColor = _ref$clearColor === undefined ? _Color2.default.White : _ref$clearColor,
            _ref$clearBeforeRende = _ref.clearBeforeRender,
            clearBeforeRender = _ref$clearBeforeRende === undefined ? true : _ref$clearBeforeRende,
            contextOptions = _ref.contextOptions;

        _classCallCheck(this, DisplayManager);

        if (!_support2.default.webGL) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = game.canvas;

        /**
         * @private
         * @member {WebGLRenderingContext}
         */
        this._context = this._createContext(contextOptions);

        if (!this._context) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        /**
         * @private
         * @member {Boolean}
         */
        this._contextLost = this._context.isContextLost();

        /**
         * @private
         * @member {Color}
         */
        this._clearColor = clearColor.clone();

        /**
         * @private
         * @member {Boolean}
         */
        this._clearBeforeRender = clearBeforeRender;

        /**
         * @private
         * @member {Boolean}
         */
        this._isRendering = false;

        /**
         * @private
         * @member {Map<String, Renderer>}
         */
        this._renderers = new Map();

        /**
         * @private
         * @member {?Renderer}
         */
        this._currentRenderer = null;

        /**
         * @private
         * @member {Matrix}
         */
        this._worldTransform = new _Matrix2.default();

        /**
         * @private
         * @member {RenderTarget}
         */
        this._rootRenderTarget = new _RenderTarget2.default(width, height, true);

        /**
         * @private
         * @member {?RenderTarget}
         */
        this._renderTarget = null;

        /**
         * @private
         * @member {Map<Number, BlendMode>}
         */
        this._blendModes = this._createBlendModes(this._context);

        /**
         * @private
         * @member {?Number}
         */
        this._currentBlendMode = null;

        /**
         * @private
         * @member {Matrix}
         */
        this._projection = new _Matrix2.default();

        this._addEvents();
        this._setGLFlags();

        this.setBlendMode(_const.BLEND_MODE.SOURCE_OVER);
        this.setClearColor(this._clearColor);
        this.setRenderTarget(this._rootRenderTarget);

        this.addRenderer('sprite', new _SpriteRenderer2.default());
        this.addRenderer('particle', new _ParticleRenderer2.default());

        this.resize(width, height);

        game.on('display:begin', this.begin, this).on('display:render', this.render, this).on('display:end', this.end, this).on('display:clear', this.clear, this).on('display:resize', this.resize, this).on('display:view', this.setView, this);
    }

    /**
     * @public
     * @readonly
     * @member {WebGLRenderingContext}
     */


    _createClass(DisplayManager, [{
        key: 'addRenderer',


        /**
         * @public
         * @param {String} name
         * @param {SpriteRenderer|ParticleRenderer|Renderer} renderer
         */
        value: function addRenderer(name, renderer) {
            if (this._renderers.has(name)) {
                throw new Error('Renderer "' + name + '" was already added.');
            }

            renderer.setContext(this._context);
            this._renderers.set(name, renderer);
        }

        /**
         * @public
         * @param {String} name
         * @returns {Renderer}
         */

    }, {
        key: 'getRenderer',
        value: function getRenderer(name) {
            if (!this._renderers.has(name)) {
                throw new Error('Could not find renderer "' + name + '".');
            }

            var renderer = this._renderers.get(name),
                currentRenderer = this._currentRenderer;

            if (currentRenderer !== renderer) {
                if (currentRenderer) {
                    currentRenderer.unbind();
                }

                this._currentRenderer = renderer;
                this._currentRenderer.setProjection(this._projection);
                this._currentRenderer.bind();
            }

            return renderer;
        }

        /**
         * @public
         * @param {?RenderTarget} renderTarget
         */

    }, {
        key: 'setRenderTarget',
        value: function setRenderTarget(renderTarget) {
            var newTarget = renderTarget || this._rootRenderTarget;

            if (this._renderTarget !== newTarget) {
                newTarget.setContext(this._context);
                newTarget.bind();

                this._renderTarget = newTarget;
            }
        }

        /**
         * @public
         * @param {Number} blendMode
         */

    }, {
        key: 'setBlendMode',
        value: function setBlendMode(blendMode) {
            if (!this._blendModes.has(blendMode)) {
                throw new Error('Blendmode "' + blendMode + '" is not supported.');
            }

            if (blendMode !== this._currentBlendMode) {
                var blending = this._blendModes.get(blendMode);

                this._currentBlendMode = blendMode;
                this._context.blendFunc(blending.sFactor, blending.dFactor);
            }
        }

        /**
         * @public
         * @param {Number} width
         * @param {Number} height
         */

    }, {
        key: 'resize',
        value: function resize(width, height) {
            this._canvas.width = width;
            this._canvas.height = height;

            this._rootRenderTarget.resize(width, height);
            this.setProjection(this._rootRenderTarget.projection);
        }

        /**
         * @public
         * @param {View} view
         */

    }, {
        key: 'setView',
        value: function setView(view) {
            this._renderTarget.setView(view);

            if (this._renderTarget === this._rootRenderTarget) {
                this.setProjection(this._rootRenderTarget.projection);
            }
        }

        /**
         * @public
         * @param {Matrix} projection
         */

    }, {
        key: 'setProjection',
        value: function setProjection(projection) {
            this._projection.copy(projection);

            if (this._currentRenderer) {
                this._currentRenderer.setProjection(this._projection);
            }
        }

        /**
         * @public
         * @param {Color} [color=this._clearColor]
         */

    }, {
        key: 'clear',
        value: function clear() {
            var color = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._clearColor;

            var gl = this._context;

            if (color) {
                this.setClearColor(color);
            }

            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        /**
         * @public
         * @param {Color} color
         */

    }, {
        key: 'setClearColor',
        value: function setClearColor(color) {
            if (!this._clearColor.equals(color)) {
                this._clearColor.copy(color);
                this._context.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);
            }
        }

        /**
         * @public
         */

    }, {
        key: 'begin',
        value: function begin() {
            if (this._isRendering) {
                throw new Error('Renderer has already begun!');
            }

            this._isRendering = true;

            if (this._clearBeforeRender) {
                this.clear();
            }
        }

        /**
         * @public
         * @param {*} renderable
         */

    }, {
        key: 'render',
        value: function render(renderable) {
            if (!this._isRendering) {
                throw new Error('Renderer needs to begin first!');
            }

            if (!this._contextLost) {
                renderable.render(this, this._worldTransform);
            }
        }

        /**
         * @public
         */

    }, {
        key: 'end',
        value: function end() {
            if (!this._isRendering) {
                throw new Error('Renderer needs to begin first!');
            }

            this._isRendering = false;

            if (this._currentRenderer && !this._contextLost) {
                this._currentRenderer.flush();
            }
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._removeEvents();

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._renderers.values()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var renderer = _step.value;

                    renderer.destroy();
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this._blendModes.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var blendMode = _step2.value;

                    blendMode.destroy();
                }
            } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion2 && _iterator2.return) {
                        _iterator2.return();
                    }
                } finally {
                    if (_didIteratorError2) {
                        throw _iteratorError2;
                    }
                }
            }

            this._renderers.clear();
            this._renderers = null;

            this._blendModes.clear();
            this._blendModes = null;

            this._clearColor.destroy();
            this._clearColor = null;

            this._worldTransform.destroy();
            this._worldTransform = null;

            this._rootRenderTarget.destroy();
            this._rootRenderTarget = null;

            this._projection.destroy();
            this._projection = null;

            this._clearBeforeRender = null;
            this._isRendering = null;
            this._contextLost = null;
            this._currentRenderer = null;
            this._currentBlendMode = null;
            this._renderTarget = null;
            this._context = null;
            this._canvas = null;
        }

        /**
         * @override
         */

    }, {
        key: '_createContext',
        value: function _createContext() {
            var _ref2 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                _ref2$alpha = _ref2.alpha,
                alpha = _ref2$alpha === undefined ? false : _ref2$alpha,
                _ref2$antialias = _ref2.antialias,
                antialias = _ref2$antialias === undefined ? false : _ref2$antialias,
                _ref2$premultipliedAl = _ref2.premultipliedAlpha,
                premultipliedAlpha = _ref2$premultipliedAl === undefined ? false : _ref2$premultipliedAl,
                _ref2$preserveDrawing = _ref2.preserveDrawingBuffer,
                preserveDrawingBuffer = _ref2$preserveDrawing === undefined ? false : _ref2$preserveDrawing,
                _ref2$stencil = _ref2.stencil,
                stencil = _ref2$stencil === undefined ? true : _ref2$stencil,
                _ref2$depth = _ref2.depth,
                depth = _ref2$depth === undefined ? false : _ref2$depth;

            try {
                return this._canvas.getContext('webgl', {
                    alpha: alpha,
                    antialias: antialias,
                    premultipliedAlpha: premultipliedAlpha,
                    preserveDrawingBuffer: preserveDrawingBuffer,
                    stencil: stencil,
                    depth: depth
                }) || this._canvas.getContext('experimental-webgl', {
                    alpha: alpha,
                    antialias: antialias,
                    premultipliedAlpha: premultipliedAlpha,
                    preserveDrawingBuffer: preserveDrawingBuffer,
                    stencil: stencil,
                    depth: depth
                });
            } catch (e) {
                return null;
            }
        }

        /**
         * @override
         */

    }, {
        key: '_createBlendModes',
        value: function _createBlendModes(gl) {
            var one = gl.ONE,
                srcAlpha = gl.SRC_ALPHA,
                dstAlpha = gl.DST_ALPHA,
                oneMinusSrcAlpha = gl.ONE_MINUS_SRC_ALPHA;

            return new Map([[_const.BLEND_MODE.SOURCE_OVER, new _BlendMode2.default(one, oneMinusSrcAlpha, 'source-over')], [_const.BLEND_MODE.ADD, new _BlendMode2.default(srcAlpha, dstAlpha, 'lighter')], [_const.BLEND_MODE.MULTIPLY, new _BlendMode2.default(dstAlpha, oneMinusSrcAlpha, 'multiply')], [_const.BLEND_MODE.SCREEN, new _BlendMode2.default(srcAlpha, one, 'screen')], [_const.BLEND_MODE.OVERLAY, new _BlendMode2.default(one, oneMinusSrcAlpha, 'overlay')], [_const.BLEND_MODE.DARKEN, new _BlendMode2.default(one, oneMinusSrcAlpha, 'darken')], [_const.BLEND_MODE.LIGHTEN, new _BlendMode2.default(one, oneMinusSrcAlpha, 'lighten')], [_const.BLEND_MODE.COLOR_DODGE, new _BlendMode2.default(one, oneMinusSrcAlpha, 'color-dodge')], [_const.BLEND_MODE.COLOR_BURN, new _BlendMode2.default(one, oneMinusSrcAlpha, 'color-burn')], [_const.BLEND_MODE.HARD_LIGHT, new _BlendMode2.default(one, oneMinusSrcAlpha, 'hard-light')], [_const.BLEND_MODE.SOFT_LIGHT, new _BlendMode2.default(one, oneMinusSrcAlpha, 'soft-light')], [_const.BLEND_MODE.DIFFERENCE, new _BlendMode2.default(one, oneMinusSrcAlpha, 'difference')], [_const.BLEND_MODE.EXCLUSION, new _BlendMode2.default(one, oneMinusSrcAlpha, 'exclusion')], [_const.BLEND_MODE.HUE, new _BlendMode2.default(one, oneMinusSrcAlpha, 'hue')], [_const.BLEND_MODE.SATURATION, new _BlendMode2.default(one, oneMinusSrcAlpha, 'saturation')], [_const.BLEND_MODE.COLOR, new _BlendMode2.default(one, oneMinusSrcAlpha, 'color')], [_const.BLEND_MODE.LUMINOSITY, new _BlendMode2.default(one, oneMinusSrcAlpha, 'luminosity')]]);
        }

        /**
         * @private
         */

    }, {
        key: '_addEvents',
        value: function _addEvents() {
            this._onContextLostHandler = this._onContextLost.bind(this);
            this._onContextRestoredHandler = this._onContextRestored.bind(this);

            this._canvas.addEventListener('webglcontextlost', this._onContextLostHandler, false);
            this._canvas.addEventListener('webglcontextrestored', this._onContextRestoredHandler, false);
        }

        /**
         * @private
         */

    }, {
        key: '_removeEvents',
        value: function _removeEvents() {
            this._canvas.removeEventListener('webglcontextlost', this._onContextLostHandler, false);
            this._canvas.removeEventListener('webglcontextrestored', this._onContextRestoredHandler, false);

            this._onContextLostHandler = null;
            this._onContextRestoredHandler = null;
        }

        /**
         * @private
         */

    }, {
        key: '_setGLFlags',
        value: function _setGLFlags() {
            var gl = this._context;

            gl.colorMask(true, true, true, false);
            gl.disable(gl.DEPTH_TEST);
            gl.disable(gl.CULL_FACE);
            gl.enable(gl.BLEND);
        }

        /**
         * @private
         */

    }, {
        key: '_onContextLost',
        value: function _onContextLost() {
            this._contextLost = true;
        }

        /**
         * @private
         */

    }, {
        key: '_onContextRestored',
        value: function _onContextRestored() {
            this._contextLost = false;
        }
    }, {
        key: 'context',
        get: function get() {
            return this._context;
        }

        /**
         * @public
         * @member {RenderTarget}
         */

    }, {
        key: 'renderTarget',
        get: function get() {
            return this._renderTarget;
        },
        set: function set(renderTarget) {
            this.setRenderTarget(renderTarget);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'currentBlendMode',
        get: function get() {
            return this._currentBlendMode;
        },
        set: function set(blendMode) {
            this.setBlendMode(blendMode);
        }

        /**
         * @public
         * @member {Color}
         */

    }, {
        key: 'clearColor',
        get: function get() {
            return this._clearColor;
        },
        set: function set(color) {
            this.setClearColor(color);
        }
    }]);

    return DisplayManager;
}();

exports.default = DisplayManager;

/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _View = __webpack_require__(30);

var _View2 = _interopRequireDefault(_View);

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class RenderTarget
 */
var RenderTarget = function () {

    /**
     * @constructor
     * @param {Number} width
     * @param {Number} height
     * @param {Boolean} [isRoot = false]
     */
    function RenderTarget(width, height) {
        var isRoot = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

        _classCallCheck(this, RenderTarget);

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLFramebuffer}
         */
        this._frameBuffer = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._isRoot = isRoot;

        /**
         * @private
         * @member {Vector}
         */
        this._size = new _Vector2.default(width, height);

        /**
         * @private
         * @member {Rectangle}
         */
        this._viewport = new _Rectangle2.default();

        /**
         * @private
         * @member {View}
         */
        this._defaultView = new _View2.default(new _Rectangle2.default(0, 0, width, height));

        /**
         * @private
         * @member {View}
         */
        this._view = this._defaultView;
    }

    /**
     * @public
     * @member {Vector}
     */


    _createClass(RenderTarget, [{
        key: 'setContext',


        /**
         * @public
         * @param {WebGLRenderingContext} gl
         */
        value: function setContext(gl) {
            if (!this._context) {
                this._context = gl;
                this._frameBuffer = this._isRoot ? null : gl.createFramebuffer();
            }
        }

        /**
         * @public
         */

    }, {
        key: 'bind',
        value: function bind() {
            var gl = this._context;

            gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);
        }

        /**
         * @public
         * @param {View} view
         * @returns {Rectangle}
         */

    }, {
        key: 'getViewport',
        value: function getViewport(view) {
            var width = this.width,
                height = this.height,
                viewport = view.viewport;

            return this._viewport.set(0.5 + width * viewport.x | 0, 0.5 + height * viewport.y | 0, 0.5 + width * viewport.width | 0, 0.5 + height * viewport.height | 0);
        }

        /**
         * @public
         */

    }, {
        key: 'updateViewport',
        value: function updateViewport() {
            var gl = this._context,
                viewport = this.getViewport(this._view);

            gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
        }

        /**
         * @public
         * @param {Number} width
         * @param {Number} height
         */

    }, {
        key: 'resize',
        value: function resize(width, height) {
            this._size.set(width, height);

            this.updateViewport();
        }

        /**
         * @public
         * @param {View} view
         */

    }, {
        key: 'setView',
        value: function setView(view) {
            this._view = view;

            this.updateViewport();
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            if (this._frameBuffer) {
                this._context.deleteFramebuffer(this._frameBuffer);
                this._frameBuffer = null;
            }

            this._defaultView.destroy();
            this._defaultView = null;

            this._viewport.destroy();
            this._viewport = null;

            this._size.destroy();
            this._size = null;

            this._view = null;
            this._isRoot = null;
            this._context = null;
        }
    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(size) {
            this._size.copy(size);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return this._size.x;
        },
        set: function set(width) {
            this._size.x = width | 0;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._size.y;
        },
        set: function set(height) {
            this._size.y = height | 0;
        }

        /**
         * @public
         * @readonly
         * @member {Matrix}
         */

    }, {
        key: 'projection',
        get: function get() {
            return this._view.transform;
        }
    }]);

    return RenderTarget;
}();

exports.default = RenderTarget;

/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ObservableVector = __webpack_require__(19);

var _ObservableVector2 = _interopRequireDefault(_ObservableVector);

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Matrix = __webpack_require__(10);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class View
 */
var View = function () {

    /**
     * @constructor
     * @param {Rectangle} viewRectangle
     */
    function View() {
        var viewRectangle = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : new _Rectangle2.default(0, 0, 100, 100);

        _classCallCheck(this, View);

        /**
         * @private
         * @member {ObservableVector}
         */
        this._center = new _ObservableVector2.default(this._setDirty, this);

        /**
         * @private
         * @member {ObservableVector}
         */
        this._size = new _ObservableVector2.default(this._setDirty, this);

        /**
         * @private
         * @member {Number}
         */
        this._rotation = 0;

        /**
         * @private
         * @member {Rectangle}
         */
        this._viewport = new _Rectangle2.default(0, 0, 1, 1);

        /**
         * @private
         * @member {Matrix}
         */
        this._transform = new _Matrix2.default();

        /**
         * @private
         * @member {Boolean}
         */
        this._dirtyTransform = true;

        this.reset(viewRectangle);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */


    _createClass(View, [{
        key: 'setCenter',


        /**
         * @public
         * @param {Number} x
         * @param {Number} y
         */
        value: function setCenter(x, y) {
            this._center.set(x, y);
        }

        /**
         * @public
         * @param {Number} width
         * @param {Number} height
         */

    }, {
        key: 'setSize',
        value: function setSize(width, height) {
            this._size.set(width, height);
        }

        /**
         * @public
         * @param {Number} angle
         */

    }, {
        key: 'setRotation',
        value: function setRotation(angle) {
            var rotation = angle % 360;

            this._rotation = rotation < 0 ? rotation + 360 : rotation;
            this._dirtyTransform = true;
        }

        /**
         * @public
         * @param {Rectangle} rectangle
         */

    }, {
        key: 'setViewport',
        value: function setViewport(rectangle) {
            this._viewport.copy(rectangle);
        }

        /**
         * @public
         * @param {Number} x
         * @param {Number} y
         */

    }, {
        key: 'move',
        value: function move(x, y) {
            this.setCenter(this._center.x + x, this._center.y + y);
        }

        /**
         * @public
         * @param {Number} factor
         */

    }, {
        key: 'zoom',
        value: function zoom(factor) {
            this.setSize(this._size.x * factor, this._size.y * factor);
        }

        /**
         * @public
         * @param {Number} angle
         */

    }, {
        key: 'rotate',
        value: function rotate(angle) {
            this.setRotation(this._rotation + angle);
        }

        /**
         * @public
         * @param {Rectangle} rectangle
         */

    }, {
        key: 'reset',
        value: function reset(rectangle) {
            this._center.set(rectangle.x + rectangle.width / 2 | 0, rectangle.y + rectangle.height / 2 | 0);
            this._size.set(rectangle.width, rectangle.height);
            this._rotation = 0;
            this._dirtyTransform = true;
        }

        /**
         * @public
         */

    }, {
        key: 'updateTransform',
        value: function updateTransform() {
            var transform = this._transform,
                angle = this._rotation * _const.DEG_TO_RAD,
                center = this._center,
                size = this._size,
                cos = Math.cos(angle),
                sin = Math.sin(angle),
                a = 2 / size.x,
                b = -2 / size.y,
                c = -a * center.x,
                d = -b * center.y,
                tx = -center.x * cos - center.y * sin + center.x,
                ty = center.x * sin - center.y * cos + center.y;

            transform.a = a * cos;
            transform.b = a * sin;
            transform.x = a * tx + c;

            transform.c = -b * sin;
            transform.d = b * cos;
            transform.y = b * ty + d;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._center.destroy();
            this._center = null;

            this._size.destroy();
            this._size = null;

            this._viewport.destroy();
            this._viewport = null;

            this._transform.destroy();
            this._transform = null;

            this._rotation = null;
            this._dirtyTransform = null;
        }

        /**
         * @private
         */

    }, {
        key: '_setDirty',
        value: function _setDirty() {
            this._dirtyTransform = true;
        }
    }, {
        key: 'width',
        get: function get() {
            return this._size.x;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._size.y;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'left',
        get: function get() {
            return this._center.x - this._size.x / 2;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'top',
        get: function get() {
            return this._center.y - this._size.y / 2;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'right',
        get: function get() {
            return this._center.x + this._size.x / 2;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'bottom',
        get: function get() {
            return this._center.y + this._size.y / 2;
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'center',
        get: function get() {
            return this._center;
        },
        set: function set(center) {
            this._center.copy(center);
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(size) {
            this._size.copy(size);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'rotation',
        get: function get() {
            return this._rotation;
        },
        set: function set(rotation) {
            this.setRotation(rotation);
        }

        /**
         * @public
         * @member {Rectangle}
         */

    }, {
        key: 'viewport',
        get: function get() {
            return this._viewport;
        },
        set: function set(viewport) {
            this._viewport.copy(viewport);
            this._dirtyTransform = true;
        }

        /**
         * @public
         * @member {Matrix}
         */

    }, {
        key: 'transform',
        get: function get() {
            if (this._dirtyTransform) {
                this.updateTransform();
                this._dirtyTransform = false;
            }

            return this._transform;
        },
        set: function set(transform) {
            this._transform.copy(transform);
        }
    }]);

    return View;
}();

exports.default = View;

/***/ }),
/* 31 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
        value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderer2 = __webpack_require__(21);

var _Renderer3 = _interopRequireDefault(_Renderer2);

var _SpriteShader = __webpack_require__(32);

var _SpriteShader2 = _interopRequireDefault(_SpriteShader);

var _settings = __webpack_require__(4);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SpriteRenderer
 * @extends {Renderer}
 */
var SpriteRenderer = function (_Renderer) {
        _inherits(SpriteRenderer, _Renderer);

        /**
         * @constructor
         */
        function SpriteRenderer() {
                _classCallCheck(this, SpriteRenderer);

                /**
                 * @private
                 * @member {Number}
                 */
                var _this = _possibleConstructorReturn(this, (SpriteRenderer.__proto__ || Object.getPrototypeOf(SpriteRenderer)).call(this));

                _this._indexCount = 6;

                /**
                 * @private
                 * @member {Number}
                 */
                _this._vertexCount = 4;

                /**
                 * 2 = position (x, y) +
                 * 2 = texCoord (x, y) +
                 * 1 = color    (ARGB int)
                 *
                 * @private
                 * @member {Number}
                 */
                _this._vertexPropCount = 5;

                /**
                 * Vertex property count times the vertices per sprite.
                 *
                 * @private
                 * @member {Number}
                 */
                _this._spriteVertexSize = _this._vertexCount * _this._vertexPropCount;

                /**
                 * @private
                 * @member {Number}
                 */
                _this._maxSprites = _settings2.default.SPRITE_BATCH_SIZE;

                /**
                 * @private
                 * @member {ArrayBuffer}
                 */
                _this._vertexData = new ArrayBuffer(_this._maxSprites * _this._spriteVertexSize * 4);

                /**
                 * @private
                 * @member {Float32Array}
                 */
                _this._vertexView = new Float32Array(_this._vertexData);

                /**
                 * @private
                 * @member {Uint32Array}
                 */
                _this._colorView = new Uint32Array(_this._vertexData);

                /**
                 * @private
                 * @member {Uint16Array}
                 */
                _this._indexData = _Renderer3.default.createIndexBuffer(_this._maxSprites * _this._indexCount);

                /**
                 * Current amount of elements inside the batch to draw.
                 *
                 * @private
                 * @member {Number}
                 */
                _this._batchSize = 0;

                /**
                 * @private
                 * @member {SpriteShader}
                 */
                _this._shader = new _SpriteShader2.default();

                /**
                 * @private
                 * @member {?Texture}
                 */
                _this._currentTexture = null;

                /**
                 * @private
                 * @member {Boolean}
                 */
                _this._bound = false;
                return _this;
        }

        /**
         * @override
         */


        _createClass(SpriteRenderer, [{
                key: 'setContext',
                value: function setContext(gl) {
                        if (!this._context) {
                                this._context = gl;
                                this._indexBuffer = gl.createBuffer();
                                this._vertexBuffer = gl.createBuffer();
                                this._shader.setContext(gl);
                        }
                }

                /**
                 * @override
                 */

        }, {
                key: 'setProjection',
                value: function setProjection(projection) {
                        this._shader.setProjection(projection);
                }

                /**
                 * @override
                 */

        }, {
                key: 'bind',
                value: function bind() {
                        if (!this._bound) {
                                var gl = this._context;

                                gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
                                gl.bufferData(gl.ARRAY_BUFFER, this._vertexData, gl.DYNAMIC_DRAW);

                                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
                                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);

                                this._shader.bind();
                                this._bound = true;
                        }
                }

                /**
                 * @override
                 */

        }, {
                key: 'unbind',
                value: function unbind() {
                        if (this._bound) {
                                this.flush();
                                this._shader.unbind();
                                this._bound = false;
                        }
                }

                /**
                 * @override
                 * @param {Sprite} sprite
                 */

        }, {
                key: 'render',
                value: function render(sprite) {
                        if (this._currentTexture !== sprite.texture) {
                                this.flush();

                                this._shader.setSpriteTexture(sprite.texture);
                                this._currentTexture = sprite.texture;
                        }

                        if (this._batchSize >= this._maxSprites) {
                                this.flush();
                        }

                        var vertexBuffer = this._vertexView,
                            colorBuffer = this._colorView,
                            transform = sprite.worldTransform,
                            vertexData = sprite.vertexData,
                            index = this._batchSize * this._spriteVertexSize;

                        this._currentTexture.glTexture.update();

                        // X & Y
                        vertexBuffer[index] = vertexData[0] * transform.a + vertexData[1] * transform.b + transform.x;
                        vertexBuffer[index + 1] = vertexData[0] * transform.c + vertexData[1] * transform.d + transform.y;

                        // U & V
                        vertexBuffer[index + 2] = vertexData[2];
                        vertexBuffer[index + 3] = vertexData[3];

                        // X & Y
                        vertexBuffer[index + 5] = vertexData[4] * transform.a + vertexData[5] * transform.b + transform.x;
                        vertexBuffer[index + 6] = vertexData[4] * transform.c + vertexData[5] * transform.d + transform.y;

                        // U & V
                        vertexBuffer[index + 7] = vertexData[6];
                        vertexBuffer[index + 8] = vertexData[7];

                        // X & Y
                        vertexBuffer[index + 10] = vertexData[8] * transform.a + vertexData[9] * transform.b + transform.x;
                        vertexBuffer[index + 11] = vertexData[8] * transform.c + vertexData[9] * transform.d + transform.y;

                        // U & V
                        vertexBuffer[index + 12] = vertexData[10];
                        vertexBuffer[index + 13] = vertexData[11];

                        // X & Y
                        vertexBuffer[index + 15] = vertexData[12] * transform.a + vertexData[13] * transform.b + transform.x;
                        vertexBuffer[index + 16] = vertexData[12] * transform.c + vertexData[13] * transform.d + transform.y;

                        // U & V
                        vertexBuffer[index + 17] = vertexData[14];
                        vertexBuffer[index + 18] = vertexData[15];

                        // Tint
                        colorBuffer[index + 4] = colorBuffer[index + 9] = colorBuffer[index + 14] = colorBuffer[index + 19] = sprite.tint.rgba;

                        this._batchSize++;
                }

                /**
                 * @override
                 */

        }, {
                key: 'flush',
                value: function flush() {
                        var gl = this._context;

                        if (!this._batchSize) {
                                return;
                        }

                        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._vertexView.subarray(0, this._batchSize * this._spriteVertexSize));
                        gl.drawElements(gl.TRIANGLES, this._batchSize * this._indexCount, gl.UNSIGNED_SHORT, 0);

                        this._batchSize = 0;
                }

                /**
                 * @override
                 */

        }, {
                key: 'destroy',
                value: function destroy() {
                        _get(SpriteRenderer.prototype.__proto__ || Object.getPrototypeOf(SpriteRenderer.prototype), 'destroy', this).call(this);

                        if (this._bound) {
                                this.unbind();
                        }

                        this._shader.destroy();
                        this._shader = null;

                        this._vertexData = null;
                        this._vertexView = null;
                        this._colorView = null;
                        this._indexData = null;
                        this._spriteVertexSize = null;
                        this._indexCount = null;
                        this._maxSprites = null;
                        this._batchSize = null;
                        this._currentTexture = null;
                        this._bound = null;
                }
        }]);

        return SpriteRenderer;
}(_Renderer3.default);

exports.default = SpriteRenderer;

/***/ }),
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Shader2 = __webpack_require__(22);

var _Shader3 = _interopRequireDefault(_Shader2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SpriteShader
 * @extends {Shader}
 */
var SpriteShader = function (_Shader) {
    _inherits(SpriteShader, _Shader);

    /**
     * @constructor
     */
    function SpriteShader() {
        _classCallCheck(this, SpriteShader);

        var _this = _possibleConstructorReturn(this, (SpriteShader.__proto__ || Object.getPrototypeOf(SpriteShader)).call(this));

        _this.setVertexSource(['precision lowp float;', 'attribute vec2 aVertexPosition;', 'attribute vec2 aTextureCoord;', 'attribute vec4 aColor;', 'uniform mat3 projectionMatrix;', 'varying vec2 vTextureCoord;', 'varying vec4 vColor;', 'void main(void) {', 'vTextureCoord = aTextureCoord;', 'vColor = vec4(aColor.rgb * aColor.a, aColor.a);', 'gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);', '}']);

        _this.setFragmentSource(['precision lowp float;', 'varying vec2 vTextureCoord;', 'varying vec4 vColor;', 'uniform sampler2D uSampler;', 'void main(void) {', 'gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor;', '}']);

        _this.setAttributes([{
            name: 'aVertexPosition',
            type: _const.ATTRIBUTE_TYPE.FLOAT,
            size: 2,
            normalized: false
        }, {
            name: 'aTextureCoord',
            type: _const.ATTRIBUTE_TYPE.FLOAT,
            size: 2,
            normalized: false
        }, {
            name: 'aColor',
            type: _const.ATTRIBUTE_TYPE.UNSIGNED_BYTE,
            size: 4,
            normalized: true
        }]);

        _this.setUniforms([{
            name: 'projectionMatrix',
            type: _const.UNIFORM_TYPE.FLOAT_MAT3
        }, {
            name: 'uSampler',
            type: _const.UNIFORM_TYPE.SAMPLER_2D,
            unit: 0
        }]);
        return _this;
    }

    /**
     * @public
     * @param {Matrix} projection
     */


    _createClass(SpriteShader, [{
        key: 'setProjection',
        value: function setProjection(projection) {
            this.getUniform('projectionMatrix').setMatrix(projection);
        }

        /**
         * @public
         * @param {Texture} texture
         */

    }, {
        key: 'setSpriteTexture',
        value: function setSpriteTexture(texture) {
            this.getUniform('uSampler').setTexture(texture, 0);
        }
    }]);

    return SpriteShader;
}(_Shader3.default);

exports.default = SpriteShader;

/***/ }),
/* 33 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class ShaderAttribute
 */
var ShaderAttribute = function () {

    /**
     * @constructor
     * @param {Object} options
     * @param {String} options.name
     * @param {Number} [options.type]
     * @param {Number} [options.size]
     * @param {Boolean} [options.normalized=false]
     * @param {Boolean} [options.enabled=true]
     */
    function ShaderAttribute() {
        var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
            name = _ref.name,
            type = _ref.type,
            _ref$size = _ref.size,
            size = _ref$size === undefined ? 1 : _ref$size,
            _ref$normalized = _ref.normalized,
            normalized = _ref$normalized === undefined ? false : _ref$normalized,
            _ref$enabled = _ref.enabled,
            enabled = _ref$enabled === undefined ? true : _ref$enabled;

        _classCallCheck(this, ShaderAttribute);

        /**
         * @private
         * @member {String}
         */
        this._name = name;

        /**
         * @private
         * @member {Number}
         */
        this._type = type;

        /**
         * @private
         * @member {Number}
         */
        this._size = size;

        /**
         * @private
         * @member {Boolean}
         */
        this._normalized = normalized;

        /**
         * @private
         * @member {Boolean}
         */
        this._enabled = enabled;

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?Number}
         */
        this._location = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */


    _createClass(ShaderAttribute, [{
        key: 'setContext',


        /**
         * @public
         * @param {WebGLRenderingContext} gl
         * @param {WebGLProgram} program
         */
        value: function setContext(gl, program) {
            if (this._context !== gl) {
                this._context = gl;
                this._location = gl.getAttribLocation(program, this._name);

                if (this._location === -1) {
                    throw new Error('Attribute location for attribute "' + this._name + '" is not available.');
                }
            }
        }

        /**
         * @public
         * @param {Boolean} enabled
         */

    }, {
        key: 'setEnabled',
        value: function setEnabled(enabled) {
            if (this._enabled !== enabled) {
                this._enabled = enabled;

                if (this._bound) {
                    this._upload();
                }
            }
        }

        /**
         * @public
         */

    }, {
        key: 'bind',
        value: function bind(stride, offset) {
            if (!this._bound) {
                this._bound = true;
                this._context.vertexAttribPointer(this._location, this._size, this._type, this._normalized, stride, offset);
                this._upload();
            }
        }

        /**
         * @public
         */

    }, {
        key: 'unbind',
        value: function unbind() {
            if (this._bound) {
                this._bound = false;
            }
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            if (this._bound) {
                this.unbind();
            }

            this._context = null;
            this._name = null;
            this._enabled = null;
            this._location = null;
            this._bound = null;
        }

        /**
         * @private
         */

    }, {
        key: '_upload',
        value: function _upload() {
            if (!this._bound) {
                return;
            }

            if (this._enabled) {
                this._context.enableVertexAttribArray(this._location);
            } else {
                this._context.disableVertexAttribArray(this._location);
            }
        }
    }, {
        key: 'name',
        get: function get() {
            return this._name;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'type',
        get: function get() {
            return this._type;
        }

        /**
         * @public
         * @readonly
         * @member {Boolean}
         */

    }, {
        key: 'normalized',
        get: function get() {
            return this._normalized;
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'enabled',
        get: function get() {
            return this._enabled;
        },
        set: function set(enabled) {
            this.setEnabled(enabled);
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'byteSize',
        get: function get() {
            return this.bytesType * this._size;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'bytesType',
        get: function get() {
            switch (this._type) {
                case _const.ATTRIBUTE_TYPE.BYTE:
                case _const.ATTRIBUTE_TYPE.UNSIGNED_BYTE:
                    return 1;
                case _const.ATTRIBUTE_TYPE.SHORT:
                case _const.ATTRIBUTE_TYPE.UNSIGNED_SHORT:
                    return 2;
                case _const.ATTRIBUTE_TYPE.INT:
                case _const.ATTRIBUTE_TYPE.UNSIGNED_INT:
                case _const.ATTRIBUTE_TYPE.FLOAT:
                    return 4;
            }

            return 0;
        }
    }]);

    return ShaderAttribute;
}();

exports.default = ShaderAttribute;

/***/ }),
/* 34 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _Matrix = __webpack_require__(10);

var _Matrix2 = _interopRequireDefault(_Matrix);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class ShaderUniform
 */
var ShaderUniform = function () {

    /**
     * @constructor
     * @param {Object} options
     * @param {String} options.name
     * @param {Number} options.type
     * @param {Number} [options.unit=-1]
     * @param {Boolean} [options.transpose=false]
     */
    function ShaderUniform() {
        var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
            name = _ref.name,
            type = _ref.type,
            _ref$unit = _ref.unit,
            unit = _ref$unit === undefined ? -1 : _ref$unit,
            _ref$transpose = _ref.transpose,
            transpose = _ref$transpose === undefined ? false : _ref$transpose;

        _classCallCheck(this, ShaderUniform);

        /**
         * @private
         * @member {String}
         */
        this._name = name;

        /**
         * @private
         * @member {Number}
         */
        this._type = type;

        /**
         * @private
         * @member {*}
         */
        this._value = null;

        /**
         * @private
         * @member {Number}
         */
        this._unit = unit;

        /**
         * @private
         * @member {Boolean}
         */
        this._transpose = transpose;

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLUniformLocation}
         */
        this._location = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;

        /**
         * @private
         * @member {Boolean}
         */
        this._dirty = false;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */


    _createClass(ShaderUniform, [{
        key: 'setContext',


        /**
         * @public
         * @param {WebGLRenderingContext} gl
         * @param {WebGLProgram} program
         */
        value: function setContext(gl, program) {
            if (this._context !== gl) {
                this._context = gl;
                this._location = gl.getUniformLocation(program, this._name);
            }
        }

        /**
         * @public
         * @param {WebGLRenderingContext} gl
         * @param {WebGLProgram} program
         */

    }, {
        key: 'setValue',
        value: function setValue(value) {
            this._value = value;
            this._dirty = true;

            if (this._bound) {
                this._upload();
            }
        }

        /**
         * @param {Matrix} matrix
         */

    }, {
        key: 'setMatrix',
        value: function setMatrix(matrix) {
            var transpose = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._transpose;

            this._transpose = transpose;

            this.setValue(matrix instanceof _Matrix2.default ? matrix.toArray(transpose) : matrix);
        }

        /**
         * @param {Texture} texture
         * @param {Number} unit
         */

    }, {
        key: 'setTexture',
        value: function setTexture(texture) {
            var unit = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._unit;

            this._unit = unit;

            this.setValue(texture);
        }

        /**
         * @public
         */

    }, {
        key: 'bind',
        value: function bind() {
            if (!this._bound) {
                this._bound = true;
                this._upload();
            }
        }

        /**
         * @public
         */

    }, {
        key: 'unbind',
        value: function unbind() {
            if (this._bound) {
                this._bound = false;
            }
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            if (this._bound) {
                this.unbind();
            }

            this._name = null;
            this._type = null;
            this._value = null;
            this._context = null;
            this._location = null;
            this._bound = null;
            this._unit = null;
            this._transpose = null;
        }
    }, {
        key: '_upload',
        value: function _upload() {
            if (!this._dirty) {
                return;
            }

            var gl = this._context,
                location = this._location,
                value = this._value;

            this._dirty = false;

            switch (this._type) {
                case _const.UNIFORM_TYPE.INT:
                    return gl.uniform1i(location, value);
                case _const.UNIFORM_TYPE.FLOAT:
                    return gl.uniform1f(location, value);
                case _const.UNIFORM_TYPE.FLOAT_VEC2:
                    return gl.uniform2fv(location, value);
                case _const.UNIFORM_TYPE.FLOAT_VEC3:
                    return gl.uniform3fv(location, value);
                case _const.UNIFORM_TYPE.FLOAT_VEC4:
                    return gl.uniform4fv(location, value);
                case _const.UNIFORM_TYPE.INT_VEC2:
                    return gl.uniform2iv(location, value);
                case _const.UNIFORM_TYPE.INT_VEC3:
                    return gl.uniform3iv(location, value);
                case _const.UNIFORM_TYPE.INT_VEC4:
                    return gl.uniform4iv(location, value);
                case _const.UNIFORM_TYPE.BOOL:
                    return gl.uniform1i(location, value);
                case _const.UNIFORM_TYPE.BOOL_VEC2:
                    return gl.uniform2iv(location, value);
                case _const.UNIFORM_TYPE.BOOL_VEC3:
                    return gl.uniform3iv(location, value);
                case _const.UNIFORM_TYPE.BOOL_VEC4:
                    return gl.uniform4iv(location, value);
                case _const.UNIFORM_TYPE.FLOAT_MAT2:
                    return gl.uniformMatrix2fv(location, this._transpose, value);
                case _const.UNIFORM_TYPE.FLOAT_MAT3:
                    return gl.uniformMatrix3fv(location, this._transpose, value);
                case _const.UNIFORM_TYPE.FLOAT_MAT4:
                    return gl.uniformMatrix4fv(location, this._transpose, value);
                case _const.UNIFORM_TYPE.SAMPLER_2D:
                    value.glTexture.setContext(this._context).bind(this._unit).update(this._unit);

                    return gl.uniform1i(location, this._unit);
                default:
                    throw new Error('Unknown uniform type ' + this._type);
            }
        }
    }, {
        key: 'name',
        get: function get() {
            return this._name;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'type',
        get: function get() {
            return this._type;
        }

        /**
         * @public
         * @member {Number|Number[]|Vector|Matrix|Texture}
         */

    }, {
        key: 'value',
        get: function get() {
            return this._value;
        },
        set: function set(value) {
            this.setValue(value);
        }
    }]);

    return ShaderUniform;
}();

exports.default = ShaderUniform;

/***/ }),
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderer2 = __webpack_require__(21);

var _Renderer3 = _interopRequireDefault(_Renderer2);

var _ParticleShader = __webpack_require__(36);

var _ParticleShader2 = _interopRequireDefault(_ParticleShader);

var _utils = __webpack_require__(1);

var _settings = __webpack_require__(4);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ParticleRenderer
 * @extends {Renderer}
 */
var ParticleRenderer = function (_Renderer) {
    _inherits(ParticleRenderer, _Renderer);

    /**
     * @constructor
     */
    function ParticleRenderer() {
        _classCallCheck(this, ParticleRenderer);

        /**
         * @private
         * @member {Number}
         */
        var _this = _possibleConstructorReturn(this, (ParticleRenderer.__proto__ || Object.getPrototypeOf(ParticleRenderer)).call(this));

        _this._indexCount = 6;

        /**
         * @private
         * @member {Number}
         */
        _this._vertexCount = 4;

        /**
         * 2 = vertexPos    (x, y) +
         * 2 = textureCoords(x, y) +
         * 2 = position     (x, y) +
         * 2 = scale        (x, y) +
         * 1 = rotation     (x, y) +
         * 1 = color        (ARGB int)
         *
         * @private
         * @member {Number}
         */
        _this._vertexPropCount = 10;

        /**
         * @private
         * @member {Number}
         */
        _this._particleVertexSize = _this._vertexCount * _this._vertexPropCount;

        /**
         * @private
         * @member {Number}
         */
        _this._maxParticles = _settings2.default.PARTICLE_BATCH_SIZE;

        /**
         * @private
         * @member {ArrayBuffer}
         */
        _this._vertexData = new ArrayBuffer(_this._maxParticles * _this._particleVertexSize * 4);

        /**
         * @private
         * @member {Float32Array}
         */
        _this._vertexView = new Float32Array(_this._vertexData);

        /**
         * @private
         * @member {Uint32Array}
         */
        _this._colorView = new Uint32Array(_this._vertexData);

        /**
         * @private
         * @member {Uint16Array}
         */
        _this._indexData = _Renderer3.default.createIndexBuffer(_this._maxParticles * _this._indexCount);

        /**
         * Current amount of elements inside the batch to draw.
         *
         * @private
         * @member {Number}
         */
        _this._batchSize = 0;

        /**
         * @private
         * @member {?ParticleShader}
         */
        _this._shader = new _ParticleShader2.default();

        /**
         * @member {?Texture}
         * @private
         */
        _this._currentTexture = null;

        /**
         * @private
         * @member {Boolean}
         */
        _this._bound = false;
        return _this;
    }

    /**
     * @override
     */


    _createClass(ParticleRenderer, [{
        key: 'setContext',
        value: function setContext(gl) {
            if (!this._context) {
                this._context = gl;
                this._indexBuffer = gl.createBuffer();
                this._vertexBuffer = gl.createBuffer();
                this._shader.setContext(gl);
            }
        }

        /**
         * @override
         */

    }, {
        key: 'setProjection',
        value: function setProjection(projection) {
            this._shader.setProjection(projection);
        }

        /**
         * @override
         */

    }, {
        key: 'bind',
        value: function bind() {
            if (!this._bound) {
                var gl = this._context;

                gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, this._vertexData, gl.DYNAMIC_DRAW);

                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);

                this._shader.bind();
                this._bound = true;
            }
        }

        /**
         * @override
         */

    }, {
        key: 'unbind',
        value: function unbind() {
            if (this._bound) {
                this.flush();
                this._shader.unbind();
                this._bound = false;
            }
        }

        /**
         * @override
         * @param {ParticleEmitter} emitter
         */

    }, {
        key: 'render',
        value: function render(emitter) {
            if (this._currentTexture !== emitter.texture) {
                this.flush();

                this._shader.setParticleTexture(emitter.texture);
                this._currentTexture = emitter.texture;
            }

            var vertexData = this._vertexView,
                colorData = this._colorView,
                particles = emitter.particles,
                textureRect = emitter.textureRect,
                textureCoords = emitter.textureCoords;

            this._currentTexture.glTexture.update();

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = particles[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var particle = _step.value;

                    if (this._batchSize >= this._maxParticles) {
                        this.flush();
                    }

                    var index = this._batchSize * this._particleVertexSize;

                    vertexData[index] = vertexData[index + 1] = vertexData[index + 11] = vertexData[index + 20] = 0;

                    vertexData[index + 2] = vertexData[index + 22] = textureCoords.x;
                    vertexData[index + 3] = vertexData[index + 13] = textureCoords.y;

                    vertexData[index + 10] = vertexData[index + 30] = textureRect.width;
                    vertexData[index + 21] = vertexData[index + 31] = textureRect.height;

                    vertexData[index + 12] = vertexData[index + 32] = textureCoords.width;
                    vertexData[index + 23] = vertexData[index + 33] = textureCoords.height;

                    vertexData[index + 4] = vertexData[index + 14] = vertexData[index + 24] = vertexData[index + 34] = particle.position.x;
                    vertexData[index + 5] = vertexData[index + 15] = vertexData[index + 25] = vertexData[index + 35] = particle.position.y;

                    vertexData[index + 6] = vertexData[index + 16] = vertexData[index + 26] = vertexData[index + 36] = particle.scale.x;
                    vertexData[index + 7] = vertexData[index + 17] = vertexData[index + 27] = vertexData[index + 37] = particle.scale.y;

                    vertexData[index + 8] = vertexData[index + 18] = vertexData[index + 28] = vertexData[index + 38] = (0, _utils.degreesToRadians)(particle.rotation);

                    colorData[index + 9] = colorData[index + 19] = colorData[index + 29] = colorData[index + 39] = particle.color.rgba;

                    this._batchSize++;
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }
        }

        /**
         * @override
         */

    }, {
        key: 'flush',
        value: function flush() {
            if (!this._batchSize) {
                return;
            }

            var gl = this._context;

            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._vertexView.subarray(0, this._batchSize * this._particleVertexSize));
            gl.drawElements(gl.TRIANGLES, this._batchSize * this._indexCount, gl.UNSIGNED_SHORT, 0);

            this._batchSize = 0;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(ParticleRenderer.prototype.__proto__ || Object.getPrototypeOf(ParticleRenderer.prototype), 'destroy', this).call(this);

            if (this._bound) {
                this.unbind();
            }

            this._shader.destroy();
            this._shader = null;

            this._vertexData = null;
            this._vertexView = null;
            this._colorView = null;
            this._indexData = null;
            this._vertexCount = null;
            this._vertexPropCount = null;
            this._particleVertexSize = null;
            this._indexCount = null;
            this._maxParticles = null;
            this._batchSize = null;
            this._currentTexture = null;
            this._bound = null;
        }
    }]);

    return ParticleRenderer;
}(_Renderer3.default);

exports.default = ParticleRenderer;

/***/ }),
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Shader2 = __webpack_require__(22);

var _Shader3 = _interopRequireDefault(_Shader2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ParticleShader
 * @extends {Shader}
 */
var ParticleShader = function (_Shader) {
    _inherits(ParticleShader, _Shader);

    /**
     * @constructor
     */
    function ParticleShader() {
        _classCallCheck(this, ParticleShader);

        var _this = _possibleConstructorReturn(this, (ParticleShader.__proto__ || Object.getPrototypeOf(ParticleShader)).call(this));

        _this.setVertexSource(['precision lowp float;', 'attribute vec2 aVertexPosition;', 'attribute vec2 aTextureCoord;', 'attribute vec2 aPosition;', 'attribute vec2 aScale;', 'attribute float aRotation;', 'attribute vec4 aColor;', 'uniform mat3 projectionMatrix;', 'varying vec2 vTextureCoord;', 'varying vec4 vColor;', 'void main(void) {', 'vec2 vp = aVertexPosition;', 'vp.x = (aVertexPosition.x) * cos(aRotation) - (aVertexPosition.y) * sin(aRotation);', 'vp.y = (aVertexPosition.x) * sin(aRotation) + (aVertexPosition.y) * cos(aRotation);', 'vp = (vp * aScale) + aPosition;', 'vTextureCoord = aTextureCoord;', 'vColor = vec4(aColor.rgb * aColor.a, aColor.a);', 'gl_Position = vec4((projectionMatrix * vec3(vp, 1.0)).xy, 0.0, 1.0);', '}']);

        _this.setFragmentSource(['precision lowp float;', 'varying vec2 vTextureCoord;', 'varying vec4 vColor;', 'uniform sampler2D uSampler;', 'void main(void) {', 'gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor;', '}']);

        _this.setAttributes([{
            name: 'aVertexPosition',
            type: _const.ATTRIBUTE_TYPE.FLOAT,
            size: 2
        }, {
            name: 'aTextureCoord',
            type: _const.ATTRIBUTE_TYPE.FLOAT,
            size: 2
        }, {
            name: 'aPosition',
            type: _const.ATTRIBUTE_TYPE.FLOAT,
            size: 2
        }, {
            name: 'aScale',
            type: _const.ATTRIBUTE_TYPE.FLOAT,
            size: 2
        }, {
            name: 'aRotation',
            type: _const.ATTRIBUTE_TYPE.FLOAT,
            size: 1
        }, {
            name: 'aColor',
            type: _const.ATTRIBUTE_TYPE.UNSIGNED_BYTE,
            size: 4,
            normalized: true
        }]);

        _this.setUniforms([{
            name: 'projectionMatrix',
            type: _const.UNIFORM_TYPE.FLOAT_MAT3
        }, {
            name: 'uSampler',
            type: _const.UNIFORM_TYPE.SAMPLER_2D,
            unit: 0
        }]);
        return _this;
    }

    /**
     * @public
     * @param {Matrix} projection
     */


    _createClass(ParticleShader, [{
        key: 'setProjection',
        value: function setProjection(projection) {
            this.getUniform('projectionMatrix').setMatrix(projection);
        }

        /**
         * @public
         * @param {Texture} texture
         */

    }, {
        key: 'setParticleTexture',
        value: function setParticleTexture(texture) {
            this.getUniform('uSampler').setTexture(texture, 0);
        }
    }]);

    return ParticleShader;
}(_Shader3.default);

exports.default = ParticleShader;

/***/ }),
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class BlendMode
 */
var BlendMode = function () {

    /**
     * @constructor
     * @param {Number} sFactor
     * @param {Number} dFactor
     * @param {String} canvasBlending
     */
    function BlendMode(sFactor, dFactor, canvasBlending) {
        _classCallCheck(this, BlendMode);

        /**
         * @private
         * @member {Number}
         */
        this._sFactor = sFactor;

        /**
         * @private
         * @member {Number}
         */
        this._dFactor = dFactor;

        /**
         * @private
         * @member {String}
         */
        this._canvasBlending = canvasBlending;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */


    _createClass(BlendMode, [{
        key: "destroy",


        /**
         * @public
         */
        value: function destroy() {
            this._sFactor = null;
            this._dFactor = null;
            this._canvasBlending = null;
        }
    }, {
        key: "sFactor",
        get: function get() {
            return this._sFactor;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: "dFactor",
        get: function get() {
            return this._dFactor;
        }

        /**
         * @public
         * @readonly
         * @member {String}
         */

    }, {
        key: "canvasBlending",
        get: function get() {
            return this._canvasBlending;
        }
    }]);

    return BlendMode;
}();

exports.default = BlendMode;

/***/ }),
/* 38 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = __webpack_require__(1);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class MediaManager
 */
var MediaManager = function () {

    /**
     * @constructor
     * @param {Game} game
     * @param {Object} [options={}]
     * @param {Number} [options.masterVolume=1]
     * @param {Number} [options.musicVolume=1]
     * @param {Number} [options.soundVolume=1]
     * @param {Number} [options.videoVolume=1]
     */
    function MediaManager(game) {
        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            _ref$masterVolume = _ref.masterVolume,
            masterVolume = _ref$masterVolume === undefined ? 1 : _ref$masterVolume,
            _ref$musicVolume = _ref.musicVolume,
            musicVolume = _ref$musicVolume === undefined ? 1 : _ref$musicVolume,
            _ref$soundVolume = _ref.soundVolume,
            soundVolume = _ref$soundVolume === undefined ? 1 : _ref$soundVolume,
            _ref$videoVolume = _ref.videoVolume,
            videoVolume = _ref$videoVolume === undefined ? 1 : _ref$videoVolume;

        _classCallCheck(this, MediaManager);

        /**
         * @private
         * @member {Game}
         */
        this._game = game;

        /**
         * @private
         * @member {AudioContext}
         */
        this._context = new AudioContext();

        /**
         * @private
         * @member {AudioDestinationNode}
         */
        this._destination = this._context.destination;

        /**
         * @private
         * @member {DynamicsCompressorNode}
         */
        this._compressor = this._context.createDynamicsCompressor();
        this._compressor.connect(this._destination);

        /**
         * @private
         * @member {GainNode}
         */
        this._masterGain = this._context.createGain();
        this._masterGain.connect(this._compressor);

        /**
         * @private
         * @member {GainNode}
         */
        this._musicGain = this._context.createGain();
        this._musicGain.connect(this._masterGain);

        /**
         * @private
         * @member {GainNode}
         */
        this._soundGain = this._context.createGain();
        this._soundGain.connect(this._masterGain);

        /**
         * @private
         * @member {GainNode}
         */
        this._videoGain = this._context.createGain();
        this._videoGain.connect(this._masterGain);

        /**
         * @private
         * @member {Number}
         */
        this._masterVolume = null;

        /**
         * @private
         * @member {Number}
         */
        this._soundVolume = null;

        /**
         * @private
         * @member {Number}
         */
        this._musicVolume = null;

        /**
         * @private
         * @member {Number}
         */
        this._videoVolume = null;

        this.setMasterVolume(masterVolume);
        this.setSoundVolume(soundVolume);
        this.setMusicVolume(musicVolume);
        this.setVideoVolume(videoVolume);

        game.on('media:play', this.play, this).on('media:volume:master', this.setMasterVolume, this).on('media:volume:sound', this.setSoundVolume, this).on('media:volume:music', this.setMusicVolume, this).on('media:volume:video', this.setVideoVolume, this);
    }

    /**
     * @public
     * @readonly
     * @member {AudioContext}
     */


    _createClass(MediaManager, [{
        key: 'play',


        /**
         * @public
         * @param {Music|Sound|Video} media
         * @param {Object} [options]
         * @param {Boolean} [options.loop]
         * @param {Number} [options.playbackRate]
         * @param {Number} [options.volume]
         * @param {Number} [options.time]
         */
        value: function play(media, options) {
            media.connect(this);
            media.play(options);
        }

        /**
         * @public
         * @param {Number} volume
         */

    }, {
        key: 'setMasterVolume',
        value: function setMasterVolume(volume) {
            var vol = (0, _utils.clamp)(volume, 0, 1);

            if (this._masterVolume !== vol) {
                this._masterGain.gain.value = this._masterVolume = vol;
            }
        }

        /**
         * @public
         * @param {Number} volume
         */

    }, {
        key: 'setSoundVolume',
        value: function setSoundVolume(volume) {
            var vol = (0, _utils.clamp)(volume, 0, 1);

            if (this._soundVolume !== vol) {
                this._soundGain.gain.value = this._soundVolume = volume;
            }
        }

        /**
         * @public
         * @param {Number} volume
         */

    }, {
        key: 'setMusicVolume',
        value: function setMusicVolume(volume) {
            var vol = (0, _utils.clamp)(volume, 0, 1);

            if (this._musicVolume !== vol) {
                this._musicGain.gain.value = this._musicVolume = vol;
            }
        }

        /**
         * @public
         * @param {Number} volume
         */

    }, {
        key: 'setVideoVolume',
        value: function setVideoVolume(volume) {
            var vol = (0, _utils.clamp)(volume, 0, 1);

            if (this._videoVolume !== vol) {
                this._videoGain.gain.value = this._videoVolume = vol;
            }
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._game.off('media:play', this.play, this).off('media:volume:master', this.setMasterVolume, this).off('media:volume:sound', this.setSoundVolume, this).off('media:volume:music', this.setMusicVolume, this);

            this._soundGain.disconnect();
            this._soundGain = null;

            this._musicGain.disconnect();
            this._musicGain = null;

            this._videoGain.disconnect();
            this._videoGain = null;

            this._masterGain.disconnect();
            this._masterGain = null;

            this._compressor.disconnect();
            this._compressor = null;

            this._context.close();
            this._context = null;

            this._masterVolume = null;
            this._soundVolume = null;
            this._musicVolume = null;
            this._videoVolume = null;
            this._destination = null;
            this._game = null;
        }
    }, {
        key: 'audioContext',
        get: function get() {
            return this._context;
        }

        /**
         * @readonly
         * @member {GainNode}
         */

    }, {
        key: 'masterGain',
        get: function get() {
            return this._masterGain;
        }

        /**
         * @readonly
         * @member {GainNode}
         */

    }, {
        key: 'soundGain',
        get: function get() {
            return this._soundGain;
        }

        /**
         * @readonly
         * @member {GainNode}
         */

    }, {
        key: 'musicGain',
        get: function get() {
            return this._musicGain;
        }

        /**
         * @readonly
         * @member {GainNode}
         */

    }, {
        key: 'videoGain',
        get: function get() {
            return this._videoGain;
        }

        /**
         * @readonly
         * @member {AudioNode}
         */

    }, {
        key: 'analyserTarget',
        get: function get() {
            return this._compressor;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'masterVolume',
        get: function get() {
            return this._masterVolume;
        },
        set: function set(volume) {
            this.setMasterVolume(volume);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'soundVolume',
        get: function get() {
            return this._soundVolume;
        },
        set: function set(volume) {
            this.setSoundVolume(volume);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'musicVolume',
        get: function get() {
            return this._musicVolume;
        },
        set: function set(volume) {
            this.setMusicVolume(volume);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'videoVolume',
        get: function get() {
            return this._videoVolume;
        },
        set: function set(volume) {
            this.setVideoVolume(volume);
        }
    }]);

    return MediaManager;
}();

exports.default = MediaManager;

/***/ }),
/* 39 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ChannelHandler2 = __webpack_require__(6);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _Keyboard = __webpack_require__(40);

var _Keyboard2 = _interopRequireDefault(_Keyboard);

var _Mouse = __webpack_require__(41);

var _Mouse2 = _interopRequireDefault(_Mouse);

var _GamepadManager = __webpack_require__(42);

var _GamepadManager2 = _interopRequireDefault(_GamepadManager);

var _PointerManager = __webpack_require__(46);

var _PointerManager2 = _interopRequireDefault(_PointerManager);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class InputManager
 * @extends {ChannelHandler}
 */
var InputManager = function (_ChannelHandler) {
    _inherits(InputManager, _ChannelHandler);

    /**
     * @constructor
     * @param {Game} game
     */
    function InputManager(game) {
        _classCallCheck(this, InputManager);

        /**
         * @private
         * @member {Game}
         */
        var _this = _possibleConstructorReturn(this, (InputManager.__proto__ || Object.getPrototypeOf(InputManager)).call(this, new ArrayBuffer(_const.CHANNEL_LENGTH.GLOBAL * 4), 0, _const.CHANNEL_LENGTH.GLOBAL));

        _this._game = game;

        /**
         * @private
         * @member {Set<Input>}
         */
        _this._inputs = new Set();

        /**
         * @private
         * @member {Keyboard}
         */
        _this._keyboard = new _Keyboard2.default(game, _this.channelBuffer);

        /**
         * @private
         * @member {Mouse}
         */
        _this._mouse = new _Mouse2.default(game, _this.channelBuffer);

        /**
         * @private
         * @member {GamepadManager}
         */
        _this._gamepadManager = new _GamepadManager2.default(game, _this.channelBuffer);

        /**
         * @private
         * @member {PointerManager}
         */
        _this._pointerManager = new _PointerManager2.default(game, _this.channelBuffer);

        game.on('input:add', _this.add, _this).on('input:remove', _this.remove, _this).on('input:clear', _this.clear, _this);
        return _this;
    }

    /**
     * @public
     * @param {Input|Input[]} inputs
     */


    _createClass(InputManager, [{
        key: 'add',
        value: function add(inputs) {
            if (Array.isArray(inputs)) {
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = inputs[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var input = _step.value;

                        this.add(input);
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion && _iterator.return) {
                            _iterator.return();
                        }
                    } finally {
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }

                return;
            }

            this._inputs.add(inputs);
        }

        /**
         * @public
         * @param {Input|Input[]} inputs
         */

    }, {
        key: 'remove',
        value: function remove(inputs) {
            if (Array.isArray(inputs)) {
                var _iteratorNormalCompletion2 = true;
                var _didIteratorError2 = false;
                var _iteratorError2 = undefined;

                try {
                    for (var _iterator2 = inputs[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                        var input = _step2.value;

                        this.remove(input);
                    }
                } catch (err) {
                    _didIteratorError2 = true;
                    _iteratorError2 = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion2 && _iterator2.return) {
                            _iterator2.return();
                        }
                    } finally {
                        if (_didIteratorError2) {
                            throw _iteratorError2;
                        }
                    }
                }

                return;
            }

            this._inputs.delete(inputs);
        }

        /**
         * @public
         * @param {Boolean} [destroyInputs=false]
         */

    }, {
        key: 'clear',
        value: function clear() {
            var destroyInputs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

            if (destroyInputs) {
                var _iteratorNormalCompletion3 = true;
                var _didIteratorError3 = false;
                var _iteratorError3 = undefined;

                try {
                    for (var _iterator3 = this._inputs[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                        var input = _step3.value;

                        input.destroy();
                    }
                } catch (err) {
                    _didIteratorError3 = true;
                    _iteratorError3 = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion3 && _iterator3.return) {
                            _iterator3.return();
                        }
                    } finally {
                        if (_didIteratorError3) {
                            throw _iteratorError3;
                        }
                    }
                }

                return;
            }

            this._inputs.clear();
        }

        /**
         * @public
         */

    }, {
        key: 'update',
        value: function update() {
            this._gamepadManager.update();

            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
                for (var _iterator4 = this._inputs[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                    var input = _step4.value;

                    input.update(this.channels);
                }
            } catch (err) {
                _didIteratorError4 = true;
                _iteratorError4 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion4 && _iterator4.return) {
                        _iterator4.return();
                    }
                } finally {
                    if (_didIteratorError4) {
                        throw _iteratorError4;
                    }
                }
            }

            this._keyboard.update();
            this._mouse.update();
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(InputManager.prototype.__proto__ || Object.getPrototypeOf(InputManager.prototype), 'destroy', this).call(this);

            this._game.off('input:add', this.add, this).off('input:remove', this.remove, this).off('input:clear', this.clear, this);

            this._inputs.clear();
            this._inputs = null;

            this._keyboard.destroy();
            this._keyboard = null;

            this._mouse.destroy();
            this._mouse = null;

            this._gamepadManager.destroy();
            this._gamepadManager = null;

            this._pointerManager.destroy();
            this._pointerManager = null;

            this._game = null;
        }
    }]);

    return InputManager;
}(_ChannelHandler3.default);

exports.default = InputManager;

/***/ }),
/* 40 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ChannelHandler2 = __webpack_require__(6);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var flags = {
  KEY_DOWN: 1 << 0,
  KEY_UP: 1 << 1
};

/**
 * @class Keyboard
 * @extends {ChannelHandler}
 */

var Keyboard = function (_ChannelHandler) {
  _inherits(Keyboard, _ChannelHandler);

  /**
   * @constructor
   * @param {Game} game
   * @param {ArrayBuffer} channelBuffer
   */
  function Keyboard(game, channelBuffer) {
    _classCallCheck(this, Keyboard);

    /**
     * @private
     * @member {Game}
     */
    var _this = _possibleConstructorReturn(this, (Keyboard.__proto__ || Object.getPrototypeOf(Keyboard)).call(this, channelBuffer, _const.CHANNEL_OFFSET.KEYBOARD, _const.CHANNEL_LENGTH.DEVICE));

    _this._game = game;

    /**
     * @private
     * @member {Set<Number>}
     */
    _this._channelsPressed = new Set();

    /**
     * @private
     * @member {Set<Number>}
     */
    _this._channelsReleased = new Set();

    /**
     * @private
     * @member {Number}
     */
    _this._flags = 0;

    _this._addEventListeners();
    return _this;
  }

  /**
   * @override
   */


  _createClass(Keyboard, [{
    key: 'update',
    value: function update() {
      if (!this._flags) {
        return;
      }

      if (this._flags & flags.KEY_DOWN) {
        this.trigger('keyboard:down', this._channelsPressed, this);
        this._channelsPressed.clear();
      }

      if (this._flags & flags.KEY_UP) {
        this.trigger('keyboard:up', this._channelsReleased, this);
        this._channelsReleased.clear();
      }

      this._flags = 0;
    }

    /**
     * @override
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      _get(Keyboard.prototype.__proto__ || Object.getPrototypeOf(Keyboard.prototype), 'destroy', this).call(this);

      this._removeEventListeners();

      this._channelsPressed.clear();
      this._channelsPressed = null;

      this._channelsReleased.clear();
      this._channelsReleased = null;

      this._flags = null;
      this._game = null;
    }

    /**
     * @private
     */

  }, {
    key: '_addEventListeners',
    value: function _addEventListeners() {
      this._onKeyDownHandler = this._onKeyDown.bind(this);
      this._onKeyUpHandler = this._onKeyUp.bind(this);

      window.addEventListener('keydown', this._onKeyDownHandler, true);
      window.addEventListener('keyup', this._onKeyUpHandler, true);
    }

    /**
     * @private
     */

  }, {
    key: '_removeEventListeners',
    value: function _removeEventListeners() {
      window.removeEventListener('keydown', this._onKeyDownHandler, true);
      window.removeEventListener('keyup', this._onKeyUpHandler, true);

      this._onKeyDownHandler = null;
      this._onKeyUpHandler = null;
    }

    /**
     * @private
     * @param {Event} event
     */

  }, {
    key: '_onKeyDown',
    value: function _onKeyDown(event) {
      this.channels[event.keyCode] = 1;
      this._channelsPressed.add(Keyboard.getChannelCode(event.keyCode));

      this._flags |= flags.KEY_DOWN;
    }

    /**
     * @private
     * @param {Event} event
     */

  }, {
    key: '_onKeyUp',
    value: function _onKeyUp(event) {
      this.channels[event.keyCode] = 0;
      this._channelsReleased.add(Keyboard.getChannelCode(event.keyCode));

      this._flags |= flags.KEY_UP;
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @returns {Number}
     */

  }], [{
    key: 'getChannelCode',
    value: function getChannelCode(key) {
      return _const.CHANNEL_OFFSET.KEYBOARD + key % _const.CHANNEL_LENGTH.DEVICE;
    }
  }]);

  return Keyboard;
}(_ChannelHandler3.default);

/**
 * @public
 * @static
 * @member {Number}
 */


exports.default = Keyboard;
Keyboard.Backspace = _const.CHANNEL_OFFSET.KEYBOARD + 8;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Tab = _const.CHANNEL_OFFSET.KEYBOARD + 9;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Clear = _const.CHANNEL_OFFSET.KEYBOARD + 12;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Enter = _const.CHANNEL_OFFSET.KEYBOARD + 13;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Shift = _const.CHANNEL_OFFSET.KEYBOARD + 16;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Control = _const.CHANNEL_OFFSET.KEYBOARD + 17;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Alt = _const.CHANNEL_OFFSET.KEYBOARD + 18;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Pause = _const.CHANNEL_OFFSET.KEYBOARD + 19;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.CapsLock = _const.CHANNEL_OFFSET.KEYBOARD + 20;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Escape = _const.CHANNEL_OFFSET.KEYBOARD + 27;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Space = _const.CHANNEL_OFFSET.KEYBOARD + 32;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.PageUp = _const.CHANNEL_OFFSET.KEYBOARD + 33;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.PageDown = _const.CHANNEL_OFFSET.KEYBOARD + 34;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.End = _const.CHANNEL_OFFSET.KEYBOARD + 35;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Home = _const.CHANNEL_OFFSET.KEYBOARD + 36;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Left = _const.CHANNEL_OFFSET.KEYBOARD + 37;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Up = _const.CHANNEL_OFFSET.KEYBOARD + 38;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Right = _const.CHANNEL_OFFSET.KEYBOARD + 39;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Down = _const.CHANNEL_OFFSET.KEYBOARD + 40;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Insert = _const.CHANNEL_OFFSET.KEYBOARD + 45;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Delete = _const.CHANNEL_OFFSET.KEYBOARD + 46;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Help = _const.CHANNEL_OFFSET.KEYBOARD + 47;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Zero = _const.CHANNEL_OFFSET.KEYBOARD + 48;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.One = _const.CHANNEL_OFFSET.KEYBOARD + 49;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Two = _const.CHANNEL_OFFSET.KEYBOARD + 50;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Three = _const.CHANNEL_OFFSET.KEYBOARD + 51;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Four = _const.CHANNEL_OFFSET.KEYBOARD + 52;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Five = _const.CHANNEL_OFFSET.KEYBOARD + 53;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Six = _const.CHANNEL_OFFSET.KEYBOARD + 54;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Seven = _const.CHANNEL_OFFSET.KEYBOARD + 55;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Eight = _const.CHANNEL_OFFSET.KEYBOARD + 56;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Nine = _const.CHANNEL_OFFSET.KEYBOARD + 57;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.A = _const.CHANNEL_OFFSET.KEYBOARD + 65;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.B = _const.CHANNEL_OFFSET.KEYBOARD + 66;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.C = _const.CHANNEL_OFFSET.KEYBOARD + 67;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.D = _const.CHANNEL_OFFSET.KEYBOARD + 68;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.E = _const.CHANNEL_OFFSET.KEYBOARD + 69;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F = _const.CHANNEL_OFFSET.KEYBOARD + 70;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.G = _const.CHANNEL_OFFSET.KEYBOARD + 71;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.H = _const.CHANNEL_OFFSET.KEYBOARD + 72;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.I = _const.CHANNEL_OFFSET.KEYBOARD + 73;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.J = _const.CHANNEL_OFFSET.KEYBOARD + 74;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.K = _const.CHANNEL_OFFSET.KEYBOARD + 75;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.L = _const.CHANNEL_OFFSET.KEYBOARD + 76;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.M = _const.CHANNEL_OFFSET.KEYBOARD + 77;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.N = _const.CHANNEL_OFFSET.KEYBOARD + 78;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.O = _const.CHANNEL_OFFSET.KEYBOARD + 79;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.P = _const.CHANNEL_OFFSET.KEYBOARD + 80;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Q = _const.CHANNEL_OFFSET.KEYBOARD + 81;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.R = _const.CHANNEL_OFFSET.KEYBOARD + 82;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.S = _const.CHANNEL_OFFSET.KEYBOARD + 83;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.T = _const.CHANNEL_OFFSET.KEYBOARD + 84;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.U = _const.CHANNEL_OFFSET.KEYBOARD + 85;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.V = _const.CHANNEL_OFFSET.KEYBOARD + 86;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.W = _const.CHANNEL_OFFSET.KEYBOARD + 87;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.X = _const.CHANNEL_OFFSET.KEYBOARD + 88;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Y = _const.CHANNEL_OFFSET.KEYBOARD + 89;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Z = _const.CHANNEL_OFFSET.KEYBOARD + 90;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad0 = _const.CHANNEL_OFFSET.KEYBOARD + 96;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad1 = _const.CHANNEL_OFFSET.KEYBOARD + 97;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad2 = _const.CHANNEL_OFFSET.KEYBOARD + 98;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad3 = _const.CHANNEL_OFFSET.KEYBOARD + 99;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad4 = _const.CHANNEL_OFFSET.KEYBOARD + 100;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad5 = _const.CHANNEL_OFFSET.KEYBOARD + 101;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad6 = _const.CHANNEL_OFFSET.KEYBOARD + 102;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad7 = _const.CHANNEL_OFFSET.KEYBOARD + 103;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad8 = _const.CHANNEL_OFFSET.KEYBOARD + 104;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad9 = _const.CHANNEL_OFFSET.KEYBOARD + 105;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadMultiply = _const.CHANNEL_OFFSET.KEYBOARD + 106;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadAdd = _const.CHANNEL_OFFSET.KEYBOARD + 107;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadEnter = _const.CHANNEL_OFFSET.KEYBOARD + 108;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadSubtract = _const.CHANNEL_OFFSET.KEYBOARD + 109;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadDecimal = _const.CHANNEL_OFFSET.KEYBOARD + 110;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadDivide = _const.CHANNEL_OFFSET.KEYBOARD + 111;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F1 = _const.CHANNEL_OFFSET.KEYBOARD + 112;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F2 = _const.CHANNEL_OFFSET.KEYBOARD + 113;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F3 = _const.CHANNEL_OFFSET.KEYBOARD + 114;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F4 = _const.CHANNEL_OFFSET.KEYBOARD + 115;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F5 = _const.CHANNEL_OFFSET.KEYBOARD + 116;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F6 = _const.CHANNEL_OFFSET.KEYBOARD + 117;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F7 = _const.CHANNEL_OFFSET.KEYBOARD + 118;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F8 = _const.CHANNEL_OFFSET.KEYBOARD + 119;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F9 = _const.CHANNEL_OFFSET.KEYBOARD + 120;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F10 = _const.CHANNEL_OFFSET.KEYBOARD + 121;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F11 = _const.CHANNEL_OFFSET.KEYBOARD + 122;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F12 = _const.CHANNEL_OFFSET.KEYBOARD + 123;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumLock = _const.CHANNEL_OFFSET.KEYBOARD + 144;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.ScrollLock = _const.CHANNEL_OFFSET.KEYBOARD + 145;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Colon = _const.CHANNEL_OFFSET.KEYBOARD + 186;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Equals = _const.CHANNEL_OFFSET.KEYBOARD + 187;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Comma = _const.CHANNEL_OFFSET.KEYBOARD + 188;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Dash = _const.CHANNEL_OFFSET.KEYBOARD + 189;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Period = _const.CHANNEL_OFFSET.KEYBOARD + 190;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.QuestionMark = _const.CHANNEL_OFFSET.KEYBOARD + 191;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Tilde = _const.CHANNEL_OFFSET.KEYBOARD + 192;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.OpenBracket = _const.CHANNEL_OFFSET.KEYBOARD + 219;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.BackwardSlash = _const.CHANNEL_OFFSET.KEYBOARD + 220;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.ClosedBracket = _const.CHANNEL_OFFSET.KEYBOARD + 221;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Quotes = _const.CHANNEL_OFFSET.KEYBOARD + 222;

/***/ }),
/* 41 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
        value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ChannelHandler2 = __webpack_require__(6);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var flags = {
        POSITION: 1 << 0,
        WHEEL: 1 << 1,
        WINDOW_STATE: 1 << 2,
        BUTTON_DOWN: 1 << 3,
        BUTTON_UP: 1 << 4
};

/**
 * @class Mouse
 * @extends {ChannelHandler}
 */

var Mouse = function (_ChannelHandler) {
        _inherits(Mouse, _ChannelHandler);

        /**
         * @constructor
         * @param {Game} game
         * @param {ArrayBuffer} channelBuffer
         */
        function Mouse(game, channelBuffer) {
                _classCallCheck(this, Mouse);

                /**
                 * @private
                 * @member {Game}
                 */
                var _this = _possibleConstructorReturn(this, (Mouse.__proto__ || Object.getPrototypeOf(Mouse)).call(this, channelBuffer, _const.CHANNEL_OFFSET.MOUSE, _const.CHANNEL_LENGTH.DEVICE));

                _this._game = game;

                /**
                 * @private
                 * @member {HTMLCanvasElement}
                 */
                _this._canvas = game.canvas;

                /**
                 * @private
                 * @member {Vector}
                 */
                _this._position = new _Vector2.default();

                /**
                 * @private
                 * @member {Vector}
                 */
                _this._positionDelta = new _Vector2.default();

                /**
                 * @private
                 * @member {Vector}
                 */
                _this._scrollDelta = new _Vector2.default();

                /**
                 * @private
                 * @member {Boolean}
                 */
                _this._insideWindow = false;

                /**
                 * @private
                 * @member {Set<Number>}
                 */
                _this._channelsPressed = new Set();

                /**
                 * @private
                 * @member {Set<Number>}
                 */
                _this._channelsReleased = new Set();

                /**
                 * @private
                 * @member {Number}
                 */
                _this._flags = 0;

                _this._addEventListeners();

                /**
                 * @event Mouse#leave
                 * @member {Function}
                 * @property {Mouse} mouse
                 */

                /**
                 * @event Mouse#enter
                 * @member {Function}
                 * @property {Mouse} mouse
                 */

                /**
                 * @event Mouse#scroll
                 * @member {Function}
                 * @property {Mouse} mouse
                 */

                /**
                 * @event Mouse#move
                 * @member {Function}
                 * @property {Mouse} mouse
                 */

                /**
                 * @event Mouse#down
                 * @member {Function}
                 * @property {Mouse} mouse
                 */

                /**
                 * @event Mouse#up
                 * @member {Function}
                 * @property {Mouse} mouse
                 */
                return _this;
        }

        /**
         * @public
         * @readonly
         * @member {Vector}
         */


        _createClass(Mouse, [{
                key: 'update',


                /**
                 * @public
                 * @fires Mouse#enter
                 * @fires Mouse#leave
                 * @fires Mouse#scroll
                 * @fires Mouse#move
                 * @fires Mouse#down
                 * @fires Mouse#up
                 */
                value: function update() {
                        if (!this._flags) {
                                return;
                        }

                        if (this._flags & flags.WINDOW_STATE) {
                                this._game.trigger(this._insideWindow ? 'mouse:enter' : 'mouse:leave', this);
                        }

                        if (this._flags & flags.WHEEL) {
                                this._game.trigger('mouse:scroll', this._scrollDelta, this);
                                this._scrollDelta.reset();
                        }

                        if (this._flags & flags.POSITION) {
                                this._game.trigger('mouse:move', this._position, this);
                                this._positionDelta.reset();
                        }

                        if (this._flags & flags.BUTTON_DOWN) {
                                this._game.trigger('mouse:down', this._channelsPressed, this);
                                this._channelsPressed.clear();
                        }

                        if (this._flags & flags.BUTTON_UP) {
                                this._game.trigger('mouse:up', this._channelsReleased, this);
                                this._channelsReleased.clear();
                        }

                        this._flags = 0;

                        this.channels.fill(0, 5, 17);
                }

                /**
                 * @override
                 */

        }, {
                key: 'destroy',
                value: function destroy() {
                        _get(Mouse.prototype.__proto__ || Object.getPrototypeOf(Mouse.prototype), 'destroy', this).call(this);

                        this._removeEventListeners();

                        this._position.destroy();
                        this._position = null;

                        this._positionDelta.destroy();
                        this._positionDelta = null;

                        this._scrollDelta.destroy();
                        this._scrollDelta = null;

                        this._channelsPressed.clear();
                        this._channelsPressed = null;

                        this._channelsReleased.clear();
                        this._channelsReleased = null;

                        this._flags = null;
                        this._insideWindow = null;
                        this._canvas = null;
                        this._game = null;
                }

                /**
                 * @private
                 */

        }, {
                key: '_addEventListeners',
                value: function _addEventListeners() {
                        var canvas = this._canvas;

                        this._onMouseDownHandler = this._onMouseDown.bind(this);
                        this._onMouseUpHandler = this._onMouseUp.bind(this);
                        this._onMouseMoveHandler = this._onMouseMove.bind(this);
                        this._onMouseOverHandler = this._onMouseOver.bind(this);
                        this._onMouseOutHandler = this._onMouseOut.bind(this);
                        this._onMouseWheelHandler = this._onMouseWheel.bind(this);
                        this._killEventHandler = this._killEvent.bind(this);

                        canvas.addEventListener('mousedown', this._onMouseDownHandler, true);
                        canvas.addEventListener('mouseup', this._onMouseUpHandler, true);
                        canvas.addEventListener('mousemove', this._onMouseMoveHandler, true);
                        canvas.addEventListener('mouseover', this._onMouseOverHandler, true);
                        canvas.addEventListener('mouseout', this._onMouseOutHandler, true);
                        canvas.addEventListener('wheel', this._onMouseWheelHandler, true);
                        canvas.addEventListener('contextmenu', this._killEventHandler, true);
                        canvas.addEventListener('selectstart', this._killEventHandler, true);
                }

                /**
                 * @private
                 */

        }, {
                key: '_removeEventListeners',
                value: function _removeEventListeners() {
                        var canvas = this._canvas;

                        canvas.removeEventListener('mousedown', this._onMouseDownHandler, true);
                        canvas.removeEventListener('mouseup', this._onMouseUpHandler, true);
                        canvas.removeEventListener('mousemove', this._onMouseMoveHandler, true);
                        canvas.removeEventListener('mouseover', this._onMouseOverHandler, true);
                        canvas.removeEventListener('mouseout', this._onMouseOutHandler, true);
                        canvas.removeEventListener('wheel', this._onMouseWheelHandler, true);
                        canvas.removeEventListener('contextmenu', this._killEventHandler, true);
                        canvas.removeEventListener('selectstart', this._killEventHandler, true);

                        this._onMouseDownHandler = null;
                        this._onMouseUpHandler = null;
                        this._onMouseMoveHandler = null;
                        this._onMouseOverHandler = null;
                        this._onMouseOutHandler = null;
                        this._onMouseWheelHandler = null;
                        this._killEventHandler = null;
                }

                /**
                 * @private
                 * @param {Event} event
                 */

        }, {
                key: '_killEvent',
                value: function _killEvent(event) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                }

                /**
                 * @private
                 * @param {MouseEvent} event
                 */

        }, {
                key: '_onMouseDown',
                value: function _onMouseDown(event) {
                        var button = Math.min(event.button, 4);

                        this.channels[button] = 1;
                        this._channelsPressed.add(Mouse.getChannelCode(button));

                        this._flags |= flags.BUTTON_DOWN;

                        event.preventDefault();
                }

                /**
                 * @private
                 * @param {MouseEvent} event
                 */

        }, {
                key: '_onMouseUp',
                value: function _onMouseUp(event) {
                        var button = Math.min(event.button, 4);

                        this.channels[button] = 0;
                        this._channelsReleased.add(Mouse.getChannelCode(button));

                        this._flags |= flags.BUTTON_UP;

                        event.preventDefault();
                }

                /**
                 * @private
                 * @param {MouseEvent} event
                 */

        }, {
                key: '_onMouseMove',
                value: function _onMouseMove(event) {
                        var channels = this.channels,
                            bounds = this._canvas.getBoundingClientRect(),
                            x = event.clientX - bounds.left,
                            y = event.clientY - bounds.top,
                            deltaX = x - this.x,
                            deltaY = y - this.y;

                        // Move
                        channels[5] = 1;

                        // MoveLeft
                        channels[6] = Math.abs(Math.min(0, deltaX));

                        // MoveRight
                        channels[7] = Math.max(0, deltaX);

                        // MoveUp
                        channels[8] = Math.abs(Math.min(0, deltaY));

                        // MoveDown
                        channels[9] = Math.max(0, deltaY);

                        this._positionDelta.set(deltaX, deltaY);
                        this._position.set(x, y);

                        this._flags |= flags.POSITION;

                        event.preventDefault();
                }

                /**
                 * @private
                 * @param {WheelEvent} event
                 */

        }, {
                key: '_onMouseWheel',
                value: function _onMouseWheel(event) {
                        var channels = this.channels;

                        // Scroll
                        channels[10] = 1;

                        // ScrollLeft
                        channels[11] = Math.abs(Math.min(0, event.deltaX));

                        // ScrollRight
                        channels[12] = Math.max(0, event.deltaX);

                        // ScrollUp
                        channels[13] = Math.abs(Math.min(0, event.deltaY));

                        // ScrollDown
                        channels[14] = Math.max(0, event.deltaY);

                        this._scrollDelta.set(event.deltaX, event.deltaY);

                        this._flags |= flags.WHEEL;
                }

                /**
                 * @private
                 */

        }, {
                key: '_onMouseOver',
                value: function _onMouseOver() {
                        var channels = this.channels;

                        // EnterWindow
                        channels[15] = 1;

                        // LeaveWindow
                        channels[16] = 0;

                        this._insideWindow = true;

                        this._flags |= flags.WINDOW_STATE;
                }

                /**
                 * @private
                 */

        }, {
                key: '_onMouseOut',
                value: function _onMouseOut() {
                        var channels = this.channels;

                        // EnterWindow
                        channels[15] = 0;

                        // LeaveWindow
                        channels[16] = 1;

                        this._insideWindow = false;

                        this._flags |= flags.WINDOW_STATE;
                }

                /**
                 * @public
                 * @static
                 * @param {Number} key
                 * @returns {Number}
                 */

        }, {
                key: 'position',
                get: function get() {
                        return this._position;
                }

                /**
                 * @public
                 * @readonly
                 * @member {Number}
                 */

        }, {
                key: 'x',
                get: function get() {
                        return this._position.x;
                }

                /**
                 * @public
                 * @readonly
                 * @member {Number}
                 */

        }, {
                key: 'y',
                get: function get() {
                        return this._position.y;
                }

                /**
                 * @public
                 * @readonly
                 * @member {Vector}
                 */

        }, {
                key: 'positionDelta',
                get: function get() {
                        return this._positionDelta;
                }

                /**
                 * @public
                 * @readonly
                 * @member {Number}
                 */

        }, {
                key: 'deltaX',
                get: function get() {
                        return this._positionDelta.x;
                }

                /**
                 * @public
                 * @readonly
                 * @member {Number}
                 */

        }, {
                key: 'deltaY',
                get: function get() {
                        return this._positionDelta.y;
                }

                /**
                 * @public
                 * @readonly
                 * @member {Vector}
                 */

        }, {
                key: 'scrollDelta',
                get: function get() {
                        return this._scrollDelta;
                }

                /**
                 * @public
                 * @readonly
                 * @member {Number}
                 */

        }, {
                key: 'scrollX',
                get: function get() {
                        return this._scrollDelta.x;
                }

                /**
                 * @public
                 * @readonly
                 * @member {Number}
                 */

        }, {
                key: 'scrollY',
                get: function get() {
                        return this._scrollDelta.y;
                }

                /**
                 * @public
                 * @readonly
                 * @member {Boolean}
                 */

        }, {
                key: 'insideWindow',
                get: function get() {
                        return this._insideWindow;
                }
        }], [{
                key: 'getChannelCode',
                value: function getChannelCode(key) {
                        return _const.CHANNEL_OFFSET.MOUSE + key % _const.CHANNEL_LENGTH.DEVICE;
                }
        }]);

        return Mouse;
}(_ChannelHandler3.default);

/**
 * @public
 * @static
 * @member {Number}
 */


exports.default = Mouse;
Mouse.LeftButton = _const.CHANNEL_OFFSET.MOUSE + 0;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MiddleButton = _const.CHANNEL_OFFSET.MOUSE + 1;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.RightButton = _const.CHANNEL_OFFSET.MOUSE + 2;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.BackButton = _const.CHANNEL_OFFSET.MOUSE + 3;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ForwardButton = _const.CHANNEL_OFFSET.MOUSE + 4;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.Move = _const.CHANNEL_OFFSET.MOUSE + 5;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveLeft = _const.CHANNEL_OFFSET.MOUSE + 6;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveRight = _const.CHANNEL_OFFSET.MOUSE + 7;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveUp = _const.CHANNEL_OFFSET.MOUSE + 8;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveDown = _const.CHANNEL_OFFSET.MOUSE + 9;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.Scroll = _const.CHANNEL_OFFSET.MOUSE + 10;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollLeft = _const.CHANNEL_OFFSET.MOUSE + 11;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollRight = _const.CHANNEL_OFFSET.MOUSE + 12;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollUp = _const.CHANNEL_OFFSET.MOUSE + 13;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollDown = _const.CHANNEL_OFFSET.MOUSE + 14;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.EnterWindow = _const.CHANNEL_OFFSET.MOUSE + 15;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.LeaveWindow = _const.CHANNEL_OFFSET.MOUSE + 16;

/***/ }),
/* 42 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Gamepad = __webpack_require__(23);

var _Gamepad2 = _interopRequireDefault(_Gamepad);

var _ChannelHandler2 = __webpack_require__(6);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var navigator = window.navigator;

/**
 * @class GamepadManager
 * @extends {ChannelHandler}
 */

var GamepadManager = function (_ChannelHandler) {
    _inherits(GamepadManager, _ChannelHandler);

    /**
     * @constructor
     * @param {Game} game
     * @param {ArrayBuffer} channelBuffer
     */
    function GamepadManager(game, channelBuffer) {
        _classCallCheck(this, GamepadManager);

        /**
         * @private
         * @member {Game}
         */
        var _this = _possibleConstructorReturn(this, (GamepadManager.__proto__ || Object.getPrototypeOf(GamepadManager)).call(this, channelBuffer, _const.CHANNEL_OFFSET.GAMEPAD, _const.CHANNEL_LENGTH.DEVICE));

        _this._game = game;

        /**
         * @private
         * @member {Map<Number, Gamepad>}
         */
        _this._gamepads = new Map();
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Map<Number, Gamepad>}
     */


    _createClass(GamepadManager, [{
        key: 'update',


        /**
         * @public
         */
        value: function update() {
            this.updateGamepads();

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._gamepads.values()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var gamepad = _step.value;

                    gamepad.update();
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }
        }

        /**
         * @public
         */

    }, {
        key: 'updateGamepads',
        value: function updateGamepads() {
            var game = this._game,
                currentGamepads = this._gamepads,
                fetchedGamepads = navigator.getGamepads(),
                length = fetchedGamepads.length;

            for (var i = 0; i < length; i++) {
                if (!!fetchedGamepads[i] === currentGamepads.has(i)) {
                    continue;
                }

                if (fetchedGamepads[i]) {
                    var gamepad = new _Gamepad2.default(fetchedGamepads[i], this.channelBuffer);

                    currentGamepads.set(i, gamepad);
                    game.trigger('gamepad:add', gamepad, currentGamepads);
                } else {
                    var _gamepad = currentGamepads.get(i);

                    currentGamepads.delete(i);
                    game.trigger('gamepad:remove', _gamepad, currentGamepads);
                    _gamepad.destroy();
                }

                game.trigger('gamepad:change', currentGamepads);
            }
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(GamepadManager.prototype.__proto__ || Object.getPrototypeOf(GamepadManager.prototype), 'destroy', this).call(this);

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this._gamepads.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var gamepad = _step2.value;

                    gamepad.destroy();
                }
            } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion2 && _iterator2.return) {
                        _iterator2.return();
                    }
                } finally {
                    if (_didIteratorError2) {
                        throw _iteratorError2;
                    }
                }
            }

            this._gamepads.clear();
            this._gamepads = null;

            this._game = null;
        }
    }, {
        key: 'gamepads',
        get: function get() {
            return this._gamepads;
        }
    }]);

    return GamepadManager;
}(_ChannelHandler3.default);

exports.default = GamepadManager;

/***/ }),
/* 43 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _GamepadMapping2 = __webpack_require__(44);

var _GamepadMapping3 = _interopRequireDefault(_GamepadMapping2);

var _GamepadControl = __webpack_require__(45);

var _GamepadControl2 = _interopRequireDefault(_GamepadControl);

var _Gamepad = __webpack_require__(23);

var _Gamepad2 = _interopRequireDefault(_Gamepad);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class DefaultGamepadMapping
 * @extends {GamepadMapping}
 */
var DefaultGamepadMapping = function (_GamepadMapping) {
    _inherits(DefaultGamepadMapping, _GamepadMapping);

    /**
     * @constructor
     */
    function DefaultGamepadMapping() {
        _classCallCheck(this, DefaultGamepadMapping);

        return _possibleConstructorReturn(this, (DefaultGamepadMapping.__proto__ || Object.getPrototypeOf(DefaultGamepadMapping)).call(this, [new _GamepadControl2.default(0, _Gamepad2.default.FaceButtonBottom), new _GamepadControl2.default(1, _Gamepad2.default.FaceButtonLeft), new _GamepadControl2.default(2, _Gamepad2.default.FaceButtonRight), new _GamepadControl2.default(3, _Gamepad2.default.FaceButtonTop), new _GamepadControl2.default(4, _Gamepad2.default.LeftTriggerBottom), new _GamepadControl2.default(5, _Gamepad2.default.RightTriggerBottom), new _GamepadControl2.default(6, _Gamepad2.default.LeftTriggerTop), new _GamepadControl2.default(7, _Gamepad2.default.RightTriggerTop), new _GamepadControl2.default(8, _Gamepad2.default.Select), new _GamepadControl2.default(9, _Gamepad2.default.Start), new _GamepadControl2.default(10, _Gamepad2.default.LeftStickButton), new _GamepadControl2.default(11, _Gamepad2.default.RightStickButton), new _GamepadControl2.default(12, _Gamepad2.default.DPadUp), new _GamepadControl2.default(13, _Gamepad2.default.DPadDown), new _GamepadControl2.default(14, _Gamepad2.default.DPadLeft), new _GamepadControl2.default(15, _Gamepad2.default.DPadRight), new _GamepadControl2.default(16, _Gamepad2.default.Special)], [new _GamepadControl2.default(0, _Gamepad2.default.LeftStickLeft, { negate: true }), new _GamepadControl2.default(0, _Gamepad2.default.LeftStickRight), new _GamepadControl2.default(1, _Gamepad2.default.LeftStickUp, { negate: true }), new _GamepadControl2.default(1, _Gamepad2.default.LeftStickDown), new _GamepadControl2.default(2, _Gamepad2.default.RightStickLeft, { negate: true }), new _GamepadControl2.default(2, _Gamepad2.default.RightStickRight), new _GamepadControl2.default(3, _Gamepad2.default.RightStickUp, { negate: true }), new _GamepadControl2.default(3, _Gamepad2.default.RightStickDown)]));
    }

    return DefaultGamepadMapping;
}(_GamepadMapping3.default);

exports.default = DefaultGamepadMapping;

/***/ }),
/* 44 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class GamepadMapping
 */
var GamepadMapping = function () {

    /**
     * @constructor
     * @param {GamepadControl[]} [buttons]
     * @param {GamepadControl[]} [axes]
     */
    function GamepadMapping(buttons, axes) {
        _classCallCheck(this, GamepadMapping);

        /**
         * @private
         * @member {Set<GamepadControl>}
         */
        this._buttons = new Set(buttons);

        /**
         * @private
         * @member {Set<GamepadControl>}
         */
        this._axes = new Set(axes);
    }

    /**
     * @public
     * @member {Set<GamepadControl>}
     */


    _createClass(GamepadMapping, [{
        key: "setButtons",


        /**
         * @public
         * @param {GamepadControl[]} buttons
         */
        value: function setButtons(buttons) {
            this._buttons.clear();

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = buttons[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var button = _step.value;

                    this._buttons.add(button);
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }
        }

        /**
         * @public
         * @param {GamepadControl[]} axes
         */

    }, {
        key: "setAxes",
        value: function setAxes(axes) {
            this._axes.clear();

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = axes[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var axis = _step2.value;

                    this._axes.add(axis);
                }
            } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion2 && _iterator2.return) {
                        _iterator2.return();
                    }
                } finally {
                    if (_didIteratorError2) {
                        throw _iteratorError2;
                    }
                }
            }
        }

        /**
         * @public
         */

    }, {
        key: "destroy",
        value: function destroy() {
            this._buttons.clear();
            this._buttons = null;

            this._axes.clear();
            this._axes = null;
        }
    }, {
        key: "buttons",
        get: function get() {
            return this._buttons;
        },
        set: function set(buttons) {
            this.setButtons(buttons);
        }

        /**
         * @public
         * @member {Set<GamepadControl>}
         */

    }, {
        key: "axes",
        get: function get() {
            return this._axes;
        },
        set: function set(axes) {
            this.setAxes(axes);
        }
    }]);

    return GamepadMapping;
}();

exports.default = GamepadMapping;

/***/ }),
/* 45 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class GamepadControl
 */
var GamepadControl = function () {

    /**
     * @constructor
     * @param {Number} index
     * @param {Number} channel
     * @param {Object} [options]
     * @param {Number} [options.threshold=0.2]
     * @param {Boolean} [options.negate=false]
     * @param {Boolean} [options.normalize=false]
     */
    function GamepadControl(index, channel) {
        var _ref = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
            _ref$threshold = _ref.threshold,
            threshold = _ref$threshold === undefined ? 0.2 : _ref$threshold,
            _ref$negate = _ref.negate,
            negate = _ref$negate === undefined ? false : _ref$negate,
            _ref$normalize = _ref.normalize,
            normalize = _ref$normalize === undefined ? false : _ref$normalize;

        _classCallCheck(this, GamepadControl);

        /**
         * @private
         * @member {Number}
         */
        this._index = index;

        /**
         * @private
         * @member {Number}
         */
        this._channel = channel;

        /**
         * @private
         * @member {Number}
         */
        this._key = channel % _const.CHANNEL_LENGTH.CHILD;

        /**
         * @private
         * @member {Number}
         */
        this._threshold = threshold;

        /**
         * Transform value range from [-1, 1] to [1, -1].
         *
         * @private
         * @member {Boolean}
         */
        this._negate = negate;

        /**
         * Transform value range from [-1, 1] to [0, 1].
         *
         * @private
         * @member {Boolean}
         */
        this._normalize = normalize;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(GamepadControl, [{
        key: 'transformValue',


        /**
         * @public
         * @param {Number} value
         * @returns {Number}
         */
        value: function transformValue(value) {
            if (this._negate) {
                value *= -1;
            }

            if (this._normalize) {
                value = (value + 1) / 2;
            }

            return value > this._threshold ? value : 0;
        }
    }, {
        key: 'index',
        get: function get() {
            return this._index;
        },
        set: function set(index) {
            this._index = index;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'channel',
        get: function get() {
            return this._channel;
        },
        set: function set(channel) {
            this._channel = channel;
            this._key = this._channel % _const.CHANNEL_LENGTH.CHILD;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'key',
        get: function get() {
            return this._key;
        },
        set: function set(key) {
            this._key = key % _const.CHANNEL_LENGTH.CHILD;
            this._channel = _const.CHANNEL_OFFSET.GAMEPAD + this._key;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'threshold',
        get: function get() {
            return this._threshold;
        },
        set: function set(threshold) {
            this._threshold = threshold;
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'negate',
        get: function get() {
            return this._negate;
        },
        set: function set(negate) {
            this._negate = negate;
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'normalize',
        get: function get() {
            return this._normalize;
        },
        set: function set(normalize) {
            this._normalize = normalize;
        }
    }]);

    return GamepadControl;
}();

exports.default = GamepadControl;

/***/ }),
/* 46 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ChannelHandler2 = __webpack_require__(6);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class PointerManager
 * @extends {ChannelHandler}
 */
var PointerManager = function (_ChannelHandler) {
    _inherits(PointerManager, _ChannelHandler);

    /**
     * @constructor
     * @param {Game} game
     * @param {ArrayBuffer} channelBuffer
     */
    function PointerManager(game, channelBuffer) {
        _classCallCheck(this, PointerManager);

        /**
         * @private
         * @member {Game}
         */
        var _this = _possibleConstructorReturn(this, (PointerManager.__proto__ || Object.getPrototypeOf(PointerManager)).call(this, channelBuffer, _const.CHANNEL_OFFSET.POINTER, _const.CHANNEL_LENGTH.DEVICE));

        _this._game = game;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        _this._canvas = game.canvas;

        /**
         * @private
         * @member {Map<Number, Pointer>}
         */
        _this._pointers = new Map();

        _this._addEventListeners();
        return _this;
    }

    /**
     * @public
     * @member {Map<Number, Pointer>}
     */


    _createClass(PointerManager, [{
        key: 'destroy',


        /**
         * @override
         */
        value: function destroy() {
            _get(PointerManager.prototype.__proto__ || Object.getPrototypeOf(PointerManager.prototype), 'destroy', this).call(this);

            this._removeEventListeners();

            this._pointers.clear();
            this._pointers = null;

            this._canvas = null;
            this._game = null;
        }

        /**
         * @private
         */

    }, {
        key: '_addEventListeners',
        value: function _addEventListeners() {
            var canvas = this._canvas;

            this._onTouchStartHandler = this._onTouchStart.bind(this);
            this._onTouchEndHandler = this._onTouchEnd.bind(this);
            this._onTouchMoveHandler = this._onTouchMove.bind(this);

            canvas.addEventListener('touchstart', this._onTouchStartHandler, true);
            canvas.addEventListener('touchend', this._onTouchEndHandler, true);
            canvas.addEventListener('touchmove', this._onTouchMoveHandler, true);
        }

        /**
         * @private
         */

    }, {
        key: '_removeEventListeners',
        value: function _removeEventListeners() {
            var canvas = this._canvas;

            canvas.removeEventListener('touchstart', this._onTouchStartHandler, true);
            canvas.removeEventListener('touchend', this._onTouchEndHandler, true);
            canvas.removeEventListener('touchmove', this._onTouchMoveHandler, true);

            this._onTouchStartHandler = null;
            this._onTouchEndHandler = null;
            this._onTouchMoveHandler = null;
        }
    }, {
        key: '_onTouchStart',
        value: function _onTouchStart(event) {
            console.log('touchdown', event);
        }
    }, {
        key: '_onTouchEnd',
        value: function _onTouchEnd(event) {
            console.log('touchup', event);
        }
    }, {
        key: '_onTouchMove',
        value: function _onTouchMove(event) {
            console.log('touchmove', event);
        }
    }, {
        key: 'pointers',
        get: function get() {
            return this._pointers;
        }
    }]);

    return PointerManager;
}(_ChannelHandler3.default);

exports.default = PointerManager;

/***/ }),
/* 47 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(7);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _ResourceContainer = __webpack_require__(48);

var _ResourceContainer2 = _interopRequireDefault(_ResourceContainer);

var _factory = __webpack_require__(49);

var Factories = _interopRequireWildcard(_factory);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ResourceLoader
 * @extends {EventEmitter}
 */
var ResourceLoader = function (_EventEmitter) {
    _inherits(ResourceLoader, _EventEmitter);

    /**
     * @constructor
     * @param {Object} [options={}]
     * @param {String} [options.basePath='']
     */
    function ResourceLoader() {
        var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
            _ref$basePath = _ref.basePath,
            basePath = _ref$basePath === undefined ? '' : _ref$basePath;

        _classCallCheck(this, ResourceLoader);

        /**
         * @private
         * @member {Set<Object>}
         */
        var _this = _possibleConstructorReturn(this, (ResourceLoader.__proto__ || Object.getPrototypeOf(ResourceLoader)).call(this));

        _this._queue = new Set();

        /**
         * @private
         * @member {ResourceContainer}
         */
        _this._resources = new _ResourceContainer2.default();

        /**
         * @private
         * @member {Map<String, ResourceFactory>}
         */
        _this._factories = new Map();

        /**
         * @private
         * @member {String}
         */
        _this._basePath = basePath;

        /**
         * @private
         * @member {Object}
         */
        _this._request = {
            method: 'GET',
            mode: 'cors',
            cache: 'default'
        };

        /**
         * @private
         * @member {?Database}
         */
        _this._database = null;

        _this.addFactory('arrayBuffer', new Factories.ArrayBufferFactory()).addFactory('audioBuffer', new Factories.AudioBufferFactory()).addFactory('audio', new Factories.AudioFactory()).addFactory('blob', new Factories.BlobFactory()).addFactory('font', new Factories.FontFactory()).addFactory('image', new Factories.ImageFactory()).addFactory('json', new Factories.JSONFactory()).addFactory('music', new Factories.MusicFactory()).addFactory('sound', new Factories.SoundFactory()).addFactory('sprite', new Factories.SpriteFactory()).addFactory('string', new Factories.StringFactory()).addFactory('texture', new Factories.TextureFactory()).addFactory('video', new Factories.VideoFactory());
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {ResourceContainer}
     */


    _createClass(ResourceLoader, [{
        key: 'addFactory',


        /**
         * @public
         * @chainable
         * @param {String} type
         * @param {ResourceFactory} factory
         * @returns {ResourceLoader}
         */
        value: function addFactory(type, factory) {
            this._factories.set(type, factory);
            this._resources.addType(type);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} type
         * @returns {ResourceFactory}
         */

    }, {
        key: 'getFactory',
        value: function getFactory(type) {
            if (!this._factories.has(type)) {
                throw new Error('No resource factory for type "' + type + '".');
            }

            return this._factories.get(type);
        }

        /**
         * @public
         * @returns {Promise}
         */

    }, {
        key: 'load',
        value: function load() {
            var _this2 = this;

            var items = [].concat(_toConsumableArray(this._queue));
            var loaded = 0;

            this._queue.clear();

            this.trigger('start', items.length, loaded, items);

            return items.map(function (item) {
                return _this2.loadItem(item);
            }).reduce(function (sequence, promise) {
                return sequence.then(function () {
                    return promise;
                }).then(function (resource) {
                    return _this2.trigger('progress', items.length, ++loaded, resource);
                });
            }, Promise.resolve()).then(function () {
                return _this2.trigger('complete', items.length, loaded, _this2._resources);
            });
        }

        /**
         * @public
         * @param {Object} item
         * @param {String} item.type
         * @param {String} item.name
         * @param {String} item.path
         * @param {Object} [item.options]
         * @returns {Promise<*>}
         */

    }, {
        key: 'loadItem',
        value: function loadItem() {
            var _this3 = this;

            var _ref2 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                type = _ref2.type,
                name = _ref2.name,
                path = _ref2.path,
                options = _ref2.options;

            if (this._resources.has(type, name)) {
                return Promise.resolve(this._resources.get(type, name));
            }

            var factory = this.getFactory(type);

            if (this._database) {
                return this._database.loadData(factory.storageType, name).then(function (result) {
                    return result.data || factory.request(_this3._basePath + path, _this3._request).then(function (response) {
                        return factory.process(response);
                    }).then(function (data) {
                        return _this3._database.saveData(factory.storageType, name, data);
                    }).then(function (result) {
                        return result.data;
                    });
                }).then(function (source) {
                    return factory.create(source, options);
                }).then(function (resource) {
                    _this3._resources.set(type, name, resource);

                    return resource;
                });
            }

            return factory.load(this._basePath + path, this._request, options).then(function (resource) {
                _this3._resources.set(type, name, resource);

                return resource;
            });
        }

        /**
         * @public
         * @chainable
         * @param {String} type
         * @param {String} name
         * @param {String} path
         * @param {Object} [options]
         * @returns {ResourceLoader}
         */

    }, {
        key: 'addItem',
        value: function addItem(type, name, path, options) {
            if (!this._factories.has(type)) {
                throw new Error('No resource factory for type "' + type + '".');
            }

            this._queue.add({
                type: type,
                name: name,
                path: path,
                options: options
            });

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} type
         * @param {Map<String, String>|Object<String, String>} list
         * @param {Object} [options]
         * @returns {ResourceLoader}
         */

    }, {
        key: 'addList',
        value: function addList(type, list, options) {
            var items = list instanceof Map ? list : Object.entries(list);

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = items[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var _ref3 = _step.value;

                    var _ref4 = _slicedToArray(_ref3, 2);

                    var name = _ref4[0];
                    var path = _ref4[1];

                    this.addItem(type, name, path, options);
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {ResourceLoader}
         */

    }, {
        key: 'reset',
        value: function reset() {
            this._resources.clear();
            this._queue.clear();
            this.off();

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(ResourceLoader.prototype.__proto__ || Object.getPrototypeOf(ResourceLoader.prototype), 'destroy', this).call(this);

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this._factories.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var factory = _step2.value;

                    factory.destroy();
                }
            } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion2 && _iterator2.return) {
                        _iterator2.return();
                    }
                } finally {
                    if (_didIteratorError2) {
                        throw _iteratorError2;
                    }
                }
            }

            if (this._database) {
                this._database.destroy();
                this._database = null;
            }

            this._resources.destroy();
            this._resources = null;

            this._queue.clear();
            this._queue = null;

            this._factories.clear();
            this._factories = null;

            this._basePath = null;
            this._request = null;
        }
    }, {
        key: 'resources',
        get: function get() {
            return this._resources;
        }

        /**
         * @public
         * @member {String}
         */

    }, {
        key: 'basePath',
        get: function get() {
            return this._basePath;
        },
        set: function set(basePath) {
            this._basePath = basePath;
        }

        /**
         * @public
         * @member {Object<String, String>}
         */

    }, {
        key: 'request',
        get: function get() {
            return this._request;
        },
        set: function set(request) {
            this._request = request;
        }

        /**
         * @public
         * @member {?Database}
         */

    }, {
        key: 'database',
        get: function get() {
            return this._database;
        },
        set: function set(request) {
            this._database = request;
        }
    }]);

    return ResourceLoader;
}(_EventEmitter3.default);

exports.default = ResourceLoader;

/***/ }),
/* 48 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class ResourceContainer
 */
var ResourceContainer = function () {

    /**
     * @constructor
     */
    function ResourceContainer() {
        _classCallCheck(this, ResourceContainer);

        /**
         * @private
         * @member {Map<String, Map<String, *>>}
         */
        this._resources = new Map();

        /**
         * @private
         * @member {Set<String>}
         */
        this._types = new Set();
    }

    /**
     * @public
     * @readonly
     * @member {Map<String, Map<String, *>>}
     */


    _createClass(ResourceContainer, [{
        key: "addType",


        /**
         * @public
         * @chainable
         * @param {String} type
         * @returns {ResourceContainer}
         */
        value: function addType(type) {
            if (!this._types.has(type)) {
                this._resources.set(type, new Map());
                this._types.add(type);
            }

            return this;
        }

        /**
         * @public
         * @param {String} type
         * @returns {Map<String, *>}
         */

    }, {
        key: "getResources",
        value: function getResources(type) {
            if (!this._types.has(type)) {
                throw new Error("Unknown type \"" + type + "\".");
            }

            return this._resources.get(type);
        }

        /**
         * @public
         * @param {String} type
         * @param {String} name
         * @returns {Boolean}
         */

    }, {
        key: "has",
        value: function has(type, name) {
            return this.getResources(type).has(name);
        }

        /**
         * @public
         * @param {String} type
         * @param {String} name
         * @returns {ResourceContainer}
         */

    }, {
        key: "get",
        value: function get(type, name) {
            var resources = this.getResources(type);

            if (!resources.has(name)) {
                throw new Error("Missing resource \"" + name + "\" with type \"" + type + "\".");
            }

            return resources.get(name);
        }

        /**
         * @public
         * @chainable
         * @param {String} type
         * @param {String} name
         * @param {*} resource
         * @returns {ResourceContainer}
         */

    }, {
        key: "set",
        value: function set(type, name, resource) {
            this.getResources(type).set(name, resource);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} type
         * @param {String} name
         * @returns {ResourceContainer}
         */

    }, {
        key: "delete",
        value: function _delete(type, name) {
            this.getResources(type).delete(name);

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {ResourceContainer}
         */

    }, {
        key: "clear",
        value: function clear() {
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._resources.values()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var container = _step.value;

                    container.clear();
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            return this;
        }

        /**
         * @public
         */

    }, {
        key: "destroy",
        value: function destroy() {
            this.clear();

            this._resources.clear();
            this._resources = null;

            this._types.clear();
            this._types = null;
        }
    }, {
        key: "resources",
        get: function get() {
            return this._resources;
        }

        /**
         * @public
         * @readonly
         * @member {Set<String>}
         */

    }, {
        key: "types",
        get: function get() {
            return this._types;
        }
    }]);

    return ResourceContainer;
}();

exports.default = ResourceContainer;

/***/ }),
/* 49 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _ArrayBufferFactory = __webpack_require__(12);

Object.defineProperty(exports, 'ArrayBufferFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ArrayBufferFactory).default;
  }
});

var _AudioBufferFactory = __webpack_require__(50);

Object.defineProperty(exports, 'AudioBufferFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_AudioBufferFactory).default;
  }
});

var _AudioFactory = __webpack_require__(51);

Object.defineProperty(exports, 'AudioFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_AudioFactory).default;
  }
});

var _BlobFactory = __webpack_require__(14);

Object.defineProperty(exports, 'BlobFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_BlobFactory).default;
  }
});

var _FontFactory = __webpack_require__(62);

Object.defineProperty(exports, 'FontFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_FontFactory).default;
  }
});

var _ImageFactory = __webpack_require__(52);

Object.defineProperty(exports, 'ImageFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ImageFactory).default;
  }
});

var _JSONFactory = __webpack_require__(63);

Object.defineProperty(exports, 'JSONFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_JSONFactory).default;
  }
});

var _MusicFactory = __webpack_require__(64);

Object.defineProperty(exports, 'MusicFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_MusicFactory).default;
  }
});

var _SoundFactory = __webpack_require__(65);

Object.defineProperty(exports, 'SoundFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SoundFactory).default;
  }
});

var _SpriteFactory = __webpack_require__(66);

Object.defineProperty(exports, 'SpriteFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SpriteFactory).default;
  }
});

var _StringFactory = __webpack_require__(68);

Object.defineProperty(exports, 'StringFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_StringFactory).default;
  }
});

var _TextureFactory = __webpack_require__(55);

Object.defineProperty(exports, 'TextureFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_TextureFactory).default;
  }
});

var _VideoFactory = __webpack_require__(69);

Object.defineProperty(exports, 'VideoFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_VideoFactory).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 50 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ArrayBufferFactory2 = __webpack_require__(12);

var _ArrayBufferFactory3 = _interopRequireDefault(_ArrayBufferFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class AudioBufferFactory
 * @extends {ResourceFactory}
 */
var AudioBufferFactory = function (_ArrayBufferFactory) {
    _inherits(AudioBufferFactory, _ArrayBufferFactory);

    function AudioBufferFactory() {
        _classCallCheck(this, AudioBufferFactory);

        return _possibleConstructorReturn(this, (AudioBufferFactory.__proto__ || Object.getPrototypeOf(AudioBufferFactory)).apply(this, arguments));
    }

    _createClass(AudioBufferFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(source, options) {
            return _get(AudioBufferFactory.prototype.__proto__ || Object.getPrototypeOf(AudioBufferFactory.prototype), 'create', this).call(this, source, options).then(function (arrayBuffer) {
                return (0, _utils.decodeAudioBuffer)(arrayBuffer);
            });
        }
    }, {
        key: 'storageType',


        /**
         * @override
         */
        get: function get() {
            return 'audioBuffer';
        }
    }]);

    return AudioBufferFactory;
}(_ArrayBufferFactory3.default);

exports.default = AudioBufferFactory;

/***/ }),
/* 51 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _BlobFactory2 = __webpack_require__(14);

var _BlobFactory3 = _interopRequireDefault(_BlobFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class AudioFactory
 * @extends {ResourceFactory}
 */
var AudioFactory = function (_BlobFactory) {
    _inherits(AudioFactory, _BlobFactory);

    /**
     * @constructor
     */
    function AudioFactory() {
        _classCallCheck(this, AudioFactory);

        /**
         * @private
         * @member {Set<String>}
         */
        var _this = _possibleConstructorReturn(this, (AudioFactory.__proto__ || Object.getPrototypeOf(AudioFactory)).call(this));

        _this._objectURLs = new Set();
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Set<String>}
     */


    _createClass(AudioFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(source) {
            var _this2 = this;

            var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
                _ref$mimeType = _ref.mimeType,
                mimeType = _ref$mimeType === undefined ? (0, _utils.determineMimeType)(source) : _ref$mimeType,
                _ref$loadEvent = _ref.loadEvent,
                loadEvent = _ref$loadEvent === undefined ? 'canplaythrough' : _ref$loadEvent;

            return _get(AudioFactory.prototype.__proto__ || Object.getPrototypeOf(AudioFactory.prototype), 'create', this).call(this, source, { mimeType: mimeType }).then(function (blob) {
                return new Promise(function (resolve, reject) {
                    var audio = document.createElement('audio'),
                        objectURL = URL.createObjectURL(blob);

                    _this2._objectURLs.add(objectURL);

                    audio.addEventListener(loadEvent, function () {
                        return resolve(audio);
                    });
                    audio.addEventListener('error', function () {
                        return reject(audio);
                    });
                    audio.addEventListener('abort', function () {
                        return reject(audio);
                    });

                    audio.src = objectURL;
                });
            });
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._objectURLs[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var objectURL = _step.value;

                    URL.revokeObjectURL(objectURL);
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            this._objectURLs.clear();
            this._objectURLs = null;
        }
    }, {
        key: 'objectURLs',
        get: function get() {
            return this._objectURLs;
        }

        /**
         * @override
         */

    }, {
        key: 'storageType',
        get: function get() {
            return 'audio';
        }
    }]);

    return AudioFactory;
}(_BlobFactory3.default);

exports.default = AudioFactory;

/***/ }),
/* 52 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _BlobFactory2 = __webpack_require__(14);

var _BlobFactory3 = _interopRequireDefault(_BlobFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ImageFactory
 * @extends {ResourceFactory}
 */
var ImageFactory = function (_BlobFactory) {
    _inherits(ImageFactory, _BlobFactory);

    /**
     * @constructor
     */
    function ImageFactory() {
        _classCallCheck(this, ImageFactory);

        /**
         * @private
         * @member {Set<String>}
         */
        var _this = _possibleConstructorReturn(this, (ImageFactory.__proto__ || Object.getPrototypeOf(ImageFactory)).call(this));

        _this._objectURLs = new Set();
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Set<String>}
     */


    _createClass(ImageFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(source) {
            var _this2 = this;

            var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
                _ref$mimeType = _ref.mimeType,
                mimeType = _ref$mimeType === undefined ? (0, _utils.determineMimeType)(source) : _ref$mimeType;

            return _get(ImageFactory.prototype.__proto__ || Object.getPrototypeOf(ImageFactory.prototype), 'create', this).call(this, source, { mimeType: mimeType }).then(function (blob) {
                return new Promise(function (resolve, reject) {
                    var image = new Image(),
                        objectURL = URL.createObjectURL(blob);

                    _this2._objectURLs.add(objectURL);

                    image.addEventListener('load', function () {
                        return resolve(image);
                    });
                    image.addEventListener('error', function () {
                        return reject(image);
                    });
                    image.addEventListener('abort', function () {
                        return reject(image);
                    });

                    image.src = objectURL;
                });
            });
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._objectURLs[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var objectURL = _step.value;

                    URL.revokeObjectURL(objectURL);
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            this._objectURLs.clear();
            this._objectURLs = null;
        }
    }, {
        key: 'objectURLs',
        get: function get() {
            return this._objectURLs;
        }

        /**
         * @override
         */

    }, {
        key: 'storageType',
        get: function get() {
            return 'image';
        }
    }]);

    return ImageFactory;
}(_BlobFactory3.default);

exports.default = ImageFactory;

/***/ }),
/* 53 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Playable2 = __webpack_require__(15);

var _Playable3 = _interopRequireDefault(_Playable2);

var _utils = __webpack_require__(1);

var _support = __webpack_require__(5);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Music
 * @extends {Playable}
 */
var Music = function (_Playable) {
    _inherits(Music, _Playable);

    /**
     * @constructor
     * @param {HTMLMediaElement} audio
     */
    function Music(audio) {
        _classCallCheck(this, Music);

        if (!_support2.default.webAudio) {
            throw new Error('Web Audio API is not supported, use the fallback Audio instead.');
        }

        /**
         * @private
         * @member {?AudioContext}
         */
        var _this = _possibleConstructorReturn(this, (Music.__proto__ || Object.getPrototypeOf(Music)).call(this, audio));

        _this._audioContext = null;

        /**
         * @private
         * @member {?MediaElementAudioSourceNode}
         */
        _this._sourceNode = null;

        /**
         * @private
         * @member {?GainNode}
         */
        _this._gainNode = null;
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {?AudioContext}
     */


    _createClass(Music, [{
        key: 'connect',


        /**
         * @override
         */
        value: function connect(mediaManager) {
            if (this._audioContext) {
                return;
            }

            this._audioContext = mediaManager.audioContext;

            this._gainNode = this._audioContext.createGain();
            this._gainNode.connect(mediaManager.musicGain);

            this._sourceNode = this._audioContext.createMediaElementSource(this._source);
            this._sourceNode.connect(this._gainNode);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Music.prototype.__proto__ || Object.getPrototypeOf(Music.prototype), 'destroy', this).call(this);

            if (this._audioContext) {
                this._audioContext = null;

                this._sourceNode.disconnect();
                this._sourceNode = null;

                this._gainNode.disconnect();
                this._gainNode = null;
            }
        }
    }, {
        key: 'audioContext',
        get: function get() {
            return this._audioContext;
        }

        /**
         * @override
         */

    }, {
        key: 'volume',
        get: function get() {
            return this._audioContext ? this._gainNode.gain.value : 1;
        },
        set: function set(volume) {
            if (this._audioContext) {
                this._gainNode.gain.value = (0, _utils.clamp)(volume, 0, 1);
            }
        }

        /**
         * @public
         * @readonly
         * @member {?GainNode}
         */

    }, {
        key: 'analyserTarget',
        get: function get() {
            return this._gainNode;
        }
    }]);

    return Music;
}(_Playable3.default);

exports.default = Music;

/***/ }),
/* 54 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Playable2 = __webpack_require__(15);

var _Playable3 = _interopRequireDefault(_Playable2);

var _utils = __webpack_require__(1);

var _support = __webpack_require__(5);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Sound
 * @extends {Playable}
 */
var Sound = function (_Playable) {
    _inherits(Sound, _Playable);

    /**
     * @constructor
     * @param {AudioBuffer} audioBuffer
     */
    function Sound(audioBuffer) {
        _classCallCheck(this, Sound);

        if (!_support2.default.webAudio) {
            throw new Error('Web Audio API is not supported, use the fallback Audio instead.');
        }

        /**
         * @private
         * @member {?AudioContext}
         */
        var _this = _possibleConstructorReturn(this, (Sound.__proto__ || Object.getPrototypeOf(Sound)).call(this, audioBuffer));

        _this._audioContext = null;

        /**
         * @private
         * @member {?AudioBufferSourceNode}
         */
        _this._sourceNode = null;

        /**
         * @private
         * @member {?GainNode}
         */
        _this._gainNode = null;

        /**
         * @private
         * @member {Boolean}
         */
        _this._paused = true;

        /**
         * @private
         * @member {Number}
         */
        _this._startTime = 0;

        /**
         * @private
         * @member {Number}
         */
        _this._currentTime = 0;

        /**
         * @private
         * @member {Number}
         */
        _this._volume = 1;

        /**
         * @private
         * @member {Number}
         */
        _this._playbackRate = 1;

        /**
         * @private
         * @member {Boolean}
         */
        _this._loop = false;
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {?AudioContext}
     */


    _createClass(Sound, [{
        key: 'connect',


        /**
         * @override
         */
        value: function connect(mediaManager) {
            if (this._audioContext) {
                return;
            }

            this._audioContext = mediaManager.audioContext;

            this._gainNode = this._audioContext.createGain();
            this._gainNode.connect(mediaManager.soundGain);
        }

        /**
         * @override
         */

    }, {
        key: 'play',
        value: function play(options) {
            if (!this._paused) {
                return;
            }

            this._paused = false;

            if (this._sourceNode) {
                this._sourceNode.stop(0);
                this._sourceNode.disconnect();
            }

            this.applyOptions(options);

            this._sourceNode = this._audioContext.createBufferSource();
            this._sourceNode.buffer = this._source;
            this._sourceNode.loop = this._loop;
            this._sourceNode.playbackRate.value = this._playbackRate;

            this._sourceNode.connect(this._gainNode);
            this._sourceNode.start(0, this._currentTime);

            this._startTime = this._audioContext.currentTime;
        }

        /**
         * @override
         */

    }, {
        key: 'pause',
        value: function pause() {
            if (this._paused) {
                return;
            }

            this._paused = true;

            var duration = this.duration,
                currentTime = this.currentTime;

            this._currentTime = currentTime <= duration ? currentTime : (currentTime - duration) * (currentTime / duration | 0);
            this._sourceNode.stop(0);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Sound.prototype.__proto__ || Object.getPrototypeOf(Sound.prototype), 'destroy', this).call(this);

            if (this._audioContext) {
                this._sourceNode.disconnect();
                this._sourceNode = null;

                this._gainNode.disconnect();
                this._gainNode = null;

                this._audioContext = null;
            }
        }
    }, {
        key: 'audioContext',
        get: function get() {
            return this._audioContext;
        }

        /**
         * @override
         */

    }, {
        key: 'volume',
        get: function get() {
            return this._volume;
        },
        set: function set(volume) {
            this._volume = (0, _utils.clamp)(volume, 0, 2);

            if (this._gainNode) {
                this._gainNode.gain.value = this._volume;
            }
        }

        /**
         * @override
         */

    }, {
        key: 'currentTime',
        get: function get() {
            if (!this._startTime || !this._audioContext) {
                return 0;
            }

            return this._currentTime + this._audioContext.currentTime - this._startTime;
        },
        set: function set(currentTime) {
            this.pause();
            this._currentTime = Math.max(0, currentTime);
            this.play();
        }

        /**
         * @override
         */

    }, {
        key: 'loop',
        get: function get() {
            return this._loop;
        },
        set: function set(loop) {
            this._loop = loop;

            if (this._sourceNode) {
                this._sourceNode.loop = this._loop;
            }
        }

        /**
         * @override
         */

    }, {
        key: 'playbackRate',
        get: function get() {
            return this._playbackRate;
        },
        set: function set(playbackRate) {
            this._playbackRate = Math.max(0, playbackRate);

            if (this._sourceNode) {
                this._sourceNode.playbackRate.value = this._playbackRate;
            }
        }

        /**
         * @override
         */

    }, {
        key: 'paused',
        get: function get() {
            if (!this._paused || this._loop) {
                return false;
            }

            return this.currentTime >= this.duration;
        },
        set: function set(paused) {
            if (paused) {
                this.pause();
            } else {
                this.play();
            }
        }

        /**
         * @override
         */

    }, {
        key: 'playing',
        get: function get() {
            return !this._paused;
        },
        set: function set(playing) {
            if (playing) {
                this.play();
            } else {
                this.pause();
            }
        }

        /**
         * @override
         */

    }, {
        key: 'analyserTarget',
        get: function get() {
            return this._gainNode;
        }
    }]);

    return Sound;
}(_Playable3.default);

exports.default = Sound;

/***/ }),
/* 55 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ImageFactory2 = __webpack_require__(52);

var _ImageFactory3 = _interopRequireDefault(_ImageFactory2);

var _Texture = __webpack_require__(16);

var _Texture2 = _interopRequireDefault(_Texture);

var _settings = __webpack_require__(4);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class TextureFactory
 * @extends {ResourceFactory}
 */
var TextureFactory = function (_ImageFactory) {
    _inherits(TextureFactory, _ImageFactory);

    function TextureFactory() {
        _classCallCheck(this, TextureFactory);

        return _possibleConstructorReturn(this, (TextureFactory.__proto__ || Object.getPrototypeOf(TextureFactory)).apply(this, arguments));
    }

    _createClass(TextureFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(source) {
            var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
                mimeType = _ref.mimeType,
                _ref$scaleMode = _ref.scaleMode,
                scaleMode = _ref$scaleMode === undefined ? _settings2.default.SCALE_MODE : _ref$scaleMode,
                _ref$wrapMode = _ref.wrapMode,
                wrapMode = _ref$wrapMode === undefined ? _settings2.default.WRAP_MODE : _ref$wrapMode,
                _ref$premultiplyAlpha = _ref.premultiplyAlpha,
                premultiplyAlpha = _ref$premultiplyAlpha === undefined ? _settings2.default.PREMULTIPLY_ALPHA : _ref$premultiplyAlpha;

            return _get(TextureFactory.prototype.__proto__ || Object.getPrototypeOf(TextureFactory.prototype), 'create', this).call(this, source, { mimeType: mimeType }).then(function (image) {
                return new _Texture2.default(image, {
                    scaleMode: scaleMode,
                    wrapMode: wrapMode,
                    premultiplyAlpha: premultiplyAlpha
                });
            });
        }
    }, {
        key: 'storageType',


        /**
         * @override
         */
        get: function get() {
            return 'image';
        }
    }]);

    return TextureFactory;
}(_ImageFactory3.default);

exports.default = TextureFactory;

/***/ }),
/* 56 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _Time = __webpack_require__(11);

var _Time2 = _interopRequireDefault(_Time);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Particle
 */
var Particle = function () {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Time} [options.lifetime]
     * @param {Vector} [options.position]
     * @param {Vector} [options.velocity]
     * @param {Number} [options.rotation]
     * @param {Number} [options.rotationSpeed]
     * @param {Vector} [options.scale]
     * @param {Color} [options.color]
     */
    function Particle() {
        var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
            lifetime = _ref.lifetime,
            position = _ref.position,
            velocity = _ref.velocity,
            rotation = _ref.rotation,
            rotationSpeed = _ref.rotationSpeed,
            scale = _ref.scale,
            color = _ref.color;

        _classCallCheck(this, Particle);

        /**
         * @private
         * @member {Time}
         */
        this._totalLifetime = lifetime && lifetime.clone() || new _Time2.default(1, _Time2.default.Seconds);

        /**
         * @private
         * @member {Vector}
         */
        this._position = position && position.clone() || new _Vector2.default();

        /**
         * @private
         * @member {Vector}
         */
        this._velocity = velocity && velocity.clone() || new _Vector2.default();

        /**
         * @private
         * @member {Number}
         */
        this._rotation = rotation || 0;

        /**
         * @private
         * @member {Number}
         */
        this._rotationSpeed = rotationSpeed || 0;

        /**
         * @private
         * @member {Vector}
         */
        this._scale = scale && scale.clone() || new _Vector2.default(1, 1);

        /**
         * @private
         * @member {Color}
         */
        this._color = color && color.clone() || new _Color2.default(255, 255, 255, 1);

        /**
         * @private
         * @member {Time}
         */
        this._elapsedLifetime = new _Time2.default();
    }

    /**
     * @public
     * @member {Vector}
     */


    _createClass(Particle, [{
        key: 'update',


        /**
         * @public
         * @param {Time} delta
         */
        value: function update(delta) {
            var seconds = delta.seconds;

            this._elapsedLifetime.add(delta);
            this._position.add(seconds * this._velocity.x, seconds * this._velocity.y);
            this._rotation += seconds * this._rotationSpeed;
        }
    }, {
        key: 'position',
        get: function get() {
            return this._position;
        },
        set: function set(position) {
            this._position.copy(position);
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'velocity',
        get: function get() {
            return this._velocity;
        },
        set: function set(velocity) {
            this._velocity.copy(velocity);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'rotation',
        get: function get() {
            return this._rotation;
        },
        set: function set(rotation) {
            this._rotation = rotation;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'rotationSpeed',
        get: function get() {
            return this._rotationSpeed;
        },
        set: function set(rotationSpeed) {
            this._rotationSpeed = rotationSpeed;
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'scale',
        get: function get() {
            return this._scale;
        },
        set: function set(scale) {
            this._velocity.copy(scale);
        }

        /**
         * @public
         * @member {Color}
         */

    }, {
        key: 'color',
        get: function get() {
            return this._color;
        },
        set: function set(color) {
            this._color.copy(color);
        }

        /**
         * @public
         * @member {Time}
         */

    }, {
        key: 'elapsedLifetime',
        get: function get() {
            return this._elapsedLifetime;
        },
        set: function set(elapsedLifetime) {
            this._elapsedLifetime.copy(elapsedLifetime);
        }

        /**
         * @public
         * @member {Time}
         */

    }, {
        key: 'totalLifetime',
        get: function get() {
            return this._totalLifetime;
        },
        set: function set(totalLifetime) {
            this._totalLifetime.copy(totalLifetime);
        }

        /**
         * @public
         * @readonly
         * @member {Time}
         */

    }, {
        key: 'remainingLifetime',
        get: function get() {
            return new _Time2.default(this.totalLifetime.milliseconds - this.elapsedLifetime.milliseconds);
        }

        /**
         * @public
         * @readonly
         * @member {Time}
         */

    }, {
        key: 'elapsedRatio',
        get: function get() {
            return this.elapsedLifetime.milliseconds / this.totalLifetime.milliseconds;
        }

        /**
         * @public
         * @readonly
         * @member {Time}
         */

    }, {
        key: 'remainingRatio',
        get: function get() {
            return this.remainingLifetime.milliseconds / this.totalLifetime.milliseconds;
        }
    }]);

    return Particle;
}();

exports.default = Particle;

/***/ }),
/* 57 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.settings = exports.utils = exports.support = undefined;

var _const = __webpack_require__(0);

Object.keys(_const).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _const[key];
        }
    });
});

var _core = __webpack_require__(58);

Object.keys(_core).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _core[key];
        }
    });
});

var _content = __webpack_require__(74);

Object.keys(_content).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _content[key];
        }
    });
});

var _input = __webpack_require__(76);

Object.keys(_input).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _input[key];
        }
    });
});

var _media = __webpack_require__(79);

Object.keys(_media).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _media[key];
        }
    });
});

var _display = __webpack_require__(83);

Object.keys(_display).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _display[key];
        }
    });
});

var _particle = __webpack_require__(86);

Object.keys(_particle).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _particle[key];
        }
    });
});

var _support = __webpack_require__(5);

var support = _interopRequireWildcard(_support);

var _utils = __webpack_require__(1);

var utils = _interopRequireWildcard(_utils);

var _settings = __webpack_require__(4);

var settings = _interopRequireWildcard(_settings);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

/**
 * @namespace Exo
 */
exports.support = support;
exports.utils = utils;
exports.settings = settings;

/***/ }),
/* 58 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _EventEmitter = __webpack_require__(7);

Object.defineProperty(exports, 'EventEmitter', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_EventEmitter).default;
  }
});

var _Color = __webpack_require__(8);

Object.defineProperty(exports, 'Color', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Color).default;
  }
});

var _Transformable = __webpack_require__(25);

Object.defineProperty(exports, 'Transformable', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Transformable).default;
  }
});

var _RC = __webpack_require__(26);

Object.defineProperty(exports, 'RC4', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_RC).default;
  }
});

var _Random = __webpack_require__(59);

Object.defineProperty(exports, 'Random', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Random).default;
  }
});

var _Time = __webpack_require__(11);

Object.defineProperty(exports, 'Time', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Time).default;
  }
});

var _Clock = __webpack_require__(20);

Object.defineProperty(exports, 'Clock', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Clock).default;
  }
});

var _Timer = __webpack_require__(60);

Object.defineProperty(exports, 'Timer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Timer).default;
  }
});

var _Game = __webpack_require__(61);

Object.defineProperty(exports, 'Game', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Game).default;
  }
});

var _Scene = __webpack_require__(70);

Object.defineProperty(exports, 'Scene', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Scene).default;
  }
});

var _SceneManager = __webpack_require__(27);

Object.defineProperty(exports, 'SceneManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SceneManager).default;
  }
});

var _Quadtree = __webpack_require__(71);

Object.defineProperty(exports, 'Quadtree', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Quadtree).default;
  }
});

var _Shape = __webpack_require__(9);

Object.defineProperty(exports, 'Shape', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Shape).default;
  }
});

var _Vector = __webpack_require__(2);

Object.defineProperty(exports, 'Vector', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Vector).default;
  }
});

var _Rectangle = __webpack_require__(3);

Object.defineProperty(exports, 'Rectangle', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Rectangle).default;
  }
});

var _Circle = __webpack_require__(72);

Object.defineProperty(exports, 'Circle', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Circle).default;
  }
});

var _Polygon = __webpack_require__(73);

Object.defineProperty(exports, 'Polygon', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Polygon).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 59 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _RC = __webpack_require__(26);

var _RC2 = _interopRequireDefault(_RC);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Random
 */
var Random = function () {

    /**
     * @constructor
     * @param {String} [seed=Random.generateSeed()]
     */
    function Random() {
        var seed = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : Random.generateSeed();

        _classCallCheck(this, Random);

        /**
         * @private
         * @member {String}
         */
        this._seed = seed;

        /**
         * @private
         * @member {RC4}
         */
        this._rc4 = new _RC2.default(this.getMixedKeys(this.flatten(seed)));
    }

    /**
     * @public
     * @member {String}
     */


    _createClass(Random, [{
        key: 'flatten',


        /**
         * @private
         * @param {*} object
         * @param {Number} [depth=3]
         * @returns {String}
         */
        value: function flatten(object) {
            var depth = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 3;

            var result = [];

            if (depth >= 0 && (typeof object === 'undefined' ? 'undefined' : _typeof(object)) === 'object') {
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = Object.values(object)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var value = _step.value;

                        result.push(this.flatten(value, depth - 1));
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion && _iterator.return) {
                            _iterator.return();
                        }
                    } finally {
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }
            }

            if (result.length) {
                return String.fromCharCode.apply(String, result);
            }

            return typeof object === 'string' ? object : object + '\0';
        }

        /**
         * @private
         * @param {String} seed
         * @param {Number[]} [keys=[]]
         * @returns {Number[]}
         */

    }, {
        key: 'getMixedKeys',
        value: function getMixedKeys(seed) {
            var keys = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

            var result = [],
                seedString = '' + seed,
                len = seedString.length;

            for (var i = 0, smear = 0; i < len; i++) {
                result[255 & i] = 255 & (smear ^= keys[255 & i] * 19) + seedString.charCodeAt(i);
            }

            return result;
        }

        /**
         * @public
         * @param {Number} [min=0]
         * @param {Number} [max=1]
         * @returns {Number}
         */

    }, {
        key: 'next',
        value: function next() {
            var min = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var max = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

            var rc4 = this._rc4,
                significance = Math.pow(2, 52),
                overflow = significance * 2;

            var n = rc4.next(6),
                denom = Math.pow(256, 6),
                x = 0;

            while (n < significance) {
                n = (n + x) * 256;
                denom *= 256;
                x = rc4.next(1);
            }

            while (n >= overflow) {
                n /= 2;
                denom /= 2;
                x >>>= 1;
            }

            return (n + x) / denom * (max - min) + min;
        }

        /**
         * @private
         * @returns {String}
         */

    }, {
        key: 'seed',
        get: function get() {
            return this._seed;
        },
        set: function set(seed) {
            this._seed = seed;
            this._rc4.setKeys(this.getMixedKeys(this.flatten(seed)));
        }
    }], [{
        key: 'generateSeed',
        value: function generateSeed() {
            var seed = new Uint8Array(256);

            if (crypto) {
                crypto.getRandomValues(seed);
            } else {
                for (var i = 0; i < 256; i++) {
                    seed[i] = Math.random() * 256 & 255;
                }
            }

            return String.fromCharCode.apply(String, _toConsumableArray(seed));
        }
    }]);

    return Random;
}();

exports.default = Random;

/***/ }),
/* 60 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Clock2 = __webpack_require__(20);

var _Clock3 = _interopRequireDefault(_Clock2);

var _Time = __webpack_require__(11);

var _Time2 = _interopRequireDefault(_Time);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Timer
 * @extends {Clock}
 */
var Timer = function (_Clock) {
    _inherits(Timer, _Clock);

    /**
     * @constructor
     * @param {Boolean} autoStart
     * @param {Number} timeLimit
     * @param {Number} factor
     */
    function Timer(autoStart, timeLimit, factor) {
        _classCallCheck(this, Timer);

        /**
         * @private
         * @member {Number}
         */
        var _this = _possibleConstructorReturn(this, (Timer.__proto__ || Object.getPrototypeOf(Timer)).call(this, false));

        _this._limit = 0;

        if (autoStart) {
            _this.restart(timeLimit, factor);
        }
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */


    _createClass(Timer, [{
        key: 'reset',


        /**
         * @public
         * @chainable
         * @param {Number} timeLimit
         * @param {Number} [factor=Time.Milliseconds]
         * @returns {Timer}
         */
        value: function reset(timeLimit) {
            var factor = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _Time2.default.Milliseconds;

            this._limit = timeLimit * factor;
            this._timeBuffer = 0;
            this._isRunning = false;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} timeLimit
         * @param {Number} [factor=Time.Milliseconds]
         * @returns {Timer}
         */

    }, {
        key: 'restart',
        value: function restart(timeLimit) {
            var factor = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _Time2.default.Milliseconds;

            return this.reset(timeLimit, factor).start();
        }

        /**
         * @public
         * @returns {Number}
         */

    }, {
        key: 'getRemainingMilliseconds',
        value: function getRemainingMilliseconds() {
            return Math.max(0, this._limit - this.getElapsedMilliseconds());
        }

        /**
         * @public
         * @returns {Number}
         */

    }, {
        key: 'getRemainingSeconds',
        value: function getRemainingSeconds() {
            return this.getRemainingMilliseconds() / _Time2.default.Seconds;
        }

        /**
         * @public
         * @returns {Number}
         */

    }, {
        key: 'getRemainingMinutes',
        value: function getRemainingMinutes() {
            return this.getRemainingMilliseconds() / _Time2.default.Minutes;
        }

        /**
         * @public
         * @returns {Time}
         */

    }, {
        key: 'getRemainingTime',
        value: function getRemainingTime() {
            return this._time.setMilliseconds(this.getRemainingMilliseconds());
        }
    }, {
        key: 'isRunning',
        get: function get() {
            return this._isRunning && !this.isExpired;
        }

        /**
         * @public
         * @readonly
         * @member {Boolean}
         */

    }, {
        key: 'isExpired',
        get: function get() {
            return this.getElapsedMilliseconds() >= this._limit;
        }
    }]);

    return Timer;
}(_Clock3.default);

exports.default = Timer;

/***/ }),
/* 61 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(7);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _Clock = __webpack_require__(20);

var _Clock2 = _interopRequireDefault(_Clock);

var _SceneManager = __webpack_require__(27);

var _SceneManager2 = _interopRequireDefault(_SceneManager);

var _DisplayManager = __webpack_require__(28);

var _DisplayManager2 = _interopRequireDefault(_DisplayManager);

var _MediaManager = __webpack_require__(38);

var _MediaManager2 = _interopRequireDefault(_MediaManager);

var _InputManager = __webpack_require__(39);

var _InputManager2 = _interopRequireDefault(_InputManager);

var _ResourceLoader = __webpack_require__(47);

var _ResourceLoader2 = _interopRequireDefault(_ResourceLoader);

var _settings = __webpack_require__(4);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Game
 * @extends {EventEmitter}
 */
var Game = function (_EventEmitter) {
    _inherits(Game, _EventEmitter);

    /**
     * @constructor
     * @param {Object} [options]
     * @param {String} [options.basePath='']
     * @param {Number} [options.width=800]
     * @param {Number} [options.height=600]
     * @param {Number} [options.soundVolume=1]
     * @param {Number} [options.musicVolume=1]
     * @param {Number} [options.masterVolume=1]
     * @param {?HTMLCanvasElement|?String} [options.canvas=null]
     * @param {?HTMLCanvasElement|?String} [options.canvasParent=null]
     * @param {Color} [options.clearColor=Color.White]
     * @param {Boolean} [options.clearBeforeRender=true]
     * @param {Object} [options.contextOptions]
     */
    function Game(options) {
        _classCallCheck(this, Game);

        /**
         * @private
         * @member {Object}
         */
        var _this = _possibleConstructorReturn(this, (Game.__proto__ || Object.getPrototypeOf(Game)).call(this));

        _this._config = Object.assign({}, _settings2.default.GAME_CONFIG, options);

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        _this._canvas = _this._getElement(_this._config.canvas) || document.createElement('canvas');

        /**
         * @private
         * @member {HTMLElement}
         */
        _this._canvasParent = _this._getElement(_this._config.canvasParent);

        /**
         * @private
         * @member {ResourceLoader}
         */
        _this._loader = new _ResourceLoader2.default(_this._config);

        /**
         * @private
         * @member {DisplayManager}
         */
        _this._displayManager = new _DisplayManager2.default(_this, _this._config);

        /**
         * @private
         * @member {MediaManager}
         */
        _this._mediaManager = new _MediaManager2.default(_this, _this._config);

        /**
         * @private
         * @member {InputManager}
         */
        _this._inputManager = new _InputManager2.default(_this);

        /**
         * @private
         * @member {SceneManager}
         */
        _this._sceneManager = new _SceneManager2.default(_this);

        /**
         * @private
         * @member {Function}
         */
        _this._updateHandler = _this._updateGameLoop.bind(_this);

        /**
         * @private
         * @member {Number}
         */
        _this._updateId = 0;

        /**
         * @private
         * @member {Clock}
         */
        _this._delta = new _Clock2.default(false);

        /**
         * @private
         * @member {Boolean}
         */
        _this._running = false;

        if (_this._canvasParent) {
            _this._canvasParent.appendChild(_this._canvas);
        }
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {HTMLCanvasElement}
     */


    _createClass(Game, [{
        key: 'start',


        /**
         * @public
         * @param {Scene} scene
         */
        value: function start(scene) {
            if (this._running) {
                throw new Error('Game instance is already running!');
            }

            this._running = true;

            this.trigger('scene:change', scene);
            this._startGameLoop();
        }

        /**
         * @public
         */

    }, {
        key: 'stop',
        value: function stop() {
            if (!this._running) {
                throw new Error('Game instance is not running.');
            }

            this._running = false;

            this.trigger('scene:stop');
            this._stopGameLoop();
        }

        /**
         * @private
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Game.prototype.__proto__ || Object.getPrototypeOf(Game.prototype), 'destroy', this).call(this);

            this._stopGameLoop();

            if (this._canvasParent) {
                this._canvasParent.removeChild(this._canvas);
            }

            this._loader.destroy();
            this._loader = null;

            this._inputManager.destroy();
            this._inputManager = null;

            this._mediaManager.destroy();
            this._mediaManager = null;

            this._displayManager.destroy();
            this._displayManager = null;

            this._sceneManager.destroy();
            this._sceneManager = null;

            this._delta.destroy();
            this._delta = null;

            this._config = null;
            this._canvas = null;
            this._canvasParent = null;
            this._updateHandler = null;
            this._updateId = null;
            this._running = null;
        }

        /**
         * @private
         * @param {?String|?HTMLElement} element
         * @returns {?HTMLElement|?HTMLCanvasElement}
         */

    }, {
        key: '_getElement',
        value: function _getElement(element) {
            if (!element) {
                return null;
            }

            if (element instanceof HTMLElement) {
                return element;
            }

            return typeof element === 'string' && document.querySelector(element) || null;
        }

        /**
         * @private
         */

    }, {
        key: '_startGameLoop',
        value: function _startGameLoop() {
            this._updateId = requestAnimationFrame(this._updateHandler);
            this._delta.restart();
        }

        /**
         * @private
         */

    }, {
        key: '_updateGameLoop',
        value: function _updateGameLoop() {
            this._inputManager.update();
            this._sceneManager.update(this._delta.getElapsedTime());
            this._delta.restart();

            this._updateId = requestAnimationFrame(this._updateHandler);
        }

        /**
         * @private
         */

    }, {
        key: '_stopGameLoop',
        value: function _stopGameLoop() {
            cancelAnimationFrame(this._updateId);
            this._delta.stop();
        }
    }, {
        key: 'canvas',
        get: function get() {
            return this._canvas;
        }

        /**
         * @public
         * @readonly
         * @member {Object}
         */

    }, {
        key: 'config',
        get: function get() {
            return this._config;
        }

        /**
         * @public
         * @readonly
         * @member {ResourceLoader}
         */

    }, {
        key: 'loader',
        get: function get() {
            return this._loader;
        }

        /**
         * @public
         * @readonly
         * @member {DisplayManager}
         */

    }, {
        key: 'displayManager',
        get: function get() {
            return this._displayManager;
        }

        /**
         * @public
         * @readonly
         * @member {MediaManager}
         */

    }, {
        key: 'mediaManager',
        get: function get() {
            return this._mediaManager;
        }

        /**
         * @public
         * @readonly
         * @member {InputManager}
         */

    }, {
        key: 'inputManager',
        get: function get() {
            return this._inputManager;
        }

        /**
         * @public
         * @readonly
         * @member {SceneManager}
         */

    }, {
        key: 'sceneManager',
        get: function get() {
            return this._sceneManager;
        }
    }]);

    return Game;
}(_EventEmitter3.default);

exports.default = Game;

/***/ }),
/* 62 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ArrayBufferFactory2 = __webpack_require__(12);

var _ArrayBufferFactory3 = _interopRequireDefault(_ArrayBufferFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class FontFactory
 * @extends {ResourceFactory}
 */
var FontFactory = function (_ArrayBufferFactory) {
    _inherits(FontFactory, _ArrayBufferFactory);

    function FontFactory() {
        _classCallCheck(this, FontFactory);

        return _possibleConstructorReturn(this, (FontFactory.__proto__ || Object.getPrototypeOf(FontFactory)).apply(this, arguments));
    }

    _createClass(FontFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(source) {
            var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
                family = _ref.family,
                destriptors = _ref.destriptors,
                _ref$addToDocument = _ref.addToDocument,
                addToDocument = _ref$addToDocument === undefined ? true : _ref$addToDocument;

            return _get(FontFactory.prototype.__proto__ || Object.getPrototypeOf(FontFactory.prototype), 'create', this).call(this, source, null).then(function (arrayBuffer) {
                return new Promise(function (resolve, reject) {
                    var fontFace = new FontFace(family, arrayBuffer, destriptors),
                        promise = fontFace.load();

                    if (addToDocument) {
                        promise.then(function () {
                            return document.fonts.add(fontFace);
                        });
                    }

                    promise.then(function () {
                        return resolve(fontFace);
                    }, function () {
                        return reject(fontFace);
                    });
                });
            });
        }
    }, {
        key: 'storageType',


        /**
         * @override
         */
        get: function get() {
            return 'font';
        }
    }]);

    return FontFactory;
}(_ArrayBufferFactory3.default);

exports.default = FontFactory;

/***/ }),
/* 63 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ResourceFactory2 = __webpack_require__(13);

var _ResourceFactory3 = _interopRequireDefault(_ResourceFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class JSONFactory
 * @extends {ResourceFactory}
 */
var JSONFactory = function (_ResourceFactory) {
    _inherits(JSONFactory, _ResourceFactory);

    function JSONFactory() {
        _classCallCheck(this, JSONFactory);

        return _possibleConstructorReturn(this, (JSONFactory.__proto__ || Object.getPrototypeOf(JSONFactory)).apply(this, arguments));
    }

    _createClass(JSONFactory, [{
        key: 'process',


        /**
         * @override
         */
        value: function process(response) {
            return response.json();
        }

        /**
         * @override
         */

    }, {
        key: 'create',
        value: function create(source, options) {
            return Promise.resolve(source);
        }
    }, {
        key: 'storageType',


        /**
         * @override
         */
        get: function get() {
            return 'json';
        }
    }]);

    return JSONFactory;
}(_ResourceFactory3.default);

exports.default = JSONFactory;

/***/ }),
/* 64 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _AudioFactory2 = __webpack_require__(51);

var _AudioFactory3 = _interopRequireDefault(_AudioFactory2);

var _Music = __webpack_require__(53);

var _Music2 = _interopRequireDefault(_Music);

var _support = __webpack_require__(5);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class MusicFactory
 * @extends {ResourceFactory}
 */
var MusicFactory = function (_AudioFactory) {
    _inherits(MusicFactory, _AudioFactory);

    function MusicFactory() {
        _classCallCheck(this, MusicFactory);

        return _possibleConstructorReturn(this, (MusicFactory.__proto__ || Object.getPrototypeOf(MusicFactory)).apply(this, arguments));
    }

    _createClass(MusicFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(source, options) {
            if (!_support2.default.webAudio) {
                return Promise.reject(Error('Web Audio is not supported!'));
            }

            return _get(MusicFactory.prototype.__proto__ || Object.getPrototypeOf(MusicFactory.prototype), 'create', this).call(this, source, options).then(function (audio) {
                return new _Music2.default(audio);
            });
        }
    }, {
        key: 'storageType',


        /**
         * @override
         */
        get: function get() {
            return 'music';
        }
    }]);

    return MusicFactory;
}(_AudioFactory3.default);

exports.default = MusicFactory;

/***/ }),
/* 65 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _AudioBufferFactory2 = __webpack_require__(50);

var _AudioBufferFactory3 = _interopRequireDefault(_AudioBufferFactory2);

var _Sound = __webpack_require__(54);

var _Sound2 = _interopRequireDefault(_Sound);

var _support = __webpack_require__(5);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SoundFactory
 * @extends {ResourceFactory}
 */
var SoundFactory = function (_AudioBufferFactory) {
    _inherits(SoundFactory, _AudioBufferFactory);

    function SoundFactory() {
        _classCallCheck(this, SoundFactory);

        return _possibleConstructorReturn(this, (SoundFactory.__proto__ || Object.getPrototypeOf(SoundFactory)).apply(this, arguments));
    }

    _createClass(SoundFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(source, options) {
            if (!_support2.default.webAudio) {
                return Promise.reject(Error('Web Audio is not supported!'));
            }

            return _get(SoundFactory.prototype.__proto__ || Object.getPrototypeOf(SoundFactory.prototype), 'create', this).call(this, source, options).then(function (audioBuffer) {
                return new _Sound2.default(audioBuffer);
            });
        }
    }, {
        key: 'storageType',


        /**
         * @override
         */
        get: function get() {
            return 'sound';
        }
    }]);

    return SoundFactory;
}(_AudioBufferFactory3.default);

exports.default = SoundFactory;

/***/ }),
/* 66 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _TextureFactory2 = __webpack_require__(55);

var _TextureFactory3 = _interopRequireDefault(_TextureFactory2);

var _Sprite = __webpack_require__(17);

var _Sprite2 = _interopRequireDefault(_Sprite);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SpriteFactory
 * @extends {ResourceFactory}
 */
var SpriteFactory = function (_TextureFactory) {
    _inherits(SpriteFactory, _TextureFactory);

    function SpriteFactory() {
        _classCallCheck(this, SpriteFactory);

        return _possibleConstructorReturn(this, (SpriteFactory.__proto__ || Object.getPrototypeOf(SpriteFactory)).apply(this, arguments));
    }

    _createClass(SpriteFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(source, options) {
            return _get(SpriteFactory.prototype.__proto__ || Object.getPrototypeOf(SpriteFactory.prototype), 'create', this).call(this, source, options).then(function (texture) {
                return new _Sprite2.default(texture);
            });
        }
    }, {
        key: 'storageType',


        /**
         * @override
         */
        get: function get() {
            return 'image';
        }
    }]);

    return SpriteFactory;
}(_TextureFactory3.default);

exports.default = SpriteFactory;

/***/ }),
/* 67 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _settings = __webpack_require__(4);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var flags = {
    SCALE_MODE: 1 << 0,
    WRAP_MODE: 1 << 1,
    PREMULTIPLY_ALPHA: 1 << 2,
    SOURCE: 1 << 3
};

/**
 * @class GLTexture
 */

var GLTexture = function () {

    /**
     * @constructor
     * @param {Object} [options={}]
     * @param {WebGLRenderingContext} [options.context]
     * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} [options.source]
     * @param {Number} [options.scaleMode=settings.SCALE_MODE]
     * @param {Number} [options.wrapMode=settings.WRAP_MODE]
     * @param {Boolean} [options.premultiplyAlpha=settings.PREMULTIPLY_ALPHA]
     */
    function GLTexture() {
        var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
            context = _ref.context,
            source = _ref.source,
            _ref$width = _ref.width,
            width = _ref$width === undefined ? -1 : _ref$width,
            _ref$height = _ref.height,
            height = _ref$height === undefined ? -1 : _ref$height,
            _ref$scaleMode = _ref.scaleMode,
            scaleMode = _ref$scaleMode === undefined ? _settings2.default.SCALE_MODE : _ref$scaleMode,
            _ref$wrapMode = _ref.wrapMode,
            wrapMode = _ref$wrapMode === undefined ? _settings2.default.WRAP_MODE : _ref$wrapMode,
            _ref$premultiplyAlpha = _ref.premultiplyAlpha,
            premultiplyAlpha = _ref$premultiplyAlpha === undefined ? _settings2.default.PREMULTIPLY_ALPHA : _ref$premultiplyAlpha;

        _classCallCheck(this, GLTexture);

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLTexture}
         */
        this._texture = null;

        /**
         * @private
         * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
         */
        this._source = null;

        /**
         * @private
         * @member {Number}
         */
        this._width = width;

        /**
         * @private
         * @member {Number}
         */
        this._height = height;

        /**
         * @private
         * @member {Number}
         */
        this._scaleMode = scaleMode;

        /**
         * @private
         * @member {Number}
         */
        this._wrapMode = wrapMode;

        /**
         * @private
         * @member {Boolean}
         */
        this._premultiplyAlpha = premultiplyAlpha;

        /**
         * @private
         * @member {Number}
         */
        this._flags = flags.SCALE_MODE | flags.WRAP_MODE | flags.PREMULTIPLY_ALPHA;

        if (context !== undefined) {
            this.setContext(context);
        }

        if (source !== undefined) {
            this.setSource(source);
        }
    }

    /**
     * @public
     * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
     */


    _createClass(GLTexture, [{
        key: 'setContext',


        /**
         * @public
         * @chainable
         * @param {WebGLRenderingContext} gl
         * @returns {GLTexture}
         */
        value: function setContext(gl) {
            if (this._context !== gl) {
                this._context = gl;
                this._texture = gl.createTexture();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement} source
         * @returns {GLTexture}
         */

    }, {
        key: 'setSource',
        value: function setSource(source) {
            if (this._source !== source) {
                this._source = source;
                this.updateSource();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {GLTexture}
         */

    }, {
        key: 'updateSource',
        value: function updateSource() {
            if (this._source) {
                this._flags |= flags.SOURCE;
            } else {
                this._flags &= ~flags.SOURCE;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} scaleMode
         * @returns {GLTexture}
         */

    }, {
        key: 'setScaleMode',
        value: function setScaleMode(scaleMode) {
            if (this._scaleMode !== scaleMode) {
                this._scaleMode = scaleMode;
                this._flags |= flags.SCALE_MODE;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} wrapMode
         * @returns {GLTexture}
         */

    }, {
        key: 'setWrapMode',
        value: function setWrapMode(wrapMode) {
            if (this._wrapMode !== wrapMode) {
                this._wrapMode = wrapMode;
                this._flags |= flags.WRAP_MODE;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Boolean} premultiplyAlpha
         * @returns {GLTexture}
         */

    }, {
        key: 'setPremultiplyAlpha',
        value: function setPremultiplyAlpha(premultiplyAlpha) {
            if (this._premultiplyAlpha !== premultiplyAlpha) {
                this._premultiplyAlpha = premultiplyAlpha;
                this._flags |= flags.PREMULTIPLY_ALPHA;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} [unit]
         * @returns {GLTexture}
         */

    }, {
        key: 'update',
        value: function update(unit) {
            if (!this._flags) {
                return this;
            }

            this.bind(unit);

            var gl = this._context;

            if (this._flags & flags.SCALE_MODE) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this._scaleMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this._scaleMode);
            }

            if (this._flags & flags.WRAP_MODE) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrapMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrapMode);
            }

            if (this._flags & flags.PREMULTIPLY_ALPHA) {
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);
            }

            if (this._flags & flags.SOURCE) {
                var source = this._source,
                    width = source.videoWidth || source.width,
                    height = source.videoHeight || source.height;

                if (this._width !== width || this._height !== height) {
                    this._width = width;
                    this._height = height;

                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
                }
            }

            this._flags = 0;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} [unit]
         * @returns {GLTexture}
         */

    }, {
        key: 'bind',
        value: function bind(unit) {
            var gl = this._context;

            if (unit !== undefined) {
                gl.activeTexture(gl.TEXTURE0 + unit);
            }

            gl.bindTexture(gl.TEXTURE_2D, this._texture);

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {GLTexture}
         */

    }, {
        key: 'unbind',
        value: function unbind() {
            var gl = this._context;

            gl.bindTexture(gl.TEXTURE_2D, null);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            if (this._context) {
                this._context.deleteTexture(this._texture);
                this._context = null;
                this._texture = null;
            }

            this._width = null;
            this._height = null;
            this._scaleMode = null;
            this._wrapMode = null;
            this._premultiplyAlpha = null;
            this._source = null;
            this._flags = null;
        }
    }, {
        key: 'source',
        get: function get() {
            return this._source;
        },
        set: function set(source) {
            this.setSource(source);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'scaleMode',
        get: function get() {
            return this._scaleMode;
        },
        set: function set(scaleMode) {
            this.setScaleMode(scaleMode);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'wrapMode',
        get: function get() {
            return this._wrapMode;
        },
        set: function set(wrapMode) {
            this.setWrapMode(wrapMode);
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'premultiplyAlpha',
        get: function get() {
            return this._premultiplyAlpha;
        },
        set: function set(premultiplyAlpha) {
            this.setPremultiplyAlpha(premultiplyAlpha);
        }
    }]);

    return GLTexture;
}();

exports.default = GLTexture;

/***/ }),
/* 68 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ResourceFactory2 = __webpack_require__(13);

var _ResourceFactory3 = _interopRequireDefault(_ResourceFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class StringFactory
 * @extends {ResourceFactory}
 */
var StringFactory = function (_ResourceFactory) {
    _inherits(StringFactory, _ResourceFactory);

    function StringFactory() {
        _classCallCheck(this, StringFactory);

        return _possibleConstructorReturn(this, (StringFactory.__proto__ || Object.getPrototypeOf(StringFactory)).apply(this, arguments));
    }

    _createClass(StringFactory, [{
        key: 'process',


        /**
         * @override
         */
        value: function process(response) {
            return response.text();
        }

        /**
         * @override
         */

    }, {
        key: 'create',
        value: function create(source, options) {
            return Promise.resolve(source);
        }
    }, {
        key: 'storageType',


        /**
         * @override
         */
        get: function get() {
            return 'string';
        }
    }]);

    return StringFactory;
}(_ResourceFactory3.default);

exports.default = StringFactory;

/***/ }),
/* 69 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _BlobFactory2 = __webpack_require__(14);

var _BlobFactory3 = _interopRequireDefault(_BlobFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class VideoFactory
 * @extends {ResourceFactory}
 */
var VideoFactory = function (_BlobFactory) {
    _inherits(VideoFactory, _BlobFactory);

    /**
     * @constructor
     */
    function VideoFactory() {
        _classCallCheck(this, VideoFactory);

        /**
         * @private
         * @member {Set<String>}
         */
        var _this = _possibleConstructorReturn(this, (VideoFactory.__proto__ || Object.getPrototypeOf(VideoFactory)).call(this));

        _this._objectURLs = new Set();
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Set<String>}
     */


    _createClass(VideoFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(source) {
            var _this2 = this;

            var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
                _ref$mimeType = _ref.mimeType,
                mimeType = _ref$mimeType === undefined ? (0, _utils.determineMimeType)(source) : _ref$mimeType,
                _ref$loadEvent = _ref.loadEvent,
                loadEvent = _ref$loadEvent === undefined ? 'canplaythrough' : _ref$loadEvent;

            return _get(VideoFactory.prototype.__proto__ || Object.getPrototypeOf(VideoFactory.prototype), 'create', this).call(this, source, { mimeType: mimeType }).then(function (blob) {
                return new Promise(function (resolve, reject) {
                    var video = document.createElement('video'),
                        objectURL = URL.createObjectURL(blob);

                    _this2._objectURLs.add(objectURL);

                    video.addEventListener(loadEvent, function () {
                        return resolve(video);
                    });
                    video.addEventListener('error', function () {
                        return reject(video);
                    });
                    video.addEventListener('abort', function () {
                        return reject(video);
                    });

                    video.src = objectURL;
                });
            });
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._objectURLs[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var objectURL = _step.value;

                    URL.revokeObjectURL(objectURL);
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            this._objectURLs.clear();
            this._objectURLs = null;
        }
    }, {
        key: 'objectURLs',
        get: function get() {
            return this._objectURLs;
        }

        /**
         * @override
         */

    }, {
        key: 'storageType',
        get: function get() {
            return 'video';
        }
    }]);

    return VideoFactory;
}(_BlobFactory3.default);

exports.default = VideoFactory;

/***/ }),
/* 70 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(7);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Scene
 * @extends {EventEmitter}
 */
var Scene = function (_EventEmitter) {
    _inherits(Scene, _EventEmitter);

    /**
     * @constructor
     * @param {Object} [prototype]
     * @param {Function} [prototype.load]
     * @param {Function} [prototype.init]
     * @param {Function} [prototype.update]
     * @param {Function} [prototype.unload]
     * @param {Function} [prototype.destroy]
     */
    function Scene(prototype) {
        _classCallCheck(this, Scene);

        /**
         * @private
         * @member {Game}
         */
        var _this = _possibleConstructorReturn(this, (Scene.__proto__ || Object.getPrototypeOf(Scene)).call(this));

        _this._game = null;

        if (prototype) {
            Object.assign(_this, prototype);
        }
        return _this;
    }

    /**
     * @public
     * @member {Game}
     */


    _createClass(Scene, [{
        key: 'load',


        /**
         * @public
         * @abstract
         * @param {ResourceLoader} loader
         */
        value: function load(loader) {
            this._game.trigger('scene:start');
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'init',
        value: function init() {}
        // do nothing


        /**
         * @public
         * @abstract
         * @param {Time} delta
         */

    }, {
        key: 'update',
        value: function update(delta) {}
        // do nothing


        /**
         * @public
         * @abstract
         */

    }, {
        key: 'unload',
        value: function unload() {}
        // do nothing


        /**
         * @public
         * @abstract
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Scene.prototype.__proto__ || Object.getPrototypeOf(Scene.prototype), 'destroy', this).call(this);

            this._game = null;
        }
    }, {
        key: 'game',
        get: function get() {
            return this._game;
        },
        set: function set(game) {
            this._game = game;
        }
    }]);

    return Scene;
}(_EventEmitter3.default);

exports.default = Scene;

/***/ }),
/* 71 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _settings = __webpack_require__(4);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Quadtree
 */
var Quadtree = function () {

    /**
     * @constructor
     * @param {Rectangle} bounds
     * @param {Number} [level=0]
     */
    function Quadtree(bounds) {
        var level = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

        _classCallCheck(this, Quadtree);

        /**
         * @private
         * @member {Rectangle}
         */
        this._bounds = bounds.clone();

        /**
         * @private
         * @member {Number}
         */
        this._level = level;

        /**
         * @private
         * @member {Map<Number, Quadtree>}
         */
        this._children = new Map();

        /**
         * @private
         * @member {Set<Object>}
         */
        this._entities = new Set();
    }

    /**
     * @public
     * @readonly
     * @member {Rectangle}
     */


    _createClass(Quadtree, [{
        key: 'clear',


        /**
         * @public
         * @chainable
         * @returns {Quadtree}
         */
        value: function clear() {
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._children[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var quadtree = _step.value;

                    quadtree.clear();
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            this._children.clear();
            this._entities.clear();

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Object} entity
         * @returns {Quadtree}
         */

    }, {
        key: 'insert',
        value: function insert(entity) {
            var entities = this._entities,
                childNode = this._getChildNode(entity);

            if (childNode) {
                childNode.insert(entity);

                return this;
            }

            entities.add(entity);

            if (entities.size > _settings2.default.QUAD_TREE_MAX_ENTITIES && this._level < _settings2.default.QUAD_TREE_MAX_LEVEL) {
                this._split();

                var _iteratorNormalCompletion2 = true;
                var _didIteratorError2 = false;
                var _iteratorError2 = undefined;

                try {
                    for (var _iterator2 = entities[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                        var _entity = _step2.value;

                        var _childNode = this._getChildNode(_entity);

                        if (_childNode) {
                            entities.delete(_entity);
                            _childNode.insert(_entity);
                        }
                    }
                } catch (err) {
                    _didIteratorError2 = true;
                    _iteratorError2 = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion2 && _iterator2.return) {
                            _iterator2.return();
                        }
                    } finally {
                        if (_didIteratorError2) {
                            throw _iteratorError2;
                        }
                    }
                }
            }

            return this;
        }

        /**
         * @public
         * @param {Object} entity
         * @returns {Object[]}
         */

    }, {
        key: 'getRelatedEntities',
        value: function getRelatedEntities(entity) {
            var childNode = this._getChildNode(entity);

            return childNode ? [].concat(_toConsumableArray(childNode.getRelatedEntities(entity)), _toConsumableArray(this._entities)) : [].concat(_toConsumableArray(this._entities));
        }

        /**
         * @private
         */

    }, {
        key: '_split',
        value: function _split() {
            if (this._children.size) {
                return;
            }

            var bounds = this._bounds,
                childLevel = this._level + 1,
                childWidth = bounds.width / 2 | 0,
                childHeight = bounds.height / 2 | 0,
                x = bounds.x,
                y = bounds.y;

            this._children.set(0, new Quadtree(new _Rectangle2.default(x, y, childWidth, childHeight), childLevel)).set(1, new Quadtree(new _Rectangle2.default(x + childWidth, y, childWidth, childHeight), childLevel)).set(2, new Quadtree(new _Rectangle2.default(x, y + childHeight, childWidth, childHeight), childLevel)).set(3, new Quadtree(new _Rectangle2.default(x + childWidth, y + childHeight, childWidth, childHeight), childLevel));
        }

        /**
         * @private
         * @param {Object} entity
         * @returns {?Quadtree}
         */

    }, {
        key: '_getChildNode',
        value: function _getChildNode(entity) {
            var children = this._children,
                length = children.size,
                bounds = entity.getBounds();

            for (var i = 0; i < length; i++) {
                var child = children.get(i);

                if (child.bounds.contains(bounds)) {
                    return child;
                }
            }

            return null;
        }

        /**
         * @private
         * @param {Object} entity
         * @returns {?Quadtree}
         */

    }, {
        key: '_getChildNode',
        value: function _getChildNode(entity) {
            var children = this._children,
                bounds = this._bounds,
                horizontalCenter = bounds.x + bounds.width / 2,
                verticalCenter = bounds.y + bounds.height / 2,
                topQuadrant = entity.top < verticalCenter && entity.bottom < verticalCenter,
                bottomQuadrant = entity.top > horizontalCenter;

            if (!children.size || !topQuadrant && !bottomQuadrant) {
                return null;
            }

            if (entity.left < horizontalCenter && entity.right < horizontalCenter) {
                return topQuadrant ? children.get(0) : children.get(2);
            } else if (entity.left > horizontalCenter) {
                return topQuadrant ? children.get(1) : children.get(3);
            }

            return null;
        }
    }, {
        key: 'bounds',
        get: function get() {
            return this._bounds;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'level',
        get: function get() {
            return this._level;
        }

        /**
         * @public
         * @readonly
         * @member {Map<Number, Quadtree>}
         */

    }, {
        key: 'children',
        get: function get() {
            return this._children;
        }

        /**
         * @public
         * @readonly
         * @member {Set<Object>}
         */

    }, {
        key: 'entities',
        get: function get() {
            return this._entities;
        }
    }]);

    return Quadtree;
}();

exports.default = Quadtree;

/***/ }),
/* 72 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Shape2 = __webpack_require__(9);

var _Shape3 = _interopRequireDefault(_Shape2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Circle
 * @implements {Shape}
 */
var Circle = function (_Shape) {
    _inherits(Circle, _Shape);

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     * @param {Number} [radius=0]
     */
    function Circle() {
        var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        var radius = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

        _classCallCheck(this, Circle);

        /**
         * @private
         * @member {Vector}
         */
        var _this = _possibleConstructorReturn(this, (Circle.__proto__ || Object.getPrototypeOf(Circle)).call(this));

        _this._position = new _Vector2.default(x, y);

        /**
         * @private
         * @member {Number}
         */
        _this._radius = radius;
        return _this;
    }

    /**
     * @override
     */


    _createClass(Circle, [{
        key: 'set',


        /**
         * @override
         */
        value: function set(x, y, radius) {
            this._position.set(x, y);
            this._radius = radius;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(circle) {
            this._position.copy(circle.position);
            this._radius = circle.radius;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new Circle(this.x, this.y, this._radius);
        }

        /**
         * @override
         */

    }, {
        key: 'reset',
        value: function reset() {
            this.set(0, 0, 0);
        }

        /**
         * @override
         */

    }, {
        key: 'toArray',
        value: function toArray() {
            var array = this._array || (this._array = new Float32Array(3));

            array[0] = this.x;
            array[1] = this.y;
            array[2] = this._radius;

            return array;
        }

        /**
         * @override
         */

    }, {
        key: 'getBounds',
        value: function getBounds() {
            if (!this._bounds) {
                this._bounds = new _Rectangle2.default();
            }

            return this._bounds.set(this._x - this._radius, this._y - this._radius, this._radius * 2, this._radius * 2);
        }

        /**
         * @override
         */

    }, {
        key: 'contains',
        value: function contains(shape) {
            switch (shape.type) {
                case _const.SHAPE.POINT:
                    var dx = this.x - shape.x,
                        dy = this.y - shape.y;

                    return dx * dx + dy * dy <= this._radius * this._radius;
                case _const.SHAPE.CIRCLE:
                case _const.SHAPE.RECTANGLE:
                case _const.SHAPE.POLYGON:
                default:
                    return false;
            }

            throw new Error('Passed item is not a valid shape!', shape);
        }

        /**
         * @override
         */

    }, {
        key: 'intersects',
        value: function intersects(shape) {
            switch (shape.type) {
                case _const.SHAPE.POINT:
                    return this.contains(shape);
                case _const.SHAPE.CIRCLE:
                    return this.distanceTo(shape) < this._radius + shape.radius;
                case _const.SHAPE.RECTANGLE:
                case _const.SHAPE.POLYGON:
                default:
                    return false;
            }

            throw new Error('Passed item is not a valid shape!', shape);
        }

        /**
         * @public
         * @param {Cirlce} circle
         * @returns {Number}
         */

    }, {
        key: 'distanceTo',
        value: function distanceTo(circle) {
            var x = this._x - circle.x,
                y = this._y - circle.y;

            return Math.sqrt(x * x + y * y);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Circle.prototype.__proto__ || Object.getPrototypeOf(Circle.prototype), 'destroy', this).call(this);

            this._position.destroy();
            this._position = null;
            this._radius = null;
        }
    }, {
        key: 'type',
        get: function get() {
            return _const.SHAPE.CIRCLE;
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'position',
        get: function get() {
            return this._position;
        },
        set: function set(position) {
            this._position.copy(position);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'x',
        get: function get() {
            return this._position.x;
        },
        set: function set(x) {
            this._position.x = x;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'y',
        get: function get() {
            return this._position.y;
        },
        set: function set(y) {
            this._position.y = y;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'radius',
        get: function get() {
            return this._radius;
        },
        set: function set(radius) {
            this._radius = radius;
        }
    }]);

    return Circle;
}(_Shape3.default);

exports.default = Circle;

/***/ }),
/* 73 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Shape2 = __webpack_require__(9);

var _Shape3 = _interopRequireDefault(_Shape2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Polygon
 * @extends {Shape}
 */
var Polygon = function (_Shape) {
    _inherits(Polygon, _Shape);

    /**
     * @constructor
     * @param {?Vector[]} vectors
     */
    function Polygon() {
        var vectors = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];

        _classCallCheck(this, Polygon);

        /**
         * @private
         * @member {Vector[]}
         */
        var _this = _possibleConstructorReturn(this, (Polygon.__proto__ || Object.getPrototypeOf(Polygon)).call(this));

        _this._vectors = vectors;
        return _this;
    }

    /**
     * @override
     */


    _createClass(Polygon, [{
        key: 'set',


        /**
         * @override
         */
        value: function set(newVectors) {
            var vectors = this._vectors,
                oldLen = vectors.length,
                newLen = newVectors.length;

            if (oldLen > newLen) {
                vectors.length = newLen;
            } else if (newLen > oldLen) {
                for (var i = oldLen; i < newLen; i++) {
                    vectors.push(newVectors[i].clone());
                }
            }

            for (var _i = 0; _i < oldLen; _i++) {
                vectors[_i].copy(newVectors[_i]);
            }
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(polygon) {
            this.set(polygon.vectors);
        }

        /**
         * @override
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new Polygon(this._vectors.map(function (vector) {
                return vector.clone();
            }));
        }

        /**
         * @override
         */

    }, {
        key: 'toArray',
        value: function toArray() {
            var array = this._array || (this._array = new Float32Array(this._vectors.length * 2)),
                vectors = this._vectors,
                len = vectors.length;

            for (var i = 0, j = 0; i < len; i++, j += 2) {
                array[j] = vectors[i].x;
                array[j + 1] = vectors[i].y;
            }

            return array;
        }

        /**
         * @override
         */

    }, {
        key: 'contains',
        value: function contains(shape) {
            var vectors = this._vectors,
                length = vectors.length,
                x = shape.x,
                y = shape.y;

            var inside = false;

            for (var i = 0, j = length - 1; i < length; j = i++) {
                var a = vectors[i],
                    b = vectors[j];

                if (a.y > y !== b.y > y && x < (b.x - a.x) * ((y - a.y) / (b.y - a.y)) + a.x) {
                    inside = !inside;
                }
            }

            return inside;
        }
    }, {
        key: 'type',
        get: function get() {
            return _const.SHAPE.POLYGON;
        }

        /**
         * @public
         * @readonly
         * @member {Vector[]}
         */

    }, {
        key: 'vectors',
        get: function get() {
            return this._vectors;
        }
    }]);

    return Polygon;
}(_Shape3.default);

exports.default = Polygon;

/***/ }),
/* 74 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _Database = __webpack_require__(75);

Object.defineProperty(exports, 'Database', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Database).default;
  }
});

var _ResourceLoader = __webpack_require__(47);

Object.defineProperty(exports, 'ResourceLoader', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ResourceLoader).default;
  }
});

var _ResourceContainer = __webpack_require__(48);

Object.defineProperty(exports, 'ResourceContainer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ResourceContainer).default;
  }
});

var _ResourceFactory = __webpack_require__(13);

Object.defineProperty(exports, 'ResourceFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ResourceFactory).default;
  }
});

var _factory = __webpack_require__(49);

Object.keys(_factory).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _factory[key];
    }
  });
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 75 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _support = __webpack_require__(5);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @typedef {Object} DatabaseResult
 * @property {String} type
 * @property {String} name
 * @property {?Object} data
 */

/**
 * @class Database
 */
var Database = function () {

    /**
     * @constructor
     * @param {String} name
     * @param {Number} version
     */
    function Database(name, version) {
        _classCallCheck(this, Database);

        if (!_support2.default.indexedDB) {
            throw new Error('This browser does not support indexedDB!');
        }

        /**
         * @private
         * @member {String}
         */
        this._name = name;

        /**
         * @private
         * @member {Number}
         */
        this._version = version;

        /**
         * @private
         * @member {?IDBDatabase}
         */
        this._database = null;

        /**
         * @private
         * @member {?Promise}
         */
        this._connect = null;

        /**
         * @private
         * @member {Function}
         */
        this._onCloseHandler = this._closeConnection.bind(this);
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */


    _createClass(Database, [{
        key: 'open',


        /**
         * @public
         * @returns {Promise}
         */
        value: function open() {
            var _this = this;

            return this._connect || (this._connect = new Promise(function (resolve, reject) {
                var request = indexedDB.open(_this._name, _this._version);

                request.addEventListener('upgradeneeded', function (event) {
                    var database = event.target.result,
                        transaction = event.target.transaction,
                        currentStores = [].concat(_toConsumableArray(transaction.objectStoreNames));

                    database.addEventListener('error', function (event) {
                        return reject(event);
                    });
                    database.addEventListener('abort', function (event) {
                        return reject(event);
                    });

                    var _iteratorNormalCompletion = true;
                    var _didIteratorError = false;
                    var _iteratorError = undefined;

                    try {
                        for (var _iterator = currentStores[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                            var store = _step.value;

                            if (!_const.DATABASE_TYPES.includes(store)) {
                                database.deleteObjectStore(store);
                            }
                        }
                    } catch (err) {
                        _didIteratorError = true;
                        _iteratorError = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion && _iterator.return) {
                                _iterator.return();
                            }
                        } finally {
                            if (_didIteratorError) {
                                throw _iteratorError;
                            }
                        }
                    }

                    var _iteratorNormalCompletion2 = true;
                    var _didIteratorError2 = false;
                    var _iteratorError2 = undefined;

                    try {
                        for (var _iterator2 = _const.DATABASE_TYPES[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                            var type = _step2.value;

                            if (!currentStores.includes(type)) {
                                database.createObjectStore(type, { keyPath: 'name' });
                            }
                        }
                    } catch (err) {
                        _didIteratorError2 = true;
                        _iteratorError2 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion2 && _iterator2.return) {
                                _iterator2.return();
                            }
                        } finally {
                            if (_didIteratorError2) {
                                throw _iteratorError2;
                            }
                        }
                    }
                });

                request.addEventListener('success', function (event) {
                    _this._database = event.target.result;
                    _this._database.addEventListener('close', _this._onCloseHandler);
                    _this._database.addEventListener('versionchange', _this._onCloseHandler);

                    resolve(_this._database);
                });

                request.addEventListener('error', function (event) {
                    return reject(event);
                });
                request.addEventListener('blocked', function (event) {
                    return reject(event);
                });
            }));
        }

        /**
         * @public
         * @returns {Promise}
         */

    }, {
        key: 'close',
        value: function close() {
            this._closeConnection();
            return Promise.resolve();
        }

        /**
         * @public
         * @param {String} type
         * @param {String} [transactionMode='readonly']
         * @returns {Promise}
         */

    }, {
        key: 'getObjectStore',
        value: function getObjectStore(type) {
            var transactionMode = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'readonly';

            if (!_const.DATABASE_TYPES.includes(type)) {
                return Promise.reject(Error('Could not find ObjectStore named "' + type + '".'));
            }

            return this.open().then(function (database) {
                return database.transaction([type], transactionMode).objectStore(type);
            });
        }

        /**
         * @public
         * @param {String} [type='*']
         * @returns {Promise}
         */

    }, {
        key: 'clear',
        value: function clear() {
            var _this2 = this;

            var type = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '*';

            if (type === '*') {
                return _const.DATABASE_TYPES.reduce(function (promise, type) {
                    return promise.then(function () {
                        return _this2.clear(type);
                    });
                }, Promise.resolve());
            }

            return this.getObjectStore(type, 'readwrite').then(function (store) {
                return new Promise(function (resolve, reject) {
                    var request = store.clear();

                    request.addEventListener('success', function (event) {
                        return resolve(event);
                    });
                    request.addEventListener('error', function (event) {
                        return reject(event);
                    });
                });
            });
        }

        /**
         * @public
         * @returns {Promise}
         */

    }, {
        key: 'delete',
        value: function _delete() {
            var _this3 = this;

            return this.close().then(function () {
                return new Promise(function (resolve, reject) {
                    var request = indexedDB.deleteDatabase(_this3._name);

                    request.addEventListener('success', function (event) {
                        return resolve(event);
                    });
                    request.addEventListener('error', function (event) {
                        return reject(event);
                    });
                });
            });
        }

        /**
         * @public
         * @param {String} type
         * @param {String} name
         * @returns {Promise<DatabaseResult>}
         */

    }, {
        key: 'loadData',
        value: function loadData(type, name) {
            return this.getObjectStore(type).then(function (store) {
                return new Promise(function (resolve, reject) {
                    var request = store.get(name);

                    request.addEventListener('success', function (event) {
                        var result = event.target.result,
                            data = result && result.data || null;

                        resolve({ type: type, name: name, data: data });
                    });

                    request.addEventListener('error', function (event) {
                        return reject(event);
                    });
                });
            });
        }

        /**
         * @public
         * @param {String} type
         * @param {String} name
         * @param {Object} data
         * @returns {Promise<DatabaseResult>}
         */

    }, {
        key: 'saveData',
        value: function saveData(type, name, data) {
            return this.getObjectStore(type, 'readwrite').then(function (store) {
                return new Promise(function (resolve, reject) {
                    var request = store.put({ name: name, data: data });

                    request.addEventListener('success', function () {
                        return resolve({ type: type, name: name, data: data });
                    });
                    request.addEventListener('error', function (event) {
                        return reject(event);
                    });
                });
            });
        }

        /**
         * @public
         * @param {String} type
         * @param {String} name
         * @returns {Promise<DatabaseResult>}
         */

    }, {
        key: 'removeData',
        value: function removeData(type, name) {
            return this.getObjectStore(type, 'readwrite').then(function (store) {
                return new Promise(function (resolve, reject) {
                    var request = store.delete(name);

                    request.addEventListener('success', function () {
                        return resolve({ type: type, name: name, data: null });
                    });
                    request.addEventListener('error', function (event) {
                        return reject(event);
                    });
                });
            });
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._closeConnection();

            this._name = null;
            this._version = null;
            this._onCloseHandler = null;
        }

        /**
         * @private
         */

    }, {
        key: '_closeConnection',
        value: function _closeConnection() {
            if (this._database) {
                this._database.removeEventListener('close', this._onCloseHandler);
                this._database.removeEventListener('versionchange', this._onCloseHandler);
                this._database.close();
                this._database = null;
            }

            this._connect = null;
        }
    }, {
        key: 'name',
        get: function get() {
            return this._name;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'version',
        get: function get() {
            return this._version;
        }

        /**
         * @public
         * @readonly
         * @member {Boolean}
         */

    }, {
        key: 'isOpen',
        get: function get() {
            return this._database !== null;
        }
    }]);

    return Database;
}();

exports.default = Database;

/***/ }),
/* 76 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _ChannelHandler = __webpack_require__(6);

Object.defineProperty(exports, 'ChannelHandler', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ChannelHandler).default;
  }
});

var _Input = __webpack_require__(77);

Object.defineProperty(exports, 'Input', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Input).default;
  }
});

var _InputManager = __webpack_require__(39);

Object.defineProperty(exports, 'InputManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_InputManager).default;
  }
});

var _Keyboard = __webpack_require__(40);

Object.defineProperty(exports, 'Keyboard', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Keyboard).default;
  }
});

var _Mouse = __webpack_require__(41);

Object.defineProperty(exports, 'Mouse', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Mouse).default;
  }
});

var _GamepadControl = __webpack_require__(45);

Object.defineProperty(exports, 'GamepadControl', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_GamepadControl).default;
  }
});

var _GamepadMapping = __webpack_require__(44);

Object.defineProperty(exports, 'GamepadMapping', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_GamepadMapping).default;
  }
});

var _DefaultGamepadMapping = __webpack_require__(43);

Object.defineProperty(exports, 'GamepadDefaultMapping', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_DefaultGamepadMapping).default;
  }
});

var _Gamepad = __webpack_require__(23);

Object.defineProperty(exports, 'Gamepad', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Gamepad).default;
  }
});

var _GamepadManager = __webpack_require__(42);

Object.defineProperty(exports, 'GamepadManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_GamepadManager).default;
  }
});

var _Pointer = __webpack_require__(78);

Object.defineProperty(exports, 'Pointer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Pointer).default;
  }
});

var _PointerManager = __webpack_require__(46);

Object.defineProperty(exports, 'PointerManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_PointerManager).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 77 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(7);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _settings = __webpack_require__(4);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Input
 * @extends {EventEmitter}
 */
var Input = function (_EventEmitter) {
    _inherits(Input, _EventEmitter);

    /**
     * @constructor
     * @param {Number[]} channels
     * @param {Object} [options={}]
     * @param {Number} [options.triggerThreshold=settings.TRIGGER_THRESHOLD]
     * @param {Function} [options.start]
     * @param {Function} [options.stop]
     * @param {Function} [options.active]
     * @param {Function} [options.trigger]
     * @param {*} [options.context]
     */
    function Input(channels) {
        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            _ref$triggerThreshold = _ref.triggerThreshold,
            triggerThreshold = _ref$triggerThreshold === undefined ? 300 : _ref$triggerThreshold,
            start = _ref.start,
            stop = _ref.stop,
            active = _ref.active,
            trigger = _ref.trigger,
            context = _ref.context;

        _classCallCheck(this, Input);

        /**
         * @private
         * @member {Set<Number>}
         */
        var _this = _possibleConstructorReturn(this, (Input.__proto__ || Object.getPrototypeOf(Input)).call(this));

        _this._channels = new Set(channels);

        /**
         * @private
         * @member {Number}
         */
        _this._value = 0;

        /**
         * @private
         * @member {Number}
         */
        _this._triggerStart = 0;

        /**
         * @private
         * @member {Number}
         */
        _this._triggerThreshold = triggerThreshold;

        if (start) {
            _this.on('start', start, context);
        }

        if (stop) {
            _this.on('stop', stop, context);
        }

        if (active) {
            _this.on('active', active, context);
        }

        if (trigger) {
            _this.on('trigger', trigger, context);
        }
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Set<Number>}
     */


    _createClass(Input, [{
        key: 'update',


        /**
         * @public
         * @param {Float32Array} activeChannels
         */
        value: function update(activeChannels) {
            this._value = 0;

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._channels[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var channel = _step.value;

                    this._value = Math.max(activeChannels[channel], this._value);
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            if (this._value) {
                if (!this._triggerStart) {
                    this._triggerStart = Date.now();
                    this.trigger('start', this._value);
                }

                this.trigger('active', this._value);
            } else {
                this.trigger('stop', this._value);

                if (this._triggerStart && Date.now() - this._triggerStart < this._triggerThreshold) {
                    this._triggerStart = 0;
                    this.trigger('trigger', this._value);
                }
            }
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Input.prototype.__proto__ || Object.getPrototypeOf(Input.prototype), 'destroy', this).call(this);

            this._channels.clear();
            this._channels = null;

            this._value = null;
            this._triggerStart = null;
            this._triggerThreshold = null;
        }
    }, {
        key: 'channels',
        get: function get() {
            return this._channels;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'value',
        get: function get() {
            return this._value;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'triggerThreshold',
        get: function get() {
            return this._triggerThreshold;
        },
        set: function set(threshold) {
            this._triggerThreshold = threshold;
        }
    }]);

    return Input;
}(_EventEmitter3.default);

exports.default = Input;

/***/ }),
/* 78 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ChannelHandler2 = __webpack_require__(6);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Pointer
 * @extends {ChannelHandler}
 */
var Pointer = function (_ChannelHandler) {
    _inherits(Pointer, _ChannelHandler);

    /**
     * @constructor
     * @param {ArrayBuffer} channelBuffer
     */
    function Pointer(channelBuffer, index) {
        _classCallCheck(this, Pointer);

        return _possibleConstructorReturn(this, (Pointer.__proto__ || Object.getPrototypeOf(Pointer)).call(this, channelBuffer, _const.CHANNEL_OFFSET.POINTER + index * _const.CHANNEL_LENGTH.CHILD, _const.CHANNEL_LENGTH.CHILD));
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @param {Number} [index=0]
     * @returns {Number}
     */


    _createClass(Pointer, null, [{
        key: 'getChannelCode',
        value: function getChannelCode(key) {
            var index = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

            return _const.CHANNEL_OFFSET.POINTER + index * _const.CHANNEL_LENGTH.CHILD + key % _const.CHANNEL_LENGTH.CHILD;
        }
    }]);

    return Pointer;
}(_ChannelHandler3.default);

exports.default = Pointer;

/***/ }),
/* 79 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _Playable = __webpack_require__(15);

Object.defineProperty(exports, 'Playable', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Playable).default;
  }
});

var _Audio = __webpack_require__(80);

Object.defineProperty(exports, 'Audio', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Audio).default;
  }
});

var _Sound = __webpack_require__(54);

Object.defineProperty(exports, 'Sound', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Sound).default;
  }
});

var _Music = __webpack_require__(53);

Object.defineProperty(exports, 'Music', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Music).default;
  }
});

var _MediaManager = __webpack_require__(38);

Object.defineProperty(exports, 'MediaManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_MediaManager).default;
  }
});

var _AudioAnalyser = __webpack_require__(81);

Object.defineProperty(exports, 'AudioAnalyser', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_AudioAnalyser).default;
  }
});

var _Video = __webpack_require__(82);

Object.defineProperty(exports, 'Video', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Video).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 80 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Playable2 = __webpack_require__(15);

var _Playable3 = _interopRequireDefault(_Playable2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Audio
 * @extends {Playable}
 */
var Audio = function (_Playable) {
    _inherits(Audio, _Playable);

    /**
     * @constructor
     * @param {HTMLAudioElement} audio
     */
    function Audio(audio) {
        _classCallCheck(this, Audio);

        /**
         * @private
         * @member {Number}
         */
        var _this = _possibleConstructorReturn(this, (Audio.__proto__ || Object.getPrototypeOf(Audio)).call(this, audio));

        _this._volume = 1;

        /**
         * @private
         * @member {Number}
         */
        _this._parentVolume = 1;
        return _this;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(Audio, [{
        key: 'connect',


        /**
         * @override
         */
        value: function connect(mediaManager) {
            this.parentVolume = mediaManager.masterVolume;
        }
    }, {
        key: 'parentVolume',
        get: function get() {
            return this._parentVolume;
        },
        set: function set(volume) {
            var newVolume = (0, _utils.clamp)(volume, 0, 1);

            if (this._parentVolume !== newVolume) {
                this._parentVolume = newVolume;
                this._source.volume = this._volume * this._parentVolume;
            }
        }

        /**
         * @override
         */

    }, {
        key: 'volume',
        get: function get() {
            return this._volume;
        },
        set: function set(volume) {
            var newVolume = (0, _utils.clamp)(volume, 0, 2);

            if (this._volume !== newVolume) {
                this._volume = newVolume;
                this._source.volume = this._volume * this._parentVolume;
            }
        }

        /**
         * @override
         */

    }, {
        key: 'analyserTarget',
        get: function get() {
            throw new Error('Audio class cannot be analysed.');
        }
    }]);

    return Audio;
}(_Playable3.default);

exports.default = Audio;

/***/ }),
/* 81 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class AudioAnalyser
 */
var AudioAnalyser = function () {

    /**
     * @constructor
     * @param {Sound|Music|Video|MediaManager} target
     * @param {Object} [options]
     * @param {Number} [options.fftSize=2048]
     * @param {Number} [options.minDecibels=-100]
     * @param {Number} [options.maxDecibels=-30]
     * @param {Number} [options.smoothingTimeConstant=0.8]
     */
    function AudioAnalyser(target) {
        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            _ref$fftSize = _ref.fftSize,
            fftSize = _ref$fftSize === undefined ? 2048 : _ref$fftSize,
            _ref$minDecibels = _ref.minDecibels,
            minDecibels = _ref$minDecibels === undefined ? -100 : _ref$minDecibels,
            _ref$maxDecibels = _ref.maxDecibels,
            maxDecibels = _ref$maxDecibels === undefined ? -30 : _ref$maxDecibels,
            _ref$smoothingTimeCon = _ref.smoothingTimeConstant,
            smoothingTimeConstant = _ref$smoothingTimeCon === undefined ? 0.8 : _ref$smoothingTimeCon;

        _classCallCheck(this, AudioAnalyser);

        if (!target) {
            throw new Error('No analyser target was provided.');
        }

        /**
         * @private
         * @member {Sound|Music|Video|MediaManager}
         */
        this._target = target;

        /**
         * @private
         * @member {Object}
         */
        this._options = {
            fftSize: fftSize,
            minDecibels: minDecibels,
            maxDecibels: maxDecibels,
            smoothingTimeConstant: smoothingTimeConstant
        };
    }

    _createClass(AudioAnalyser, [{
        key: 'ensureContext',
        value: function ensureContext() {
            if (this._context) {
                return;
            }

            if (!this._target.audioContext) {
                throw new Error('Failed to provide an AudioContext from the target.');
            }

            if (!this._target.analyserTarget) {
                throw new Error('Target has no valid AudioNode to analyse.');
            }

            /**
             * @private
             * @member {AudioContext}
             */
            this._context = this._target.audioContext;

            /**
             * @private
             * @member {AnalyserNode}
             */
            this._analyser = Object.assign(this._context.createAnalyser(), this._options);

            /**
             * @private
             * @member {AudioNode}
             */
            this._targetNode = this._target.analyserTarget;
            this._targetNode.connect(this._analyser);

            /**
             * @private
             * @member {Uint8Array} _timeDomainData
             */
            this._timeDomainData = new Uint8Array(this._analyser.frequencyBinCount);

            /**
             * @private
             * @member {Uint8Array} _frequencyData
             */
            this._frequencyData = new Uint8Array(this._analyser.frequencyBinCount);

            /**
             * @private
             * @member {Float32Array} _preciseTimeDomainData
             */
            this._preciseTimeDomainData = new Float32Array(this._analyser.frequencyBinCount);

            /**
             * @private
             * @member {Float32Array} _preciseFrequencyData
             */
            this._preciseFrequencyData = new Float32Array(this._analyser.frequencyBinCount);
        }

        /**
         * @public
         * @readonly
         * @member {Uint8Array}
         */

    }, {
        key: 'destroy',


        /**
         * @public
         */
        value: function destroy() {
            this._target = null;
            this._options = null;

            if (this._context) {
                this._context = null;

                this._targetNode.disconnect(this._analyser);
                this._targetNode = null;

                this._analyser.disconnect();
                this._analyser = null;

                this._timeDomainData = null;
                this._frequencyData = null;
                this._preciseTimeDomainData = null;
                this._preciseFrequencyData = null;
            }
        }
    }, {
        key: 'timeDomainData',
        get: function get() {
            this.ensureContext();

            this._analyser.getByteTimeDomainData(this._timeDomainData);

            return this._timeDomainData;
        }

        /**
         * @public
         * @readonly
         * @member {Uint8Array}
         */

    }, {
        key: 'frequencyData',
        get: function get() {
            this.ensureContext();

            this._analyser.getByteFrequencyData(this._frequencyData);

            return this._frequencyData;
        }

        /**
         * @public
         * @readonly
         * @member {Float32Array}
         */

    }, {
        key: 'preciseTimeDomainData',
        get: function get() {
            this.ensureContext();

            this._analyser.getFloatTimeDomainData(this._preciseTimeDomainData);

            return this._preciseTimeDomainData;
        }

        /**
         * @public
         * @readonly
         * @member {Float32Array}
         */

    }, {
        key: 'preciseFrequencyData',
        get: function get() {
            this.ensureContext();

            this._analyser.getFloatFrequencyData(this._preciseFrequencyData);

            return this._preciseFrequencyData;
        }
    }]);

    return AudioAnalyser;
}();

exports.default = AudioAnalyser;

/***/ }),
/* 82 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _utils = __webpack_require__(1);

var _Sprite2 = __webpack_require__(17);

var _Sprite3 = _interopRequireDefault(_Sprite2);

var _Texture = __webpack_require__(16);

var _Texture2 = _interopRequireDefault(_Texture);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Video
 * @extends {Playable}
 */
var Video = function (_Sprite) {
    _inherits(Video, _Sprite);

    /**
     * @constructor
     * @param {HTMLVideoElement} videoElement
     */
    function Video(videoElement) {
        _classCallCheck(this, Video);

        /**
         * @private
         * @member {HTMLVideoElement}
         */
        var _this = _possibleConstructorReturn(this, (Video.__proto__ || Object.getPrototypeOf(Video)).call(this, new _Texture2.default(videoElement)));

        _this._source = videoElement;

        /**
         * @private
         * @member {?AudioContext}
         */
        _this._audioContext = null;

        /**
         * @private
         * @member {?MediaElementAudioSourceNode}
         */
        _this._sourceNode = null;

        /**
         * @private
         * @member {?GainNode}
         */
        _this._gainNode = null;
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {?AudioContext}
     */


    _createClass(Video, [{
        key: 'render',


        /**
         * @override
         */
        value: function render(displayManager, parentTransform) {
            if (!this.visible) {
                return this;
            }

            this.updateTexture();

            this.worldTransform.copy(parentTransform);
            this.worldTransform.multiply(this.transform);

            displayManager.getRenderer('sprite').render(this);

            return this;
        }

        /**
         * @public
         * @abstract
         * @param {MediaManager} mediaManager
         */

    }, {
        key: 'connect',
        value: function connect(mediaManager) {
            if (this._audioContext) {
                return;
            }

            this._audioContext = mediaManager.audioContext;

            this._gainNode = this._audioContext.createGain();
            this._gainNode.connect(mediaManager.videoGain);

            this._sourceNode = this._audioContext.createMediaElementSource(this._source);
            this._sourceNode.connect(this._gainNode);
        }

        /**
         * @public
         * @abstract
         * @param {Object} [options]
         * @param {Boolean} [options.loop]
         * @param {Number} [options.playbackRate]
         * @param {Number} [options.volume]
         * @param {Number} [options.time]
         */

    }, {
        key: 'play',
        value: function play(options) {
            if (this.paused) {
                this.applyOptions(options);
                this._source.play();
            }
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'pause',
        value: function pause() {
            if (this.playing) {
                this._source.pause();
            }
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'stop',
        value: function stop() {
            this.pause();
            this.currentTime = 0;
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'toggle',
        value: function toggle() {
            if (this.paused) {
                this.play();
            } else {
                this.pause();
            }
        }

        /**
         * @public
         * @abstract
         * @param {Object} [options]
         * @param {Boolean} [options.loop]
         * @param {Number} [options.playbackRate]
         * @param {Number} [options.volume]
         * @param {Number} [options.time]
         */

    }, {
        key: 'applyOptions',
        value: function applyOptions() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                loop = _ref.loop,
                playbackRate = _ref.playbackRate,
                volume = _ref.volume,
                time = _ref.time;

            if (loop !== undefined) {
                this.loop = loop;
            }

            if (playbackRate !== undefined) {
                this.playbackRate = playbackRate;
            }

            if (volume !== undefined) {
                this.volume = volume;
            }

            if (time !== undefined) {
                this.currentTime = time;
            }
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Video.prototype.__proto__ || Object.getPrototypeOf(Video.prototype), 'destroy', this).call(this);

            this.stop();

            this._source = null;

            if (this._audioContext) {
                this._audioContext = null;

                this._sourceNode.disconnect();
                this._sourceNode = null;

                this._gainNode.disconnect();
                this._gainNode = null;
            }
        }
    }, {
        key: 'audioContext',
        get: function get() {
            return this._audioContext;
        }

        /**
         * @public
         * @readonly
         * @member {HTMLVideoElement}
         */

    }, {
        key: 'source',
        get: function get() {
            return this._source;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'duration',
        get: function get() {
            return this._source.duration;
        }

        /**
         * @override
         */

    }, {
        key: 'volume',
        get: function get() {
            return this._audioContext ? this._gainNode.gain.value : 1;
        },
        set: function set(volume) {
            if (this._audioContext) {
                this._gainNode.gain.value = (0, _utils.clamp)(volume, 0, 1);
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'currentTime',
        get: function get() {
            return this._source.currentTime;
        },
        set: function set(currentTime) {
            this._source.currentTime = Math.max(0, currentTime);
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'loop',
        get: function get() {
            return this._source.loop;
        },
        set: function set(loop) {
            this._source.loop = loop;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'playbackRate',
        get: function get() {
            return this._source.playbackRate;
        },
        set: function set(playbackRate) {
            this._source.playbackRate = Math.max(0, playbackRate);
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'paused',
        get: function get() {
            return this._source.paused;
        },
        set: function set(paused) {
            if (paused) {
                this.pause();
            } else {
                this.play();
            }
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'playing',
        get: function get() {
            return !this.paused;
        },
        set: function set(playing) {
            if (playing) {
                this.play();
            } else {
                this.pause();
            }
        }

        /**
         * @public
         * @readonly
         * @member {?GainNode}
         */

    }, {
        key: 'analyserTarget',
        get: function get() {
            return this._gainNode;
        }
    }]);

    return Video;
}(_Sprite3.default);

exports.default = Video;

/***/ }),
/* 83 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _DisplayManager = __webpack_require__(28);

Object.defineProperty(exports, 'DisplayManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_DisplayManager).default;
  }
});

var _RenderTarget = __webpack_require__(29);

Object.defineProperty(exports, 'RenderTarget', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_RenderTarget).default;
  }
});

var _Texture = __webpack_require__(16);

Object.defineProperty(exports, 'Texture', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Texture).default;
  }
});

var _View = __webpack_require__(30);

Object.defineProperty(exports, 'View', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_View).default;
  }
});

var _BlendMode = __webpack_require__(37);

Object.defineProperty(exports, 'BlendMode', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_BlendMode).default;
  }
});

var _Renderable = __webpack_require__(24);

Object.defineProperty(exports, 'Renderable', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Renderable).default;
  }
});

var _Container = __webpack_require__(84);

Object.defineProperty(exports, 'Container', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Container).default;
  }
});

var _Renderer = __webpack_require__(21);

Object.defineProperty(exports, 'Renderer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Renderer).default;
  }
});

var _Shader = __webpack_require__(22);

Object.defineProperty(exports, 'Shader', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Shader).default;
  }
});

var _ShaderAttribute = __webpack_require__(33);

Object.defineProperty(exports, 'ShaderAttribute', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ShaderAttribute).default;
  }
});

var _ShaderUniform = __webpack_require__(34);

Object.defineProperty(exports, 'ShaderUniform', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ShaderUniform).default;
  }
});

var _Sprite = __webpack_require__(17);

Object.defineProperty(exports, 'Sprite', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Sprite).default;
  }
});

var _Text = __webpack_require__(85);

Object.defineProperty(exports, 'Text', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Text).default;
  }
});

var _SpriteShader = __webpack_require__(32);

Object.defineProperty(exports, 'SpriteShader', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SpriteShader).default;
  }
});

var _SpriteRenderer = __webpack_require__(31);

Object.defineProperty(exports, 'SpriteRenderer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SpriteRenderer).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 84 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderable2 = __webpack_require__(24);

var _Renderable3 = _interopRequireDefault(_Renderable2);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Container
 * @extends {Renderable}
 */
var Container = function (_Renderable) {
    _inherits(Container, _Renderable);

    /**
     * @constructor
     */
    function Container() {
        _classCallCheck(this, Container);

        /**
         * @private
         * @member {Renderable[]}
         */
        var _this = _possibleConstructorReturn(this, (Container.__proto__ || Object.getPrototypeOf(Container)).call(this));

        _this._children = [];

        /**
         * @private
         * @member {Vector}
         */
        _this._size = new _Vector2.default();
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Renderable[]}
     */


    _createClass(Container, [{
        key: 'addChild',


        /**
         * @public
         * @chainable
         * @param {Renderable} child
         * @returns {Container}
         */
        value: function addChild(child) {
            if (child === this) {
                return this;
            }

            if (child.parent) {
                child.parent.removeChild(child);
            }

            child.parent = this;

            this._children.push(child);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Renderable} child
         * @param {Number} index
         * @returns {Container}
         */

    }, {
        key: 'addChildAt',
        value: function addChildAt(child, index) {
            if (index < 0 || index > this._children.length) {
                throw new Error('The index ' + index + ' is out of bounds ' + this._children.length);
            }

            if (child === this) {
                return this;
            }

            if (child.parent) {
                child.parent.removeChild(child);
            }

            child.parent = this;

            this._children.splice(index, 0, child);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Renderable} firstChild
         * @param {Renderable} secondChild
         * @returns {Container}
         */

    }, {
        key: 'swapChildren',
        value: function swapChildren(firstChild, secondChild) {
            if (firstChild === secondChild) {
                return this;
            }

            this._children[this.getChildIndex(firstChild)] = secondChild;
            this._children[this.getChildIndex(secondChild)] = firstChild;

            return this;
        }

        /**
         * @public
         * @param {Renderable} child
         * @returns {Number}
         */

    }, {
        key: 'getChildIndex',
        value: function getChildIndex(child) {
            var index = this._children.indexOf(child);

            if (index === -1) {
                throw new Error('Renderable is not a child of the container.');
            }

            return index;
        }

        /**
         * @public
         * @chainable
         * @param {Renderable} child
         * @param {Number} index
         * @returns {Container}
         */

    }, {
        key: 'setChildIndex',
        value: function setChildIndex(child, index) {
            if (index < 0 || index >= this._children.length) {
                throw new Error('The index ' + index + ' is out of bounds ' + this._children.length);
            }

            (0, _utils.removeItems)(this._children, this.getChildIndex(index), 1);
            this._children.splice(index, 0, child);

            return this;
        }

        /**
         * @public
         * @param {Number} index
         * @returns {Renderable}
         */

    }, {
        key: 'getChildAt',
        value: function getChildAt(index) {
            if (index < 0 || index >= this._children.length) {
                throw new Error('getChildAt: Index (' + index + ') does not exist.');
            }

            return this._children[index];
        }

        /**
         * @public
         * @chainable
         * @param {Renderable} child
         * @returns {Container}
         */

    }, {
        key: 'removeChild',
        value: function removeChild(child) {
            var index = this._children.indexOf(child);

            if (index === -1) {
                return this;
            }

            child.parent = null;
            (0, _utils.removeItems)(this._children, index, 1);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} index
         * @returns {Container}
         */

    }, {
        key: 'removeChildAt',
        value: function removeChildAt(index) {
            this.getChildAt(index).parent = null;
            (0, _utils.removeItems)(this._children, index, 1);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} begin
         * @param {Number} end
         * @returns {Container}
         */

    }, {
        key: 'removeChildren',
        value: function removeChildren() {
            var begin = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var end = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._children.length;

            var range = end - begin;

            if (!range && !this._children.length) {
                return this;
            }

            if (range < 0 && range > end) {
                throw new Error('removeChildren: numeric values are outside the acceptable range.');
            }

            this._children.splice(begin, range);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager, parentTransform) {
            if (!this.visible) {
                return this;
            }

            this._worldTransform.copy(parentTransform);
            this._worldTransform.multiply(this.transform);

            for (var i = 0, len = this._children.length; i < len; i++) {
                this._children[i].render(displayManager, this._worldTransform);
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Container.prototype.__proto__ || Object.getPrototypeOf(Container.prototype), 'destroy', this).call(this);

            this._children.length = 0;
            this._children = null;

            this._size.destroy();
            this._size = null;
        }
    }, {
        key: 'children',
        get: function get() {
            return this._children;
        }

        /**
         * @public
         * @member {Renderable|Container}
         */

    }, {
        key: 'parent',
        get: function get() {
            return this._parent;
        },
        set: function set(parent) {
            this._parent = parent;
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(size) {
            this._size.copy(size);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return this._size.x;
        },
        set: function set(width) {
            this._size.x = width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._size.y;
        },
        set: function set(height) {
            this._size.y = height;
        }
    }]);

    return Container;
}(_Renderable3.default);

exports.default = Container;

/***/ }),
/* 85 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Sprite2 = __webpack_require__(17);

var _Sprite3 = _interopRequireDefault(_Sprite2);

var _Texture = __webpack_require__(16);

var _Texture2 = _interopRequireDefault(_Texture);

var _settings = __webpack_require__(4);

var _settings2 = _interopRequireDefault(_settings);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var heightCache = new Map(),
    body = document.querySelector('body'),
    dummy = function (element) {
    element.appendChild(document.createTextNode('M'));

    Object.assign(element.style, {
        position: 'absolute',
        top: 0,
        left: 0
    });

    return element;
}(document.createElement('div'));

/**
 * @class Text
 * @extends {Sprite}
 */

var Text = function (_Sprite) {
    _inherits(Text, _Sprite);

    /**
     * @constructor
     * @param {String} text
     * @param {Object} [style]
     * @param {HTMLCanvasElement} [canvas=document.createElement('canvas')]
     */
    function Text(text, style) {
        var canvas = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : document.createElement('canvas');

        _classCallCheck(this, Text);

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        var _this = _possibleConstructorReturn(this, (Text.__proto__ || Object.getPrototypeOf(Text)).call(this, new _Texture2.default(canvas)));

        _this._canvas = canvas;

        /**
         * @private
         * @member {CanvasRenderingContext2D}
         */
        _this._context = canvas.getContext('2d');

        /**
         * @private
         * @member {String}
         */
        _this._text = null;

        /**
         * @private
         * @member {Object}
         */
        _this._style = null;

        /**
         * @private
         * @type {Boolean}
         */
        _this._dirty = false;

        _this.text = text;
        _this.style = style;
        return _this;
    }

    /**
     * @public
     * @member {String}
     */


    _createClass(Text, [{
        key: 'updatateText',


        /**
         * @public
         */
        value: function updatateText() {
            if (!this._dirty) {
                return;
            }

            var canvas = this._canvas,
                context = this._context,
                style = this._style,
                font = context.font = style.fontWeight + ' ' + style.fontSize + 'px ' + style.fontFamily,
                strokeThickness = style.strokeThickness,
                text = style.wordWrap ? this._getWordWrappedText() : this._text,
                lines = text.split(_const.NEWLINE),
                lineWidths = lines.map(function (line) {
                return context.measureText(line).width;
            }),
                maxLineWidth = lineWidths.reduce(function (max, width) {
                return Math.max(max, width);
            }, 0),
                lineHeight = this._determineFontHeight(font) + strokeThickness,
                width = Math.ceil(maxLineWidth + strokeThickness + style.padding * 2),
                height = Math.ceil(lineHeight * lines.length + style.padding * 2);

            canvas.width = width;
            canvas.height = height;

            context.clearRect(0, 0, width, height);

            context.font = font;

            context.strokeStyle = style.stroke;
            context.lineWidth = style.strokeThickness;
            context.fillStyle = style.fill;
            context.textBaseline = style.baseline;
            context.lineJoin = style.lineJoin;
            context.miterLimit = style.miterLimit;

            lines.forEach(function (line, index) {
                var lineWidth = maxLineWidth - lineWidths[index],
                    offset = style.align === 'right' ? lineWidth : style.align === 'center' ? lineWidth / 2 : 0,
                    lineX = strokeThickness / 2 + (style.align === 'left' ? 0 : offset),
                    lineY = strokeThickness / 2 + lineHeight * index;

                if (style.stroke && strokeThickness) {
                    context.strokeText(line, lineX, lineY);
                }

                if (style.fill) {
                    context.fillText(line, lineX, lineY);
                }
            });

            this.setTexture(this.texture.setSource(this._canvas));

            this._dirty = false;
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager, parentTransform) {
            this.updatateText();

            _get(Text.prototype.__proto__ || Object.getPrototypeOf(Text.prototype), 'render', this).call(this, displayManager, parentTransform);

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Text.prototype.__proto__ || Object.getPrototypeOf(Text.prototype), 'destroy', this).call(this);

            this._context = null;
            this._canvas = null;
            this._text = null;
            this._style = null;
            this._dirty = null;
        }

        /**
         * Greedy wrapping algorithm that will wrap words as the line grows longer
         * than its horizontal bounds.
         *
         * @private
         * @returns {String}
         */

    }, {
        key: '_getWordWrappedText',
        value: function _getWordWrappedText() {
            var context = this._context;

            var spaceLeft = this._style.wordWrapWidth,
                result = '';

            this._text.split('\n').forEach(function (line, index) {
                if (index > 0) {
                    result += '\n';
                }

                line.split(' ').forEach(function (word, index) {
                    var wordWidth = context.measureText(word).width,
                        spaceWidth = context.measureText(' ').width;

                    if (wordWidth + spaceWidth > spaceLeft) {
                        if (index > 0) {
                            result += '\n';
                        }

                        spaceLeft -= wordWidth;
                    } else {
                        spaceLeft -= wordWidth + spaceWidth;
                    }

                    result += word + ' ';
                });
            });

            return result;
        }

        /**
         * @private
         * @param {String} font
         * @returns {Number}
         */

    }, {
        key: '_determineFontHeight',
        value: function _determineFontHeight(font) {
            if (!heightCache.has(font)) {
                dummy.style.font = font;

                body.appendChild(dummy);
                heightCache.set(font, dummy.offsetHeight);
                body.removeChild(dummy);
            }

            return heightCache.get(font);
        }
    }, {
        key: 'text',
        get: function get() {
            return this._text;
        },
        set: function set(text) {
            var newText = text || ' ';

            if (this._text !== newText) {
                this._text = newText;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {Object}
         */

    }, {
        key: 'style',
        get: function get() {
            return this._style;
        },
        set: function set(style) {
            this._style = Object.assign({}, _settings2.default.TEXT_STYLE, style);
            this._dirty = true;
        }
    }]);

    return Text;
}(_Sprite3.default);

exports.default = Text;

/***/ }),
/* 86 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _Particle = __webpack_require__(56);

Object.defineProperty(exports, 'Particle', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Particle).default;
  }
});

var _ParticleEmitter = __webpack_require__(87);

Object.defineProperty(exports, 'ParticleEmitter', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleEmitter).default;
  }
});

var _ParticleShader = __webpack_require__(36);

Object.defineProperty(exports, 'ParticleShader', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleShader).default;
  }
});

var _ParticleRenderer = __webpack_require__(35);

Object.defineProperty(exports, 'ParticleRenderer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleRenderer).default;
  }
});

var _ParticleModifier = __webpack_require__(18);

Object.defineProperty(exports, 'ParticleModifier', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleModifier).default;
  }
});

var _ForceModifier = __webpack_require__(88);

Object.defineProperty(exports, 'ForceModifier', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ForceModifier).default;
  }
});

var _ScaleModifier = __webpack_require__(89);

Object.defineProperty(exports, 'ScaleModifier', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ScaleModifier).default;
  }
});

var _TorqueModifier = __webpack_require__(90);

Object.defineProperty(exports, 'TorqueModifier', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_TorqueModifier).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 87 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Particle = __webpack_require__(56);

var _Particle2 = _interopRequireDefault(_Particle);

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _Time = __webpack_require__(11);

var _Time2 = _interopRequireDefault(_Time);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class ParticleEmitter
 */
var ParticleEmitter = function () {

    /**
     * @constructor
     * @param {Texture} texture
     */
    function ParticleEmitter(texture) {
        _classCallCheck(this, ParticleEmitter);

        /**
         * @private
         * @member {Texture}
         */
        this._texture = texture;

        /**
         * @private
         * @member {Rectangle}
         */
        this._textureRect = new _Rectangle2.default(0, 0, texture.width, texture.height);

        /**
         * @private
         * @member {Rectangle}
         */
        this._textureCoords = new _Rectangle2.default();

        /**
         * @private
         * @member {Number}
         */
        this._emissionRate = 1;

        /**
         * @private
         * @member {Number}
         */
        this._emissionDelta = 0;

        /**
         * @private
         * @member {ParticleModifier[]}
         */
        this._modifiers = [];

        /**
         * @private
         * @member {Set<Particle>}
         */
        this._particles = new Set();

        /**
         * @private
         * @member {Time}
         */
        this._particleLifetime = new _Time2.default(1, _Time2.default.Seconds);

        /**
         * @private
         * @member {Vector}
         */
        this._particlePosition = new _Vector2.default();

        /**
         * @private
         * @member {Vector}
         */
        this._particleVelocity = new _Vector2.default();

        /**
         * @private
         * @member {Number}
         */
        this._particleRotation = 1;

        /**
         * @private
         * @member {Number}
         */
        this._particleRotationSpeed = 0;

        /**
         * @private
         * @member {Vector}
         */
        this._particleScale = new _Vector2.default(1, 1);

        /**
         * @private
         * @member {Color}
         */
        this._particleColor = _Color2.default.White.clone();
    }

    /**
     * @public
     * @readonly
     * @member {Set<Particle>}
     */


    _createClass(ParticleEmitter, [{
        key: 'setTextureRect',


        /**
         * @public
         * @param {Rectangle} rect
         */
        value: function setTextureRect(rectangle) {
            var texture = this._texture,
                width = texture.width,
                height = texture.height,
                x = rectangle.x / width,
                y = rectangle.y / height;

            this._textureCoords.set(x, y, x + rectangle.width / width, y + rectangle.height / height);
            this._textureRect.copy(rectangle);
        }

        /**
         * @public
         * @param {ParticleModifier} modifier
         */

    }, {
        key: 'addModifier',
        value: function addModifier(modifier) {
            this._modifiers.push(modifier);
        }

        /**
         * @public
         * @param {Time} time
         */

    }, {
        key: 'computeParticleCount',
        value: function computeParticleCount(time) {
            var particleAmount = this._emissionRate * time.seconds + this._emissionDelta,
                particles = particleAmount | 0;

            this._emissionDelta = particleAmount - particles;

            return particles;
        }

        /**
         * @public
         * @param {Time} delta
         */

    }, {
        key: 'update',
        value: function update(delta) {
            var particles = this._particles,
                modifiers = this._modifiers,
                particleCount = this.computeParticleCount(delta);

            for (var i = 0; i < particleCount; i++) {
                particles.add(new _Particle2.default({
                    lifetime: this._particleLifetime,
                    position: this._particlePosition,
                    velocity: this._particleVelocity,
                    rotation: this._particleRotation,
                    rotationSpeed: this._particleRotationSpeed,
                    scale: this._particleScale,
                    color: this._particleColor
                }));
            }

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = particles[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var particle = _step.value;

                    particle.update(delta);

                    if (particle.elapsedLifetime.greaterThan(particle.totalLifetime)) {
                        particles.delete(particle);
                        continue;
                    }

                    var _iteratorNormalCompletion2 = true;
                    var _didIteratorError2 = false;
                    var _iteratorError2 = undefined;

                    try {
                        for (var _iterator2 = modifiers[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                            var modifier = _step2.value;

                            modifier.apply(particle, delta);
                        }
                    } catch (err) {
                        _didIteratorError2 = true;
                        _iteratorError2 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion2 && _iterator2.return) {
                                _iterator2.return();
                            }
                        } finally {
                            if (_didIteratorError2) {
                                throw _iteratorError2;
                            }
                        }
                    }
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }
        }

        /**
         * @public
         * @param {DisplayManager} displayManager
         */

    }, {
        key: 'render',
        value: function render(displayManager) {
            displayManager.getRenderer('particle').render(this);
        }
    }, {
        key: 'particles',
        get: function get() {
            return this._particles;
        }

        /**
         * @public
         * @readonly
         * @member {ParticleModifier[]}
         */

    }, {
        key: 'modifiers',
        get: function get() {
            return this._modifiers;
        }

        /**
         * @public
         * @readonly
         * @member {Rectangle}
         */

    }, {
        key: 'textureRect',
        get: function get() {
            return this._textureRect;
        }

        /**
         * @public
         * @member {Texture}
         */

    }, {
        key: 'texture',
        get: function get() {
            return this._texture;
        },
        set: function set(texture) {
            this._texture = texture;
        }

        /**
         * @public
         * @member {Rectangle}
         */

    }, {
        key: 'textureCoords',
        get: function get() {
            return this._textureCoords;
        },
        set: function set(textureCoords) {
            this._textureCoords.copy(textureCoords);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'emissionRate',
        get: function get() {
            return this._emissionRate;
        },
        set: function set(particlesPerSecond) {
            this._emissionRate = particlesPerSecond;
        }

        /**
         * @public
         * @member {Time}
         */

    }, {
        key: 'particleLifetime',
        get: function get() {
            return this._particleLifetime;
        },
        set: function set(particleLifetime) {
            this._particleLifetime.copy(particleLifetime);
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'particlePosition',
        get: function get() {
            return this._particlePosition;
        },
        set: function set(position) {
            this._particlePosition.copy(position);
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'particleVelocity',
        get: function get() {
            return this._particleVelocity;
        },
        set: function set(velocity) {
            this._particleVelocity.copy(velocity);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'particleRotation',
        get: function get() {
            return this._particleRotation;
        },
        set: function set(rotation) {
            this._particleRotation = rotation % 360;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'particleRotationSpeed',
        get: function get() {
            return this._particleRotationSpeed;
        },
        set: function set(speed) {
            this._particleRotationSpeed = speed;
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'particleScale',
        get: function get() {
            return this._particleScale;
        },
        set: function set(scale) {
            this._particleScale.copy(scale);
        }

        /**
         * @public
         * @member {Color}
         */

    }, {
        key: 'particleColor',
        get: function get() {
            return this._particleColor;
        },
        set: function set(color) {
            this._particleColor.copy(color);
        }
    }]);

    return ParticleEmitter;
}();

exports.default = ParticleEmitter;

/***/ }),
/* 88 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ParticleModifier2 = __webpack_require__(18);

var _ParticleModifier3 = _interopRequireDefault(_ParticleModifier2);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ForceModifier
 * @implements {ParticleModifier}
 */
var ForceModifier = function (_ParticleModifier) {
    _inherits(ForceModifier, _ParticleModifier);

    /**
     * @constructor
     * @param {Vector} acceleration
     */
    function ForceModifier(acceleration) {
        _classCallCheck(this, ForceModifier);

        /**
         * @private
         * @member {Vector}
         */
        var _this = _possibleConstructorReturn(this, (ForceModifier.__proto__ || Object.getPrototypeOf(ForceModifier)).call(this));

        _this._acceleration = acceleration && acceleration.clone() || new _Vector2.default();
        return _this;
    }

    /**
     * @public
     * @member {Vector}
     */


    _createClass(ForceModifier, [{
        key: 'apply',


        /**
         * @override
         */
        value: function apply(particle, delta) {
            var acceleration = this._acceleration,
                seconds = delta.seconds;

            particle.velocity.add(seconds * acceleration.x, seconds * acceleration.y);
        }
    }, {
        key: 'acceleration',
        get: function get() {
            return this._acceleration;
        },
        set: function set(acceleration) {
            this._acceleration.copy(acceleration);
        }
    }]);

    return ForceModifier;
}(_ParticleModifier3.default);

exports.default = ForceModifier;

/***/ }),
/* 89 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ParticleModifier2 = __webpack_require__(18);

var _ParticleModifier3 = _interopRequireDefault(_ParticleModifier2);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ScaleModifier
 * @implements {ParticleModifier}
 */
var ScaleModifier = function (_ParticleModifier) {
    _inherits(ScaleModifier, _ParticleModifier);

    /**
     * @constructor
     * @param {Vector} scaleFactor
     */
    function ScaleModifier(scaleFactor) {
        _classCallCheck(this, ScaleModifier);

        /**
         * @private
         * @member {Vector}
         */
        var _this = _possibleConstructorReturn(this, (ScaleModifier.__proto__ || Object.getPrototypeOf(ScaleModifier)).call(this));

        _this._scaleFactor = scaleFactor && scaleFactor.clone() || new _Vector2.default();
        return _this;
    }

    /**
     * @public
     * @member {Vector}
     */


    _createClass(ScaleModifier, [{
        key: 'apply',


        /**
         * @override
         */
        value: function apply(particle, delta) {
            var scaleFactor = this._scaleFactor,
                seconds = delta.seconds;

            particle.scale.add(seconds * scaleFactor.x, seconds * scaleFactor.y);
        }
    }, {
        key: 'scaleFactor',
        get: function get() {
            return this._scaleFactor;
        },
        set: function set(scaleFactor) {
            this._scaleFactor.copy(scaleFactor);
        }
    }]);

    return ScaleModifier;
}(_ParticleModifier3.default);

exports.default = ScaleModifier;

/***/ }),
/* 90 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ParticleModifier2 = __webpack_require__(18);

var _ParticleModifier3 = _interopRequireDefault(_ParticleModifier2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class TorqueModifier
 * @implements {ParticleModifier}
 */
var TorqueModifier = function (_ParticleModifier) {
    _inherits(TorqueModifier, _ParticleModifier);

    /**
     * @constructor
     * @param {Number} angularAcceleration
     */
    function TorqueModifier(angularAcceleration) {
        _classCallCheck(this, TorqueModifier);

        /**
         * @private
         * @member {Number}
         */
        var _this = _possibleConstructorReturn(this, (TorqueModifier.__proto__ || Object.getPrototypeOf(TorqueModifier)).call(this));

        _this._angularAcceleration = angularAcceleration || 0;
        return _this;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(TorqueModifier, [{
        key: 'apply',


        /**
         * @override
         */
        value: function apply(particle, delta) {
            particle.rotationSpeed += delta.seconds * this._angularAcceleration;
        }
    }, {
        key: 'angularAcceleration',
        get: function get() {
            return this._acceleration;
        },
        set: function set(angularAcceleration) {
            this._angularAcceleration = angularAcceleration;
        }
    }]);

    return TorqueModifier;
}(_ParticleModifier3.default);

exports.default = TorqueModifier;

/***/ })
/******/ ]);
//# sourceMappingURL=exo.build.js.map