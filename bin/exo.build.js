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
/******/ 	return __webpack_require__(__webpack_require__.s = 59);
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
 * @memberof Exo
 * @type {String}
 */
VERSION = exports.VERSION = "1.0.0",


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @memberof Exo
 * @type {Number}
 */
TAU = exports.TAU = Math.PI * 2,


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @memberof Exo
 * @type {Number}
 */
DEG_TO_RAD = exports.DEG_TO_RAD = Math.PI / 180,


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @memberof Exo
 * @type {Number}
 */
RAD_TO_DEG = exports.RAD_TO_DEG = 180 / Math.PI,


/**
 * @public
 * @constant
 * @memberOf Exo
 * @name SHAPE
 * @type {Object<String, Number>}
 * @property {Number} POLYGON
 * @property {Number} RECTANGLE
 * @property {Number} CIRCLE
 * @property {Number} ELLIPSIS
 * @property {Number} POINT
 */
SHAPE = exports.SHAPE = {
  POLYGON: 0,
  RECTANGLE: 1,
  CIRCLE: 2,
  ELLIPSIS: 3,
  POINT: 4
},


/**
 * @public
 * @constant
 * @memberOf Exo
 * @name SCALE_MODE
 * @type {Object<String, Number>}
 * @property {Number} LINEAR
 * @property {Number} NEAREST
 */
SCALE_MODE = exports.SCALE_MODE = {
  LINEAR: 0,
  NEAREST: 1
},


/**
 * @public
 * @constant
 * @memberOf Exo
 * @name WRAP_MODE
 * @type {Object<String, Number>}
 * @property {Number} CLAMP_TO_EDGE
 * @property {Number} REPEAT
 * @property {Number} MIRRORED_REPEAT
 */
WRAP_MODE = exports.WRAP_MODE = {
  CLAMP_TO_EDGE: 0,
  REPEAT: 1,
  MIRRORED_REPEAT: 2
},


/**
 * @public
 * @constant
 * @memberOf Exo
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
 * @memberOf Exo
 * @name CHANNEL_OFFSET
 * @type {Object<String, Number>}
 * @property {Number} KEYBOARD
 * @property {Number} MOUSE
 * @property {Number} GAMEPAD
 * @property {Number} POINTER
 */
CHANNEL_OFFSET = exports.CHANNEL_OFFSET = {
  KEYBOARD: INPUT_DEVICE.KEYBOARD << 8,
  MOUSE: INPUT_DEVICE.MOUSE << 8,
  GAMEPAD: INPUT_DEVICE.GAMEPAD << 8,
  POINTER: INPUT_DEVICE.POINTER << 8
},


/**
 * @public
 * @constant
 * @memberOf Exo
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
 * @memberOf Exo
 * @name UNIFORM_TYPE
 * @type {Object<String, Number>}
 * @property {Number} INT
 * @property {Number} FLOAT
 * @property {Number} VECTOR
 * @property {Number} VECTOR_INT
 * @property {Number} MATRIX
 * @property {Number} TEXTURE
 */
UNIFORM_TYPE = exports.UNIFORM_TYPE = {
  INT: 0,
  FLOAT: 1,
  VECTOR: 2,
  VECTOR_INT: 3,
  MATRIX: 4,
  TEXTURE: 5
},


/**
 * @public
 * @constant
 * @memberOf Exo
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
 * @memberOf Exo
 * @name DATABASE_TYPES
 * @type {String[]}
 */
DATABASE_TYPES = exports.DATABASE_TYPES = ['arrayBuffer', 'audioBuffer', 'audio', 'font', 'image', 'json', 'music', 'sound', 'string'],


/**
 * @public
 * @constant
 * @memberOf Exo
 * @name QUAD_TREE_MAX_LEVEL
 * @type {Number}
 */
QUAD_TREE_MAX_LEVEL = exports.QUAD_TREE_MAX_LEVEL = 5,


/**
 * @public
 * @constant
 * @memberOf Exo
 * @name QUAD_TREE_MAX_ENTITIES
 * @type {Number}
 */
QUAD_TREE_MAX_ENTITIES = exports.QUAD_TREE_MAX_ENTITIES = 10,


/**
 * @public
 * @constant
 * @memberOf Exo
 * @name CODEC_NOT_SUPPORTED
 * @type {RegExp}
 */
CODEC_NOT_SUPPORTED = exports.CODEC_NOT_SUPPORTED = /^no$/;

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getMimeType = exports.getExtension = exports.getFilename = exports.getWrapModeEnum = exports.getScaleModeEnum = exports.removeItems = exports.rgbToHex = exports.hueToRgb = exports.rangeIntersect = exports.inRange = exports.isPowerOfTwo = exports.clamp = exports.radiansToDegrees = exports.degreesToRadians = exports.decodeAudioBuffer = exports.isCodecSupported = exports.audio = exports.audioContext = exports.webGLSupported = exports.indexedDBSupported = exports.webAudioSupported = undefined;

var _const = __webpack_require__(0);

var

/**
 * @public
 * @static
 * @readonly
 * @constant
 * @memberof Exo.utils
 * @type {Boolean}
 */
webAudioSupported = exports.webAudioSupported = 'AudioContext' in window,


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @memberof Exo.utils
 * @type {Boolean}
 */
indexedDBSupported = exports.indexedDBSupported = 'indexedDB' in window,


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @memberof Exo.utils
 * @type {Boolean}
 */
webGLSupported = exports.webGLSupported = function () {
  var canvas = document.createElement('canvas'),
      supports = 'probablySupportsContext' in canvas ? 'probablySupportsContext' : 'supportsContext';

  if (supports in canvas) {
    return canvas[supports]('webgl') || canvas[supports]('experimental-webgl');
  }

  return 'WebGLRenderingContext' in window;
}(),


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @memberof Exo.utils
 * @type {?AudioContext}
 */
audioContext = exports.audioContext = webAudioSupported ? new AudioContext() : null,


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @memberof Exo.utils
 * @type {HTMLMediaElement}
 */
audio = exports.audio = new Audio(),


/**
 * @public
 * @static
 * @constant
 * @memberof Exo.utils
 * @type {Function}
 * @param {...String} codecs
 * @returns {Boolean}
 */
isCodecSupported = exports.isCodecSupported = function isCodecSupported() {
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
 * @static
 * @constant
 * @memberof Exo.utils
 * @type {Function}
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<AudioBuffer>}
 */
decodeAudioBuffer = exports.decodeAudioBuffer = function decodeAudioBuffer(arrayBuffer) {
  if (!webAudioSupported) {
    return Promise.reject();
  }

  return new Promise(function (resolve, reject) {
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
degreesToRadians = exports.degreesToRadians = function degreesToRadians(degree) {
  return degree * _const.DEG_TO_RAD;
},


/**
 * @public
 * @static
 * @constant
 * @memberof Exo.utils
 * @type {Function}
 * @param {Number} radian
 * @returns {Number}
 */
radiansToDegrees = exports.radiansToDegrees = function radiansToDegrees(radian) {
  return radian * _const.RAD_TO_DEG;
},


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
clamp = exports.clamp = function clamp(value, min, max) {
  return Math.min(Math.max(value, Math.min(max, value)), Math.max(min, max));
},


/**
 * @public
 * @static
 * @constant
 * @memberof Exo.utils
 * @type {Function}
 * @param {Number} value
 * @returns {Boolean}
 */
isPowerOfTwo = exports.isPowerOfTwo = function isPowerOfTwo(value) {
  return value !== 0 && (value & value - 1) === 0;
},


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
inRange = exports.inRange = function inRange(value, min, max) {
  return value >= Math.min(min, max) && value <= Math.max(min, max);
},


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
rangeIntersect = exports.rangeIntersect = function rangeIntersect(minA, maxA, minB, maxB) {
  return Math.max(minA, maxA) >= Math.min(minB, maxB) && Math.min(minA, maxB) <= Math.max(minB, maxB);
},


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
hueToRgb = exports.hueToRgb = function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return (p + (q - p)) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return (p + (q - p)) * (2 / 3 - t) * 6;

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
rgbToHex = exports.rgbToHex = function rgbToHex(r, g, b) {
  var prefixed = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;

  var color = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).substr(1);

  return prefixed ? '#' + color : color;
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
 * @static
 * @constant
 * @memberof Exo.utils
 * @type {Function}
 * @param {WebGLRenderingContext} gl
 * @param {Number} scaleMode
 * @returns {Number}
 */
getScaleModeEnum = exports.getScaleModeEnum = function getScaleModeEnum(gl, scaleMode) {
  return scaleMode === _const.SCALE_MODE.LINEAR ? gl.LINEAR : gl.NEAREST;
},


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
getWrapModeEnum = exports.getWrapModeEnum = function getWrapModeEnum(gl, wrapMode) {
  if (wrapMode === _const.WRAP_MODE.CLAMP_TO_EDGE) {
    return gl.CLAMP_TO_EDGE;
  }

  return wrapMode === _const.WRAP_MODE.REPEAT ? gl.REPEAT : gl.MIRRORED_REPEAT;
},


/**
 * @public
 * @static
 * @constant
 * @memberof Exo.utils
 * @type {Function}
 * @returns {String}
 */
getFilename = exports.getFilename = function getFilename(url) {
  return url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('.'));
},


/**
 * @public
 * @static
 * @constant
 * @memberof Exo.utils
 * @type {Function}
 * @returns {String}
 */
getExtension = exports.getExtension = function getExtension(url) {
  return url.substring(url.lastIndexOf('.') + 1).toLowerCase();
},


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
getMimeType = exports.getMimeType = function getMimeType(response, type) {
  return response.headers.get('Content-Type') || type + '/' + getExtension(response.url);
};

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Shape2 = __webpack_require__(7);

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
 * @implements {Exo.Shape}
 * @memberof Exo
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
     * @public
     * @readonly
     * @member {Number}
     */


    _createClass(Vector, [{
        key: 'set',


        /**
         * @override
         */
        value: function set(x, y) {
            this._x = typeof x === 'number' ? x : this._x;
            this._y = typeof y === 'number' ? y : this._y;

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
        key: 'toArray',
        value: function toArray() {
            return [this._x, this._y];
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
         * @param {Exo.Vector} vector
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
         * @param {Number} x
         * @param {Number} y
         * @returns {Exo.Vector}
         */

    }, {
        key: 'add',
        value: function add(x, y) {
            this._x += typeof x === 'number' ? x : 0;
            this._y += typeof y === 'number' ? y : 0;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Exo.Vector}
         */

    }, {
        key: 'subtract',
        value: function subtract(x, y) {
            this._x -= typeof x === 'number' ? x : 0;
            this._y -= typeof y === 'number' ? y : 0;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Exo.Vector}
         */

    }, {
        key: 'multiply',
        value: function multiply(x, y) {
            this._x *= typeof x === 'number' ? x : 1;
            this._y *= typeof y === 'number' ? y : 1;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Exo.Vector}
         */

    }, {
        key: 'divide',
        value: function divide(x, y) {
            this._x /= typeof x === 'number' ? x : 1;
            this._y /= typeof y === 'number' ? y : 1;

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Exo.Vector}
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
        key: 'getBounds',
        value: function getBounds() {
            return new _Rectangle2.default(this._x, this._y, 0, 0);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._x = null;
            this._y = null;
        }

        /**
         * @public
         * @static
         * @returns {Exo.Vector}
         */

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
        set: function set(value) {
            return this._x = value;
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
        set: function set(value) {
            return this._y = value;
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
    }], [{
        key: 'Empty',
        get: function get() {
            return new Vector(0, 0);
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

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Shape2 = __webpack_require__(7);

var _Shape3 = _interopRequireDefault(_Shape2);

var _utils = __webpack_require__(1);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Rectangle
 * @implements {Exo.Shape}
 * @memberof Exo
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
         * @member {Exo.Vector}
         */
        var _this = _possibleConstructorReturn(this, (Rectangle.__proto__ || Object.getPrototypeOf(Rectangle)).call(this));

        _this._position = new _Vector2.default(x, y);

        /**
         * @public
         * @member {Exo.Vector}
         */
        _this._size = new _Vector2.default(width, height);
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
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
        key: 'toArray',
        value: function toArray() {
            return [this.x, this.y, this.width, this.height];
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
                case _const.SHAPE.POLYGON: // todo
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
                case _const.SHAPE.POLYGON: // todo
                default:
                    return false;
            }

            throw new Error('Passed item is not a valid shape!', shape);
        }

        /**
         * @override
         */

    }, {
        key: 'getBounds',
        value: function getBounds() {
            return this.clone();
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._position.destroy();
            this._position = null;

            this._size.destroy();
            this._size = null;
        }

        /**
         * @public
         * @static
         * @returns {Exo.Rectangle}
         */

    }, {
        key: 'type',
        get: function get() {
            return _const.SHAPE.RECTANGLE;
        }

        /**
         * @public
         * @member {Exo.Vector}
         */

    }, {
        key: 'position',
        get: function get() {
            return this._position;
        },
        set: function set(value) {
            this._position.copy(value);
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
        set: function set(value) {
            this._position.x = value;
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
        set: function set(value) {
            this._position.y = value;
        }

        /**
         * @public
         * @member {Exo.Vector}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(value) {
            this._size.copy(value);
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
        set: function set(value) {
            this._size.x = value;
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
        set: function set(value) {
            this._size.y = value;
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
        set: function set(value) {
            this.x = value;
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
        set: function set(value) {
            this.x = value - this.width;
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
        set: function set(value) {
            this.y = value;
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
        set: function set(value) {
            this.y = value - this.height;
        }
    }], [{
        key: 'Empty',
        get: function get() {
            return new Rectangle(0, 0, 0, 0);
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

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(5);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ChannelHandler
 * @extends {Exo.EventEmitter}
 * @memberof Exo
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

    /**
     * @private
     * @member {Boolean}
     */
    _this._active = true;
    return _this;
  }

  /**
   * @public
   * @readonly
   * @member {ArrayBuffer}
   */


  _createClass(ChannelHandler, [{
    key: 'setChannelOffset',


    /**
     * @public
     * @param {Number} offset
     * @param {Number} length
     */
    value: function setChannelOffset(offset, length) {
      this._channels = new Float32Array(this._channelBuffer, offset * 4, length);
    }

    /**
     * @public
     */

  }, {
    key: 'resetChannels',
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
      this._active = null;
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

    /**
     * @public
     * @member {Boolean}
     */

  }, {
    key: 'active',
    get: function get() {
      return this._active;
    },
    set: function set(value) {
      this._active = !!value;
    }
  }]);

  return ChannelHandler;
}(_EventEmitter3.default);

exports.default = ChannelHandler;

/***/ }),
/* 5 */
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
 * @memberof Exo
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
         * @returns {Exo.EventEmitter}
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
         * @returns {Exo.EventEmitter}
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
         * @returns {Exo.EventEmitter}
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
         * @returns {Exo.EventEmitter}
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
/* 6 */
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
 * @memberof Exo
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
     * @param {Number} r
     * @param {Number} g
     * @param {Number} b
     * @param {Number} a
     * @returns {Exo.Color}
     */
    value: function set(r, g, b, a) {
      this.r = r;
      this.g = g;
      this.b = b;
      this.a = a;

      return this;
    }

    /**
     * @public
     * @param {Boolean} [prefixed=true]
     * @returns {String}
     */

  }, {
    key: 'getHexCode',
    value: function getHexCode() {
      var prefixed = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;

      return (0, _utils.rgbToHex)(this._r, this._g, this._b, prefixed);
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

      return { h: h, s: s, l: l };
    }

    /**
     * @public
     * @chainable
     * @param {Number} h
     * @param {Number} s
     * @param {Number} l
     * @returns {Exo.Color}
     */

  }, {
    key: 'setHsl',
    value: function setHsl(h, s, l) {
      if (s === 0) {
        this.r = this.g = this.b = 255;
      } else {
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s,
            p = 2 * l - q;

        this.r = (0, _utils.hueToRgb)(p, q, h + 1 / 3) * 255;
        this.g = (0, _utils.hueToRgb)(p, q, h) * 255;
        this.b = (0, _utils.hueToRgb)(p, q, h - 1 / 3) * 255;
      }

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} percentage
     * @returns {Exo.Color}
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
     * @returns {Exo.Color}
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
     * @param {Exo.Color} color
     * @returns {Exo.Color}
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
     * @returns {Exo.Color}
     */

  }, {
    key: 'clone',
    value: function clone() {
      return new Color(this._r, this._g, this._b, this._a);
    }

    /**
     * @public
     * @returns {Boolean}
     * @param {Exo.Color} color
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

      var array = this._array || (this._array = new Float32Array(4));

      if (normalized) {
        array[0] = this._r / 255;
        array[1] = this._g / 255;
        array[2] = this._b / 255;
        array[3] = this._a;
      } else {
        array[0] = this._r;
        array[1] = this._g;
        array[2] = this._b;
        array[3] = this._a;
      }

      return array;
    }

    /**
     * @public
     * @static
     * @returns {Exo.Color}
     */

  }, {
    key: 'r',
    get: function get() {
      return this._r;
    },
    set: function set(value) {
      this._r = value & 255;
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
    set: function set(value) {
      this._g = value & 255;
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
    set: function set(value) {
      this._b = value & 255;
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
    set: function set(value) {
      this._a = (0, _utils.clamp)(value, 0, 1);
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
    set: function set(value) {
      this._r = value >> 16 & 255;
      this._g = value >> 8 & 255;
      this._b = value & 255;
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
    set: function set(value) {
      this._a = (value >> 24 & 255) / 255;
      this._r = value >> 16 & 255;
      this._g = value >> 8 & 255;
      this._b = value & 255;
    }
  }], [{
    key: 'Empty',
    get: function get() {
      return new Color(0, 0, 0, 0);
    }
  }]);

  return Color;
}();

/**
 * @public
 * @static
 * @member {Exo.Color}
 */


exports.default = Color;
Color.AliceBlue = new Color(240, 248, 255, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.AntiqueWhite = new Color(250, 235, 215, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Aqua = new Color(0, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Aquamarine = new Color(127, 255, 212, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Azure = new Color(240, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Beige = new Color(245, 245, 220, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Bisque = new Color(255, 228, 196, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Black = new Color(0, 0, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.BlanchedAlmond = new Color(255, 235, 205, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Blue = new Color(0, 0, 255, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.BlueViolet = new Color(138, 43, 226, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Brown = new Color(165, 42, 42, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.BurlyWood = new Color(222, 184, 135, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.CadetBlue = new Color(95, 158, 160, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Chartreuse = new Color(127, 255, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Chocolate = new Color(210, 105, 30, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Coral = new Color(255, 127, 80, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.CornflowerBlue = new Color(100, 149, 237, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Cornsilk = new Color(255, 248, 220, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Crimson = new Color(220, 20, 60, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Cyan = new Color(0, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkBlue = new Color(0, 0, 139, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkCyan = new Color(0, 139, 139, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkGoldenrod = new Color(184, 134, 11, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkGray = new Color(169, 169, 169, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkGreen = new Color(0, 100, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkKhaki = new Color(189, 183, 107, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkMagenta = new Color(139, 0, 139, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkOliveGreen = new Color(85, 107, 47, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkOrange = new Color(255, 140, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkOrchid = new Color(153, 50, 204, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkRed = new Color(139, 0, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkSalmon = new Color(233, 150, 122, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkSeaGreen = new Color(143, 188, 139, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkSlateBlue = new Color(72, 61, 139, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkSlateGray = new Color(47, 79, 79, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkTurquoise = new Color(0, 206, 209, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DarkViolet = new Color(148, 0, 211, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DeepPink = new Color(255, 20, 147, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DeepSkyBlue = new Color(0, 191, 255, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DimGray = new Color(105, 105, 105, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.DodgerBlue = new Color(30, 144, 255, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Firebrick = new Color(178, 34, 34, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.FloralWhite = new Color(255, 250, 240, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.ForestGreen = new Color(34, 139, 34, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Fuchsia = new Color(255, 0, 255, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Gainsboro = new Color(220, 220, 220, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.GhostWhite = new Color(248, 248, 255, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Gold = new Color(255, 215, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Goldenrod = new Color(218, 165, 32, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Gray = new Color(128, 128, 128, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Green = new Color(0, 128, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.GreenYellow = new Color(173, 255, 47, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Honeydew = new Color(240, 255, 240, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.HotPink = new Color(255, 105, 180, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.IndianRed = new Color(205, 92, 92, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Indigo = new Color(75, 0, 130, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Ivory = new Color(255, 255, 240, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Khaki = new Color(240, 230, 140, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Lavender = new Color(230, 230, 250, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LavenderBlush = new Color(255, 240, 245, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LawnGreen = new Color(124, 252, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LemonChiffon = new Color(255, 250, 205, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightBlue = new Color(173, 216, 230, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightCoral = new Color(240, 128, 128, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightCyan = new Color(224, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightGoldenrodYellow = new Color(250, 250, 210, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightGray = new Color(211, 211, 211, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightGreen = new Color(144, 238, 144, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightPink = new Color(255, 182, 193, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightSalmon = new Color(255, 160, 122, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightSeaGreen = new Color(32, 178, 170, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightSkyBlue = new Color(135, 206, 250, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightSlateGray = new Color(119, 136, 153, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightSteelBlue = new Color(176, 196, 222, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LightYellow = new Color(255, 255, 224, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Lime = new Color(0, 255, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.LimeGreen = new Color(50, 205, 50, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Linen = new Color(250, 240, 230, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Magenta = new Color(255, 0, 255, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Maroon = new Color(128, 0, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.MediumAquamarine = new Color(102, 205, 170, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.MediumBlue = new Color(0, 0, 205, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.MediumOrchid = new Color(186, 85, 211, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.MediumPurple = new Color(147, 112, 219, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.MediumSeaGreen = new Color(60, 179, 113, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.MediumSlateBlue = new Color(123, 104, 238, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.MediumSpringGreen = new Color(0, 250, 154, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.MediumTurquoise = new Color(72, 209, 204, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.MediumVioletRed = new Color(199, 21, 133, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.MidnightBlue = new Color(25, 25, 112, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.MintCream = new Color(245, 255, 250, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.MistyRose = new Color(255, 228, 225, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Moccasin = new Color(255, 228, 181, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.NavajoWhite = new Color(255, 222, 173, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Navy = new Color(0, 0, 128, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.OldLace = new Color(253, 245, 230, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Olive = new Color(128, 128, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.OliveDrab = new Color(107, 142, 35, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Orange = new Color(255, 165, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.OrangeRed = new Color(255, 69, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Orchid = new Color(218, 112, 214, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.PaleGoldenrod = new Color(238, 232, 170, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.PaleGreen = new Color(152, 251, 152, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.PaleTurquoise = new Color(175, 238, 238, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.PaleVioletRed = new Color(219, 112, 147, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.PapayaWhip = new Color(255, 239, 213, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.PeachPuff = new Color(255, 218, 185, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Peru = new Color(205, 133, 63, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Pink = new Color(255, 192, 203, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Plum = new Color(221, 160, 221, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.PowderBlue = new Color(176, 224, 230, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Purple = new Color(128, 0, 128, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Red = new Color(255, 0, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.RosyBrown = new Color(188, 143, 143, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.RoyalBlue = new Color(65, 105, 225, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.SaddleBrown = new Color(139, 69, 19, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Salmon = new Color(250, 128, 114, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.SandyBrown = new Color(244, 164, 96, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.SeaGreen = new Color(46, 139, 87, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.SeaShell = new Color(255, 245, 238, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Sienna = new Color(160, 82, 45, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Silver = new Color(192, 192, 192, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.SkyBlue = new Color(135, 206, 235, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.SlateBlue = new Color(106, 90, 205, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.SlateGray = new Color(112, 128, 144, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Snow = new Color(255, 250, 250, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.SpringGreen = new Color(0, 255, 127, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.SteelBlue = new Color(70, 130, 180, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Tan = new Color(210, 180, 140, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Teal = new Color(0, 128, 128, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Thistle = new Color(216, 191, 216, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Tomato = new Color(255, 99, 71, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.TransparentBlack = new Color(0, 0, 0, 0);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.TransparentWhite = new Color(255, 255, 255, 0);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Turquoise = new Color(64, 224, 208, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Violet = new Color(238, 130, 238, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Wheat = new Color(245, 222, 179, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.White = new Color(255, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.WhiteSmoke = new Color(245, 245, 245, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.Yellow = new Color(255, 255, 0, 1);

/**
 * @public
 * @static
 * @member {Exo.Color}
 */
Color.YellowGreen = new Color(154, 205, 50, 1);

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @interface Shape
 * @memberof Exo
 */
var Shape = function () {
  function Shape() {
    _classCallCheck(this, Shape);
  }

  _createClass(Shape, [{
    key: 'set',


    /**
     * @public
     * @virtual
     */
    value: function set() {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     */

  }, {
    key: 'copy',
    value: function copy(shape) {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     * @returns {Exo.Vector|Exo.Circle|Exo.Rectangle|Exo.Polygon|Exo.Shape}
     */

  }, {
    key: 'clone',
    value: function clone() {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     */

  }, {
    key: 'toArray',
    value: function toArray() {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     * @returns {Exo.Rectangle}
     */

  }, {
    key: 'getBounds',
    value: function getBounds() {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     * @param {Exo.Vector|Exo.Circle|Exo.Rectangle|Exo.Polygon|Exo.Shape} shape
     * @returns {Boolean}
     */

  }, {
    key: 'contains',
    value: function contains(shape) {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     * @param {Exo.Vector|Exo.Circle|Exo.Rectangle|Exo.Polygon|Exo.Shape} shape
     * @returns {Boolean}
     */

  }, {
    key: 'intersects',
    value: function intersects(shape) {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      throw new Error('Method not implemented!');
    }
  }, {
    key: 'type',


    /**
     * @public
     * @virtual
     * @readonly
     * @member {Number}
     */
    get: function get() {
      throw new Error('Type member should be overidden!');
    }

    /**
     * @public
     * @virtual
     * @readonly
     * @member {Exo.Rectangle}
     */

  }, {
    key: 'bounds',
    get: function get() {
      return this.getBounds();
    }
  }]);

  return Shape;
}();

exports.default = Shape;

/***/ }),
/* 8 */
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
 * @memberof Exo
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
     * @returns {Exo.Matrix}
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
     * @param {Exo.Matrix} matrix
     * @returns {Exo.Matrix}
     */

  }, {
    key: "copy",
    value: function copy(matrix) {
      return this.set(matrix.a, matrix.b, matrix.x, matrix.c, matrix.d, matrix.y, matrix.e, matrix.f, matrix.z);
    }

    /**
     * @public
     * @returns {Exo.Matrix}
     */

  }, {
    key: "clone",
    value: function clone() {
      return new Matrix(this.a, this.b, this.x, this.c, this.d, this.y, this.e, this.f, this.z);
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Matrix} matrix
     * @returns {Exo.Matrix}
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

      var array = this.array;

      if (transpose) {
        array[0] = this.a;
        array[1] = this.b;
        array[2] = this.x;

        array[3] = this.c;
        array[4] = this.d;
        array[5] = this.y;

        array[6] = this.e;
        array[7] = this.f;
        array[8] = this.z;
      } else {
        array[0] = this.a;
        array[1] = this.c;
        array[2] = this.e;

        array[3] = this.b;
        array[4] = this.d;
        array[5] = this.f;

        array[6] = this.x;
        array[7] = this.y;
        array[8] = this.z;
      }

      return array;
    }

    /**
     * @public
     * @returns {Exo.Matrix}
     */

  }, {
    key: "reset",
    value: function reset() {
      return this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);
    }

    /**
     * @public
     * @returns {Exo.Matrix}
     */

  }, {
    key: "destroy",
    value: function destroy() {
      this.a = null;
      this.b = null;
      this.x = null;

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
     * @param {...Exo.Matrix} matrices
     * @returns {Exo.Matrix}
     */

  }, {
    key: "array",
    get: function get() {
      return this._array || (this._array = new Float32Array(9));
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
     * @member {Exo.Matrix}
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
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Time
 * @memberof Exo
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
   * @chainable
   * @param {Number} value
   * @returns {Exo.Time}
   */


  _createClass(Time, [{
    key: "setMilliseconds",
    value: function setMilliseconds(value) {
      this._milliseconds = value;

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} value
     * @returns {Exo.Time}
     */

  }, {
    key: "setSeconds",
    value: function setSeconds(value) {
      this._milliseconds = value * Time.Seconds;

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} value
     * @returns {Exo.Time}
     */

  }, {
    key: "setMinutes",
    value: function setMinutes(value) {
      this._milliseconds = value * Time.Minutes;

      return this;
    }

    /**
     * @public
     * @returns {Number}
     */

  }, {
    key: "asMilliseconds",
    value: function asMilliseconds() {
      return this._milliseconds;
    }

    /**
     * @public
     * @returns {Number}
     */

  }, {
    key: "asSeconds",
    value: function asSeconds() {
      return this._milliseconds / Time.Seconds;
    }

    /**
     * @public
     * @returns {Number}
     */

  }, {
    key: "asMinutes",
    value: function asMinutes() {
      return this._milliseconds / Time.Minutes;
    }

    /**
     * @public
     * @param {Exo.Time} time
     * @returns {Boolean}
     */

  }, {
    key: "equals",
    value: function equals(time) {
      return this._milliseconds === time._milliseconds;
    }

    /**
     * @public
     * @param {Exo.Time} time
     * @returns {Boolean}
     */

  }, {
    key: "greaterThan",
    value: function greaterThan(time) {
      return this._milliseconds > time._milliseconds;
    }

    /**
     * @public
     * @param {Exo.Time} time
     * @returns {Boolean}
     */

  }, {
    key: "lessThan",
    value: function lessThan(time) {
      return this._milliseconds < time._milliseconds;
    }

    /**
     * @public
     * @returns {Exo.Time}
     */

  }, {
    key: "clone",
    value: function clone() {
      return new Time(this._milliseconds);
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Time} time
     * @returns {Exo.Time}
     */

  }, {
    key: "copy",
    value: function copy(time) {
      this._milliseconds = time.asMilliseconds();

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Time} time
     * @returns {Exo.Time}
     */

  }, {
    key: "add",
    value: function add(time) {
      this._milliseconds += time.asMilliseconds();

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Time} time
     * @returns {Exo.Time}
     */

  }, {
    key: "subtract",
    value: function subtract(time) {
      this._milliseconds -= time.asMilliseconds();

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

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */

  }], [{
    key: "Milliseconds",
    get: function get() {
      return 1;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */

  }, {
    key: "Seconds",
    get: function get() {
      return 1000;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */

  }, {
    key: "Minutes",
    get: function get() {
      return 60000;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */

  }, {
    key: "Hours",
    get: function get() {
      return 3600000;
    }
  }]);

  return Time;
}();

exports.default = Time;

/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ResourceFactory2 = __webpack_require__(11);

var _ResourceFactory3 = _interopRequireDefault(_ResourceFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ArrayBufferFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
 */
var ArrayBufferFactory = function (_ResourceFactory) {
  _inherits(ArrayBufferFactory, _ResourceFactory);

  function ArrayBufferFactory() {
    _classCallCheck(this, ArrayBufferFactory);

    return _possibleConstructorReturn(this, (ArrayBufferFactory.__proto__ || Object.getPrototypeOf(ArrayBufferFactory)).apply(this, arguments));
  }

  _createClass(ArrayBufferFactory, [{
    key: 'create',


    /**
     * @override
     */
    value: function create(response, options) {
      return Promise.resolve(response.arrayBuffer());
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
/* 11 */
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
 * @memberof Exo
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
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : { method: 'GET', mode: 'cors', cache: 'default' };

      return fetch(path, options);
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

      return this.request(path, request).then(function (source) {
        return _this.create(source, options);
      });
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
/* 12 */
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
 * @memberof Exo
 */
var Playable = function () {

    /**
     * @constructor
     * @param {Audio|AudioBuffer|*} source
     */
    function Playable(source) {
        _classCallCheck(this, Playable);

        /**
         * @private
         * @member {Audio|AudioBuffer|*}
         */
        this._source = source;
    }

    /**
     * @public
     * @readonly
     * @member {Audio|AudioBuffer|*}
     */


    _createClass(Playable, [{
        key: 'connect',


        /**
         * @public
         * @abstract
         * @param {Exo.AudioManager} audioManager
         */
        value: function connect(audioManager) {}
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

            if (typeof loop !== 'undefined') {
                this.loop = loop;
            }

            if (typeof playbackRate !== 'undefined') {
                this.playbackRate = playbackRate;
            }

            if (typeof volume !== 'undefined') {
                this.volume = volume;
            }

            if (typeof time !== 'undefined') {
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
        set: function set(value) {
            this._source.volume = (0, _utils.clamp)(value, 0, 2);
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
        set: function set(value) {
            this._source.currentTime = Math.max(0, value);
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
        set: function set(value) {
            this._source.loop = !!value;
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
        set: function set(value) {
            this._source.playbackRate = Math.max(0, value);
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
        set: function set(value) {
            if (value) {
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
        set: function set(value) {
            if (value) {
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
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @interface ParticleModifier
 * @memberof Exo
 */
var ParticleModifier = function () {
  function ParticleModifier() {
    _classCallCheck(this, ParticleModifier);
  }

  _createClass(ParticleModifier, [{
    key: "apply",


    /**
     * @public
     * @param {Exo.Particle} particle
     * @param {Exo.Time} delta
     */
    value: function apply(particle, delta) {
      // do nothing
    }
  }]);

  return ParticleModifier;
}();

exports.default = ParticleModifier;

/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @interface Animation
 * @memberof Exo
 */
var Animation = function () {
  function Animation() {
    _classCallCheck(this, Animation);
  }

  _createClass(Animation, [{
    key: "apply",


    /**
     * @public
     * @virtual
     * @param {*} animated
     * @param {Number} progress
     */
    value: function apply(animated, progress) {
      // do nothing
    }
  }]);

  return Animation;
}();

exports.default = Animation;

/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Vector2 = __webpack_require__(2);

var _Vector3 = _interopRequireDefault(_Vector2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ObservableVector
 * @memberof Exo
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
        value: function set(x, y) {
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
        value: function add(x, y) {
            this._x += typeof x === 'number' ? x : 0;
            this._y += typeof y === 'number' ? y : 0;
            this._callback.call(this._scope);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'subtract',
        value: function subtract(x, y) {
            this._x -= typeof x === 'number' ? x : 0;
            this._y -= typeof y === 'number' ? y : 0;
            this._callback.call(this._scope);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'multiply',
        value: function multiply(x, y) {
            this._x *= typeof x === 'number' ? x : 1;
            this._y *= typeof y === 'number' ? y : 1;
            this._callback.call(this._scope);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'divide',
        value: function divide(x, y) {
            this._x /= typeof x === 'number' ? x : 1;
            this._y /= typeof y === 'number' ? y : 1;
            this._callback.call(this._scope);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'normalize',
        value: function normalize() {
            var mag = this.magnitude;

            this._x /= mag;
            this._y /= mag;

            this._callback.call(this._scope);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(vector) {
            if (this._x !== vector.x || this._y !== vector.y) {
                this._x = vector.x;
                this._y = vector.y;
                this._callback.call(this._scope);
            }

            return this;
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
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._x = null;
            this._y = null;
            this._callback = null;
            this._scope = null;
        }
    }, {
        key: 'x',
        get: function get() {
            return this._x;
        },
        set: function set(value) {
            if (this._x !== value) {
                this._x = value;
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
        set: function set(value) {
            if (this._y !== value) {
                this._y = value;
                this._callback.call(this._scope);
            }
        }
    }]);

    return ObservableVector;
}(_Vector3.default);

exports.default = ObservableVector;

/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Time = __webpack_require__(9);

var _Time2 = _interopRequireDefault(_Time);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Clock
 * @memberof Exo
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
     * @member {Exo.Time}
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
     * @returns {Exo.Clock}
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
     * @returns {Exo.Clock}
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
     * @returns {Exo.Clock}
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
     * @returns {Exo.Clock}
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
     * @returns {Exo.Time}
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
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Renderer
 * @memberof Exo
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
    }

    /**
     * @public
     * @param {WebGLRenderingContext} gl
     */


    _createClass(Renderer, [{
        key: "setContext",
        value: function setContext(gl) {
            if (this._context) {
                return;
            }

            this._context = gl;
            this._indexBuffer = gl.createBuffer();
            this._vertexBuffer = gl.createBuffer();
        }

        /**
         * @public
         * @param {Number} length
         * @returns {Uint16Array}
         */

    }, {
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

        /**
         * @public
         */

    }, {
        key: "start",
        value: function start() {}
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
        key: "stop",
        value: function stop() {
            this.flush();
        }

        /**
         * @public
         */

    }, {
        key: "destroy",
        value: function destroy() {
            this._context = null;
            this._indexBuffer = null;
            this._vertexBuffer = null;
        }
    }]);

    return Renderer;
}();

exports.default = Renderer;

/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ShaderAttribute = __webpack_require__(33);

var _ShaderAttribute2 = _interopRequireDefault(_ShaderAttribute);

var _ShaderUniform = __webpack_require__(34);

var _ShaderUniform2 = _interopRequireDefault(_ShaderUniform);

var _WebGLTexture = __webpack_require__(35);

var _WebGLTexture2 = _interopRequireDefault(_WebGLTexture);

var _Matrix = __webpack_require__(8);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _const = __webpack_require__(0);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Shader
 * @memberof Exo
 */
var Shader = function () {

    /**
     * @constructor
     * @param {?String} vertexSource
     * @param {?String} fragmentSource
     */
    function Shader() {
        var vertexSource = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
        var fragmentSource = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

        _classCallCheck(this, Shader);

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
         * @member {?String}
         */
        this._vertexSource = vertexSource;

        /**
         * @private
         * @member {?String}
         */
        this._fragmentSource = fragmentSource;

        /**
         * @private
         * @member {Map<String, Exo.ShaderUniform>}
         */
        this._uniforms = new Map();

        /**
         * @private
         * @member {Map<String, Exo.ShaderAttribute>}
         */
        this._attributes = new Map();

        /**
         * @private
         * @member {Boolean}
         */
        this._inUse = false;

        /**
         * @private
         * @member {Number}
         */
        this._currentTextureUnit = -1;
    }

    /**
     * @public
     * @readonly
     * @member {?WebGLProgram}
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
            this._program = this.compileProgram();
        }

        /**
         * @public
         * @returns {WebGLProgram}
         */

    }, {
        key: 'compileProgram',
        value: function compileProgram() {
            var gl = this._context,
                vertexShader = this.compileShader(this._vertexSource, gl.VERTEX_SHADER),
                fragmentShader = this.compileShader(this._fragmentSource, gl.FRAGMENT_SHADER),
                program = gl.createProgram();

            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);

            gl.linkProgram(program);

            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                gl.deleteProgram(program);

                throw new Error('Error: Could not initialize shader.', gl.getError());
            }

            return program;
        }

        /**
         * @public
         * @param {String|Array} source
         * @param {Number} shaderType
         * @returns {WebGLShader}
         */

    }, {
        key: 'compileShader',
        value: function compileShader(source, shaderType) {
            if (!source) {
                throw new Error('Vertex or Fragment source need to be set first!');
            }

            var gl = this._context,
                shader = gl.createShader(shaderType);

            gl.shaderSource(shader, source instanceof Array ? source.join('\n') : source);
            gl.compileShader(shader);

            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(['SHADER COMPILE ERROR:', '- LOG -', gl.getShaderInfoLog(shader), '- SOURCE -', source].join('\n\n'));
            }

            return shader;
        }

        /**
         * @public
         */

    }, {
        key: 'bind',
        value: function bind() {
            this._context.useProgram(this._program);
            this._inUse = true;

            this.syncAttributes();
            this.syncUniforms();
        }

        /**
         * @public
         * @param {String} name
         * @param {Boolean} [active=true]
         */

    }, {
        key: 'addAttribute',
        value: function addAttribute(name) {
            var active = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

            if (this._attributes.has(name)) {
                throw new Error('Attribute "' + name + '" was already added.');
            }

            this._attributes.set(name, new _ShaderAttribute2.default(name, active));
        }

        /**
         * @public
         * @param {String} name
         * @returns {Exo.ShaderAttribute}
         */

    }, {
        key: 'getAttribute',
        value: function getAttribute(name) {
            if (!this._attributes.has(name)) {
                throw new Error('Attribute "' + name + '" is missing.');
            }

            return this._attributes.get(name);
        }

        /**
         * @public
         * @param {String} name
         */

    }, {
        key: 'removeAttribute',
        value: function removeAttribute(name) {
            if (this._attributes.has(name)) {
                this._attributes.get(name).destroy();
                this._attributes.delete(name);
            }
        }

        /**
         * @public
         */

    }, {
        key: 'syncAttributes',
        value: function syncAttributes() {
            var gl = this._context;

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._attributes[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var _ref = _step.value;

                    var _ref2 = _slicedToArray(_ref, 2);

                    var name = _ref2[0];
                    var attribute = _ref2[1];

                    if (attribute.location === null) {
                        attribute.location = gl.getAttribLocation(this._program, name);
                    }

                    if (attribute.active) {
                        gl.enableVertexAttribArray(attribute.location);
                    } else {
                        gl.disableVertexAttribArray(attribute.location);
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
         * @param {String} name
         * @param {Number} type
         */

    }, {
        key: 'addUniform',
        value: function addUniform(name, type) {
            if (this._uniforms.has(name)) {
                throw new Error('Uniform "' + name + '" was already added.');
            }

            this._uniforms.set(name, new _ShaderUniform2.default(name, type));
        }

        /**
         * @public
         * @param {String} name
         * @returns {Exo.ShaderUniform}
         */

    }, {
        key: 'getUniform',
        value: function getUniform(name) {
            if (!this._uniforms.has(name)) {
                throw new Error('Uniform "' + name + '" is missing.');
            }

            return this._uniforms.get(name);
        }

        /**
         * @public
         * @param {String} name
         * @param {Number|Number[]|Exo.Vector|Exo.Matrix|Exo.Texture} value
         * @param {Number} [textureUnit]
         */

    }, {
        key: 'setUniformValue',
        value: function setUniformValue(name, value, textureUnit) {
            var uniform = this.getUniform(name);

            uniform.value = value;

            if (typeof textureUnit === 'number') {
                uniform.textureUnit = textureUnit;
            }

            if (this._inUse) {
                this._uploadUniform(uniform);
            }
        }

        /**
         * @public
         * @param {String} name
         */

    }, {
        key: 'removeUniform',
        value: function removeUniform(name) {
            if (this._uniforms.has(name)) {
                this._uniforms.get(name).destroy();
                this._uniforms.delete(name);
            }
        }

        /**
         * @public
         */

    }, {
        key: 'syncUniforms',
        value: function syncUniforms() {
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this._uniforms.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var uniform = _step2.value;

                    this._uploadUniform(uniform);
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
         * @param {String} name
         * @param {Number} number
         */

    }, {
        key: 'setUniformNumber',
        value: function setUniformNumber(name, number) {
            this.setUniformValue(name, number);
        }

        /**
         * @public
         * @param {String} name
         * @param {Exo.Vector|Number[]} vector
         */

    }, {
        key: 'setUniformVector',
        value: function setUniformVector(name, vector) {
            this.setUniformValue(name, vector);
        }

        /**
         * @public
         * @param {String} name
         * @param {Exo.Color} color
         */

    }, {
        key: 'setUniformColor',
        value: function setUniformColor(name, color) {
            this.setUniformValue(name, color.toArray(true));
        }

        /**
         * @public
         * @param {String} name
         * @param {Exo.Matrix|Array} matrix
         * @param {Boolean} [transpose=false]
         */

    }, {
        key: 'setUniformMatrix',
        value: function setUniformMatrix(name, matrix) {
            var transpose = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

            this.setUniformValue(name, matrix instanceof _Matrix2.default ? matrix.toArray(transpose) : matrix);
        }

        /**
         * @public
         * @param {String} name
         * @param {Exo.Texture} texture
         * @param {Number} [textureUnit=0]
         */

    }, {
        key: 'setUniformTexture',
        value: function setUniformTexture(name, texture) {
            var textureUnit = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

            this.setUniformValue(name, texture, textureUnit);
        }

        /**
         * @public
         * @param {Exo.Matrix} matrix
         */

    }, {
        key: 'setProjection',
        value: function setProjection(matrix) {
            this.setUniformValue('projectionMatrix', matrix.toArray());
        }

        /**
         * @public
         * @param {HTMLImageElement|HTMLCanvasElement} source
         * @param {Number} [scaleMode=SCALE_MODE.NEAREST]
         * @param {Number} [wrapMode=WRAP_MODE.CLAMP_TO_EDGE]
         * @returns {WebGLTexture}
         */

    }, {
        key: 'createWebGLTexture',
        value: function createWebGLTexture(source) {
            var scaleMode = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _const.SCALE_MODE.NEAREST;
            var wrapMode = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : _const.WRAP_MODE.CLAMP_TO_EDGE;

            var gl = this._context,
                wrap = (0, _utils.getWrapModeEnum)(gl, wrapMode),
                scale = (0, _utils.getScaleModeEnum)(gl, scaleMode),
                texture = gl.createTexture();

            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, scale);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, scale);

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);

            gl.bindTexture(gl.TEXTURE_2D, null);

            return texture;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {
                for (var _iterator3 = this._uniforms.keys()[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                    var name = _step3.value;

                    this.removeUniform(name);
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

            this._uniforms.clear();
            this._uniforms = null;

            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
                for (var _iterator4 = this._attributes.keys()[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                    var _name = _step4.value;

                    this.removeAttribute(_name);
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

            this._attributes.clear();
            this._attributes = null;

            if (this._program) {
                this._context.deleteProgram(this._program);
                this._program = null;
            }

            this._context = null;
            this._vertexSource = null;
            this._fragmentSource = null;
        }

        /**
         * Not the best looking method, but it does its job
         *
         * @private
         * @param {Object} value
         * @returns {Number}
         */

    }, {
        key: '_getLength',
        value: function _getLength(value) {
            var len = 0;

            if (value instanceof Array) {
                return value.length;
            }

            if (typeof value.x === 'number') {
                len++;

                if (typeof value.y === 'number') {
                    len++;

                    if (typeof value.z === 'number') {
                        len++;

                        if (typeof value.w === 'number') {
                            len++;
                        }
                    }
                }
            }

            return len;
        }

        /**
         * @private
         * @param {Exo.ShaderUniform} uniform
         */

    }, {
        key: '_uploadUniform',
        value: function _uploadUniform(uniform) {
            var gl = this._context,
                location = uniform.location || (uniform.location = gl.getUniformLocation(this._program, uniform.name)),
                value = uniform.value;

            var textureUnit = void 0;

            if (!uniform.dirty) {
                return;
            }

            switch (uniform.type) {
                case _const.UNIFORM_TYPE.INT:
                    gl.uniform1i(location, value);

                    return;

                case _const.UNIFORM_TYPE.FLOAT:
                    gl.uniform1f(location, value);

                    return;

                case _const.UNIFORM_TYPE.VECTOR:
                    if (value instanceof Array) {
                        switch (this._getLength(value)) {
                            case 1:
                                gl.uniform1fv(location, value);

                                return;
                            case 2:
                                gl.uniform2fv(location, value);

                                return;
                            case 3:
                                gl.uniform3fv(location, value);

                                return;
                            case 4:
                                gl.uniform4fv(location, value);

                                return;
                        }

                        return;
                    }

                    switch (this._getLength(value)) {
                        case 1:
                            gl.uniform1f(location, value);

                            return;
                        case 2:
                            gl.uniform2f(location, value.x, value.y);

                            return;
                        case 3:
                            gl.uniform3f(location, value.x, value.y, value.z);

                            return;
                        case 4:
                            gl.uniform4f(location, value.x, value.y, value.z, value.w);

                            return;
                    }

                    return;
                case _const.UNIFORM_TYPE.VECTOR_INT:
                    if (value instanceof Array) {
                        switch (this._getLength(value)) {
                            case 1:
                                gl.uniform1iv(location, value);

                                return;
                            case 2:
                                gl.uniform2iv(location, value);

                                return;
                            case 3:
                                gl.uniform3iv(location, value);

                                return;
                            case 4:
                                gl.uniform4iv(location, value);

                                return;
                        }

                        return;
                    }

                    switch (this._getLength(value)) {
                        case 1:
                            gl.uniform1i(location, value);

                            return;
                        case 2:
                            gl.uniform2i(location, value.x, value.y);

                            return;
                        case 3:
                            gl.uniform3i(location, value.x, value.y, value.z);

                            return;
                        case 4:
                            gl.uniform4i(location, value.x, value.y, value.z, value.w);

                            return;
                    }

                    return;

                case _const.UNIFORM_TYPE.MATRIX:
                    switch (value.length) {
                        case 4:
                            gl.uniformMatrix2fv(location, false, value);

                            return;
                        case 9:
                            gl.uniformMatrix3fv(location, false, value);

                            return;
                        case 16:
                            gl.uniformMatrix4fv(location, false, value);

                            return;
                    }

                    return;

                case _const.UNIFORM_TYPE.TEXTURE:
                    textureUnit = uniform.textureUnit;

                    if (textureUnit !== this._currentTextureUnit) {
                        gl.activeTexture(gl['TEXTURE' + textureUnit]);
                        this._currentTextureUnit = textureUnit;
                    }

                    if (uniform.textureUnitChanged) {
                        gl.uniform1i(location, textureUnit);
                        uniform.textureUnitChanged = false;
                    }

                    if (!value.webGLTexture) {
                        value.webGLTexture = this.createWebGLTexture(value.source, value.scaleMode, value.wrapMode);
                    }

                    gl.bindTexture(gl.TEXTURE_2D, value.webGLTexture);

                    return;

                case _const.UNIFORM_TYPE:
                    textureUnit = uniform.textureUnit;

                    if (textureUnit !== this._currentTextureUnit) {
                        gl.activeTexture(gl.TEXTURE0 + textureUnit);
                        this._currentTextureUnit = textureUnit;
                    }

                    if (uniform.textureUnitChanged) {
                        gl.uniform1i(location, textureUnit);
                        uniform.textureUnitChanged = false;
                    }

                    if (!value.webGLTexture) {
                        value.webGLTexture = new _WebGLTexture2.default(gl);
                        value.webGLTexture.setSource(value.source);
                        value.webGLTexture.setScaleMode(value.scaleMode);
                        value.webGLTexture.setWrapMode(value.wrapMode);
                        value.webGLTexture.unbind();
                    }

                    value.webGLTexture.bind();

                    return;

                default:
                    throw new Error('Wrong Uniform Type set! Uniform: ' + uniform.name);
            }
        }
    }, {
        key: 'program',
        get: function get() {
            return this._program;
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'inUse',
        get: function get() {
            return this._inUse;
        },
        set: function set(value) {
            this._inUse = !!value;
        }

        /**
         * @public
         * @member {String} value
         */

    }, {
        key: 'vertexSource',
        get: function get() {
            return this._vertexSource;
        },
        set: function set(value) {
            this._vertexSource = Array.isArray(value) ? value.join('\n') : value;
        }

        /**
         * @public
         * @member {String} value
         */

    }, {
        key: 'fragmentSource',
        get: function get() {
            return this._fragmentSource;
        },
        set: function set(value) {
            this._fragmentSource = Array.isArray(value) ? value.join('\n') : value;
        }
    }]);

    return Shader;
}();

exports.default = Shader;

/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ChannelHandler2 = __webpack_require__(4);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _GamepadDefaultMapping = __webpack_require__(44);

var _GamepadDefaultMapping2 = _interopRequireDefault(_GamepadDefaultMapping);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Gamepad
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
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
     * @member {Exo.GamepadMapping}
     */
    _this._mapping = new _GamepadDefaultMapping2.default();
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
      if (!this.active) {
        return;
      }

      var channels = this.channels,
          buttonMapping = this._mapping.buttons,
          axesMapping = this._mapping.axes,
          buttons = this._gamepad.buttons,
          axes = this._gamepad.axes;

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = buttonMapping[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var button = _step.value;

          if (button.index in buttons) {
            channels[button.keyCode] = button.transformValue(buttons[button.index]);
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

          if (axis.index in axes) {
            channels[axis.keyCode] = axis.transformValue(axes[axis.index]);
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
     * @member {Exo.GamepadMapping}
     */

  }, {
    key: 'mapping',
    get: function get() {
      return this._mapping;
    },
    set: function set(value) {
      this._mapping = value;
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

      return _const.CHANNEL_OFFSET.GAMEPAD + index * _const.CHANNEL_LENGTH.CHILD + (key & 31);
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
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ArrayBufferFactory2 = __webpack_require__(10);

var _ArrayBufferFactory3 = _interopRequireDefault(_ArrayBufferFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class BlobFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
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
    value: function create(response) {
      var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          _ref$mimeType = _ref.mimeType,
          mimeType = _ref$mimeType === undefined ? 'text/plain' : _ref$mimeType;

      return _get(BlobFactory.prototype.__proto__ || Object.getPrototypeOf(BlobFactory.prototype), 'create', this).call(this, response, null).then(function (arrayBuffer) {
        return new Blob([arrayBuffer], { type: mimeType });
      });
    }
  }]);

  return BlobFactory;
}(_ArrayBufferFactory3.default);

exports.default = BlobFactory;

/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Texture
 * @memberof Exo
 */
var Texture = function () {

    /**
     * @constructor
     * @param {?HTMLImageElement|?HTMLCanvasElement} [source=null]
     * @param {Number} [scaleMode=SCALE_MODE.NEAREST]
     * @param {Number} [wrapMode=WRAP_MODE.CLAMP_TO_EDGE]
     */
    function Texture() {
        var source = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
        var scaleMode = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _const.SCALE_MODE.NEAREST;
        var wrapMode = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : _const.WRAP_MODE.CLAMP_TO_EDGE;

        _classCallCheck(this, Texture);

        /**
         * @private
         * @member {?HTMLImageElement|?HTMLCanvasElement}
         */
        this._source = source;

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._size = source ? new _Vector2.default(source.width, source.height) : new _Vector2.default();

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
         * @member {?WebGLTexture}
         */
        this._webGLTexture = null;
    }

    /**
     * @public
     * @member {HTMLImageElement|HTMLCanvasElement}
     */


    _createClass(Texture, [{
        key: 'destroy',


        /**
         * @public
         */
        value: function destroy() {
            this._webGLTexture = null;
            this._source = null;
            this._size = null;
        }
    }, {
        key: 'source',
        get: function get() {
            return this._source;
        },
        set: function set(value) {
            this._source = value;
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
        set: function set(value) {
            this._size.x = value;
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
        set: function set(value) {
            this._size.y = value;
        }

        /**
         * @public
         * @member {Exo.Vector}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(value) {
            this._size.copy(value);
        }

        /**
         * @public
         * @member {?WebGLTexture}
         */

    }, {
        key: 'webGLTexture',
        get: function get() {
            return this._webGLTexture;
        },
        set: function set(value) {
            this._webGLTexture = value;
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
        set: function set(value) {
            this._scaleMode = value;
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
        set: function set(value) {
            this._wrapMode = value;
        }
    }]);

    return Texture;
}();

exports.default = Texture;

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderable2 = __webpack_require__(23);

var _Renderable3 = _interopRequireDefault(_Renderable2);

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Color = __webpack_require__(6);

var _Color2 = _interopRequireDefault(_Color);

var _ObservableVector = __webpack_require__(15);

var _ObservableVector2 = _interopRequireDefault(_ObservableVector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Sprite
 * @extends {Exo.Renderable}
 * @memberof Exo
 */
var Sprite = function (_Renderable) {
    _inherits(Sprite, _Renderable);

    /**
     * @constructor
     * @param {?Exo.Texture|?HTMLImageElement|?HTMLCanvasElement} texture
     */
    function Sprite(texture) {
        _classCallCheck(this, Sprite);

        /**
         * @private
         * @member {?Exo.Texture}
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
         * @member {Exo.Rectangle}
         */
        _this._textureRect = new _Rectangle2.default();

        /**
         * @private
         * @member {Exo.Vector}
         */
        _this._size = new _ObservableVector2.default(_this._updatePositions, _this);

        /**
         * @private
         * @member {Exo.Color}
         */
        _this._tint = _Color2.default.White.clone();

        if (texture) {
            _this.texture = texture;
        }
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */


    _createClass(Sprite, [{
        key: 'setTextureRect',


        /**
         * @public
         * @param {Exo.Rectangle} rectangle
         * @param {Boolean} [keepSize]
         */
        value: function setTextureRect(rectangle, keepSize) {
            this._textureRect.copy(rectangle);

            if (!keepSize) {
                this._size.set(rectangle.width, rectangle.height);
            }

            this._updatePositions();
            this._updateTexCoords();
        }

        /**
         * @override
         * @returns {Exo.Rectangle}
         */

    }, {
        key: 'getLocalBounds',
        value: function getLocalBounds() {
            return new _Rectangle2.default(0, 0, this.width, this.height);
        }

        /**
         * @public
         * @param {Number} x
         * @param {Number} y
         * @param {Boolean} [absolute=false]
         */

    }, {
        key: 'setOrigin',
        value: function setOrigin(x, y) {
            var absolute = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

            var bounds = this.getLocalBounds(),
                origin = this._origin;

            this._dirtyTransform = true;

            if (absolute) {
                origin.x = x;
                origin.y = y;

                return;
            }

            origin.x = x * bounds.width;
            origin.y = y * bounds.height;
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
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager, parentTransform) {
            if (!this.visible) {
                return;
            }

            this._worldTransform.copy(parentTransform);
            this._worldTransform.multiply(this.transform);

            displayManager.setCurrentRenderer('sprite');
            displayManager.getCurrentRenderer().render(this);
        }

        /**
         * @override
         * @param {Boolean} [destroyTexture]
         */

    }, {
        key: 'destroy',
        value: function destroy(destroyTexture) {
            _get(Sprite.prototype.__proto__ || Object.getPrototypeOf(Sprite.prototype), 'destroy', this).call(this);

            if (destroyTexture && this._texture) {
                this._texture.destroy();
            }

            this._vertexData.fill(0);
            this._vertexData = null;

            this._texture = null;
            this._textureRect = null;
            this._size = null;
        }

        /**
         * @private
         */

    }, {
        key: '_updatePositions',
        value: function _updatePositions() {
            var vertexData = this._vertexData,
                bounds = this.getLocalBounds();

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
        key: 'vertexData',
        get: function get() {
            return this._vertexData;
        }

        /**
         * @public
         * @member {Exo.Vector}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(value) {
            this._size.copy(value);
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
        set: function set(value) {
            this._size.x = value;
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
        set: function set(value) {
            this._size.y = value;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'top',
        get: function get() {
            return this.y - (this.height - this._origin.y);
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'bottom',
        get: function get() {
            return this.y + (this.height - this._origin.y);
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'left',
        get: function get() {
            return this.x - this.width * this._origin.x;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'right',
        get: function get() {
            return this.x + this.width * (1 - this._origin.x);
        }

        /**
         * @public
         * @member {Exo.Texture}
         */

    }, {
        key: 'texture',
        get: function get() {
            return this._texture;
        },
        set: function set(value) {
            this._texture = value;

            this.setTextureRect(new _Rectangle2.default(0, 0, this._texture.width, this._texture.height));
        }

        /**
         * @public
         * @member {Exo.Rectangle}
         */

    }, {
        key: 'textureRect',
        get: function get() {
            return this._textureRect;
        },
        set: function set(value) {
            this.setTextureRect(value);
        }

        /**
         * @public
         * @member {Exo.Color}
         */

    }, {
        key: 'tint',
        get: function get() {
            return this._tint;
        },
        set: function set(value) {
            this._tint.copy(value);
        }
    }]);

    return Sprite;
}(_Renderable3.default);

exports.default = Sprite;

/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Transformable2 = __webpack_require__(24);

var _Transformable3 = _interopRequireDefault(_Transformable2);

var _Matrix = __webpack_require__(8);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Renderable
 * @extends {Exo.Transformable}
 * @memberof Exo
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
     * @member {Exo.Matrix}
     */
    var _this = _possibleConstructorReturn(this, (Renderable.__proto__ || Object.getPrototypeOf(Renderable)).call(this));

    _this._worldTransform = new _Matrix2.default();

    /**
     * @private
     * @member {Boolean}
     */
    _this._visible = true;

    /**
     * @private
     * @member {?Exo.Renderable}
     */
    _this._parent = null;
    return _this;
  }

  /**
   * @public
   * @member {Exo.Matrix}
   */


  _createClass(Renderable, [{
    key: 'getBounds',


    /**
     * @public
     * @returns {Exo.Rectangle}
     */
    value: function getBounds() {
      return this.getLocalBounds();
    }

    /**
     * @public
     * @returns {Exo.Rectangle}
     */

  }, {
    key: 'getLocalBounds',
    value: function getLocalBounds() {
      return _Rectangle2.default.Empty;
    }

    /**
     * @public
     * @virtual
     * @param {Exo.DisplayManager} renderManager
     * @param {Exo.Matrix} worldTransform
     */

  }, {
    key: 'render',
    value: function render(renderManager, worldTransform) {}
    // do nothing


    /**
     * @override
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      _get(Renderable.prototype.__proto__ || Object.getPrototypeOf(Renderable.prototype), 'destroy', this).call(this);

      this._worldTransform = null;
      this._visible = false;
      this._parent = null;
    }
  }, {
    key: 'worldTransform',
    get: function get() {
      return this._worldTransform;
    },
    set: function set(value) {
      this._worldTransform.copy(value);
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
    set: function set(value) {
      this._visible = value;
    }

    /**
     * @public
     * @member {?Exo.Renderable}
     */

  }, {
    key: 'parent',
    get: function get() {
      return this._parent;
    },
    set: function set(value) {
      this._parent = value;
    }
  }]);

  return Renderable;
}(_Transformable3.default);

exports.default = Renderable;

/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(5);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _ObservableVector = __webpack_require__(15);

var _ObservableVector2 = _interopRequireDefault(_ObservableVector);

var _Matrix = __webpack_require__(8);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Transformable
 * @extends {Exo.EventEmitter}
 * @memberof Exo
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
         * @member {Exo.Matrix}
         */
        var _this = _possibleConstructorReturn(this, (Transformable.__proto__ || Object.getPrototypeOf(Transformable)).call(this));

        _this._transform = new _Matrix2.default();

        /**
         * @private
         * @member {Exo.ObservableVector}
         */
        _this._position = new _ObservableVector2.default(_this._setDirty, _this);

        /**
         * @private
         * @member {Exo.ObservableVector}
         */
        _this._scale = new _ObservableVector2.default(_this._setDirty, _this, 1, 1);

        /**
         * @private
         * @member {Exo.ObservableVector}
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
         * @param {Number} x
         * @param {Number} y
         */
        value: function setPosition(x, y) {
            this._position.set(x, y);
        }

        /**
         * @public
         * @param {Number} x
         * @param {Number} y
         */

    }, {
        key: 'setScale',
        value: function setScale(x, y) {
            this._scale.set(x, y);
        }

        /**
         * @public
         * @param {Number} x
         * @param {Number} y
         */

    }, {
        key: 'setOrigin',
        value: function setOrigin(x, y) {
            this._origin.set(x, y);
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
         * @param {Number} x
         * @param {Number} y
         */

    }, {
        key: 'move',
        value: function move(x, y) {
            this.setPosition(this.x + x, this.y + y);
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
        set: function set(value) {
            this._position.x = value;
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
        set: function set(value) {
            this._position.y = value;
        }

        /**
         * @public
         * @member {Exo.Vector}
         */

    }, {
        key: 'position',
        get: function get() {
            return this._position;
        },
        set: function set(value) {
            this._position.copy(value);
        }

        /**
         * @public
         * @member {Exo.Vector}
         */

    }, {
        key: 'scale',
        get: function get() {
            return this._scale;
        },
        set: function set(value) {
            this._scale.copy(value);
        }

        /**
         * @public
         * @member {Exo.Vector}
         */

    }, {
        key: 'origin',
        get: function get() {
            return this._origin;
        },
        set: function set(value) {
            this._origin.copy(value);
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
        set: function set(value) {
            this.setRotation(value);
        }

        /**
         * @public
         * @member {Exo.Matrix}
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
        set: function set(value) {
            this._transform.copy(value);
        }
    }]);

    return Transformable;
}(_EventEmitter3.default);

exports.default = Transformable;

/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class RC4
 * @memberof Exo
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
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Color = __webpack_require__(6);

var _Color2 = _interopRequireDefault(_Color);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Config
 * @memberof Exo
 */
var Config = function () {

  /**
   * @constructor
   * @param {Object} settings
   */
  function Config(settings) {
    _classCallCheck(this, Config);

    var config = Object.assign({
      basepath: '',
      width: 800,
      height: 600,
      soundVolume: 1.0,
      musicVolume: 1.0,
      masterVolume: 1.0,
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
    }, settings);

    /**
     * @private
     * @member {String}
     */
    this._basePath = config.basePath;

    /**
     * @private
     * @member {Number}
     */
    this._width = config.width;

    /**
     * @private
     * @member {Number}
     */
    this._height = config.height;

    /**
     * @private
     * @member {Number}
     */
    this._soundVolume = config.soundVolume;

    /**
     * @private
     * @member {Number}
     */
    this._musicVolume = config.musicVolume;

    /**
     * @private
     * @member {Number}
     */
    this._masterVolume = config.masterVolume;

    /**
     * @private
     * @member {HTMLElement}
     */
    this._canvasParent = typeof config.canvasParent === 'string' ? document.querySelector(config.canvasParent) : config.canvasParent;

    /**
     * @private
     * @member {HTMLCanvasElement}
     */
    this._canvas = typeof config.canvas === 'string' ? document.querySelector(config.canvas) : config.canvas;

    /**
     * @private
     * @member {Exo.Color}
     */
    this._clearColor = config.clearColor;

    /**
     * @private
     * @member {Boolean}
     */
    this._clearBeforeRender = config.clearBeforeRender;

    /**
     * @private
     * @member {Object}
     */
    this._contextOptions = config.contextOptions;
  }

  /**
   * @public
   * @readonly
   * @member {String}
   */


  _createClass(Config, [{
    key: 'destroy',


    /**
     * @public
     */
    value: function destroy() {
      this._width = null;
      this._height = null;
      this._soundVolume = null;
      this._musicVolume = null;
      this._masterVolume = null;
      this._canvasParent = null;
      this._canvas = null;
      this._clearColor = null;
      this._contextOptions = null;
    }
  }, {
    key: 'basePath',
    get: function get() {
      return this._basePath;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */

  }, {
    key: 'width',
    get: function get() {
      return this._width;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */

  }, {
    key: 'height',
    get: function get() {
      return this._height;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */

  }, {
    key: 'soundVolume',
    get: function get() {
      return this._soundVolume;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */

  }, {
    key: 'musicVolume',
    get: function get() {
      return this._musicVolume;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */

  }, {
    key: 'masterVolume',
    get: function get() {
      return this._masterVolume;
    }

    /**
     * @public
     * @readonly
     * @member {HTMLElement}
     */

  }, {
    key: 'canvasParent',
    get: function get() {
      return this._canvasParent;
    }

    /**
     * @public
     * @readonly
     * @member {HTMLCanvasElement}
     */

  }, {
    key: 'canvas',
    get: function get() {
      return this._canvas;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Color}
     */

  }, {
    key: 'clearColor',
    get: function get() {
      return this._clearColor;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */

  }, {
    key: 'clearBeforeRender',
    get: function get() {
      return this._clearBeforeRender;
    }

    /**
     * @public
     * @readonly
     * @member {Object}
     */

  }, {
    key: 'contextOptions',
    get: function get() {
      return this._contextOptions;
    }
  }]);

  return Config;
}();

exports.default = Config;

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
 * @memberof Exo
 */
var SceneManager = function () {

    /**
     * @constructor
     * @param {Exo.Game} game
     */
    function SceneManager(game) {
        _classCallCheck(this, SceneManager);

        /**
         * @private
         * @member {Exo.Game}
         */
        this._game = game;

        /**
         * @private
         * @member {?Exo.Scene}
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
     * @param {Exo.Time} delta
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
         * @param {Exo.Scene} scene
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

var _ParticleRenderer = __webpack_require__(36);

var _ParticleRenderer2 = _interopRequireDefault(_ParticleRenderer);

var _Matrix = __webpack_require__(8);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _utils = __webpack_require__(1);

var _const = __webpack_require__(0);

var _BlendMode = __webpack_require__(38);

var _BlendMode2 = _interopRequireDefault(_BlendMode);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class DisplayManager
 * @memberof Exo
 */
var DisplayManager = function () {

    /**
     * @constructor
     * @param {Exo.Game} game
     */
    function DisplayManager(game) {
        _classCallCheck(this, DisplayManager);

        var config = game.config;

        if (!_utils.webGLSupported) {
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
        this._context = this._createContext(config.contextOptions);

        if (!this._context) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        /**
         * @private
         * @member {Exo.Color}
         */
        this._clearColor = config.clearColor.clone();

        /**
         * @private
         * @member {Boolean}
         */
        this._clearBeforeRender = config.clearBeforeRender;

        /**
         * @private
         * @member {Boolean}
         */
        this._isDrawing = false;

        /**
         * @private
         * @member {Map<String, Exo.Renderer>}
         */
        this._renderers = new Map();

        /**
         * @private
         * @member {?Exo.Renderer}
         */
        this._currentRenderer = null;

        /**
         * @private
         * @member {Exo.Matrix}
         */
        this._worldTransform = new _Matrix2.default();

        /**
         * @private
         * @member {Boolean}
         */
        this._contextLost = false;

        /**
         * @private
         * @member {Exo.RenderTarget}
         */
        this._rootRenderTarget = new _RenderTarget2.default(config.width, config.height, true);

        /**
         * @private
         * @member {?Exo.RenderTarget}
         */
        this._renderTarget = null;

        /**
         * @private
         * @member {Map<Number, Exo.BlendMode>}
         */
        this._blendModes = this._createBlendModes(this._context);

        /**
         * @private
         * @member {?Number}
         */
        this._currentBlendMode = null;

        /**
         * @private
         * @member {?Exo.Shader}
         */
        this._shader = null;

        /**
         * @private
         * @member {Exo.Matrix}
         */
        this._projection = new _Matrix2.default();

        this._addEvents();
        this._setGLFlags();

        this.setBlendMode(_const.BLEND_MODE.SOURCE_OVER);
        this.setClearColor(this._clearColor);
        this.setRenderTarget(this._rootRenderTarget);

        this.addRenderer('sprite', new _SpriteRenderer2.default());
        this.addRenderer('particle', new _ParticleRenderer2.default());
        this.setCurrentRenderer('sprite');

        this.resize(config.width, config.height);

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
         * @param {Exo.Renderer} renderer
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
         * @returns {Exo.Renderer}
         */

    }, {
        key: 'getRenderer',
        value: function getRenderer(name) {
            if (!this._renderers.has(name)) {
                throw new Error('Could not find renderer "' + name + '".');
            }

            return this._renderers.get(name);
        }

        /**
         * @public
         * @param {String} name
         */

    }, {
        key: 'removeRenderer',
        value: function removeRenderer(name) {
            if (this._renderers.has(name)) {
                this._renderers.get(name).destroy();
                this._renderers.delete(name);
            }
        }

        /**
         * @public
         * @param {String} name
         */

    }, {
        key: 'setCurrentRenderer',
        value: function setCurrentRenderer(name) {
            var renderer = this.getRenderer(name),
                currentRenderer = this._currentRenderer;

            if (currentRenderer === renderer) {
                return;
            }

            if (currentRenderer) {
                currentRenderer.stop();
            }

            this._currentRenderer = renderer;
            renderer.start(this);
        }

        /**
         * @public
         * @returns {?Exo.Renderer}
         */

    }, {
        key: 'getCurrentRenderer',
        value: function getCurrentRenderer() {
            return this._currentRenderer;
        }

        /**
         * @public
         * @param {?Exo.RenderTarget} renderTarget
         */

    }, {
        key: 'setRenderTarget',
        value: function setRenderTarget(renderTarget) {
            var newTarget = renderTarget || this._rootRenderTarget;

            if (this._renderTarget === newTarget) {
                return;
            }

            newTarget.setContext(this._context);
            newTarget.bind();

            this._renderTarget = newTarget;
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
         * @param {Exo.Shader} shader
         */

    }, {
        key: 'setShader',
        value: function setShader(shader) {
            var gl = this._context,
                currentShader = this._shader;

            if (currentShader === shader) {
                return;
            }

            if (currentShader) {
                currentShader.inUse = false;
            }

            shader.setContext(gl);
            shader.setProjection(this._projection);
            shader.bind();

            this._shader = shader;
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
            this._projection.copy(this._rootRenderTarget.getProjection());

            if (this._shader) {
                this._shader.setProjection(this._projection);
            }
        }

        /**
         * @public
         * @param {Exo.View} view
         */

    }, {
        key: 'setView',
        value: function setView(view) {
            this._renderTarget.setView(view);

            if (this._renderTarget === this._rootRenderTarget) {
                this._projection.copy(this._rootRenderTarget.getProjection());
                this._shader.setProjection(this._projection);
            }
        }

        /**
         * @public
         * @param {Exo.Color} [color]
         */

    }, {
        key: 'clear',
        value: function clear(color) {
            var gl = this._context;

            if (color) {
                this.setClearColor(color);
            }

            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        /**
         * @public
         * @param {Exo.Color} color
         * @param {Boolean} [override=true]
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
            if (this._isDrawing) {
                throw new Error('Renderer has already begun!');
            }

            this._isDrawing = true;

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
            if (!this._isDrawing) {
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
            if (!this._isDrawing) {
                throw new Error('Renderer needs to begin first!');
            }

            this._isDrawing = false;

            if (!this._contextLost) {
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
                for (var _iterator = this._renderers.keys()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var name = _step.value;

                    this.removeRenderer(name);
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

            this._canvas = null;
            this._context = null;
            this._clearColor = null;
            this._renderers = null;
            this._currentRenderer = null;
            this._worldTransform = null;
        }

        /**
         * @override
         */

    }, {
        key: '_createContext',
        value: function _createContext() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                _ref$alpha = _ref.alpha,
                alpha = _ref$alpha === undefined ? false : _ref$alpha,
                _ref$antialias = _ref.antialias,
                antialias = _ref$antialias === undefined ? false : _ref$antialias,
                _ref$premultipliedAlp = _ref.premultipliedAlpha,
                premultipliedAlpha = _ref$premultipliedAlp === undefined ? false : _ref$premultipliedAlp,
                _ref$preserveDrawingB = _ref.preserveDrawingBuffer,
                preserveDrawingBuffer = _ref$preserveDrawingB === undefined ? false : _ref$preserveDrawingB,
                _ref$stencil = _ref.stencil,
                stencil = _ref$stencil === undefined ? true : _ref$stencil,
                _ref$depth = _ref.depth,
                depth = _ref$depth === undefined ? false : _ref$depth;

            var options = {
                alpha: alpha,
                antialias: antialias,
                premultipliedAlpha: premultipliedAlpha,
                preserveDrawingBuffer: preserveDrawingBuffer,
                stencil: stencil,
                depth: depth
            };

            try {
                return this._canvas.getContext('webgl', options) || this._canvas.getContext('experimental-webgl', options);
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
         * @member {Exo.RenderTarget}
         */

    }, {
        key: 'renderTarget',
        get: function get() {
            return this._renderTarget;
        },
        set: function set(value) {
            this.setRenderTarget(value);
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
        set: function set(value) {
            this.setBlendMode(value);
        }

        /**
         * @public
         * @member {Exo.Color}
         */

    }, {
        key: 'clearColor',
        get: function get() {
            return this._clearColor;
        },
        set: function set(value) {
            this.setClearColor(value);
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
 * @memberof Exo
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
         * @member {Exo.Vector}
         */
        this._size = new _Vector2.default(width, height);

        /**
         * @private
         * @member {Exo.View}
         */
        this._defaultView = new _View2.default(new _Rectangle2.default(0, 0, width, height));

        /**
         * @private
         * @member {Exo.View}
         */
        this._view = this._defaultView;
    }

    /**
     * @public
     * @member {Exo.Vector}
     */


    _createClass(RenderTarget, [{
        key: 'init',


        /**
         * @public
         */
        value: function init() {
            this._defaultView.reset(new _Rectangle2.default(0, 0, this._size.x, this._size.y));
            this._view = this._defaultView;
        }

        /**
         * @public
         * @param {WebGLRenderingContext} gl
         */

    }, {
        key: 'setContext',
        value: function setContext(gl) {
            if (this._context) {
                return;
            }

            this._context = gl;
            this._frameBuffer = this._isRoot ? null : gl.createFramebuffer();
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
         * @param {Exo.View} view
         * @returns {Exo.Rectangle}
         */

    }, {
        key: 'getViewport',
        value: function getViewport(view) {
            var width = this._size.x,
                height = this._size.y,
                viewport = view.viewport;

            return new _Rectangle2.default(0.5 + width * viewport.x | 0, 0.5 + height * viewport.y | 0, 0.5 + width * viewport.width | 0, 0.5 + height * viewport.height | 0);
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
         */

    }, {
        key: 'updateViewport',
        value: function updateViewport() {
            var viewport = this.getViewport(this._view);

            this._context.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
        }

        /**
         * @public
         * @param {Exo.View} view
         */

    }, {
        key: 'setView',
        value: function setView(view) {
            this._view = view;
            this.updateViewport();
        }
    }, {
        key: 'getProjection',
        value: function getProjection() {
            return this._view.transform;
        }
    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(value) {
            this._size.copy(value);
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
        set: function set(value) {
            this._size.x = value | 0;
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
        set: function set(value) {
            this._size.y = value | 0;
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

var _ObservableVector = __webpack_require__(15);

var _ObservableVector2 = _interopRequireDefault(_ObservableVector);

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Matrix = __webpack_require__(8);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class View
 * @memberof Exo
 */
var View = function () {

    /**
     * @constructor
     * @param {Exo.Rectangle} viewRectangle
     */
    function View(viewRectangle) {
        _classCallCheck(this, View);

        /**
         * @private
         * @member {Exo.ObservableVector}
         */
        this._center = new _ObservableVector2.default(this._setDirty, this);

        /**
         * @private
         * @member {Exo.ObservableVector}
         */
        this._size = new _ObservableVector2.default(this._setDirty, this);

        /**
         * @private
         * @member {Number}
         */
        this._rotation = 0;

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._viewport = new _Rectangle2.default(0, 0, 1, 1);

        /**
         * @private
         * @member {Exo.Matrix}
         */
        this._transform = new _Matrix2.default();

        /**
         * @private
         * @member {Boolean}
         */
        this._dirtyTransform = true;

        this.reset(viewRectangle || new _Rectangle2.default(0, 0, 100, 100));
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
         * @param {Exo.Rectangle} rectangle
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
         * @param {Exo.Rectangle} rectangle
         */

    }, {
        key: 'reset',
        value: function reset(rectangle) {
            this._center.set(rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2);
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
         * @member {Exo.Vector}
         */

    }, {
        key: 'center',
        get: function get() {
            return this._center;
        },
        set: function set(value) {
            this._center.copy(value);
        }

        /**
         * @public
         * @member {Exo.Vector}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(value) {
            this._size.copy(value);
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
        set: function set(value) {
            this.setRotation(value);
        }

        /**
         * @public
         * @member {Exo.Rectangle}
         */

    }, {
        key: 'viewport',
        get: function get() {
            return this._viewport;
        },
        set: function set(value) {
            this._viewport.copy(value);
            this._dirtyTransform = true;
        }

        /**
         * @public
         * @member {Exo.Matrix}
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
        set: function set(value) {
            this._transform.copy(value);
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

var _Renderer2 = __webpack_require__(17);

var _Renderer3 = _interopRequireDefault(_Renderer2);

var _SpriteShader = __webpack_require__(32);

var _SpriteShader2 = _interopRequireDefault(_SpriteShader);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SpriteRenderer
 * @extends {Exo.Renderer}
 * @memberof Exo
 */
var SpriteRenderer = function (_Renderer) {
  _inherits(SpriteRenderer, _Renderer);

  /**
   * @constructor
   */
  function SpriteRenderer() {
    _classCallCheck(this, SpriteRenderer);

    /**
     * Vertex property count times the vertices per sprite.
     *
     * @private
     * @member {Number}
     */
    var _this = _possibleConstructorReturn(this, (SpriteRenderer.__proto__ || Object.getPrototypeOf(SpriteRenderer)).call(this));

    _this._spriteVertexSize = 20;

    /**
     * 2 triangles = 6 edges / indices
     *
     * @private
     * @member {Number}
     */
    _this._indexCount = 6;

    /**
     * 10922 possible sprites per batch
     *
     * @private
     * @member {Number}
     */
    _this._maxSprites = Math.pow(2, 16) / _this._indexCount | 0;

    /**
     *
     * maximum sprite amount per batch *
     * vertex amount per Sprite        *
     * property count per vertex       *
     * byte size
     *
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
    _this._indexData = _this.createIndexBuffer(_this._maxSprites * _this._indexCount);

    /**
     * Current amount of elements inside the batch to draw.
     *
     * @private
     * @member {Number}
     */
    _this._currentBatchSize = 0;

    /**
     * @private
     * @member {?WebGLRenderingContext}
     */
    _this._context = null;

    /**
     * Vertex buffer that will be fed by the vertexData.
     *
     * @private
     * @member {?WebGLBuffer}
     */
    _this._vertexBuffer = null;

    /**
     * Index buffer that will be fed by the indexData.
     *
     * @private
     * @member {?WebGLBuffer}
     */
    _this._indexBuffer = null;

    /**
     * @private
     * @member {Exo.SpriteShader}
     */
    _this._shader = new _SpriteShader2.default();

    /**
     * @private
     * @member {?Exo.Texture}
     */
    _this._currentTexture = null;
    return _this;
  }

  /**
   * @override
   * @param {Exo.DisplayManager} displayManager
   */


  _createClass(SpriteRenderer, [{
    key: 'start',
    value: function start(displayManager) {
      var gl = this._context,
          shader = this._shader,
          stride = this._spriteVertexSize;

      displayManager.setShader(shader);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this._vertexData, gl.DYNAMIC_DRAW);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);

      gl.vertexAttribPointer(shader.getAttribute('aVertexPosition').location, 2, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(shader.getAttribute('aTextureCoord').location, 2, gl.FLOAT, false, stride, 8);
      gl.vertexAttribPointer(shader.getAttribute('aColor').location, 4, gl.UNSIGNED_BYTE, true, stride, 16);
    }

    /**
     * @override
     * @param {Exo.Sprite} sprite
     */

  }, {
    key: 'render',
    value: function render(sprite) {
      var vertexBuffer = this._vertexView,
          colorBuffer = this._colorView,
          transform = sprite.worldTransform,
          vertexData = sprite.vertexData,
          texture = sprite.texture,
          textureSwap = this._currentTexture !== texture;

      var index = this._currentBatchSize * this._spriteVertexSize;

      if (this._currentBatchSize >= this._maxSprites || textureSwap) {
        this.flush();

        index = 0;

        if (textureSwap) {
          this._currentTexture = texture;
          this._shader.setUniformTexture('uSampler', texture, 0);
        }
      }

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

      this._currentBatchSize++;
    }

    /**
     * @override
     */

  }, {
    key: 'flush',
    value: function flush() {
      var gl = this._context,
          batchSize = this._currentBatchSize;

      if (!batchSize) {
        return;
      }

      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._vertexView.subarray(0, batchSize * this._spriteVertexSize));
      gl.drawElements(gl.TRIANGLES, batchSize * this._indexCount, gl.UNSIGNED_SHORT, 0);

      this._currentBatchSize = 0;
    }

    /**
     * @override
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      _get(SpriteRenderer.prototype.__proto__ || Object.getPrototypeOf(SpriteRenderer.prototype), 'destroy', this).call(this);

      this._shader.destroy();
      this._shader = null;

      this._vertexData = null;
      this._indexData = null;
      this._vertexView = null;
      this._colorView = null;
      this._currentTexture = null;
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

var _Shader2 = __webpack_require__(18);

var _Shader3 = _interopRequireDefault(_Shader2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SpriteShader
 * @extends {Exo.Shader}
 * @memberof Exo
 */
var SpriteShader = function (_Shader) {
    _inherits(SpriteShader, _Shader);

    /**
     * @constructor
     */
    function SpriteShader() {
        _classCallCheck(this, SpriteShader);

        var _this = _possibleConstructorReturn(this, (SpriteShader.__proto__ || Object.getPrototypeOf(SpriteShader)).call(this));

        _this.vertexSource = ['precision lowp float;', 'attribute vec2 aVertexPosition;', 'attribute vec2 aTextureCoord;', 'attribute vec4 aColor;', 'uniform mat3 projectionMatrix;', 'varying vec2 vTextureCoord;', 'varying vec4 vColor;', 'void main(void) {', 'vTextureCoord = aTextureCoord;', 'vColor = vec4(aColor.rgb * aColor.a, aColor.a);', 'gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);', '}'].join('\n');

        _this.fragmentSource = ['precision lowp float;', 'varying vec2 vTextureCoord;', 'varying vec4 vColor;', 'uniform sampler2D uSampler;', 'void main(void) {', 'gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor;', '}'].join('\n');

        _this.addAttribute('aVertexPosition', true);
        _this.addAttribute('aTextureCoord', true);
        _this.addAttribute('aColor', true);

        _this.addUniform('uSampler', _const.UNIFORM_TYPE.TEXTURE);
        _this.addUniform('projectionMatrix', _const.UNIFORM_TYPE.MATRIX);
        return _this;
    }

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

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class ShaderAttribute
 * @memberof Exo
 */
var ShaderAttribute = function () {

  /**
   * @constructor
   * @param {String} name
   * @param {Boolean} [active]
   */
  function ShaderAttribute(name, active) {
    _classCallCheck(this, ShaderAttribute);

    /**
     * @private
     * @member {String}
     */
    this._name = name;

    /**
     * @private
     * @member {Boolean}
     */
    this._active = active;

    /**
     * @private
     * @member {?Number}
     */
    this._location = null;
  }

  /**
   * @public
   * @readonly
   * @member {String}
   */


  _createClass(ShaderAttribute, [{
    key: "destroy",


    /**
     * @public
     */
    value: function destroy() {
      this._name = null;
      this._active = null;
      this._location = null;
    }
  }, {
    key: "name",
    get: function get() {
      return this._name;
    }

    /**
     * @public
     * @member {?Number}
     */

  }, {
    key: "location",
    get: function get() {
      return this._location;
    },
    set: function set(value) {
      this._location = value;
    }

    /**
     * @public
     * @member {Boolean}
     */

  }, {
    key: "active",
    get: function get() {
      return this._active;
    },
    set: function set(value) {
      this._active = !!value;
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

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class ShaderUniform
 * @param {String} name
 * @param {Number} type
 * @memberof Exo
 */
var ShaderUniform = function () {

  /**
   * @constructor
   * @param {String} name
   * @param {Number} type
   */
  function ShaderUniform(name, type) {
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
     * @member {?Number|?Number[]|?Exo.Vector|?Exo.Matrix|?Exo.Texture}
     */
    this._value = null;

    /**
     * @private
     * @member {?WebGLUniformLocation}
     */
    this._location = null;

    /**
     * @private
     * @member {Number}
     */
    this._textureUnit = -1;

    /**
     * @private
     * @member {Boolean}
     */
    this._dirty = false;

    /**
     * @private
     * @member {Boolean}
     */
    this._textureUnitChanged = false;
  }

  /**
   * @public
   * @readonly
   * @member {String}
   */


  _createClass(ShaderUniform, [{
    key: "destroy",

    /**
     * @public
     */
    value: function destroy() {
      this._location = null;
      this._value = null;
    }
  }, {
    key: "name",
    get: function get() {
      return this._name;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */

  }, {
    key: "type",
    get: function get() {
      return this._type;
    }

    /**
     * @public
     * @member {WebGLUniformLocation}
     */

  }, {
    key: "location",
    get: function get() {
      return this._location;
    },
    set: function set(value) {
      this._location = value;
    }

    /**
     * @public
     * @member {Number|Number[]|Vector|Matrix|Texture}
     */

  }, {
    key: "value",
    get: function get() {
      return this._value;
    },
    set: function set(value) {
      this._value = value;
      this._dirty = true;
    }

    /**
     * @public
     * @member {Number}
     */

  }, {
    key: "textureUnit",
    get: function get() {
      return this._textureUnit;
    },
    set: function set(value) {
      if (this._textureUnit !== value) {
        this._textureUnit = value;
        this._textureUnitChanged = true;
      }
    }

    /**
     * @public
     * @member {Boolean}
     */

  }, {
    key: "dirty",
    get: function get() {
      return this._dirty;
    },
    set: function set(value) {
      this._dirty = !!value;
    }

    /**
     * @public
     * @member {Boolean}
     */

  }, {
    key: "textureUnitChanged",
    get: function get() {
      return this._textureUnitChanged;
    },
    set: function set(value) {
      this._textureUnitChanged = !!value;
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

var _utils = __webpack_require__(1);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * Helper class to create a WebGL Texture
 *
 * @class WebGLTexture
 * @memberof Exo
 */
var WebGLTexture = function () {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context The current WebGL context
     */
    function WebGLTexture(context) {
        _classCallCheck(this, WebGLTexture);

        /**
         * The current WebGL rendering context
         *
         * @private
         * @member {WebGLRenderingContext}
         */
        this._context = context;

        /**
         * The WebGL texture
         *
         * @private
         * @member {WebGLTexture}
         */
        this._texture = context.createTexture();

        /**
         * Set to true to enable pre-multiplied alpha
         *
         * @private
         * @member {Boolean}
         */
        this._premultiplyAlpha = true;

        /**
         * The width of texture
         *
         * @private
         * @member {Number}
         */
        this._width = -1;

        /**
         * The height of texture
         *
         * @private
         * @member {Number}
         */
        this._height = -1;
    }

    /**
     * Binds the texture
     * @param {Number} [textureUnit]
     */


    _createClass(WebGLTexture, [{
        key: 'bind',
        value: function bind(textureUnit) {
            var gl = this._context;

            if (typeof textureUnit === 'number') {
                gl.activeTexture(gl.TEXTURE0 + textureUnit);
            }

            gl.bindTexture(gl.TEXTURE_2D, this._texture);
        }

        /**
         * Unbinds the texture
         */

    }, {
        key: 'unbind',
        value: function unbind() {
            var gl = this._context;

            gl.bindTexture(gl.TEXTURE_2D, null);
        }

        /**
         * Uploads this texture to the GPU
         *
         * @public
         * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} source the source image of the texture
         */

    }, {
        key: 'setSource',
        value: function setSource(source) {
            var gl = this._context,
                newWidth = source.videoWidth || source.width,
                newHeight = source.videoHeight || source.height;

            this.bind();

            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);

            if (newHeight !== this._height || newWidth !== this._width) {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            } else {
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
            }

            // if the source is a video, we need to use the videoWidth / videoHeight properties
            this._width = newWidth;
            this._height = newHeight;
        }

        /**
         * @public
         * @param {Number} scaleMode
         */

    }, {
        key: 'setScaleMode',
        value: function setScaleMode(scaleMode) {
            var gl = this._context,
                scale = (0, _utils.getScaleModeEnum)(gl, scaleMode);

            this.bind();

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, scale);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, scale);
        }

        /**
         * @public
         * @param {Number} wrapMode
         */

    }, {
        key: 'setWrapMode',
        value: function setWrapMode(wrapMode) {
            var gl = this._context,
                wrap = (0, _utils.getWrapModeEnum)(gl, wrapMode);

            this.bind();

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        }

        /**
         * Destroys this texture
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._context.deleteTexture(this._texture);
            this._texture = null;
            this._context = null;
        }
    }]);

    return WebGLTexture;
}();

exports.default = WebGLTexture;

/***/ }),
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderer2 = __webpack_require__(17);

var _Renderer3 = _interopRequireDefault(_Renderer2);

var _ParticleShader = __webpack_require__(37);

var _ParticleShader2 = _interopRequireDefault(_ParticleShader);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ParticleRenderer
 * @extends {Exo.Renderer}
 * @memberof Exo
 */
var ParticleRenderer = function (_Renderer) {
  _inherits(ParticleRenderer, _Renderer);

  /**
   * @constructor
   */
  function ParticleRenderer() {
    _classCallCheck(this, ParticleRenderer);

    /**
     * 4 vertices per particle
     *
     * @private
     * @member {Number}
     */
    var _this = _possibleConstructorReturn(this, (ParticleRenderer.__proto__ || Object.getPrototypeOf(ParticleRenderer)).call(this));

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
     * Vertex property count times the vertices per particle.
     *
     * @private
     * @member {Number}
     */
    _this._particleVertexSize = _this._vertexCount * _this._vertexPropCount;

    /**
     * 2 triangles = 6 edges / indices
     *
     * @private
     * @member {Number}
     */
    _this._indexCount = 6;

    /**
     * 10922 possible particles per batch
     *
     * @private
     * @member {Number}
     */
    _this._maxParticles = ~~(Math.pow(2, 16) / _this._indexCount);

    /**
     * maximum particle amount per batch *
     * vertex amount per particle        *
     * property count per vertex         *
     * byte size
     *
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
    _this._indexData = _this.createIndexBuffer(_this._maxParticles * _this._indexCount);

    /**
     * Current amount of elements inside the batch to draw.
     *
     * @private
     * @member {Number}
     */
    _this._currentBatchSize = 0;

    /**
     * Vertex buffer that will be fed by the vertexData.
     *
     * @private
     * @member {?WebGLBuffer}
     */
    _this._vertexBuffer = null;

    /**
     * Index buffer that will be fed by the indexData.
     *
     * @private
     * @member {?WebGLBuffer}
     */
    _this._indexBuffer = null;

    /**
     * @private
     * @member {?Exo.ParticleShader}
     */
    _this._shader = new _ParticleShader2.default();

    /**
     * @member {?Exo.Texture}
     * @private
     */
    _this._currentTexture = null;
    return _this;
  }

  /**
   * @override
   */


  _createClass(ParticleRenderer, [{
    key: 'start',
    value: function start(displayManager) {
      var gl = this._context,
          shader = this._shader,
          stride = this._particleVertexSize;

      displayManager.setShader(shader);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this._vertexData, gl.STREAM_DRAW);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);

      gl.vertexAttribPointer(shader.getAttribute('aVertexPosition').location, 2, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(shader.getAttribute('aTextureCoord').location, 2, gl.FLOAT, false, stride, 8);
      gl.vertexAttribPointer(shader.getAttribute('aPosition').location, 2, gl.FLOAT, false, stride, 16);
      gl.vertexAttribPointer(shader.getAttribute('aScale').location, 2, gl.FLOAT, false, stride, 24);
      gl.vertexAttribPointer(shader.getAttribute('aRotation').location, 1, gl.FLOAT, false, stride, 32);
      gl.vertexAttribPointer(shader.getAttribute('aColor').location, 4, gl.UNSIGNED_BYTE, true, stride, 36);
    }

    /**
     * @override
     * @param {Exo.ParticleEmitter} emitter
     */

  }, {
    key: 'render',
    value: function render(emitter) {
      var vertexData = this._vertexView,
          colorData = this._colorView,
          particles = emitter.particles,
          texture = emitter.texture,
          textureRect = emitter.textureRect,
          textureCoords = emitter.textureCoords,
          textureSwap = this._currentTexture !== texture,
          propCount = this._particleVertexSize,
          len = particles.length;

      if (this._currentBatchSize >= this._maxParticles || textureSwap) {
        this.flush();

        if (textureSwap) {
          this._currentTexture = texture;
          this._shader.setUniformTexture('uSampler', texture, 0);
        }
      }

      for (var i = 0, index = this._currentBatchSize * this._particleVertexSize; i < len; i++, index += propCount) {
        if (this._currentBatchSize >= this._maxParticles) {
          this.flush();

          index = this._currentBatchSize * this._particleVertexSize;
        }

        var particle = particles[i];

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

        this._currentBatchSize++;
      }
    }

    /**
     * @override
     */

  }, {
    key: 'flush',
    value: function flush() {
      var batchSize = this._currentBatchSize,
          gl = this._context;

      if (!batchSize) {
        return;
      }

      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._vertexView.subarray(0, batchSize * this._particleVertexSize));
      gl.drawElements(gl.TRIANGLES, batchSize * this._indexCount, gl.UNSIGNED_SHORT, 0);

      this._currentBatchSize = 0;
    }

    /**
     * @override
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      _get(ParticleRenderer.prototype.__proto__ || Object.getPrototypeOf(ParticleRenderer.prototype), 'destroy', this).call(this);

      this._shader.destroy();
      this._shader = null;

      this._vertexData = null;
      this._indexData = null;
      this._vertexView = null;
      this._colorView = null;
      this._currentTexture = null;
    }
  }]);

  return ParticleRenderer;
}(_Renderer3.default);

exports.default = ParticleRenderer;

/***/ }),
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _Shader2 = __webpack_require__(18);

var _Shader3 = _interopRequireDefault(_Shader2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ParticleShader
 * @extends {Exo.Shader}
 * @memberof Exo
 */
var ParticleShader = function (_Shader) {
    _inherits(ParticleShader, _Shader);

    /**
     * @constructor
     */
    function ParticleShader() {
        _classCallCheck(this, ParticleShader);

        var _this = _possibleConstructorReturn(this, (ParticleShader.__proto__ || Object.getPrototypeOf(ParticleShader)).call(this));

        _this.vertexSource = ['precision lowp float;', 'attribute vec2 aVertexPosition;', 'attribute vec2 aTextureCoord;', 'attribute vec2 aPosition;', 'attribute vec2 aScale;', 'attribute float aRotation;', 'attribute vec4 aColor;', 'uniform mat3 projectionMatrix;', 'varying vec2 vTextureCoord;', 'varying vec4 vColor;', 'void main(void) {', 'vec2 vp = aVertexPosition;', 'vp.x = (aVertexPosition.x) * cos(aRotation) - (aVertexPosition.y) * sin(aRotation);', 'vp.y = (aVertexPosition.x) * sin(aRotation) + (aVertexPosition.y) * cos(aRotation);', 'vp = (vp * aScale) + aPosition;', 'vTextureCoord = aTextureCoord;', 'vColor = vec4(aColor.rgb * aColor.a, aColor.a);', 'gl_Position = vec4((projectionMatrix * vec3(vp, 1.0)).xy, 0.0, 1.0);', '}'].join('\n');

        _this.fragmentSource = ['precision lowp float;', 'varying vec2 vTextureCoord;', 'varying vec4 vColor;', 'uniform sampler2D uSampler;', 'void main(void) {', 'gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor;', '}'].join('\n');

        _this.addAttribute('aVertexPosition', true);
        _this.addAttribute('aTextureCoord', true);
        _this.addAttribute('aPosition', true);
        _this.addAttribute('aScale', true);
        _this.addAttribute('aRotation', true);
        _this.addAttribute('aColor', true);

        _this.addUniform('uSampler', _const.UNIFORM_TYPE.TEXTURE);
        _this.addUniform('projectionMatrix', _const.UNIFORM_TYPE.MATRIX);
        return _this;
    }

    return ParticleShader;
}(_Shader3.default);

exports.default = ParticleShader;

/***/ }),
/* 38 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class BlendMode
 * @memberof Exo
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
/* 39 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = __webpack_require__(1);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class AudioManager
 * @memberof Exo
 */
var AudioManager = function () {

  /**
   * @constructor
   * @param {Exo.Game} game
   */
  function AudioManager(game) {
    _classCallCheck(this, AudioManager);

    /**
     * @private
     * @member {Exo.Game}
     * @memberof Exo.AudioManager
     */
    this._game = game;

    /**
     * @private
     * @member {AudioContext}
     * @memberof Exo.AudioManager
     */
    this._context = new AudioContext();

    /**
     * @private
     * @member {AudioDestinationNode}
     * @memberof Exo.AudioManager
     */
    this._destination = this._context.destination;

    /**
     * @private
     * @member {DynamicsCompressorNode}
     * @memberof Exo.AudioManager
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
     * @member {Number}
     */
    this._masterVolume = 1;

    /**
     * @private
     * @member {Number}
     */
    this._musicVolume = 1;

    /**
     * @private
     * @member {Number}
     */
    this._soundVolume = 1;

    game.on('audio:play', this.play, this).on('audio:volume:master', this.setMasterVolume, this).on('audio:volume:sound', this.setSoundVolume, this).on('audio:volume:music', this.setMusicVolume, this);
  }

  /**
   * @public
   * @readonly
   * @member {AudioContext}
   * @memberof Exo.AudioManager
   */


  _createClass(AudioManager, [{
    key: 'play',


    /**
     * @public
     * @param {Exo.Music|Exo.Sound|Exo.Audio|Exo.Playable} playable
     * @param {Object} [options]
     * @param {Boolean} [options.loop]
     * @param {Number} [options.playbackRate]
     * @param {Number} [options.volume]
     * @param {Number} [options.time]
     */
    value: function play(playable, options) {
      playable.connect(this);
      playable.play(options);
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
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      this._destination = null;

      this._soundGain.disconnect();
      this._soundGain = null;

      this._musicGain.disconnect();
      this._musicGain = null;

      this._masterGain.disconnect();
      this._masterGain = null;

      this._compressor.disconnect();
      this._compressor = null;

      this._context.close();
      this._context = null;

      this._game.off('audio:play', this.play, this).off('audio:volume:master', this.setMasterVolume, this).off('audio:volume:sound', this.setSoundVolume, this).off('audio:volume:music', this.setMusicVolume, this);

      this._game = null;
    }
  }, {
    key: 'context',
    get: function get() {
      return this._context;
    }

    /**
     * @readonly
     * @member {AudioNode}
     * @memberof Exo.AudioManager
     */

  }, {
    key: 'masterNode',
    get: function get() {
      return this._masterGain;
    }

    /**
     * @readonly
     * @member {AudioNode}
     * @memberof Exo.AudioManager
     */

  }, {
    key: 'musicNode',
    get: function get() {
      return this._musicGain;
    }

    /**
     * @readonly
     * @member {AudioNode}
     * @memberof Exo.AudioManager
     */

  }, {
    key: 'soundNode',
    get: function get() {
      return this._soundGain;
    }

    /**
     * @readonly
     * @member {AudioNode}
     * @memberof Exo.AudioManager
     */

  }, {
    key: 'analyserTarget',
    get: function get() {
      return this._compressor;
    }

    /**
     * @public
     * @member {Number}
     * @memberof Exo.AudioManager
     */

  }, {
    key: 'masterVolume',
    get: function get() {
      return this._masterVolume;
    },
    set: function set(value) {
      this.setMasterVolume(value);
    }

    /**
     * @public
     * @member {Number}
     * @memberof Exo.AudioManager
     */

  }, {
    key: 'soundVolume',
    get: function get() {
      return this._soundVolume;
    },
    set: function set(value) {
      this.setSoundVolume(value);
    }

    /**
     * @public
     * @member {Number}
     * @memberof Exo.AudioManager
     */

  }, {
    key: 'musicVolume',
    get: function get() {
      return this._musicVolume;
    },
    set: function set(value) {
      this.setMusicVolume(value);
    }
  }]);

  return AudioManager;
}();

exports.default = AudioManager;

/***/ }),
/* 40 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ChannelHandler2 = __webpack_require__(4);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _Keyboard = __webpack_require__(41);

var _Keyboard2 = _interopRequireDefault(_Keyboard);

var _Mouse = __webpack_require__(42);

var _Mouse2 = _interopRequireDefault(_Mouse);

var _GamepadManager = __webpack_require__(43);

var _GamepadManager2 = _interopRequireDefault(_GamepadManager);

var _PointerManager = __webpack_require__(47);

var _PointerManager2 = _interopRequireDefault(_PointerManager);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class InputManager
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
 */
var InputManager = function (_ChannelHandler) {
    _inherits(InputManager, _ChannelHandler);

    /**
     * @constructor
     * @param {Exo.Game} game
     */
    function InputManager(game) {
        _classCallCheck(this, InputManager);

        /**
         * @private
         * @member {Exo.Game}
         */
        var _this = _possibleConstructorReturn(this, (InputManager.__proto__ || Object.getPrototypeOf(InputManager)).call(this, new ArrayBuffer(_const.CHANNEL_LENGTH.GLOBAL * 4), 0, _const.CHANNEL_LENGTH.GLOBAL));

        _this._game = game;

        /**
         * @private
         * @member {Set<Exo.Input>}
         */
        _this._inputs = new Set();

        /**
         * @private
         * @member {Exo.Keyboard}
         */
        _this._keyboard = new _Keyboard2.default(game, _this.channelBuffer);

        /**
         * @private
         * @member {Exo.Mouse}
         */
        _this._mouse = new _Mouse2.default(game, _this.channelBuffer);

        /**
         * @private
         * @member {Exo.GamepadManager}
         */
        _this._gamepadManager = new _GamepadManager2.default(game, _this.channelBuffer);

        /**
         * @private
         * @member {Exo.PointerManager}
         */
        _this._pointerManager = new _PointerManager2.default(game, _this.channelBuffer);

        game.on('input:add', _this.add, _this).on('input:remove', _this.remove, _this).on('input:clear', _this.clear, _this);
        return _this;
    }

    /**
     * @public
     * @param {Exo.Input|Exo.Input[]} inputs
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
         * @param {Exo.Input|Exo.Input[]} inputs
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
/* 41 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ChannelHandler2 = __webpack_require__(4);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Keyboard
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
 */
var Keyboard = function (_ChannelHandler) {
  _inherits(Keyboard, _ChannelHandler);

  /**
   * @constructor
   * @param {Exo.Game} game
   * @param {ArrayBuffer} channelBuffer
   */
  function Keyboard(game, channelBuffer) {
    _classCallCheck(this, Keyboard);

    /**
     * @private
     * @member {Exo.Game}
     */
    var _this = _possibleConstructorReturn(this, (Keyboard.__proto__ || Object.getPrototypeOf(Keyboard)).call(this, channelBuffer, _const.CHANNEL_OFFSET.KEYBOARD, _const.CHANNEL_LENGTH.DEVICE));

    _this._game = game;

    _this._addEventListeners();
    return _this;
  }

  /**
   * @override
   */


  _createClass(Keyboard, [{
    key: 'destroy',
    value: function destroy() {
      _get(Keyboard.prototype.__proto__ || Object.getPrototypeOf(Keyboard.prototype), 'destroy', this).call(this);

      this._removeEventListeners();
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
      if (!this.active) {
        return;
      }

      this._channels[event.keyCode] = 1;
      this.trigger('keyboard:down', Keyboard.getChannelCode(event.keyCode), this);
    }

    /**
     * @private
     * @param {Event} event
     */

  }, {
    key: '_onKeyUp',
    value: function _onKeyUp(event) {
      if (!this.active) {
        return;
      }

      this._channels[event.keyCode] = 0;
      this.trigger('keyboard:up', Keyboard.getChannelCode(event.keyCode), this);
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
      return _const.CHANNEL_OFFSET.KEYBOARD + (key & 255);
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
/* 42 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ChannelHandler2 = __webpack_require__(4);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Mouse
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
 */
var Mouse = function (_ChannelHandler) {
  _inherits(Mouse, _ChannelHandler);

  /**
   * @constructor
   * @param {Exo.Game} game
   * @param {ArrayBuffer} channelBuffer
   */
  function Mouse(game, channelBuffer) {
    _classCallCheck(this, Mouse);

    /**
     * @private
     * @member {Exo.Game}
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
     * @member {Exo.Vector}
     */
    _this._position = new _Vector2.default();

    /**
     * @private
     * @member {Boolean}
     */
    _this._insideWindow = false;

    /**
     * @private
     * @member {Boolean}
     */
    _this._positionChanged = false;

    /**
     * @private
     * @member {Boolean}
     */
    _this._wheelChanged = false;

    /**
     * @private
     * @member {Boolean}
     */
    _this._stateChanged = false;

    _this._addEventListeners();
    return _this;
  }

  /**
   * @public
   * @readonly
   * @member {Number}
   * @memberof Mouse
   */


  _createClass(Mouse, [{
    key: 'update',


    /**
     * @public
     * @fires Mouse#enter
     * @fires Mouse#leave
     * @fires Mouse#move
     * @fires Mouse#scroll
     */
    value: function update() {
      var game = this._game;

      if (!this.active) {
        return;
      }

      if (this._stateChanged) {
        this._insideWindow = this.hasEnteredWindow;

        if (this._insideWindow) {

          /**
           * @event Exo.Mouse#enter
           * @member {Function}
           * @property {Exo.Mouse} mouse
           */
          game.trigger('mouse:enter', this);
        } else {

          /**
           * @event Exo.Mouse#leave
           * @member {Function}
           * @property {Exo.Mouse} mouse
           */
          game.trigger('mouse:leave', this);
        }

        this._setStateDelta(0);
        this._stateChanged = false;
      }

      if (this._positionChanged) {

        /**
         * @event Exo.Mouse#move
         * @member {Function}
         * @property {Exo.Mouse} mouse
         */
        game.trigger('mouse:move', this);

        this._setPositionDelta(0, 0);
        this._positionChanged = false;
      }

      if (this._wheelChanged) {

        /**
         * @event Exo.Mouse#scroll
         * @member {Function}
         * @property {Exo.Mouse} mouse
         */
        game.trigger('mouse:scroll', this);

        this._setWheelDelta(0, 0, 0);
        this._wheelChanged = false;
      }
    }

    /**
     * @override
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      _get(Mouse.prototype.__proto__ || Object.getPrototypeOf(Mouse.prototype), 'destroy', this).call(this);

      this._removeEventListeners();
      this._stateChanged = null;
      this._positionChanged = null;
      this._wheelChanged = null;
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

      // Disable right clicking context menu
      canvas.addEventListener('contextmenu', this._killEventHandler, true);

      // Disable mouse selection
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

      this._channels[button] = 1;
      this._game.trigger('mouse:down', Mouse.getChannelCode(button), this);
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

      this._channels[button] = 0;
      this._game.trigger('mouse:up', Mouse.getChannelCode(button), this);
      event.preventDefault();
    }

    /**
     * @private
     * @param {MouseEvent} event
     */

  }, {
    key: '_onMouseMove',
    value: function _onMouseMove(event) {
      var rect = this._canvas.getBoundingClientRect(),
          x = event.clientX - rect.left,
          y = event.clientY - rect.top;

      this._setPositionDelta(x - this.x, y - this.y);
      this._position.set(x, y);
      this._positionChanged = true;
    }

    /**
     * @private
     */

  }, {
    key: '_onMouseOver',
    value: function _onMouseOver() {
      this._setStateDelta(1);
    }

    /**
     * @private
     */

  }, {
    key: '_onMouseOut',
    value: function _onMouseOut() {
      this._setStateDelta(-1);
    }

    /**
     * @private
     * @param {WheelEvent} event
     */

  }, {
    key: '_onMouseWheel',
    value: function _onMouseWheel(event) {
      this._setWheelDelta(event.deltaX, event.deltaY, event.deltaZ);
      this._wheelChanged = true;
    }

    /**
     * @param {Number} deltaX
     * @param {Number} deltaY
     * @param {Number} deltaZ
     * @memberof Mouse
     */

  }, {
    key: '_setWheelDelta',
    value: function _setWheelDelta(deltaX, deltaY, deltaZ) {
      var channels = this.channels;

      channels[5] = Math.abs(Math.min(0, deltaX));
      channels[6] = Math.max(0, deltaX);

      channels[7] = Math.abs(Math.min(0, deltaY));
      channels[8] = Math.max(0, deltaY);

      channels[9] = Math.abs(Math.min(0, deltaZ));
      channels[10] = Math.max(0, deltaZ);
    }

    /**
     * @param {Number} deltaX
     * @param {Number} deltaY
     * @memberof Mouse
     */

  }, {
    key: '_setPositionDelta',
    value: function _setPositionDelta(deltaX, deltaY) {
      var channels = this.channels;

      channels[11] = Math.abs(Math.min(0, deltaX));
      channels[12] = Math.max(0, deltaX);

      channels[13] = Math.abs(Math.min(0, deltaY));
      channels[14] = Math.max(0, deltaY);
    }

    /**
     *  1 = enter
     *  0 = nothing
     * -1 = leave
     *
     * @param {Number} delta
     * @memberof Mouse
     */

  }, {
    key: '_setStateDelta',
    value: function _setStateDelta(delta) {
      var channels = this.channels;

      channels[15] = Math.max(0, delta);
      channels[16] = Math.abs(Math.min(0, delta));
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
     * @memberof Mouse
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
     * @memberof Mouse
     */

  }, {
    key: 'y',
    get: function get() {
      return this._position.y;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     * @memberof Mouse
     */

  }, {
    key: 'isInsideFrame',
    get: function get() {
      return this._insideWindow;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */

  }, {
    key: 'wheelX',
    get: function get() {
      return this._channels[5] - this._channels[6];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */

  }, {
    key: 'wheelY',
    get: function get() {
      return this._channels[7] - this._channels[8];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */

  }, {
    key: 'wheelZ',
    get: function get() {
      return this._channels[9] - this._channels[10];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */

  }, {
    key: 'deltaX',
    get: function get() {
      return this._channels[11] - this._channels[12];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     * @memberof Mouse
     */

  }, {
    key: 'deltaY',
    get: function get() {
      return this._channels[13] - this._channels[14];
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     * @memberof Mouse
     */

  }, {
    key: 'hasEnteredWindow',
    get: function get() {
      return !!this._channels[15];
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     * @memberof Mouse
     */

  }, {
    key: 'hasLeftWindow',
    get: function get() {
      return !!this._channels[16];
    }
  }], [{
    key: 'getChannelCode',
    value: function getChannelCode(key) {
      return _const.CHANNEL_OFFSET.MOUSE + (key & 255);
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
Mouse.ScrollLeft = _const.CHANNEL_OFFSET.MOUSE + 5;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollRight = _const.CHANNEL_OFFSET.MOUSE + 6;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollUp = _const.CHANNEL_OFFSET.MOUSE + 7;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollDown = _const.CHANNEL_OFFSET.MOUSE + 8;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollForward = _const.CHANNEL_OFFSET.MOUSE + 9;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.ScrollBackward = _const.CHANNEL_OFFSET.MOUSE + 10;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveLeft = _const.CHANNEL_OFFSET.MOUSE + 11;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveRight = _const.CHANNEL_OFFSET.MOUSE + 12;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveUp = _const.CHANNEL_OFFSET.MOUSE + 13;

/**
 * @public
 * @static
 * @member {Number}
 */
Mouse.MoveDown = _const.CHANNEL_OFFSET.MOUSE + 14;

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
/* 43 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Gamepad = __webpack_require__(19);

var _Gamepad2 = _interopRequireDefault(_Gamepad);

var _ChannelHandler2 = __webpack_require__(4);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var navigator = window.navigator;

/**
 * @class GamepadManager
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
 */

var GamepadManager = function (_ChannelHandler) {
    _inherits(GamepadManager, _ChannelHandler);

    /**
     * @constructor
     * @param {Exo.Game} game
     * @param {ArrayBuffer} channelBuffer
     */
    function GamepadManager(game, channelBuffer) {
        _classCallCheck(this, GamepadManager);

        /**
         * @private
         * @member {Exo.Game}
         */
        var _this = _possibleConstructorReturn(this, (GamepadManager.__proto__ || Object.getPrototypeOf(GamepadManager)).call(this, channelBuffer, _const.CHANNEL_OFFSET.GAMEPAD, _const.CHANNEL_LENGTH.DEVICE));

        _this._game = game;

        /**
         * @private
         * @member {Map<Number, Exo.Gamepad>}
         */
        _this._gamepads = new Map();
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Map<Number, Exo.Gamepad>}
     */


    _createClass(GamepadManager, [{
        key: 'update',


        /**
         * @public
         */
        value: function update() {
            this.updateGamepads();

            if (this.active) {
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
        }

        /**
         * @public
         */

    }, {
        key: 'updateGamepads',
        value: function updateGamepads() {
            var game = this._game,
                activeGamepads = this._gamepads,
                nativeGamepads = navigator.getGamepads(),
                length = nativeGamepads.length;

            for (var index = 0; index < length; index++) {
                if (!nativeGamepads[index] === !activeGamepads.has(index)) {
                    continue;
                }

                if (nativeGamepads[index]) {
                    var newGamepad = new _Gamepad2.default(nativeGamepads[index], this.channelBuffer);

                    activeGamepads.set(index, newGamepad);
                    game.trigger('gamepad:add', newGamepad, index, activeGamepads);
                } else {
                    var oldGamepad = activeGamepads.get(index);

                    activeGamepads.delete(index);
                    game.trigger('gamepad:remove', oldGamepad, index, activeGamepads);
                    oldGamepad.destroy();
                }

                game.trigger('gamepad:change', activeGamepads);
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
/* 44 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _GamepadMapping2 = __webpack_require__(45);

var _GamepadMapping3 = _interopRequireDefault(_GamepadMapping2);

var _GamepadButton = __webpack_require__(46);

var _GamepadButton2 = _interopRequireDefault(_GamepadButton);

var _Gamepad = __webpack_require__(19);

var _Gamepad2 = _interopRequireDefault(_Gamepad);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class GamepadDefaultMapping
 * @extends {Exo.GamepadMapping}
 * @memberof Exo
 */
var GamepadDefaultMapping = function (_GamepadMapping) {
    _inherits(GamepadDefaultMapping, _GamepadMapping);

    /**
     * @constructor
     */
    function GamepadDefaultMapping() {
        _classCallCheck(this, GamepadDefaultMapping);

        var _this = _possibleConstructorReturn(this, (GamepadDefaultMapping.__proto__ || Object.getPrototypeOf(GamepadDefaultMapping)).call(this));

        _this.setButtons([new _GamepadButton2.default(0, _Gamepad2.default.FaceButtonBottom), new _GamepadButton2.default(1, _Gamepad2.default.FaceButtonLeft), new _GamepadButton2.default(2, _Gamepad2.default.FaceButtonRight), new _GamepadButton2.default(3, _Gamepad2.default.FaceButtonTop), new _GamepadButton2.default(4, _Gamepad2.default.LeftTriggerBottom), new _GamepadButton2.default(5, _Gamepad2.default.RightTriggerBottom), new _GamepadButton2.default(6, _Gamepad2.default.LeftTriggerTop), new _GamepadButton2.default(7, _Gamepad2.default.RightTriggerTop), new _GamepadButton2.default(8, _Gamepad2.default.Select), new _GamepadButton2.default(9, _Gamepad2.default.Start), new _GamepadButton2.default(10, _Gamepad2.default.LeftStickButton), new _GamepadButton2.default(11, _Gamepad2.default.RightStickButton), new _GamepadButton2.default(12, _Gamepad2.default.DPadUp), new _GamepadButton2.default(13, _Gamepad2.default.DPadDown), new _GamepadButton2.default(14, _Gamepad2.default.DPadLeft), new _GamepadButton2.default(15, _Gamepad2.default.DPadRight), new _GamepadButton2.default(16, _Gamepad2.default.Special)]);

        _this.setAxes([new _GamepadButton2.default(0, _Gamepad2.default.LeftStickLeft, {
            negate: true
        }), new _GamepadButton2.default(0, _Gamepad2.default.LeftStickRight), new _GamepadButton2.default(1, _Gamepad2.default.LeftStickUp, {
            negate: true
        }), new _GamepadButton2.default(1, _Gamepad2.default.LeftStickDown), new _GamepadButton2.default(2, _Gamepad2.default.RightStickLeft, {
            negate: true
        }), new _GamepadButton2.default(2, _Gamepad2.default.RightStickRight), new _GamepadButton2.default(3, _Gamepad2.default.RightStickUp, {
            negate: true
        }), new _GamepadButton2.default(3, _Gamepad2.default.RightStickDown)]);
        return _this;
    }

    return GamepadDefaultMapping;
}(_GamepadMapping3.default);

exports.default = GamepadDefaultMapping;

/***/ }),
/* 45 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class GamepadMapping
 * @memberof Exo
 */
var GamepadMapping = function () {

    /**
     * @constructor
     */
    function GamepadMapping() {
        _classCallCheck(this, GamepadMapping);

        /**
         * @private
         * @member {Set<Exo.GamepadButton>}
         */
        this._buttons = new Set();

        /**
         * @private
         * @member {Set<Exo.GamepadButton>}
         */
        this._axes = new Set();
    }

    /**
     * @public
     * @member {Set<Exo.GamepadButton>}
     */


    _createClass(GamepadMapping, [{
        key: "setButtons",


        /**
         * @public
         * @param {Exo.GamepadButton[]} buttons
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
         * @param {Exo.GamepadButton[]} axes
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
        set: function set(value) {
            this.setButtons(value);
        }

        /**
         * @public
         * @member {Set<Exo.GamepadButton>}
         */

    }, {
        key: "axes",
        get: function get() {
            return this._axes;
        },
        set: function set(value) {
            this.setAxes(value);
        }
    }]);

    return GamepadMapping;
}();

exports.default = GamepadMapping;

/***/ }),
/* 46 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = __webpack_require__(1);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class GamepadButton
 * @memberof Exo
 */
var GamepadButton = function () {

    /**
     * @constructor
     * @param {Number} index
     * @param {Number} channel
     * @param {Object} [options]
     * @param {Number} [options.threshold=0.2]
     * @param {Boolean} [options.negate=false]
     * @param {Boolean} [options.normalize=false]
     */
    function GamepadButton(index, channel) {
        var _ref = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
            _ref$threshold = _ref.threshold,
            threshold = _ref$threshold === undefined ? 0.2 : _ref$threshold,
            _ref$negate = _ref.negate,
            negate = _ref$negate === undefined ? false : _ref$negate,
            _ref$normalize = _ref.normalize,
            normalize = _ref$normalize === undefined ? false : _ref$normalize;

        _classCallCheck(this, GamepadButton);

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
        this._threshold = (0, _utils.clamp)(threshold, 0, 1);

        /**
         * @private
         * @member {Boolean}
         */
        this._negate = negate;

        /**
         * @private
         * @member {Boolean}
         */
        this._normalize = normalize;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(GamepadButton, [{
        key: 'transformValue',


        /**
         * @public
         * @param {Exo.GamepadButton|Number} buttonValue
         * @returns {Number}
         */
        value: function transformValue(buttonValue) {
            var value = typeof buttonValue.value === 'number' ? buttonValue.value : buttonValue;

            if (this._negate) {
                value *= -1;
            }

            if (this._normalize) {
                value = (value + 1) / 2;
            }

            return value >= this._threshold ? value : 0;
        }
    }, {
        key: 'index',
        get: function get() {
            return this._index;
        },
        set: function set(value) {
            this._index = value;
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
        set: function set(value) {
            this._channel = value;
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
        set: function set(value) {
            this._threshold = (0, _utils.clamp)(value, 0, 1);
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
        set: function set(value) {
            this._negate = value;
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
        set: function set(value) {
            this._normalize = value;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'keyCode',
        get: function get() {
            return this._channel & 31;
        }
    }]);

    return GamepadButton;
}();

exports.default = GamepadButton;

/***/ }),
/* 47 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ChannelHandler2 = __webpack_require__(4);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class PointerManager
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
 */
var PointerManager = function (_ChannelHandler) {
    _inherits(PointerManager, _ChannelHandler);

    /**
     * @constructor
     * @param {Exo.Game} game
     * @param {ArrayBuffer} channelBuffer
     */
    function PointerManager(game, channelBuffer) {
        _classCallCheck(this, PointerManager);

        /**
         * @private
         * @member {Exo.Game}
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
         * @member {Exo.Pointer[]}
         */
        _this._pointers = [];

        _this._addEventListeners();
        return _this;
    }

    _createClass(PointerManager, [{
        key: 'getPointers',
        value: function getPointers() {
            return this._pointers;
        }

        /**
         * @param {Number} index
         * @returns {Exo.Pointer}
         */

    }, {
        key: 'getPointer',
        value: function getPointer(index) {
            return this._pointers[index];
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(PointerManager.prototype.__proto__ || Object.getPrototypeOf(PointerManager.prototype), 'destroy', this).call(this);

            this._removeEventListeners();
            this._game = null;
        }

        /**
         * @private
         */

    }, {
        key: '_addEventListeners',
        value: function _addEventListeners() {
            this._onTouchStartHandler = this._onTouchStart.bind(this);
            this._onTouchEndHandler = this._onTouchEnd.bind(this);
            this._onTouchMoveHandler = this._onTouchMove.bind(this);

            this._canvas.addEventListener('touchstart', this._onTouchStartHandler, true);
            this._canvas.addEventListener('touchend', this._onTouchEndHandler, true);
            this._canvas.addEventListener('touchmove', this._onTouchMoveHandler, true);
        }

        /**
         * @private
         */

    }, {
        key: '_removeEventListeners',
        value: function _removeEventListeners() {
            this._canvas.removeEventListener('touchstart', this._onTouchStartHandler, true);
            this._canvas.removeEventListener('touchend', this._onTouchEndHandler, true);
            this._canvas.removeEventListener('touchmove', this._onTouchMoveHandler, true);

            this._onTouchStartHandler = null;
            this._onTouchEndHandler = null;
            this._onTouchMoveHandler = null;
        }
    }, {
        key: '_onTouchStart',
        value: function _onTouchStart(event) {
            if (!this.active) {
                return;
            }

            console.log('touchdown', event);
        }
    }, {
        key: '_onTouchEnd',
        value: function _onTouchEnd(event) {
            if (!this.active) {
                return;
            }

            console.log('touchup', event);
        }
    }, {
        key: '_onTouchMove',
        value: function _onTouchMove(event) {
            if (!this.active) {
                return;
            }

            console.log('touchmove', event);
        }
    }]);

    return PointerManager;
}(_ChannelHandler3.default);

exports.default = PointerManager;

/***/ }),
/* 48 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(5);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _ResourceContainer = __webpack_require__(49);

var _ResourceContainer2 = _interopRequireDefault(_ResourceContainer);

var _factory = __webpack_require__(50);

var Factories = _interopRequireWildcard(_factory);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ResourceLoader
 * @extends {Exo.EventEmitter}
 * @memberof Exo
 */
var ResourceLoader = function (_EventEmitter) {
    _inherits(ResourceLoader, _EventEmitter);

    /**
     * @constructor
     * @param {String} [basePath='']
     */
    function ResourceLoader() {
        var basePath = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';

        _classCallCheck(this, ResourceLoader);

        /**
         * @private
         * @member {Set<Object>}
         */
        var _this = _possibleConstructorReturn(this, (ResourceLoader.__proto__ || Object.getPrototypeOf(ResourceLoader)).call(this));

        _this._queue = new Set();

        /**
         * @private
         * @member {Exo.ResourceContainer}
         */
        _this._resources = new _ResourceContainer2.default();

        /**
         * @private
         * @member {Map<String, Exo.ResourceFactory>}
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

        _this.addFactories();
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.ResourceContainer}
     */


    _createClass(ResourceLoader, [{
        key: 'addFactory',


        /**
         * @public
         * @chainable
         * @param {String} type
         * @param {Exo.ResourceFactory} factory
         * @returns {Exo.ResourceLoader}
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
         * @returns {Exo.ResourceFactory}
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
         * @chainable
         * @returns {Exo.ResourceLoader}
         */

    }, {
        key: 'addFactories',
        value: function addFactories() {
            return this.addFactory('arrayBuffer', new Factories.ArrayBufferFactory()).addFactory('audioBuffer', new Factories.AudioBufferFactory()).addFactory('audio', new Factories.AudioFactory()).addFactory('blob', new Factories.BlobFactory()).addFactory('font', new Factories.FontFactory()).addFactory('image', new Factories.ImageFactory()).addFactory('json', new Factories.JSONFactory()).addFactory('music', new Factories.MusicFactory()).addFactory('sound', new Factories.SoundFactory()).addFactory('sprite', new Factories.SpriteFactory()).addFactory('string', new Factories.StringFactory()).addFactory('texture', new Factories.TextureFactory());
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
         * @param {Object} item.options
         * @returns {Promise<*>}
         */

    }, {
        key: 'loadItem',
        value: function loadItem() {
            var _this3 = this;

            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                type = _ref.type,
                name = _ref.name,
                path = _ref.path,
                options = _ref.options;

            if (this._resources.has(type, name)) {
                return Promise.resolve(this._resources.get(type, name));
            }

            var factory = this.getFactory(type);

            if (this._database) {
                return this._database.loadData(factory.storageType, name).then(function (data) {
                    return data || factory.request(_this3._basePath + path, _this3._request).then(function (data) {
                        return _this3._database.saveData(factory.storageType, name, data);
                    }).then(function (_ref2) {
                        var data = _ref2.data;
                        return data;
                    });
                }).then(function (data) {
                    return factory.create(data, options);
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
         * @returns {Exo.ResourceLoader}
         */

    }, {
        key: 'add',
        value: function add(type, name, path, options) {
            if (!this._factories.has(type)) {
                throw new Error('No resource factory for type "' + type + '".');
            }

            this._queue.add({ type: type, name: name, path: path, options: options });

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} type
         * @param {Map<String, String>|Object<String, String>} list
         * @param {Object} [options]
         * @returns {Exo.ResourceLoader}
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

                    this.add(type, name, path, options);
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
         * @returns {Exo.ResourceLoader}
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

            this._queue.clear();
            this._queue = null;

            this._resources.destroy();
            this._resources = null;

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
        set: function set(value) {
            this._basePath = value;
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
        set: function set(value) {
            this._request = value;
        }
    }]);

    return ResourceLoader;
}(_EventEmitter3.default);

exports.default = ResourceLoader;

/***/ }),
/* 49 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class ResourceContainer
 * @memberOf Exo
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
         * @returns {Exo.ResourceContainer}
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
         * @returns {Exo.ResourceContainer}
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
         * @returns {Exo.ResourceContainer}
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
         * @returns {Exo.ResourceContainer}
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
         * @returns {Exo.ResourceContainer}
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
/* 50 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _ArrayBufferFactory = __webpack_require__(10);

Object.defineProperty(exports, 'ArrayBufferFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ArrayBufferFactory).default;
  }
});

var _AudioBufferFactory = __webpack_require__(51);

Object.defineProperty(exports, 'AudioBufferFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_AudioBufferFactory).default;
  }
});

var _AudioFactory = __webpack_require__(52);

Object.defineProperty(exports, 'AudioFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_AudioFactory).default;
  }
});

var _BlobFactory = __webpack_require__(20);

Object.defineProperty(exports, 'BlobFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_BlobFactory).default;
  }
});

var _FontFactory = __webpack_require__(66);

Object.defineProperty(exports, 'FontFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_FontFactory).default;
  }
});

var _ImageFactory = __webpack_require__(53);

Object.defineProperty(exports, 'ImageFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ImageFactory).default;
  }
});

var _JSONFactory = __webpack_require__(67);

Object.defineProperty(exports, 'JSONFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_JSONFactory).default;
  }
});

var _MusicFactory = __webpack_require__(68);

Object.defineProperty(exports, 'MusicFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_MusicFactory).default;
  }
});

var _SoundFactory = __webpack_require__(69);

Object.defineProperty(exports, 'SoundFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SoundFactory).default;
  }
});

var _SpriteFactory = __webpack_require__(70);

Object.defineProperty(exports, 'SpriteFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SpriteFactory).default;
  }
});

var _StringFactory = __webpack_require__(71);

Object.defineProperty(exports, 'StringFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_StringFactory).default;
  }
});

var _TextureFactory = __webpack_require__(56);

Object.defineProperty(exports, 'TextureFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_TextureFactory).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 51 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ArrayBufferFactory2 = __webpack_require__(10);

var _ArrayBufferFactory3 = _interopRequireDefault(_ArrayBufferFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class AudioBufferFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
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
    value: function create(response, options) {
      return _get(AudioBufferFactory.prototype.__proto__ || Object.getPrototypeOf(AudioBufferFactory.prototype), 'create', this).call(this, response, options).then(function (arrayBuffer) {
        return (0, _utils.decodeAudioBuffer)(arrayBuffer);
      });
    }
  }]);

  return AudioBufferFactory;
}(_ArrayBufferFactory3.default);

exports.default = AudioBufferFactory;

/***/ }),
/* 52 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _BlobFactory2 = __webpack_require__(20);

var _BlobFactory3 = _interopRequireDefault(_BlobFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class AudioFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
 */
var AudioFactory = function (_BlobFactory) {
    _inherits(AudioFactory, _BlobFactory);

    function AudioFactory() {
        _classCallCheck(this, AudioFactory);

        return _possibleConstructorReturn(this, (AudioFactory.__proto__ || Object.getPrototypeOf(AudioFactory)).apply(this, arguments));
    }

    _createClass(AudioFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(response) {
            var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
                _ref$mimeType = _ref.mimeType,
                mimeType = _ref$mimeType === undefined ? (0, _utils.getMimeType)(response, 'audio') : _ref$mimeType,
                _ref$loadEvent = _ref.loadEvent,
                loadEvent = _ref$loadEvent === undefined ? 'canplaythrough' : _ref$loadEvent;

            return _get(AudioFactory.prototype.__proto__ || Object.getPrototypeOf(AudioFactory.prototype), 'create', this).call(this, response, { mimeType: mimeType }).then(function (blob) {
                return new Promise(function (resolve, reject) {
                    var audio = new Audio();

                    audio.addEventListener(loadEvent, function () {
                        return resolve(audio);
                    });
                    audio.addEventListener('error', function () {
                        return reject(audio);
                    });
                    audio.addEventListener('abort', function () {
                        return reject(audio);
                    });

                    audio.src = URL.createObjectURL(blob);
                });
            });
        }
    }, {
        key: 'storageType',


        /**
         * @override
         */
        get: function get() {
            return 'audio';
        }
    }]);

    return AudioFactory;
}(_BlobFactory3.default);

exports.default = AudioFactory;

/***/ }),
/* 53 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _BlobFactory2 = __webpack_require__(20);

var _BlobFactory3 = _interopRequireDefault(_BlobFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ImageFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
 */
var ImageFactory = function (_BlobFactory) {
    _inherits(ImageFactory, _BlobFactory);

    function ImageFactory() {
        _classCallCheck(this, ImageFactory);

        return _possibleConstructorReturn(this, (ImageFactory.__proto__ || Object.getPrototypeOf(ImageFactory)).apply(this, arguments));
    }

    _createClass(ImageFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(response) {
            var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
                _ref$mimeType = _ref.mimeType,
                mimeType = _ref$mimeType === undefined ? (0, _utils.getMimeType)(response, 'image') : _ref$mimeType;

            return _get(ImageFactory.prototype.__proto__ || Object.getPrototypeOf(ImageFactory.prototype), 'create', this).call(this, response, { mimeType: mimeType }).then(function (blob) {
                return new Promise(function (resolve, reject) {
                    var image = new Image();

                    image.addEventListener('load', function () {
                        return resolve(image);
                    });
                    image.addEventListener('error', function () {
                        return reject(image);
                    });
                    image.addEventListener('abort', function () {
                        return reject(image);
                    });

                    image.src = URL.createObjectURL(blob);
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

    return ImageFactory;
}(_BlobFactory3.default);

exports.default = ImageFactory;

/***/ }),
/* 54 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Playable2 = __webpack_require__(12);

var _Playable3 = _interopRequireDefault(_Playable2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Music
 * @extends {Exo.Playable}
 * @memberof Exo
 */
var Music = function (_Playable) {
    _inherits(Music, _Playable);

    /**
     * @constructor
     * @param {HTMLMediaElement} audio
     */
    function Music(audio) {
        _classCallCheck(this, Music);

        var _this = _possibleConstructorReturn(this, (Music.__proto__ || Object.getPrototypeOf(Music)).call(this, audio));

        if (!_utils.webAudioSupported) {
            throw new Error('Web Audio API is not supported, use the fallback Exo.Audio instead.');
        }

        /**
         * @private
         * @member {?AudioContext}
         */
        _this._context = null;

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
        value: function connect(audioManager) {
            if (this._context) {
                return;
            }

            this._context = audioManager.context;

            this._gainNode = this._context.createGain();
            this._gainNode.connect(audioManager.musicNode);

            this._sourceNode = this._context.createMediaElementSource(this._source);
            this._sourceNode.connect(this._gainNode);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Music.prototype.__proto__ || Object.getPrototypeOf(Music.prototype), 'destroy', this).call(this);

            if (this._context) {
                this._context = null;

                this._sourceNode.disconnect();
                this._sourceNode = null;

                this._gainNode.disconnect();
                this._gainNode = null;
            }
        }
    }, {
        key: 'context',
        get: function get() {
            return this._context;
        }

        /**
         * @override
         */

    }, {
        key: 'volume',
        get: function get() {
            return this._context ? this._gainNode.gain.value : 1;
        },
        set: function set(value) {
            if (this._context) {
                this._gainNode.gain.value = (0, _utils.clamp)(value, 0, 1);
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
/* 55 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Playable2 = __webpack_require__(12);

var _Playable3 = _interopRequireDefault(_Playable2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Sound
 * @extends {Exo.Playable}
 * @memberof Exo
 */
var Sound = function (_Playable) {
    _inherits(Sound, _Playable);

    /**
     * @constructor
     * @param {AudioBuffer} audioBuffer
     */
    function Sound(audioBuffer) {
        _classCallCheck(this, Sound);

        var _this = _possibleConstructorReturn(this, (Sound.__proto__ || Object.getPrototypeOf(Sound)).call(this, audioBuffer));

        if (!_utils.webAudioSupported) {
            throw new Error('Web Audio API is not supported, use the fallback Exo.Audio instead.');
        }

        /**
         * @private
         * @member {?AudioContext}
         */
        _this._context = null;

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
        value: function connect(audioManager) {
            if (this._context) {
                return;
            }

            this._context = audioManager.context;

            this._gainNode = this._context.createGain();
            this._gainNode.connect(audioManager.soundNode);
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

            this._sourceNode = this._context.createBufferSource();
            this._sourceNode.buffer = this._source;
            this._sourceNode.loop = this._loop;
            this._sourceNode.playbackRate.value = this._playbackRate;

            this._sourceNode.connect(this._gainNode);
            this._sourceNode.start(0, this._currentTime);

            this._startTime = this._context.currentTime;
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

            if (this._context) {
                this._sourceNode.disconnect();
                this._sourceNode = null;

                this._gainNode.disconnect();
                this._gainNode = null;

                this._context = null;
            }
        }
    }, {
        key: 'context',
        get: function get() {
            return this._context;
        }

        /**
         * @override
         */

    }, {
        key: 'volume',
        get: function get() {
            return this._volume;
        },
        set: function set(value) {
            this._volume = (0, _utils.clamp)(value, 0, 2);

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
            if (!this._startTime || !this._context) {
                return 0;
            }

            return this._currentTime + this._context.currentTime - this._startTime;
        },
        set: function set(value) {
            this.pause();
            this._currentTime = Math.max(0, value);
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
        set: function set(value) {
            this._loop = !!value;

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
        set: function set(value) {
            this._playbackRate = Math.max(0, value);

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
        set: function set(value) {
            if (value) {
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
        set: function set(value) {
            if (value) {
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
/* 56 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ImageFactory2 = __webpack_require__(53);

var _ImageFactory3 = _interopRequireDefault(_ImageFactory2);

var _const = __webpack_require__(0);

var _Texture = __webpack_require__(21);

var _Texture2 = _interopRequireDefault(_Texture);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class TextureFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
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
    value: function create(response) {
      var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          mimeType = _ref.mimeType,
          _ref$scaleMode = _ref.scaleMode,
          scaleMode = _ref$scaleMode === undefined ? _const.SCALE_MODE.NEAREST : _ref$scaleMode,
          _ref$wrapMode = _ref.wrapMode,
          wrapMode = _ref$wrapMode === undefined ? _const.WRAP_MODE.CLAMP_TO_EDGE : _ref$wrapMode;

      return _get(TextureFactory.prototype.__proto__ || Object.getPrototypeOf(TextureFactory.prototype), 'create', this).call(this, response, { mimeType: mimeType }).then(function (image) {
        return new _Texture2.default(image, scaleMode, wrapMode);
      });
    }
  }]);

  return TextureFactory;
}(_ImageFactory3.default);

exports.default = TextureFactory;

/***/ }),
/* 57 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Color = __webpack_require__(6);

var _Color2 = _interopRequireDefault(_Color);

var _Time = __webpack_require__(9);

var _Time2 = _interopRequireDefault(_Time);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Particle
 * @memberof Exo
 */
var Particle = function () {

  /**
   * @constructor
   * @param {Exo.Time} totalLifetime
   */
  function Particle(totalLifetime) {
    _classCallCheck(this, Particle);

    /**
     * @private
     * @member {Exo.Vector}
     */
    this._position = new _Vector2.default();

    /**
     * @private
     * @member {Exo.Vector}
     */
    this._velocity = new _Vector2.default();

    /**
     * @private
     * @member {Number}
     */
    this._rotation = 0;

    /**
     * @private
     * @member {Number}
     */
    this._rotationSpeed = 0;

    /**
     * @private
     * @member {Exo.Vector}
     */
    this._scale = new _Vector2.default(1, 1);

    /**
     * @private
     * @member {Exo.Color}
     */
    this._color = _Color2.default.White.clone();

    /**
     * @private
     * @member {Exo.Time}
     */
    this._elapsedLifetime = new _Time2.default();

    /**
     * @private
     * @member {Exo.Time}
     */
    this._totalLifetime = totalLifetime.clone();
  }

  /**
   * @public
   * @member {Exo.Vector}
   */


  _createClass(Particle, [{
    key: 'position',
    get: function get() {
      return this._position;
    },
    set: function set(value) {
      this._position.copy(value);
    }

    /**
     * @public
     * @member {Exo.Vector}
     */

  }, {
    key: 'velocity',
    get: function get() {
      return this._velocity;
    },
    set: function set(value) {
      this._velocity.copy(value);
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
    set: function set(value) {
      this._rotation = value;
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
    set: function set(value) {
      this._rotationSpeed = value;
    }

    /**
     * @public
     * @member {Exo.Vector}
     */

  }, {
    key: 'scale',
    get: function get() {
      return this._scale;
    },
    set: function set(value) {
      this._velocity.copy(value);
    }

    /**
     * @public
     * @member {Exo.Color}
     */

  }, {
    key: 'color',
    get: function get() {
      return this._color;
    },
    set: function set(value) {
      this._color.copy(value);
    }

    /**
     * @public
     * @member {Exo.Time}
     */

  }, {
    key: 'elapsedLifetime',
    get: function get() {
      return this._elapsedLifetime;
    },
    set: function set(value) {
      this._elapsedLifetime.copy(value);
    }

    /**
     * @public
     * @member {Exo.Time}
     */

  }, {
    key: 'totalLifetime',
    get: function get() {
      return this._totalLifetime;
    },
    set: function set(value) {
      this._totalLifetime.copy(value);
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Time}
     */

  }, {
    key: 'remainingLifetime',
    get: function get() {
      return new _Time2.default(this.totalLifetime.asMilliseconds() - this.elapsedLifetime.asMilliseconds());
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Time}
     */

  }, {
    key: 'elapsedRatio',
    get: function get() {
      return this.elapsedLifetime.asMilliseconds() / this.totalLifetime.asMilliseconds();
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Time}
     */

  }, {
    key: 'remainingRatio',
    get: function get() {
      return this.remainingLifetime.asMilliseconds() / this.totalLifetime.asMilliseconds();
    }
  }]);

  return Particle;
}();

exports.default = Particle;

/***/ }),
/* 58 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class AnimationFrame
 * @memberof Exo
 */
var AnimationFrame = function () {

    /**
     * @constructor
     * @param {Number} duration
     * @param {Exo.Rectangle} rectangle
     * @param {Exo.Vector} [origin=null]
     */
    function AnimationFrame(duration, rectangle) {
        var origin = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;

        _classCallCheck(this, AnimationFrame);

        /**
         * @private
         * @member {Number}
         */
        this._duration = duration;

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._rectangle = rectangle.clone();

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._origin = origin;

        /**
         * @private
         * @member {Boolean}
         */
        this._applyOrigin = !!origin;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(AnimationFrame, [{
        key: "duration",
        get: function get() {
            return this._duration;
        },
        set: function set(value) {
            this._duration = value;
        }

        /**
         * @public
         * @member {Exo.Rectangle}
         */

    }, {
        key: "rectangle",
        get: function get() {
            return this._rectangle;
        },
        set: function set(value) {
            this._rectangle.copy(value);
        }

        /**
         * @public
         * @member {Exo.Vector}
         */

    }, {
        key: "origin",
        get: function get() {
            return this._origin;
        },
        set: function set(value) {
            if (!value) {
                this._origin = null;
                this._applyOrigin = false;

                return;
            }

            if (this._origin) {
                this._origin.copy(value);
            } else {
                this._origin = value.clone();
            }
        }

        /**
         * @public
         * @readonly
         * @member {Boolean}
         */

    }, {
        key: "applyOrigin",
        get: function get() {
            return this._applyOrigin;
        }
    }]);

    return AnimationFrame;
}();

exports.default = AnimationFrame;

/***/ }),
/* 59 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.utils = undefined;

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

var _core = __webpack_require__(60);

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

var _audio = __webpack_require__(79);

Object.keys(_audio).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _audio[key];
    }
  });
});

var _display = __webpack_require__(82);

Object.keys(_display).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _display[key];
    }
  });
});

var _animation = __webpack_require__(89);

Object.keys(_animation).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _animation[key];
    }
  });
});

var _utils = __webpack_require__(1);

var utils = _interopRequireWildcard(_utils);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

/**
 * @namespace Exo
 */
exports.utils = utils;

/***/ }),
/* 60 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _EventEmitter = __webpack_require__(5);

Object.defineProperty(exports, 'EventEmitter', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_EventEmitter).default;
  }
});

var _Shape = __webpack_require__(7);

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

var _Circle = __webpack_require__(61);

Object.defineProperty(exports, 'Circle', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Circle).default;
  }
});

var _Polygon = __webpack_require__(62);

Object.defineProperty(exports, 'Polygon', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Polygon).default;
  }
});

var _Color = __webpack_require__(6);

Object.defineProperty(exports, 'Color', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Color).default;
  }
});

var _Transformable = __webpack_require__(24);

Object.defineProperty(exports, 'Transformable', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Transformable).default;
  }
});

var _RC = __webpack_require__(25);

Object.defineProperty(exports, 'RC4', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_RC).default;
  }
});

var _Random = __webpack_require__(63);

Object.defineProperty(exports, 'Random', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Random).default;
  }
});

var _Time = __webpack_require__(9);

Object.defineProperty(exports, 'Time', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Time).default;
  }
});

var _Clock = __webpack_require__(16);

Object.defineProperty(exports, 'Clock', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Clock).default;
  }
});

var _Timer = __webpack_require__(64);

Object.defineProperty(exports, 'Timer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Timer).default;
  }
});

var _Game = __webpack_require__(65);

Object.defineProperty(exports, 'Game', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Game).default;
  }
});

var _Config = __webpack_require__(26);

Object.defineProperty(exports, 'Config', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Config).default;
  }
});

var _Scene = __webpack_require__(72);

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

var _Quadtree = __webpack_require__(73);

Object.defineProperty(exports, 'Quadtree', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Quadtree).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 61 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Shape2 = __webpack_require__(7);

var _Shape3 = _interopRequireDefault(_Shape2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Circle
 * @implements {Exo.Shape}
 * @memberof Exo
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
         * @member {Exo.Vector}
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
     * @public
     * @readonly
     * @member {Number}
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
            return new Circle(this.x, this.y, this.radius);
        }

        /**
         * @override
         */

    }, {
        key: 'toArray',
        value: function toArray() {
            return [this.x, this.y, this.radius];
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
                    return this._position.distanceTo(shape.position) < this._radius + shape.radius;
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
        key: 'getBounds',
        value: function getBounds() {
            return new _Rectangle2.default(this._x - this._radius, this._y - this._radius, this._radius * 2, this._radius * 2);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._position.destroy();
            this._position = null;
            this._radius = null;
        }

        /**
         * @public
         * @param {Number} x
         * @param {Number} y
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
         * @public
         * @returns {Exo.Circle}
         */

    }, {
        key: 'type',
        get: function get() {
            return _const.SHAPE.CIRCLE;
        }

        /**
         * @public
         * @member {Exo.Vector}
         */

    }, {
        key: 'position',
        get: function get() {
            return this._position;
        },
        set: function set(value) {
            this._position.copy(value);
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
        set: function set(value) {
            this._position.x = value;
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
        set: function set(value) {
            this._position.y = value;
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
        set: function set(value) {
            this._radius = value;
        }
    }], [{
        key: 'Empty',
        get: function get() {
            return new Circle(0, 0, 0);
        }
    }]);

    return Circle;
}(_Shape3.default);

exports.default = Circle;

/***/ }),
/* 62 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Shape2 = __webpack_require__(7);

var _Shape3 = _interopRequireDefault(_Shape2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Polygon
 * @implements {Exo.Shape}
 * @memberof Exo
 */
var Polygon = function (_Shape) {
    _inherits(Polygon, _Shape);

    /**
     * @constructor
     * @param {...Exo.Vector} vectors
     */
    function Polygon() {
        _classCallCheck(this, Polygon);

        /**
         * @private
         * @member {Exo.Vector[]}
         */
        var _this = _possibleConstructorReturn(this, (Polygon.__proto__ || Object.getPrototypeOf(Polygon)).call(this));

        for (var _len = arguments.length, vectors = Array(_len), _key = 0; _key < _len; _key++) {
            vectors[_key] = arguments[_key];
        }

        _this._vectors = vectors;
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */


    _createClass(Polygon, [{
        key: 'set',


        /**
         * @override
         */
        value: function set() {
            for (var _len2 = arguments.length, newVectors = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
                newVectors[_key2] = arguments[_key2];
            }

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
            var array = [];

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._vectors[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var vector = _step.value;

                    array.push(vector.x);
                    array.push(vector.y);
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
         * @member {Exo.Vector[]}
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
/* 63 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _RC = __webpack_require__(25);

var _RC2 = _interopRequireDefault(_RC);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Random
 * @memberof Exo
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
        set: function set(value) {
            this._seed = value;
            this._rc4.setKeys(this.getMixedKeys(this.flatten(value)));
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
/* 64 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Clock2 = __webpack_require__(16);

var _Clock3 = _interopRequireDefault(_Clock2);

var _Time = __webpack_require__(9);

var _Time2 = _interopRequireDefault(_Time);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Timer
 * @extends {Exo.Clock}
 * @memberof Exo
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
     * @param {Number} factor
     * @returns {Exo.Timer}
     */
    value: function reset(timeLimit, factor) {
      this._limit = timeLimit * (factor || 1);
      this._timeBuffer = 0;
      this._isRunning = false;

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} timeLimit
     * @param {Number} factor
     * @returns {Exo.Timer}
     */

  }, {
    key: 'restart',
    value: function restart(timeLimit, factor) {
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
     * @returns {Exo.Time}
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
/* 65 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(5);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _Clock = __webpack_require__(16);

var _Clock2 = _interopRequireDefault(_Clock);

var _Config = __webpack_require__(26);

var _Config2 = _interopRequireDefault(_Config);

var _SceneManager = __webpack_require__(27);

var _SceneManager2 = _interopRequireDefault(_SceneManager);

var _DisplayManager = __webpack_require__(28);

var _DisplayManager2 = _interopRequireDefault(_DisplayManager);

var _AudioManager = __webpack_require__(39);

var _AudioManager2 = _interopRequireDefault(_AudioManager);

var _InputManager = __webpack_require__(40);

var _InputManager2 = _interopRequireDefault(_InputManager);

var _ResourceLoader = __webpack_require__(48);

var _ResourceLoader2 = _interopRequireDefault(_ResourceLoader);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Game
 * @extends {Exo.EventEmitter}
 * @memberof Exo
 */
var Game = function (_EventEmitter) {
  _inherits(Game, _EventEmitter);

  /**
   * @constructor
   * @param {Exo.Config|Object} config
   */
  function Game(config) {
    _classCallCheck(this, Game);

    var _this = _possibleConstructorReturn(this, (Game.__proto__ || Object.getPrototypeOf(Game)).call(this));

    if (!(config instanceof _Config2.default)) {
      config = new _Config2.default(config);
    }

    /**
     * @private
     * @member {Exo.Config}
     */
    _this._config = config;

    /**
     * @private
     * @member {HTMLCanvasElement}
     */
    _this._canvas = config.canvas || document.createElement('canvas');

    /**
     * @private
     * @member {HTMLCanvasElement}
     */
    _this._canvasParent = config.canvasParent || null;

    /**
     * @private
     * @member {Exo.ResourceLoader}
     */
    _this._loader = new _ResourceLoader2.default(config.basePath);

    /**
     * @private
     * @member {Exo.DisplayManager}
     */
    _this._displayManager = new _DisplayManager2.default(_this);

    /**
     * @private
     * @member {Exo.AudioManager}
     */
    _this._audioManager = new _AudioManager2.default(_this);

    /**
     * @private
     * @member {Exo.InputManager}
     */
    _this._inputManager = new _InputManager2.default(_this);

    /**
     * @private
     * @member {Exo.SceneManager}
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
     * @member {Exo.Clock}
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
     * @param {Exo.Scene} scene
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

      this._audioManager.destroy();
      this._audioManager = null;

      this._displayManager.destroy();
      this._displayManager = null;

      this._sceneManager.destroy();
      this._sceneManager = null;

      this._config.destroy();
      this._config = null;

      this._delta.destroy();
      this._delta = null;

      this._canvas = null;
      this._canvasParent = null;
      this._updateHandler = null;
      this._updateId = null;
      this._running = null;
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
     * @member {Exo.Config}
     */

  }, {
    key: 'config',
    get: function get() {
      return this._config;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.ResourceLoader}
     */

  }, {
    key: 'loader',
    get: function get() {
      return this._loader;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.DisplayManager}
     */

  }, {
    key: 'displayManager',
    get: function get() {
      return this._displayManager;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.AudioManager}
     */

  }, {
    key: 'audioManager',
    get: function get() {
      return this._audioManager;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.InputManager}
     */

  }, {
    key: 'inputManager',
    get: function get() {
      return this._inputManager;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.SceneManager}
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
/* 66 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ArrayBufferFactory2 = __webpack_require__(10);

var _ArrayBufferFactory3 = _interopRequireDefault(_ArrayBufferFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class FontFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
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
        value: function create(response) {
            var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
                _ref$addToDocument = _ref.addToDocument,
                addToDocument = _ref$addToDocument === undefined ? true : _ref$addToDocument,
                _ref$family = _ref.family,
                family = _ref$family === undefined ? (0, _utils.getFilename)(response.url) : _ref$family,
                destriptors = _ref.destriptors;

            return _get(FontFactory.prototype.__proto__ || Object.getPrototypeOf(FontFactory.prototype), 'create', this).call(this, response, null).then(function (arrayBuffer) {
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
/* 67 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ResourceFactory2 = __webpack_require__(11);

var _ResourceFactory3 = _interopRequireDefault(_ResourceFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class JSONFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
 */
var JSONFactory = function (_ResourceFactory) {
  _inherits(JSONFactory, _ResourceFactory);

  function JSONFactory() {
    _classCallCheck(this, JSONFactory);

    return _possibleConstructorReturn(this, (JSONFactory.__proto__ || Object.getPrototypeOf(JSONFactory)).apply(this, arguments));
  }

  _createClass(JSONFactory, [{
    key: 'create',


    /**
     * @override
     */
    value: function create(response, options) {
      return Promise.resolve(response.json());
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
/* 68 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _AudioFactory2 = __webpack_require__(52);

var _AudioFactory3 = _interopRequireDefault(_AudioFactory2);

var _Music = __webpack_require__(54);

var _Music2 = _interopRequireDefault(_Music);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class MusicFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
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
        value: function create(response, options) {
            if (!_utils.webAudioSupported) {
                return Promise.reject();
            }

            return _get(MusicFactory.prototype.__proto__ || Object.getPrototypeOf(MusicFactory.prototype), 'create', this).call(this, response, options).then(function (audio) {
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
/* 69 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _AudioBufferFactory2 = __webpack_require__(51);

var _AudioBufferFactory3 = _interopRequireDefault(_AudioBufferFactory2);

var _Sound = __webpack_require__(55);

var _Sound2 = _interopRequireDefault(_Sound);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SoundFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
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
        value: function create(response, options) {
            if (!_utils.webAudioSupported) {
                return Promise.reject();
            }

            return _get(SoundFactory.prototype.__proto__ || Object.getPrototypeOf(SoundFactory.prototype), 'create', this).call(this, response, options).then(function (audioBuffer) {
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
/* 70 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _TextureFactory2 = __webpack_require__(56);

var _TextureFactory3 = _interopRequireDefault(_TextureFactory2);

var _Sprite = __webpack_require__(22);

var _Sprite2 = _interopRequireDefault(_Sprite);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SpriteFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
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
    value: function create(response, options) {
      return _get(SpriteFactory.prototype.__proto__ || Object.getPrototypeOf(SpriteFactory.prototype), 'create', this).call(this, response, options).then(function (texture) {
        return new _Sprite2.default(texture);
      });
    }
  }]);

  return SpriteFactory;
}(_TextureFactory3.default);

exports.default = SpriteFactory;

/***/ }),
/* 71 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ResourceFactory2 = __webpack_require__(11);

var _ResourceFactory3 = _interopRequireDefault(_ResourceFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class StringFactory
 * @extends {Exo.ResourceFactory}
 * @memberof Exo
 */
var StringFactory = function (_ResourceFactory) {
  _inherits(StringFactory, _ResourceFactory);

  function StringFactory() {
    _classCallCheck(this, StringFactory);

    return _possibleConstructorReturn(this, (StringFactory.__proto__ || Object.getPrototypeOf(StringFactory)).apply(this, arguments));
  }

  _createClass(StringFactory, [{
    key: 'create',


    /**
     * @override
     */
    value: function create(response, options) {
      return Promise.resolve(response.text());
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
/* 72 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(5);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Scene
 * @extends {Exo.EventEmitter}
 * @memberof Exo
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
         * @member {Exo.Game}
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
     * @member {Exo.Game}
     */


    _createClass(Scene, [{
        key: 'load',


        /**
         * @public
         * @abstract
         * @param {Exo.ResourceLoader} loader
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
         * @param {Exo.Time} delta
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
        set: function set(value) {
            this._game = value;
        }
    }]);

    return Scene;
}(_EventEmitter3.default);

exports.default = Scene;

/***/ }),
/* 73 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Quadtree
 * @memberof Exo
 */
var Quadtree = function () {

    /**
     * @constructor
     * @param {Exo.Rectangle} bounds
     * @param {Number} [level=0]
     */
    function Quadtree(bounds) {
        var level = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

        _classCallCheck(this, Quadtree);

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._bounds = bounds.clone();

        /**
         * @private
         * @member {Number}
         */
        this._level = level;

        /**
         * @private
         * @member {Map<Number, Exo.Quadtree>}
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
     * @member {Exo.Rectangle}
     */


    _createClass(Quadtree, [{
        key: 'clear',


        /**
         * @public
         * @chainable
         * @returns {Exo.Quadtree}
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
         * @returns {Exo.Quadtree}
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

            if (entities.size > _const.QUAD_TREE_MAX_ENTITIES && this._level < _const.QUAD_TREE_MAX_LEVEL) {
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
         * @returns {?Exo.Quadtree}
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
         * @returns {?Exo.Quadtree}
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
         * @member {Map<Number, Exo.Quadtree>}
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

var _ResourceLoader = __webpack_require__(48);

Object.defineProperty(exports, 'ResourceLoader', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ResourceLoader).default;
  }
});

var _ResourceContainer = __webpack_require__(49);

Object.defineProperty(exports, 'ResourceContainer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ResourceContainer).default;
  }
});

var _ResourceFactory = __webpack_require__(11);

Object.defineProperty(exports, 'ResourceFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ResourceFactory).default;
  }
});

var _factory = __webpack_require__(50);

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

var _utils = __webpack_require__(1);

var _const = __webpack_require__(0);

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Database
 * @memberof Exo
 */
var Database = function () {

    /**
     * @constructor
     * @param {String} name
     * @param {Number} version
     */
    function Database(name, version) {
        _classCallCheck(this, Database);

        if (!_utils.indexedDBSupported) {
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
            var _this2 = this;

            var transactionMode = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'readonly';

            if (!_const.DATABASE_TYPES.includes(type)) {
                return Promise.reject(Error('Could not find ObjectStore named "' + type + '".'));
            }

            return this.open().then(function () {
                return _this2._database.transaction([type], transactionMode).objectStore(type);
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
            var _this3 = this;

            var type = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '*';

            if (type === '*') {
                return _const.DATABASE_TYPES.reduce(function (promise, type) {
                    return promise.then(function () {
                        return _this3.clear(type);
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
            var _this4 = this;

            return this.close().then(function () {
                return new Promise(function (resolve, reject) {
                    var request = indexedDB.deleteDatabase(_this4._name);

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
         * @returns {Promise<Object>}
         */

    }, {
        key: 'loadData',
        value: function loadData(type, name) {
            return this.getObjectStore(type).then(function (store) {
                return new Promise(function (resolve, reject) {
                    var request = store.get(name);

                    request.addEventListener('success', function (event) {
                        var result = event.target.result,
                            data = result && result.value || null;

                        resolve({ data: data, type: type, name: name });
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
         * @param {*} data
         * @returns {Promise<Object>}
         */

    }, {
        key: 'saveData',
        value: function saveData(type, name, data) {
            return this.getObjectStore(type, 'readwrite').then(function (store) {
                return new Promise(function (resolve, reject) {
                    var request = store.put({ key: name, value: data });

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
         * @returns {Promise<Object>}
         */

    }, {
        key: 'removeData',
        value: function removeData(type, name) {
            return this.getObjectStore(type, 'readwrite').then(function (store) {
                return new Promise(function (resolve, reject) {
                    var request = store.delete(name);

                    request.addEventListener('success', function () {
                        return resolve({ type: type, name: name });
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

var _ChannelHandler = __webpack_require__(4);

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

var _InputManager = __webpack_require__(40);

Object.defineProperty(exports, 'InputManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_InputManager).default;
  }
});

var _Keyboard = __webpack_require__(41);

Object.defineProperty(exports, 'Keyboard', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Keyboard).default;
  }
});

var _Mouse = __webpack_require__(42);

Object.defineProperty(exports, 'Mouse', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Mouse).default;
  }
});

var _GamepadButton = __webpack_require__(46);

Object.defineProperty(exports, 'GamepadButton', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_GamepadButton).default;
  }
});

var _GamepadMapping = __webpack_require__(45);

Object.defineProperty(exports, 'GamepadMapping', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_GamepadMapping).default;
  }
});

var _GamepadDefaultMapping = __webpack_require__(44);

Object.defineProperty(exports, 'GamepadDefaultMapping', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_GamepadDefaultMapping).default;
  }
});

var _Gamepad = __webpack_require__(19);

Object.defineProperty(exports, 'Gamepad', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Gamepad).default;
  }
});

var _GamepadManager = __webpack_require__(43);

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

var _PointerManager = __webpack_require__(47);

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

var _EventEmitter2 = __webpack_require__(5);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Input
 * @extends {Exo.EventEmitter}
 * @memberof Exo
 */
var Input = function (_EventEmitter) {
    _inherits(Input, _EventEmitter);

    /**
     * @constructor
     * @param {Number[]} [channels=[]]
     * @param {Object<String, Function>} [events={}]
     * @param {Function} [events.start]
     * @param {Function} [events.stop]
     * @param {Function} [events.active]
     * @param {Function} [events.trigger]
     * @param {*} [context]
     */
    function Input() {
        var channels = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];

        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            start = _ref.start,
            stop = _ref.stop,
            active = _ref.active,
            trigger = _ref.trigger;

        var context = arguments[2];

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
         * @member {Boolean}
         */
        _this._triggered = false;

        /**
         * @private
         * @member {number}
         */
        _this._lastTrigger = 0;

        /**
         * @private
         * @member {number}
         */
        _this._triggerThreshold = 300;

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

                    if (activeChannels[channel]) {
                        this._value = Math.max(activeChannels[channel], this._value);
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

            if (this.active) {
                if (!this._triggered) {
                    this._triggered = true;
                    this._lastTrigger = Date.now();
                    this.trigger('start', this._value);
                }

                this.trigger('active', this._value);
            } else if (this._triggered) {
                this._triggered = false;

                if (Date.now() - this._lastTrigger < this._triggerThreshold) {
                    this.trigger('trigger', this._value);
                }

                this.trigger('stop', this._value);
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
            this._triggered = null;
            this._lastTrigger = null;
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
         * @readonly
         * @member {Boolean}
         */

    }, {
        key: 'triggered',
        get: function get() {
            return this._triggered;
        }

        /**
         * @public
         * @readonly
         * @member {Boolean}
         */

    }, {
        key: 'active',
        get: function get() {
            return this._value > 0;
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
        set: function set(value) {
            this._triggerThreshold = value;
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

var _ChannelHandler2 = __webpack_require__(4);

var _ChannelHandler3 = _interopRequireDefault(_ChannelHandler2);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Pointer
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
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

      return _const.CHANNEL_OFFSET.POINTER + index * _const.CHANNEL_LENGTH.CHILD + (key & 31);
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

var _Playable = __webpack_require__(12);

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

var _Sound = __webpack_require__(55);

Object.defineProperty(exports, 'Sound', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Sound).default;
  }
});

var _Music = __webpack_require__(54);

Object.defineProperty(exports, 'Music', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Music).default;
  }
});

var _AudioManager = __webpack_require__(39);

Object.defineProperty(exports, 'AudioManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_AudioManager).default;
  }
});

var _AudioAnalyser = __webpack_require__(81);

Object.defineProperty(exports, 'AudioAnalyser', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_AudioAnalyser).default;
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

var _Playable2 = __webpack_require__(12);

var _Playable3 = _interopRequireDefault(_Playable2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Audio
 * @extends {Exo.Playable}
 * @memberof Exo
 */
var Audio = function (_Playable) {
    _inherits(Audio, _Playable);

    /**
     * @constructor
     * @param {Audio} audio
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
        value: function connect(audioManager) {
            this.parentVolume = audioManager.masterVolume;
        }
    }, {
        key: 'parentVolume',
        get: function get() {
            return this._parentVolume;
        },
        set: function set(value) {
            var volume = (0, _utils.clamp)(value, 0, 1);

            if (this._parentVolume !== volume) {
                this._parentVolume = volume;
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
        set: function set(value) {
            var volume = (0, _utils.clamp)(value, 0, 2);

            if (this._volume !== volume) {
                this._volume = volume;
                this._source.volume = this._volume * this._parentVolume;
            }
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
 * @memberof Exo
 */
var AudioAnalyser = function () {

  /**
   * @constructor
   * @param {Exo.Sound|Exo.Music|Exo.AudioManager} target
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
     * @member {Exo.Sound|Exo.Music|Exo.AudioManager}
     */
    this._target = target;

    /**
     * @private
     * @member {Object}
     */
    this._options = { fftSize: fftSize, minDecibels: minDecibels, maxDecibels: maxDecibels, smoothingTimeConstant: smoothingTimeConstant };
  }

  _createClass(AudioAnalyser, [{
    key: 'ensureContext',
    value: function ensureContext() {
      if (this._context) {
        return;
      }

      if (!this._target.context) {
        throw new Error('Failed to provide an AudioContext from the target.');
      }

      if (!this._target.analyserTarget) {
        throw new Error('Target has no valid AudioNode to analyse.');
      }

      /**
       * @private
       * @member {AudioContext}
       */
      this._context = this._target.context;

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

var _Texture = __webpack_require__(21);

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

var _WebGLTexture = __webpack_require__(35);

Object.defineProperty(exports, 'WebGLTexture', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_WebGLTexture).default;
  }
});

var _BlendMode = __webpack_require__(38);

Object.defineProperty(exports, 'BlendMode', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_BlendMode).default;
  }
});

var _Renderable = __webpack_require__(23);

Object.defineProperty(exports, 'Renderable', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Renderable).default;
  }
});

var _Container = __webpack_require__(83);

Object.defineProperty(exports, 'Container', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Container).default;
  }
});

var _Renderer = __webpack_require__(17);

Object.defineProperty(exports, 'Renderer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Renderer).default;
  }
});

var _Shader = __webpack_require__(18);

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

var _Sprite = __webpack_require__(22);

Object.defineProperty(exports, 'Sprite', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Sprite).default;
  }
});

var _Text = __webpack_require__(84);

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

var _Particle = __webpack_require__(57);

Object.defineProperty(exports, 'Particle', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Particle).default;
  }
});

var _ParticleEmitter = __webpack_require__(85);

Object.defineProperty(exports, 'ParticleEmitter', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleEmitter).default;
  }
});

var _ParticleShader = __webpack_require__(37);

Object.defineProperty(exports, 'ParticleShader', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleShader).default;
  }
});

var _ParticleRenderer = __webpack_require__(36);

Object.defineProperty(exports, 'ParticleRenderer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleRenderer).default;
  }
});

var _ParticleModifier = __webpack_require__(13);

Object.defineProperty(exports, 'ParticleModifier', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleModifier).default;
  }
});

var _ForceModifier = __webpack_require__(86);

Object.defineProperty(exports, 'ForceModifier', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ForceModifier).default;
  }
});

var _ScaleModifier = __webpack_require__(87);

Object.defineProperty(exports, 'ScaleModifier', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ScaleModifier).default;
  }
});

var _TorqueModifier = __webpack_require__(88);

Object.defineProperty(exports, 'TorqueModifier', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_TorqueModifier).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 83 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderable2 = __webpack_require__(23);

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
 * @extends {Exo.Renderable}
 * @memberof Exo
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
         * @member {Exo.Renderable[]}
         */
        var _this = _possibleConstructorReturn(this, (Container.__proto__ || Object.getPrototypeOf(Container)).call(this));

        _this._children = [];

        /**
         * @private
         * @member {Exo.Vector}
         */
        _this._size = new _Vector2.default();
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Renderable[]}
     */


    _createClass(Container, [{
        key: 'addChild',


        /**
         * @public
         * @chainable
         * @param {Exo.Renderable} child
         * @returns {Exo.Container}
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
         * @param {Exo.Renderable} child
         * @param {Number} index
         * @returns {Exo.Container}
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
         * @param {Exo.Renderable} firstChild
         * @param {Exo.Renderable} secondChild
         * @returns {Exo.Container}
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
         * @param {Exo.Renderable} child
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
         * @param {Exo.Renderable} child
         * @param {Number} index
         * @returns {Exo.Container}
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
         * @returns {Exo.Renderable}
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
         * @param {Exo.Renderable} child
         * @returns {Exo.Container}
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
         * @returns {Exo.Container}
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
         * @returns {Exo.Container}
         */

    }, {
        key: 'removeChildren',
        value: function removeChildren() {
            var begin = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var end = arguments[1];

            var children = this._children,
                endIndex = typeof end === 'number' ? end : children.length,
                range = endIndex - begin;

            if (!range && !children.length) {
                return this;
            }

            if (range < 0 && range > endIndex) {
                throw new Error('removeChildren: numeric values are outside the acceptable range.');
            }

            children.splice(begin, range);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager, parentTransform) {
            if (!this.visible) {
                return;
            }

            this._worldTransform.copy(parentTransform);
            this._worldTransform.multiply(this.transform);

            for (var i = 0, len = this._children.length; i < len; i++) {
                this._children[i].render(displayManager, this._worldTransform);
            }
        }

        /**
         * @override
         * @param {Boolean} [destroyChildren=false]
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            var destroyChildren = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

            _get(Container.prototype.__proto__ || Object.getPrototypeOf(Container.prototype), 'destroy', this).call(this);

            if (destroyChildren) {
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = this._children[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var child = _step.value;

                        child.destroy();
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
         * @member {Exo.Renderable|Exo.Container}
         */

    }, {
        key: 'parent',
        get: function get() {
            return this._parent;
        },
        set: function set(value) {
            this._parent = value;
        }

        /**
         * @public
         * @member {Exo.Vector}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(value) {
            this._size.copy(value);
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
        set: function set(value) {
            this._size.x = value;
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
        set: function set(value) {
            this._size.y = value;
        }
    }]);

    return Container;
}(_Renderable3.default);

exports.default = Container;

/***/ }),
/* 84 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Sprite2 = __webpack_require__(22);

var _Sprite3 = _interopRequireDefault(_Sprite2);

var _Texture = __webpack_require__(21);

var _Texture2 = _interopRequireDefault(_Texture);

var _Color = __webpack_require__(6);

var _Color2 = _interopRequireDefault(_Color);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var defaultStyle = {
    align: 'left',
    color: 'black',
    outlineColor: 'black',
    outlineWidth: 0,
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Arial',
    wordWrap: false,
    wordWrapWidth: 100,
    baseline: 'top'
},
    heightCache = new Map();

/**
 * @class Text
 * @extends {Exo.Sprite}
 * @memberof Exo
 */

var Text = function (_Sprite) {
    _inherits(Text, _Sprite);

    /**
     * @constructor
     * @param {String} [text='']
     * @param {?Object} [style=null]
     * @param {Number} [scaleMode=SCALE_MODE.NEAREST]
     * @param {Number} [wrapMode=WRAP_MODE.CLAMP_TO_EDGE]
     */
    function Text() {
        var text = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
        var style = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
        var scaleMode = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : _const.SCALE_MODE.NEAREST;
        var wrapMode = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : _const.WRAP_MODE.CLAMP_TO_EDGE;

        _classCallCheck(this, Text);

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        var _this = _possibleConstructorReturn(this, (Text.__proto__ || Object.getPrototypeOf(Text)).call(this, new _Texture2.default(document.createElement('canvas'), scaleMode, wrapMode)));

        _this._canvas = _this._texture.source;

        /**
         * @private
         * @member {CanvasRenderingContext2D}
         */
        _this._context = _this._canvas.getContext('2d');

        /**
         * @private
         * @member {Number}
         */
        _this._scaleMode = scaleMode;

        /**
         * @private
         * @member {Number}
         */
        _this._wrapMode = wrapMode;

        /**
         * @private
         * @member {String}
         */
        _this._text = text;

        /**
         * @private
         * @member {Object}
         */
        _this._style = Object.assign(Object.create(defaultStyle), style);

        _this._updateCanvas();
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {HTMLCanvasElement}
     */


    _createClass(Text, [{
        key: '_updateCanvas',


        /**
         * @private
         */
        value: function _updateCanvas() {
            var canvas = this._canvas,
                context = this._context,
                style = this._style,
                text = style.wordWrap ? this._getWordWrappedText() : this._text,
                font = style.fontWeight + ' ' + style.fontSize + 'px ' + style.fontFamily,
                outlineWidth = style.outlineWidth,
                lines = text.split(/(?:\r\n|\r|\n)/),
                linesLen = lines.length,
                lineWidths = [],
                lineHeight = this._determineFontHeight(font) + outlineWidth;

            var maxLineWidth = 0;

            // set canvas text styles
            context.font = font;

            for (var i = 0; i < linesLen; i++) {
                var lineWidth = context.measureText(lines[i]).width;

                lineWidths[i] = lineWidth;
                maxLineWidth = Math.max(maxLineWidth, lineWidth);
            }

            canvas.width = maxLineWidth + outlineWidth;
            canvas.height = lineHeight * lines.length;

            // set canvas text styles
            context.fillStyle = style.color;
            context.font = font;
            context.strokeStyle = style.outlineColor;
            context.lineWidth = outlineWidth;
            context.textBaseline = style.baseline;

            // draw lines line by line
            for (var _i = 0; _i < linesLen; _i++) {
                var linePositionY = outlineWidth / 2 + _i * lineHeight;
                var linePositionX = outlineWidth / 2;

                if (style.align === 'right') {
                    linePositionX += maxLineWidth - lineWidths[_i];
                } else if (style.align === 'center') {
                    linePositionX += (maxLineWidth - lineWidths[_i]) / 2;
                }

                if (style.outlineColor && style.outlineWidth) {
                    context.strokeText(lines[_i], linePositionX, linePositionY);
                }

                if (style.color) {
                    context.fillText(lines[_i], linePositionX, linePositionY);
                }
            }

            // this.setTexture(this.texture);
            this.texture = new _Texture2.default(canvas, this._scaleMode);
        }

        /**
         * @private
         * @returns {String}
         */

    }, {
        key: '_getWordWrappedText',
        value: function _getWordWrappedText() {
            // Greedy wrapping algorithm that will wrap words as the line grows longer
            // than its horizontal bounds.
            var context = this._context,
                lines = this._text.split('\n'),
                linesLen = lines.length;

            var spaceLeft = this._style.wordWrapWidth,
                result = '';

            for (var i = 0; i < linesLen; i++) {
                var words = lines[i].split(' '),
                    wordsLen = words.length;

                for (var j = 0; j < wordsLen; j++) {
                    var wordWidth = context.measureText(words[j]).width,
                        wordWidthWithSpace = wordWidth + context.measureText(' ').width;

                    if (wordWidthWithSpace > spaceLeft) {
                        // Skip printing the newline if it's the first word of the line that is
                        // greater than the word wrap width.
                        if (j > 0) {
                            result += '\n';
                        }

                        spaceLeft -= wordWidth;
                    } else {
                        spaceLeft -= wordWidthWithSpace;
                    }

                    result += words[j] + ' ';
                }

                if (i < linesLen - 1) {
                    result += '\n';
                }
            }

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
                var body = document.getElementsByTagName('body')[0],
                    dummy = document.createElement('div');

                dummy.appendChild(document.createTextNode('M'));
                dummy.setAttribute('style', 'font: ' + font + ';position:absolute;top:0;left:0');

                body.appendChild(dummy);
                heightCache.set(font, dummy.offsetHeight);
                body.removeChild(dummy);
            }

            return heightCache.get(font);
        }
    }, {
        key: 'canvas',
        get: function get() {
            return this._canvas;
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
            this._scaleMode = scaleMode;
            this._updateCanvas();
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
        set: function set(scaleMode) {
            this._wrapMode = scaleMode;
            this._updateCanvas();
        }

        /**
         * @public
         * @member {String}
         */

    }, {
        key: 'text',
        get: function get() {
            return this._text;
        },
        set: function set(text) {
            this._text = text || '';
            this._updateCanvas();
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
            this._style = Object.assign(Object.create(defaultStyle), style || null);
            this._updateCanvas();
        }

        /**
         * @public
         * @member {String}
         */

    }, {
        key: 'align',
        get: function get() {
            return this._style.align;
        },
        set: function set(align) {
            this._style.align = align || 'left';
            this._updateCanvas();
        }

        /**
         * @public
         * @member {Exo.Color|String}
         */

    }, {
        key: 'color',
        get: function get() {
            return this._style.color;
        },
        set: function set(color) {
            this._style.color = color instanceof _Color2.default ? color.getHexCode(true) : color || '';
            this._updateCanvas();
        }

        /**
         * @public
         * @member {Exo.Color|String}
         */

    }, {
        key: 'outlineColor',
        get: function get() {
            return this._style.outlineColor;
        },
        set: function set(color) {
            this._style.outlineColor = color instanceof _Color2.default ? color.getHexCode(true) : color || '';
            this._updateCanvas();
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'outlineWidth',
        get: function get() {
            return this._style.outlineWidth;
        },
        set: function set(outlineWidth) {
            this._style.outlineWidth = outlineWidth || 0;
            this._updateCanvas();
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'fontSize',
        get: function get() {
            return this._style.fontSize;
        },
        set: function set(fontSize) {
            this._style.fontSize = fontSize || 0;
            this._updateCanvas();
        }

        /**
         * @public
         * @member {String}
         */

    }, {
        key: 'fontWeight',
        get: function get() {
            return this._style.fontWeight;
        },
        set: function set(fontWeight) {
            this._style.fontWeight = fontWeight || 'normal';
            this._updateCanvas();
        }

        /**
         * @public
         * @member {String}
         */

    }, {
        key: 'fontFamily',
        get: function get() {
            return this._style.fontFamily;
        },
        set: function set(fontFamily) {
            this._style.fontFamily = fontFamily || 'Arial';
            this._updateCanvas();
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'wordWrap',
        get: function get() {
            return this._style.wordWrap;
        },
        set: function set(wordWrap) {
            this._style.wordWrap = !!wordWrap;
            this._updateCanvas();
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'wordWrapWidth',
        get: function get() {
            return this._style.wordWrapWidth;
        },
        set: function set(wordWrapWidth) {
            this._style.wordWrapWidth = typeof wordWrapWidth === 'number' ? wordWrapWidth : 100;
            this._updateCanvas();
        }

        /**
         * @public
         * @member {String}
         */

    }, {
        key: 'baseline',
        get: function get() {
            return this._style.baseline;
        },
        set: function set(baseline) {
            this._style.baseline = baseline || 'top';
            this._updateCanvas();
        }
    }]);

    return Text;
}(_Sprite3.default);

exports.default = Text;

/***/ }),
/* 85 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Particle = __webpack_require__(57);

var _Particle2 = _interopRequireDefault(_Particle);

var _Rectangle = __webpack_require__(3);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Color = __webpack_require__(6);

var _Color2 = _interopRequireDefault(_Color);

var _Time = __webpack_require__(9);

var _Time2 = _interopRequireDefault(_Time);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class ParticleEmitter
 * @memberof Exo
 */
var ParticleEmitter = function () {

    /**
     * @constructor
     * @param {Exo.Texture} texture
     */
    function ParticleEmitter(texture) {
        _classCallCheck(this, ParticleEmitter);

        /**
         * @private
         * @member {Exo.Texture}
         */
        this._texture = texture;

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._textureRect = new _Rectangle2.default(0, 0, texture.width, texture.height);

        /**
         * @private
         * @member {Exo.Rectangle}
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
         * @member {Exo.ParticleModifier[]}
         */
        this._modifiers = [];

        /**
         * @private
         * @member {Exo.Particle[]}
         */
        this._particles = [];

        /**
         * @private
         * @member {Exo.Time}
         */
        this._particleLifeTime = new _Time2.default(1, _Time2.default.Seconds);

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._particlePosition = new _Vector2.default();

        /**
         * @private
         * @member {Exo.Vector}
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
         * @member {Exo.Vector}
         */
        this._particleScale = new _Vector2.default(1, 1);

        /**
         * @private
         * @member {Exo.Color}
         */
        this._particleColor = _Color2.default.White.clone();
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Particle[]}
     */


    _createClass(ParticleEmitter, [{
        key: 'setTextureRect',
        value: function setTextureRect(textureRect) {
            var texture = this._texture,
                width = texture.width,
                height = texture.height,
                x = textureRect.x / width,
                y = textureRect.y / height;

            this._textureCoords.set(x, y, x + textureRect.width / width, y + textureRect.height / height);
            this._textureRect.copy(textureRect);
        }
    }, {
        key: 'addModifier',
        value: function addModifier(modifier) {
            this._modifiers.push(modifier);
        }
    }, {
        key: 'computeParticleCount',
        value: function computeParticleCount(time) {
            var particleAmount = this._emissionRate * time.asSeconds() + this._emissionDelta,
                particles = particleAmount | 0;

            this._emissionDelta = particleAmount - particles;

            return particles;
        }
    }, {
        key: 'update',
        value: function update(delta) {
            var particles = this._particles,
                modifiers = this._modifiers,
                particleCount = this.computeParticleCount(delta),
                modifierCount = modifiers.length;

            for (var i = 0; i < particleCount; i++) {
                var particle = new _Particle2.default(this._particleLifeTime);

                particle.position.copy(this._particlePosition);
                particle.velocity.copy(this._particleVelocity);
                particle.rotation = this._particleRotation;
                particle.rotationSpeed = this._particleRotationSpeed;
                particle.scale.copy(this._particleScale);
                particle.color.copy(this._particleColor);

                particles.push(particle);
            }

            for (var _i = particles.length - 1; _i >= 0; _i--) {
                var _particle = particles[_i];

                this.updateParticle(_particle, delta);

                if (_particle.elapsedLifetime.greaterThan(_particle.totalLifetime)) {
                    particles.splice(_i, 1);
                    continue;
                }

                for (var j = 0; j < modifierCount; j++) {
                    modifiers[j].apply(_particle, delta);
                }
            }
        }
    }, {
        key: 'updateParticle',
        value: function updateParticle(particle, delta) {
            var seconds = delta.asSeconds(),
                velocity = particle.velocity;

            particle.elapsedLifetime.add(delta);
            particle.position.add(seconds * velocity.x, seconds * velocity.y);
            particle.rotation += seconds * particle.rotationSpeed;
        }
    }, {
        key: 'render',
        value: function render(displayManager) {
            displayManager.setCurrentRenderer('particle');
            displayManager.getCurrentRenderer().render(this);
        }
    }, {
        key: 'particles',
        get: function get() {
            return this._particles;
        }

        /**
         * @public
         * @readonly
         * @member {Exo.ParticleModifier[]}
         */

    }, {
        key: 'modifiers',
        get: function get() {
            return this._modifiers;
        }

        /**
         * @public
         * @readonly
         * @member {Exo.Rectangle}
         */

    }, {
        key: 'textureRect',
        get: function get() {
            return this._textureRect;
        }

        /**
         * @public
         * @member {Exo.Texture}
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
         * @member {Exo.Rectangle}
         */

    }, {
        key: 'textureCoords',
        get: function get() {
            return this._textureCoords;
        },
        set: function set(value) {
            this._textureCoords.copy(value);
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
         * @member {Exo.Time}
         */

    }, {
        key: 'particleLifeTime',
        get: function get() {
            return this._particleLifeTime;
        },
        set: function set(particleLifeTime) {
            this._particleLifeTime.copy(particleLifeTime);
        }

        /**
         * @public
         * @member {Exo.Vector}
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
         * @member {Exo.Vector}
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
         * @member {Exo.Vector}
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
         * @member {Exo.Color}
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
/* 86 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ParticleModifier2 = __webpack_require__(13);

var _ParticleModifier3 = _interopRequireDefault(_ParticleModifier2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ForceModifier
 * @implements {Exo.ParticleModifier}
 * @memberof Exo
 */
var ForceModifier = function (_ParticleModifier) {
    _inherits(ForceModifier, _ParticleModifier);

    /**
     * @constructor
     * @param {Exo.Vector} acceleration
     */
    function ForceModifier(acceleration) {
        _classCallCheck(this, ForceModifier);

        var _this = _possibleConstructorReturn(this, (ForceModifier.__proto__ || Object.getPrototypeOf(ForceModifier)).call(this));

        _this._acceleration = acceleration.clone();
        return _this;
    }

    /**
     * @public
     * @param {Exo.Vector} acceleration
     */


    _createClass(ForceModifier, [{
        key: 'setAcceleration',
        value: function setAcceleration(acceleration) {
            this._acceleration.copy(acceleration);
        }

        /**
         * @public
         * @returns {Exo.Vector}
         */

    }, {
        key: 'getAcceleration',
        value: function getAcceleration() {
            return this._acceleration;
        }

        /**
         * @override
         */

    }, {
        key: 'apply',
        value: function apply(particle, delta) {
            var acceleration = this._acceleration,
                seconds = delta.asSeconds();

            particle.velocity.add(seconds * acceleration.x, seconds * acceleration.y);
        }
    }]);

    return ForceModifier;
}(_ParticleModifier3.default);

exports.default = ForceModifier;

/***/ }),
/* 87 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ParticleModifier2 = __webpack_require__(13);

var _ParticleModifier3 = _interopRequireDefault(_ParticleModifier2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ScaleModifier
 * @implements {Exo.ParticleModifier}
 * @memberof Exo
 */
var ScaleModifier = function (_ParticleModifier) {
    _inherits(ScaleModifier, _ParticleModifier);

    /**
     * @constructor
     * @param {Exo.Vector} scaleFactor
     */
    function ScaleModifier(scaleFactor) {
        _classCallCheck(this, ScaleModifier);

        var _this = _possibleConstructorReturn(this, (ScaleModifier.__proto__ || Object.getPrototypeOf(ScaleModifier)).call(this));

        _this._scaleFactor = scaleFactor.clone();
        return _this;
    }

    /**
     * @public
     * @param {Exo.Vector} scaleFactor
     */


    _createClass(ScaleModifier, [{
        key: 'setScaleFactor',
        value: function setScaleFactor(scaleFactor) {
            this._scaleFactor.copy(scaleFactor);
        }

        /**
         * @public
         * @returns {Exo.Vector}
         */

    }, {
        key: 'getScaleFactor',
        value: function getScaleFactor() {
            return this._scaleFactor;
        }

        /**
         * @override
         */

    }, {
        key: 'apply',
        value: function apply(particle, delta) {
            var scaleFactor = this._scaleFactor,
                seconds = delta.asSeconds();

            particle.scale.add(seconds * scaleFactor.x, seconds * scaleFactor.y);
        }
    }]);

    return ScaleModifier;
}(_ParticleModifier3.default);

exports.default = ScaleModifier;

/***/ }),
/* 88 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ParticleModifier2 = __webpack_require__(13);

var _ParticleModifier3 = _interopRequireDefault(_ParticleModifier2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class TorqueModifier
 * @implements {Exo.ParticleModifier}
 * @memberof Exo
 */
var TorqueModifier = function (_ParticleModifier) {
  _inherits(TorqueModifier, _ParticleModifier);

  /**
   * @constructor
   * @param {Number} angularAcceleration
   */
  function TorqueModifier(angularAcceleration) {
    _classCallCheck(this, TorqueModifier);

    var _this = _possibleConstructorReturn(this, (TorqueModifier.__proto__ || Object.getPrototypeOf(TorqueModifier)).call(this));

    _this._angularAcceleration = angularAcceleration;
    return _this;
  }

  /**
   * @public
   * @param {Number} angularAcceleration
   */


  _createClass(TorqueModifier, [{
    key: 'setAngularAcceleration',
    value: function setAngularAcceleration(angularAcceleration) {
      this._angularAcceleration = angularAcceleration;
    }

    /**
     * @public
     * @returns {Exo.Vector}
     */

  }, {
    key: 'getAngularAcceleration',
    value: function getAngularAcceleration() {
      return this._angularAcceleration;
    }

    /**
     * @override
     */

  }, {
    key: 'apply',
    value: function apply(particle, delta) {
      particle.rotationSpeed += delta.asSeconds() * this._angularAcceleration;
    }
  }]);

  return TorqueModifier;
}(_ParticleModifier3.default);

exports.default = TorqueModifier;

/***/ }),
/* 89 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _Animation = __webpack_require__(14);

Object.defineProperty(exports, 'Animation', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Animation).default;
  }
});

var _ColorAnimation = __webpack_require__(90);

Object.defineProperty(exports, 'ColorAnimation', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ColorAnimation).default;
  }
});

var _FadeAnimation = __webpack_require__(91);

Object.defineProperty(exports, 'FadeAnimation', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_FadeAnimation).default;
  }
});

var _FrameAnimation = __webpack_require__(92);

Object.defineProperty(exports, 'FrameAnimation', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_FrameAnimation).default;
  }
});

var _AnimationFrame = __webpack_require__(58);

Object.defineProperty(exports, 'AnimationFrame', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_AnimationFrame).default;
  }
});

var _Animator = __webpack_require__(93);

Object.defineProperty(exports, 'Animator', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Animator).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 90 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _Animation2 = __webpack_require__(14);

var _Animation3 = _interopRequireDefault(_Animation2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ColorAnimation
 * @implements {Exo.Animation}
 * @memberof Exo
 */
var ColorAnimation = function (_Animation) {
  _inherits(ColorAnimation, _Animation);

  /**
   * @constructor
   * @param {...Exo.Color} colors
   */
  function ColorAnimation() {
    _classCallCheck(this, ColorAnimation);

    /**
     * @private
     * @member {Exo.Color[]}
     */
    var _this = _possibleConstructorReturn(this, (ColorAnimation.__proto__ || Object.getPrototypeOf(ColorAnimation)).call(this));

    for (var _len = arguments.length, colors = Array(_len), _key = 0; _key < _len; _key++) {
      colors[_key] = arguments[_key];
    }

    _this._colorGradient = colors;
    return _this;
  }

  return ColorAnimation;
}(_Animation3.default);

exports.default = ColorAnimation;

/***/ }),
/* 91 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Animation2 = __webpack_require__(14);

var _Animation3 = _interopRequireDefault(_Animation2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class FadeAnimation
 * @implements {Exo.Animation}
 * @memberof Exo
 */
var FadeAnimation = function (_Animation) {
    _inherits(FadeAnimation, _Animation);

    /**
     * @constructor
     * @param {Number} inRatio
     * @param {Number} outRatio
     */
    function FadeAnimation(inRatio, outRatio) {
        _classCallCheck(this, FadeAnimation);

        /**
         * @private
         * @member {Number}
         */
        var _this = _possibleConstructorReturn(this, (FadeAnimation.__proto__ || Object.getPrototypeOf(FadeAnimation)).call(this));

        _this._inRatio = inRatio;

        /**
         * @private
         * @member {Number}
         */
        _this._outRatio = outRatio;
        return _this;
    }

    /**
     * @override
     */


    _createClass(FadeAnimation, [{
        key: 'apply',
        value: function apply(animated, progress) {
            var inRatio = this._inRatio,
                outRatio = this._outRatio;

            if (progress < inRatio) {
                animated.color.a = 255 * progress / inRatio;
            } else if (progress > 1 - outRatio) {
                animated.color.a = 255 * (1 - progress) / outRatio;
            }
        }
    }]);

    return FadeAnimation;
}(_Animation3.default);

exports.default = FadeAnimation;

/***/ }),
/* 92 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Animation2 = __webpack_require__(14);

var _Animation3 = _interopRequireDefault(_Animation2);

var _AnimationFrame = __webpack_require__(58);

var _AnimationFrame2 = _interopRequireDefault(_AnimationFrame);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class FrameAnimation
 * @implements {Exo.Animation}
 * @memberof Exo
 */
var FrameAnimation = function (_Animation) {
    _inherits(FrameAnimation, _Animation);

    /**
     * @constructor
     */
    function FrameAnimation() {
        _classCallCheck(this, FrameAnimation);

        /**
         * @private
         * @member {Exo.AnimationFrame[]}
         */
        var _this = _possibleConstructorReturn(this, (FrameAnimation.__proto__ || Object.getPrototypeOf(FrameAnimation)).call(this));

        _this._frames = [];

        /**
         * @private
         * @member {Boolean}
         */
        _this._normalized = false;
        return _this;
    }

    /**
     * @public
     * @param {Number} relativeDuration
     * @param {Exo.Rectangle} rectangle
     * @param {Exo.Vector} [origin]
     */


    _createClass(FrameAnimation, [{
        key: 'addFrame',
        value: function addFrame(relativeDuration, rectangle, origin) {
            this._frames.push(new _AnimationFrame2.default(relativeDuration, rectangle, origin));
            this._normalized = false;
        }

        /**
         * @public
         */

    }, {
        key: 'ensureNormalized',
        value: function ensureNormalized() {
            if (this._normalized) {
                return;
            }

            var sum = this._frames.reduce(function (val, frame) {
                return val + frame.duration;
            }, 0);

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._frames[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var frame = _step.value;

                    frame.duration /= sum;
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

            this._normalized = true;
        }

        /**
         * @override
         */

    }, {
        key: 'apply',
        value: function apply(target, progress) {
            if (!this._frames.length || progress < 0 || progress > 1) {
                return;
            }

            this.ensureNormalized();

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this._frames[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var frame = _step2.value;

                    progress -= frame.duration;

                    if (progress <= 0) {
                        target.setTextureRect(frame.rectangle);

                        if (frame.applyOrigin) {
                            target.setOrigin(frame.origin);
                        }

                        break;
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
    }]);

    return FrameAnimation;
}(_Animation3.default);

exports.default = FrameAnimation;

/***/ }),
/* 93 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @interface Animator
 * @memberof Exo
 */
var Animator = function () {
  function Animator() {
    _classCallCheck(this, Animator);
  }

  _createClass(Animator, [{
    key: "addAnimation",


    /**
     * @public
     * @virtual
     * @param {String} name
     * @param {Exo.Animation} animation
     * @param {Number} duration
     */
    value: function addAnimation(name, animation, duration) {
      // do nothing
    }
  }]);

  return Animator;
}();

exports.default = Animator;

/***/ })
/******/ ]);
//# sourceMappingURL=exo.build.js.map