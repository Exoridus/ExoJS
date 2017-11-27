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
/******/ 	return __webpack_require__(__webpack_require__.s = 69);
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
RAD_PER_DEG = exports.RAD_PER_DEG = Math.PI / 180,


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @type {Number}
 */
DEG_PER_RAD = exports.DEG_PER_RAD = 180 / Math.PI,


/**
 * @public
 * @constant
 * @name TIME
 * @type {Object<String, Number>}
 * @property {Number} MILLISECONDS
 * @property {Number} SECONDS
 * @property {Number} MINUTES
 * @property {Number} HOURS
 */
TIME = exports.TIME = {
    MILLISECONDS: 1,
    SECONDS: 1000,
    MINUTES: 60000,
    HOURS: 3600000
},


/**
 * @public
 * @constant
 * @name TEXTURE_FLAGS
 * @type {Object<String, Number>}
 * @property {Number} NONE
 * @property {Number} SCALE_MODE
 * @property {Number} WRAP_MODE
 * @property {Number} PREMULTIPLY_ALPHA
 * @property {Number} SOURCE
 * @property {Number} SIZE
 */
TEXTURE_FLAGS = exports.TEXTURE_FLAGS = {
    NONE: 0,
    SCALE_MODE: 1 << 0,
    WRAP_MODE: 1 << 1,
    PREMULTIPLY_ALPHA: 1 << 2,
    SOURCE: 1 << 3,
    SIZE: 1 << 4
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
    SHORT: 0x1402,
    INT: 0x1404,
    FLOAT: 0x1406,
    UNSIGNED_BYTE: 0x1401,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405
},


/**
 * @public
 * @constant
 * @name INPUT_DEVICE_KEYBOARD
 * @type {Number}
 */
INPUT_DEVICE_KEYBOARD = exports.INPUT_DEVICE_KEYBOARD = 0,


/**
 * @public
 * @constant
 * @name INPUT_DEVICE_POINTER
 * @type {Number}
 */
INPUT_DEVICE_POINTER = exports.INPUT_DEVICE_POINTER = 1,


/**
 * @public
 * @constant
 * @name INPUT_DEVICE_GAMEPAD
 * @type {Number}
 */
INPUT_DEVICE_GAMEPAD = exports.INPUT_DEVICE_GAMEPAD = 2,


/**
 * @public
 * @constant
 * @name INPUT_DEVICE_COUNT
 * @type {Number}
 */
INPUT_DEVICE_COUNT = exports.INPUT_DEVICE_COUNT = 3,


/**
 * @public
 * @constant
 * @name INPUT_CHANNELS_HANDLER
 * @type {Number}
 */
INPUT_CHANNELS_HANDLER = exports.INPUT_CHANNELS_HANDLER = 32,


/**
 * @public
 * @constant
 * @name INPUT_CHANNELS_DEVICE
 * @type {Number}
 */
INPUT_CHANNELS_DEVICE = exports.INPUT_CHANNELS_DEVICE = 256,


/**
 * @public
 * @constant
 * @name INPUT_CHANNELS_GLOBAL
 * @type {Number}
 */
INPUT_CHANNELS_GLOBAL = exports.INPUT_CHANNELS_GLOBAL = INPUT_CHANNELS_DEVICE * INPUT_DEVICE_COUNT,


/**
 * @public
 * @constant
 * @name INPUT_OFFSET_KEYBOARD
 * @type {Number}
 */
INPUT_OFFSET_KEYBOARD = exports.INPUT_OFFSET_KEYBOARD = INPUT_DEVICE_KEYBOARD * INPUT_CHANNELS_DEVICE,


/**
 * @public
 * @constant
 * @name INPUT_OFFSET_POINTER
 * @type {Number}
 */
INPUT_OFFSET_POINTER = exports.INPUT_OFFSET_POINTER = INPUT_DEVICE_POINTER * INPUT_CHANNELS_DEVICE,


/**
 * @public
 * @constant
 * @name INPUT_OFFSET_GAMEPAD
 * @type {Number}
 */
INPUT_OFFSET_GAMEPAD = exports.INPUT_OFFSET_GAMEPAD = INPUT_DEVICE_GAMEPAD * INPUT_CHANNELS_DEVICE,


/**
 * @public
 * @constant
 * @name KEYBOARD
 * @type {Object<String, Number>}
 * @property {Number} Backspace
 * @property {Number} Tab
 * @property {Number} Clear
 * @property {Number} Enter
 * @property {Number} Shift
 * @property {Number} Control
 * @property {Number} Alt
 * @property {Number} Pause
 * @property {Number} CapsLock
 * @property {Number} Escape
 * @property {Number} Space
 * @property {Number} PageUp
 * @property {Number} PageDown
 * @property {Number} End
 * @property {Number} Home
 * @property {Number} Left
 * @property {Number} Up
 * @property {Number} Right
 * @property {Number} Down
 * @property {Number} Insert
 * @property {Number} Delete
 * @property {Number} Help
 * @property {Number} Zero
 * @property {Number} One
 * @property {Number} Two
 * @property {Number} Three
 * @property {Number} Four
 * @property {Number} Five
 * @property {Number} Six
 * @property {Number} Seven
 * @property {Number} Eight
 * @property {Number} Nine
 * @property {Number} A
 * @property {Number} B
 * @property {Number} C
 * @property {Number} D
 * @property {Number} E
 * @property {Number} F
 * @property {Number} G
 * @property {Number} H
 * @property {Number} I
 * @property {Number} J
 * @property {Number} K
 * @property {Number} L
 * @property {Number} M
 * @property {Number} N
 * @property {Number} O
 * @property {Number} P
 * @property {Number} Q
 * @property {Number} R
 * @property {Number} S
 * @property {Number} T
 * @property {Number} U
 * @property {Number} V
 * @property {Number} W
 * @property {Number} X
 * @property {Number} Y
 * @property {Number} Z
 * @property {Number} NumPad0
 * @property {Number} NumPad1
 * @property {Number} NumPad2
 * @property {Number} NumPad3
 * @property {Number} NumPad4
 * @property {Number} NumPad5
 * @property {Number} NumPad6
 * @property {Number} NumPad7
 * @property {Number} NumPad8
 * @property {Number} NumPad9
 * @property {Number} NumPadMultiply
 * @property {Number} NumPadAdd
 * @property {Number} NumPadEnter
 * @property {Number} NumPadSubtract
 * @property {Number} NumPadDecimal
 * @property {Number} NumPadDivide
 * @property {Number} F1
 * @property {Number} F2
 * @property {Number} F3
 * @property {Number} F4
 * @property {Number} F5
 * @property {Number} F6
 * @property {Number} F7
 * @property {Number} F8
 * @property {Number} F9
 * @property {Number} F10
 * @property {Number} F11
 * @property {Number} F12
 * @property {Number} NumLock
 * @property {Number} ScrollLock
 * @property {Number} Colon
 * @property {Number} Equals
 * @property {Number} Comma
 * @property {Number} Dash
 * @property {Number} Period
 * @property {Number} QuestionMark
 * @property {Number} Tilde
 * @property {Number} OpenBracket
 * @property {Number} BackwardSlash
 * @property {Number} ClosedBracket
 * @property {Number} Quotes
 */
KEYBOARD = exports.KEYBOARD = {
    Backspace: INPUT_OFFSET_KEYBOARD + 8,
    Tab: INPUT_OFFSET_KEYBOARD + 9,
    Clear: INPUT_OFFSET_KEYBOARD + 12,
    Enter: INPUT_OFFSET_KEYBOARD + 13,
    Shift: INPUT_OFFSET_KEYBOARD + 16,
    Control: INPUT_OFFSET_KEYBOARD + 17,
    Alt: INPUT_OFFSET_KEYBOARD + 18,
    Pause: INPUT_OFFSET_KEYBOARD + 19,
    CapsLock: INPUT_OFFSET_KEYBOARD + 20,
    Escape: INPUT_OFFSET_KEYBOARD + 27,
    Space: INPUT_OFFSET_KEYBOARD + 32,
    PageUp: INPUT_OFFSET_KEYBOARD + 33,
    PageDown: INPUT_OFFSET_KEYBOARD + 34,
    End: INPUT_OFFSET_KEYBOARD + 35,
    Home: INPUT_OFFSET_KEYBOARD + 36,
    Left: INPUT_OFFSET_KEYBOARD + 37,
    Up: INPUT_OFFSET_KEYBOARD + 38,
    Right: INPUT_OFFSET_KEYBOARD + 39,
    Down: INPUT_OFFSET_KEYBOARD + 40,
    Insert: INPUT_OFFSET_KEYBOARD + 45,
    Delete: INPUT_OFFSET_KEYBOARD + 46,
    Help: INPUT_OFFSET_KEYBOARD + 47,
    Zero: INPUT_OFFSET_KEYBOARD + 48,
    One: INPUT_OFFSET_KEYBOARD + 49,
    Two: INPUT_OFFSET_KEYBOARD + 50,
    Three: INPUT_OFFSET_KEYBOARD + 51,
    Four: INPUT_OFFSET_KEYBOARD + 52,
    Five: INPUT_OFFSET_KEYBOARD + 53,
    Six: INPUT_OFFSET_KEYBOARD + 54,
    Seven: INPUT_OFFSET_KEYBOARD + 55,
    Eight: INPUT_OFFSET_KEYBOARD + 56,
    Nine: INPUT_OFFSET_KEYBOARD + 57,
    A: INPUT_OFFSET_KEYBOARD + 65,
    B: INPUT_OFFSET_KEYBOARD + 66,
    C: INPUT_OFFSET_KEYBOARD + 67,
    D: INPUT_OFFSET_KEYBOARD + 68,
    E: INPUT_OFFSET_KEYBOARD + 69,
    F: INPUT_OFFSET_KEYBOARD + 70,
    G: INPUT_OFFSET_KEYBOARD + 71,
    H: INPUT_OFFSET_KEYBOARD + 72,
    I: INPUT_OFFSET_KEYBOARD + 73,
    J: INPUT_OFFSET_KEYBOARD + 74,
    K: INPUT_OFFSET_KEYBOARD + 75,
    L: INPUT_OFFSET_KEYBOARD + 76,
    M: INPUT_OFFSET_KEYBOARD + 77,
    N: INPUT_OFFSET_KEYBOARD + 78,
    O: INPUT_OFFSET_KEYBOARD + 79,
    P: INPUT_OFFSET_KEYBOARD + 80,
    Q: INPUT_OFFSET_KEYBOARD + 81,
    R: INPUT_OFFSET_KEYBOARD + 82,
    S: INPUT_OFFSET_KEYBOARD + 83,
    T: INPUT_OFFSET_KEYBOARD + 84,
    U: INPUT_OFFSET_KEYBOARD + 85,
    V: INPUT_OFFSET_KEYBOARD + 86,
    W: INPUT_OFFSET_KEYBOARD + 87,
    X: INPUT_OFFSET_KEYBOARD + 88,
    Y: INPUT_OFFSET_KEYBOARD + 89,
    Z: INPUT_OFFSET_KEYBOARD + 90,
    NumPad0: INPUT_OFFSET_KEYBOARD + 96,
    NumPad1: INPUT_OFFSET_KEYBOARD + 97,
    NumPad2: INPUT_OFFSET_KEYBOARD + 98,
    NumPad3: INPUT_OFFSET_KEYBOARD + 99,
    NumPad4: INPUT_OFFSET_KEYBOARD + 100,
    NumPad5: INPUT_OFFSET_KEYBOARD + 101,
    NumPad6: INPUT_OFFSET_KEYBOARD + 102,
    NumPad7: INPUT_OFFSET_KEYBOARD + 103,
    NumPad8: INPUT_OFFSET_KEYBOARD + 104,
    NumPad9: INPUT_OFFSET_KEYBOARD + 105,
    NumPadMultiply: INPUT_OFFSET_KEYBOARD + 106,
    NumPadAdd: INPUT_OFFSET_KEYBOARD + 107,
    NumPadEnter: INPUT_OFFSET_KEYBOARD + 108,
    NumPadSubtract: INPUT_OFFSET_KEYBOARD + 109,
    NumPadDecimal: INPUT_OFFSET_KEYBOARD + 110,
    NumPadDivide: INPUT_OFFSET_KEYBOARD + 111,
    F1: INPUT_OFFSET_KEYBOARD + 112,
    F2: INPUT_OFFSET_KEYBOARD + 113,
    F3: INPUT_OFFSET_KEYBOARD + 114,
    F4: INPUT_OFFSET_KEYBOARD + 115,
    F5: INPUT_OFFSET_KEYBOARD + 116,
    F6: INPUT_OFFSET_KEYBOARD + 117,
    F7: INPUT_OFFSET_KEYBOARD + 118,
    F8: INPUT_OFFSET_KEYBOARD + 119,
    F9: INPUT_OFFSET_KEYBOARD + 120,
    F10: INPUT_OFFSET_KEYBOARD + 121,
    F11: INPUT_OFFSET_KEYBOARD + 122,
    F12: INPUT_OFFSET_KEYBOARD + 123,
    NumLock: INPUT_OFFSET_KEYBOARD + 144,
    ScrollLock: INPUT_OFFSET_KEYBOARD + 145,
    Colon: INPUT_OFFSET_KEYBOARD + 186,
    Equals: INPUT_OFFSET_KEYBOARD + 187,
    Comma: INPUT_OFFSET_KEYBOARD + 188,
    Dash: INPUT_OFFSET_KEYBOARD + 189,
    Period: INPUT_OFFSET_KEYBOARD + 190,
    QuestionMark: INPUT_OFFSET_KEYBOARD + 191,
    Tilde: INPUT_OFFSET_KEYBOARD + 192,
    OpenBracket: INPUT_OFFSET_KEYBOARD + 219,
    BackwardSlash: INPUT_OFFSET_KEYBOARD + 220,
    ClosedBracket: INPUT_OFFSET_KEYBOARD + 221,
    Quotes: INPUT_OFFSET_KEYBOARD + 222
},


/**
 * @public
 * @constant
 * @name POINTER
 * @type {Object<String, Number>}
 * @property {Number} MouseLeft
 * @property {Number} MouseMiddle
 * @property {Number} MouseRight
 * @property {Number} MouseBack
 * @property {Number} MouseForward
 * @property {Number} MouseMove
 * @property {Number} MouseScroll
 * @property {Number} PenContact
 * @property {Number} PenBarrel
 * @property {Number} PenEraser
 * @property {Number}
 * @property {Number}
 */
POINTER = exports.POINTER = {
    MouseLeft: INPUT_OFFSET_POINTER,
    MouseMiddle: INPUT_OFFSET_POINTER + 1,
    MouseRight: INPUT_OFFSET_POINTER + 2,
    MouseBack: INPUT_OFFSET_POINTER + 3,
    MouseForward: INPUT_OFFSET_POINTER + 4,
    MouseMove: INPUT_OFFSET_POINTER + 5,
    MouseScroll: INPUT_OFFSET_POINTER + 6,
    PenContact: INPUT_OFFSET_POINTER + 7,
    PenBarrel: INPUT_OFFSET_POINTER + 8,
    PenEraser: INPUT_OFFSET_POINTER + 9
},


/**
 * @public
 * @constant
 * @name GAMEPAD
 * @type {Object<String, Number>}
 * @property {Number} FaceBottom
 * @property {Number} FaceLeft
 * @property {Number} FaceRight
 * @property {Number} FaceTop
 * @property {Number} ShoulderLeftBottom
 * @property {Number} ShoulderRightBottom
 * @property {Number} ShoulderLeftTop
 * @property {Number} ShoulderRightTop
 * @property {Number} Select
 * @property {Number} Start
 * @property {Number} LeftStick
 * @property {Number} RightStick
 * @property {Number} DPadUp
 * @property {Number} DPadDown
 * @property {Number} DPadLeft
 * @property {Number} DPadRight
 * @property {Number} Home
 * @property {Number} LeftStickLeft
 * @property {Number} LeftStickRight
 * @property {Number} LeftStickUp
 * @property {Number} LeftStickDown
 * @property {Number} RightStickLeft
 * @property {Number} RightStickRight
 * @property {Number} RightStickUp
 * @property {Number} RightStickDown
 */
GAMEPAD = exports.GAMEPAD = {
    FaceBottom: INPUT_OFFSET_GAMEPAD + 0,
    FaceRight: INPUT_OFFSET_GAMEPAD + 1,
    FaceLeft: INPUT_OFFSET_GAMEPAD + 2,
    FaceTop: INPUT_OFFSET_GAMEPAD + 3,
    ShoulderLeftBottom: INPUT_OFFSET_GAMEPAD + 4,
    ShoulderRightBottom: INPUT_OFFSET_GAMEPAD + 5,
    ShoulderLeftTop: INPUT_OFFSET_GAMEPAD + 6,
    ShoulderRightTop: INPUT_OFFSET_GAMEPAD + 7,
    Select: INPUT_OFFSET_GAMEPAD + 8,
    Start: INPUT_OFFSET_GAMEPAD + 9,
    LeftStick: INPUT_OFFSET_GAMEPAD + 10,
    RightStick: INPUT_OFFSET_GAMEPAD + 11,
    DPadUp: INPUT_OFFSET_GAMEPAD + 12,
    DPadDown: INPUT_OFFSET_GAMEPAD + 13,
    DPadLeft: INPUT_OFFSET_GAMEPAD + 14,
    DPadRight: INPUT_OFFSET_GAMEPAD + 15,
    Home: INPUT_OFFSET_GAMEPAD + 16,
    LeftStickLeft: INPUT_OFFSET_GAMEPAD + 17,
    LeftStickRight: INPUT_OFFSET_GAMEPAD + 18,
    LeftStickUp: INPUT_OFFSET_GAMEPAD + 19,
    LeftStickDown: INPUT_OFFSET_GAMEPAD + 20,
    RightStickLeft: INPUT_OFFSET_GAMEPAD + 21,
    RightStickRight: INPUT_OFFSET_GAMEPAD + 22,
    RightStickUp: INPUT_OFFSET_GAMEPAD + 23,
    RightStickDown: INPUT_OFFSET_GAMEPAD + 24
},


/**
 * @public
 * @constant
 * @name UNIFORM_TYPE
 * @type {Object<String, Number>}
 * @property {Number} INT
 * @property {Number} INT_VEC2
 * @property {Number} INT_VEC3
 * @property {Number} INT_VEC4
 *
 * @property {Number} FLOAT
 * @property {Number} FLOAT_VEC2
 * @property {Number} FLOAT_VEC3
 * @property {Number} FLOAT_VEC4
 *
 * @property {Number} BOOL
 * @property {Number} BOOL_VEC2
 * @property {Number} BOOL_VEC3
 * @property {Number} BOOL_VEC4
 *
 * @property {Number} FLOAT_MAT2
 * @property {Number} FLOAT_MAT3
 * @property {Number} FLOAT_MAT4
 *
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
 * @property {Number} NORMAL
 * @property {Number} ADD
 * @property {Number} SUBTRACT
 * @property {Number} MULTIPLY
 * @property {Number} SCREEN
 */
BLEND_MODE = exports.BLEND_MODE = {
    NORMAL: 0,
    ADD: 1,
    SUBTRACT: 2,
    MULTIPLY: 3,
    SCREEN: 4
},


/**
 * @public
 * @constant
 * @name DATABASE_TYPES
 * @type {String[]}
 */
DATABASE_TYPES = exports.DATABASE_TYPES = ['arrayBuffer', 'blob', 'font', 'media', 'audio', 'video', 'music', 'sound', 'image', 'texture', 'string', 'json'],


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


/**
 * @typedef {Object} FileType
 * @property {String} mimeType
 * @property {Number[]} pattern
 * @property {Number[]} mask
 */

/**
 * @public
 * @constant
 * @name FILE_TYPES
 * @type {FileType[]}
 */
FILE_TYPES = exports.FILE_TYPES = [{
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
exports.getMediaSize = exports.getMediaHeight = exports.getMediaWidth = exports.stopEvent = exports.removeFlag = exports.addFlag = exports.hasFlag = exports.determineMimeType = exports.removeItems = exports.rgbToHex = exports.inRange = exports.isPowerOfTwo = exports.sign = exports.clamp = exports.radiansToDegrees = exports.degreesToRadians = exports.decodeAudioBuffer = exports.supportsCodec = exports.audioContext = exports.audio = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _const = __webpack_require__(0);

var _support = __webpack_require__(4);

var _support2 = _interopRequireDefault(_support);

var _Size = __webpack_require__(7);

var _Size2 = _interopRequireDefault(_Size);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var

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
audioContext = _support2.default.webAudio ? new AudioContext() : null,


/**
 * @public
 * @constant
 * @type {Function}
 * @param {...String} codecs
 * @returns {Boolean}
 */
supportsCodec = function supportsCodec() {
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
decodeAudioBuffer = function decodeAudioBuffer(arrayBuffer) {
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
degreesToRadians = function degreesToRadians(degree) {
    return degree * _const.RAD_PER_DEG;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} radian
 * @returns {Number}
 */
radiansToDegrees = function radiansToDegrees(radian) {
    return radian * _const.DEG_PER_RAD;
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
clamp = function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} value
 * @returns {Number}
 */
sign = function sign(value) {
    return value && (value < 0 ? -1 : 1);
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} value
 * @returns {Boolean}
 */
isPowerOfTwo = function isPowerOfTwo(value) {
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
inRange = function inRange(value, min, max) {
    return value >= Math.min(min, max) && value <= Math.max(min, max);
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
rgbToHex = function rgbToHex(r, g, b) {
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
removeItems = function removeItems(array, startIndex, amount) {
    if (startIndex >= array.length || amount <= 0) {
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
 * @inner
 * @constant
 * @type {Function}
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Boolean}
 */
matchesMP4Video = function matchesMP4Video(arrayBuffer) {
    var header = new Uint8Array(arrayBuffer),
        view = new DataView(arrayBuffer),
        boxSize = view.getUint32(0, false);

    if (header.length < Math.max(12, boxSize) || boxSize % 4 !== 0) {
        return false;
    }

    return String.fromCharCode.apply(String, _toConsumableArray(header.subarray(4, 11))) === 'ftypmp4';
},


/**
 * @inner
 * @constant
 * @type {Function}
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Boolean}
 */
matchesWebMVideo = function matchesWebMVideo(arrayBuffer) {
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
 * @type {Function}
 * @param {ArrayBuffer} arrayBuffer
 * @returns {String}
 */
determineMimeType = function determineMimeType(arrayBuffer) {
    var header = new Uint8Array(arrayBuffer);

    if (!header.length) {
        throw new Error('Cannot determine mime type: No data.');
    }

    var _loop = function _loop(type) {
        if (header.length < type.pattern.length) {
            return 'continue';
        }

        if (type.pattern.every(function (p, i) {
            return (header[i] & type.mask[i]) === p;
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
        for (var _iterator2 = _const.FILE_TYPES[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
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
 * @param {Number} flag
 * @param {Number} flags
 * @returns {Boolean}
 */
hasFlag = function hasFlag(flag, flags) {
    return (flags & flag) !== 0;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} flag
 * @param {Number} flags
 * @returns {Number}
 */
addFlag = function addFlag(flag, flags) {
    return flags |= flag;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} flag
 * @param {Number} flags
 * @returns {Number}
 */
removeFlag = function removeFlag(flag, flags) {
    return flags &= ~flag;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Event} event
 */
stopEvent = function stopEvent(event) {
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
getMediaWidth = function getMediaWidth(element) {
    return element && (element.naturalWidth || element.videoWidth || element.width) || 0;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {HTMLMediaElement|HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} element
 * @returns {Number}
 */
getMediaHeight = function getMediaHeight(element) {
    return element && (element.naturalHeight || element.videoHeight || element.height) || 0;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {HTMLMediaElement|HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} element
 * @returns {Size}
 */
getMediaSize = function getMediaSize(element) {
    return new _Size2.default(getMediaWidth(element), getMediaHeight(element));
};

exports.audio = audio;
exports.audioContext = audioContext;
exports.supportsCodec = supportsCodec;
exports.decodeAudioBuffer = decodeAudioBuffer;
exports.degreesToRadians = degreesToRadians;
exports.radiansToDegrees = radiansToDegrees;
exports.clamp = clamp;
exports.sign = sign;
exports.isPowerOfTwo = isPowerOfTwo;
exports.inRange = inRange;
exports.rgbToHex = rgbToHex;
exports.removeItems = removeItems;
exports.determineMimeType = determineMimeType;
exports.hasFlag = hasFlag;
exports.addFlag = addFlag;
exports.removeFlag = removeFlag;
exports.stopEvent = stopEvent;
exports.getMediaWidth = getMediaWidth;
exports.getMediaHeight = getMediaHeight;
exports.getMediaSize = getMediaSize;

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _const = __webpack_require__(0);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _DefaultGamepadMapping = __webpack_require__(37);

var _DefaultGamepadMapping2 = _interopRequireDefault(_DefaultGamepadMapping);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.default = {

    /**
     * @static
     * @type {Object}
     * @property {String} basePath=''
     * @property {Number} width=800
     * @property {Number} height=600
     * @property {?HTMLCanvasElement|?String} canvas=null
     * @property {?HTMLCanvasElement|?String} canvasParent=null
     * @property {Color} clearColor=Color.Black
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
        canvas: null,
        canvasParent: null,
        clearColor: _Color2.default.Black,
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
     * @type {Boolean}
     * @default true
     */
    GENERATE_MIPMAP: true,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 1.0
     */
    MEDIA_SPEED: 1.0,

    /**
     * @public
     * @static
     * @type {Boolean}
     * @default false
     */
    MEDIA_LOOP: false,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 0
     */
    MEDIA_TIME: 0,

    /**
     * @public
     * @static
     * @type {Boolean}
     * @default false
     */
    MEDIA_MUTED: false,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 1.0
     */
    VOLUME_MUSIC: 1.0,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 1.0
     */
    VOLUME_SOUND: 1.0,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 1.0
     */
    VOLUME_VIDEO: 1.0,

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
     * @default 20
     */
    QUAD_TREE_MAX_OBJECTS: 20,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 2500
     */
    BATCH_SIZE_SPRITES: 2500, // ~ 160kb

    /**
     * @public
     * @static
     * @type {Number}
     * @default 5000
     */
    BATCH_SIZE_PARTICLES: 5000, // ~ 800kb

    /**
     * @public
     * @static
     * @type {Number}
     * @default 300
     */
    THRESHOLD_INPUT: 300,

    /**
     * @public
     * @static
     * @type {GamepadMapping}
     * @default {DefaultGamepadMapping}
     */
    GAMEPAD_MAPPING: new _DefaultGamepadMapping2.default()
};

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Vector
 */
var Vector = function () {

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
        this._x = x;

        /**
         * @public
         * @member {Number}
         */
        this._y = y;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(Vector, [{
        key: "set",


        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} [y=x]
         * @returns {Vector}
         */
        value: function set(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            this._x = x;
            this._y = y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Vector} vector
         * @returns {Vector}
         */

    }, {
        key: "copy",
        value: function copy(vector) {
            this._x = vector.x;
            this._y = vector.y;

            return this;
        }

        /**
         * @public
         * @returns {Vector}
         */

    }, {
        key: "clone",
        value: function clone() {
            return new Vector(this._x, this._y);
        }

        /**
         * @public
         * @param {Vector|Object} vector
         * @param {Number} [vector.x]
         * @param {Number} [vector.y]
         * @returns {Boolean}
         */

    }, {
        key: "equals",
        value: function equals() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                x = _ref.x,
                y = _ref.y;

            return (x === undefined || this.x === x) && (y === undefined || this.y === y);
        }

        /**
         * @public
         * @chainable
         * @returns {Vector}
         */

    }, {
        key: "normalize",
        value: function normalize() {
            var mag = this.magnitude;

            if (mag > 0) {
                this._x /= mag;
                this._y /= mag;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Vector}
         */

    }, {
        key: "reverse",
        value: function reverse() {
            this._x *= -1;
            this._y *= -1;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} [y=x]
         * @returns {Vector}
         */

    }, {
        key: "add",
        value: function add(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            this._x += x;
            this._y += y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} [y=x]
         * @returns {Vector}
         */

    }, {
        key: "subtract",
        value: function subtract(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            this._x -= x;
            this._y -= y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} [y=x]
         * @returns {Vector}
         */

    }, {
        key: "multiply",
        value: function multiply(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            this._x *= x;
            this._y *= y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} [y=x]
         * @returns {Vector}
         */

    }, {
        key: "divide",
        value: function divide(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            this._x /= x;
            this._y /= y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Matrix} matrix
         * @param {Vector} [result=this]
         * @returns {Vector}
         */

    }, {
        key: "transform",
        value: function transform(matrix) {
            var result = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this;

            return result.set(this._x * matrix.a + this._y * matrix.b + matrix.x, this._x * matrix.c + this._y * matrix.d + matrix.y);
        }

        /**
         * @public
         * @param {Vector} [result=this]
         * @returns {Vector}
         */

    }, {
        key: "perp",
        value: function perp() {
            var result = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this;

            return result.set(this._y, this._x * -1);
        }

        /**
         * @public
         * @param {Number} x
         * @param {Number} y
         * @returns {Number}
         */

    }, {
        key: "distanceTo",
        value: function distanceTo(x, y) {
            var offsetX = this._x - x,
                offsetY = this._y - y;

            return Math.sqrt(offsetX * offsetX + offsetY * offsetY);
        }

        /**
         * @public
         * @param {Vector} vector
         * @returns {Number}
         */

    }, {
        key: "cross",
        value: function cross(vector) {
            return this._x * vector.y - this._y * vector.x;
        }

        /**
         * @public
         * @param {Vector} vector
         * @returns {Number}
         */

    }, {
        key: "dot",
        value: function dot(vector) {
            return this._x * vector.x + this._y * vector.y;
        }

        /**
         * @public
         * @chainable
         * @param {Vector} vector
         * @returns {Vector}
         */

    }, {
        key: "project",
        value: function project(vector) {
            var dot = this.dot(vector) / vector.dot(vector);

            return this.set(dot * vector.x, dot * vector.y);
        }

        /**
         * @public
         * @chainable
         * @param {Vector} axis
         * @returns {Vector}
         */

    }, {
        key: "reflect",
        value: function reflect(axis) {
            var x = this._x,
                y = this._y;

            return this.project(axis).multiply(2).subtract(x, y);
        }

        /**
         * @override
         */

    }, {
        key: "destroy",
        value: function destroy() {
            this._x = null;
            this._y = null;
        }
    }, {
        key: "x",
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
        key: "y",
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
        key: "angle",
        get: function get() {
            return Math.atan2(this._x, this._y);
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: "magnitude",
        get: function get() {
            return Math.sqrt(this._x * this._x + this._y * this._y);
        }
    }]);

    return Vector;
}();

/**
 * @public
 * @static
 * @constant
 * @type {Vector}
 */


exports.default = Vector;
Vector.Empty = new Vector(0, 0);

/**
 * @public
 * @static
 * @constant
 * @type {Vector}
 */
Vector.Temp = new Vector();

/***/ }),
/* 4 */
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
    }(),

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    touchEvents: 'ontouchstart' in window,

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    pointerEvents: 'PointerEvent' in window,

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    eventOptions: function () {
        var supportsPassive = false;

        try {
            window.addEventListener('test', null, {
                get passive() {
                    supportsPassive = true;
                }
            });
        } catch (e) {}

        return supportsPassive;
    }()
};

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = __webpack_require__(1);

var _Vector = __webpack_require__(3);

var _Vector2 = _interopRequireDefault(_Vector);

var _Size = __webpack_require__(7);

var _Size2 = _interopRequireDefault(_Size);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Rectangle
 */
var Rectangle = function () {

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=x]
     * @param {Number} [width=0]
     * @param {Number} [height=width]
     */
    function Rectangle() {
        var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;
        var width = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
        var height = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : width;

        _classCallCheck(this, Rectangle);

        /**
         * @private
         * @member {Vector}
         */
        this._position = new _Vector2.default(x, y);

        /**
         * @private
         * @member {Size}
         */
        this._size = new _Size2.default(width, height);
    }

    /**
     * @public
     * @member {Vector}
     */


    _createClass(Rectangle, [{
        key: 'transform',


        /**
         * @public
         * @chainable
         * @param {Matrix} matrix
         * @param {Rectangle} [result=this]
         * @returns {Rectangle}
         */
        value: function transform(matrix) {
            var result = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this;

            var point = _Vector2.default.Temp;

            var minX = void 0,
                minY = void 0,
                maxX = void 0,
                maxY = void 0;

            point.set(this.left, this.top).transform(matrix);

            minX = maxX = point.x;
            minY = maxY = point.y;

            point.set(this.left, this.bottom).transform(matrix);

            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);

            point.set(this.right, this.top).transform(matrix);

            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);

            point.set(this.right, this.bottom).transform(matrix);

            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);

            return result.set(minX, minY, maxX - minX, maxY - minY);
        }

        /**
         * @override
         */

    }, {
        key: 'set',
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
         * @public
         * @param {Rectangle|Object} rectangle
         * @param {Number} [rectangle.x]
         * @param {Number} [rectangle.y]
         * @param {Number} [rectangle.width]
         * @param {Number} [rectangle.height]
         * @returns {Boolean}
         */

    }, {
        key: 'equals',
        value: function equals() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                x = _ref.x,
                y = _ref.y,
                width = _ref.width,
                height = _ref.height;

            return (x === undefined || this.x === x) && (y === undefined || this.y === y) && (width === undefined || this.width === width) && (height === undefined || this.height === height);
        }

        /**
         * @override
         */

    }, {
        key: 'contains',
        value: function contains(x, y, transform) {
            var min = new _Vector2.default(this.left, this.top),
                max = new _Vector2.default(this.right, this.bottom);

            if (transform) {
                min.transform(transform);
                max.transform(transform);
            }

            return (0, _utils.inRange)(x, min.x, max.x) && (0, _utils.inRange)(y, min.y, max.y);
        }

        /**
         * @public
         * @param {Rectangle} rect
         * @returns {Boolean}
         */

    }, {
        key: 'containsRect',
        value: function containsRect(rect) {
            return (0, _utils.inRange)(rect.left, this.left, this.right) && (0, _utils.inRange)(rect.right, this.left, this.right) && (0, _utils.inRange)(rect.top, this.top, this.bottom) && (0, _utils.inRange)(rect.bottom, this.top, this.bottom);
        }

        /**
         * @public
         * @param {Rectangle} rect
         * @returns {Boolean}
         */

    }, {
        key: 'intersectsRect',
        value: function intersectsRect(rect) {
            if (rect.left > this.right || rect.top > this.bottom) {
                return false;
            }

            if (this.left > rect.right || this.top > rect.bottom) {
                return null;
            }

            return true;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Rectangle}
         */

    }, {
        key: 'setPosition',
        value: function setPosition(x, y) {
            this.position.set(x, y);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} width
         * @param {Number} height
         * @returns {Rectangle}
         */

    }, {
        key: 'setSize',
        value: function setSize(width, height) {
            this._size.set(width, height);

            return this;
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
         * @member {Size}
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
            return this._size.width;
        },
        set: function set(width) {
            this._size.width = width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._size.height;
        },
        set: function set(height) {
            this._size.height = height;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'left',
        get: function get() {
            return this.x;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'top',
        get: function get() {
            return this.y;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'right',
        get: function get() {
            return this.x + this.width;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'bottom',
        get: function get() {
            return this.y + this.height;
        }
    }]);

    return Rectangle;
}();

/**
 * @public
 * @static
 * @constant
 * @member {Rectangle}
 */


exports.default = Rectangle;
Rectangle.Empty = new Rectangle(0, 0, 0, 0);

/**
 * @public
 * @static
 * @constant
 * @member {Rectangle}
 */
Rectangle.Temp = new Rectangle();

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
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Size
 */
var Size = function () {

    /**
     * @constructor
     * @param {Number} [width=0]
     * @param {Number} [height=0]
     */
    function Size() {
        var width = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        var height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

        _classCallCheck(this, Size);

        /**
         * @public
         * @member {Number}
         */
        this._width = width;

        /**
         * @public
         * @member {Number}
         */
        this._height = height;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(Size, [{
        key: "set",


        /**
         * @public
         * @chainable
         * @param {Number} width
         * @param {Number} [height=width]
         * @returns {Size}
         */
        value: function set(width) {
            var height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : width;

            this._width = width;
            this._height = height;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} width
         * @param {Number} [height=width]
         * @returns {Size}
         */

    }, {
        key: "add",
        value: function add(width) {
            var height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : width;

            this._width += width;
            this._height += height;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} width
         * @param {Number} [height=width]
         * @returns {Size}
         */

    }, {
        key: "subtract",
        value: function subtract(width) {
            var height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : width;

            this._width -= width;
            this._height -= height;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} width
         * @param {Number} [height=width]
         * @returns {Size}
         */

    }, {
        key: "multiply",
        value: function multiply(width) {
            var height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : width;

            this._width *= width;
            this._height *= height;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} width
         * @param {Number} [height=width]
         * @returns {Size}
         */

    }, {
        key: "divide",
        value: function divide(width) {
            var height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : width;

            this._width /= width;
            this._height /= height;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Size} size
         * @returns {Size}
         */

    }, {
        key: "copy",
        value: function copy(size) {
            this._width = size.width;
            this._height = size.height;

            return this;
        }

        /**
         * @public
         * @returns {Size}
         */

    }, {
        key: "clone",
        value: function clone() {
            return new Size(this._width, this._height);
        }

        /**
         * @public
         * @param {Size|Object} size
         * @param {Number} [size.width]
         * @param {Number} [size.height]
         * @returns {Boolean}
         */

    }, {
        key: "equals",
        value: function equals() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                width = _ref.width,
                height = _ref.height;

            return (width === undefined || this.width === width) && (height === undefined || this.height === height);
        }

        /**
         * @override
         */

    }, {
        key: "destroy",
        value: function destroy() {
            this._width = null;
            this._height = null;
        }
    }, {
        key: "width",
        get: function get() {
            return this._width;
        },
        set: function set(width) {
            this._width = width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: "height",
        get: function get() {
            return this._height;
        },
        set: function set(height) {
            this._height = height;
        }
    }]);

    return Size;
}();

/**
 * @public
 * @static
 * @constant
 * @type {Size}
 */


exports.default = Size;
Size.Empty = new Size(0, 0);

/**
 * @public
 * @static
 * @constant
 * @type {Size}
 */
Size.Temp = new Size();

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
     * @member {?Float32Array}
     */
    this._array = null;

    /**
     * @private
     * @member {?Number}
     */
    this._rgba = null;
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
     * @param {Number} [r=this._r]
     * @param {Number} [g=this._g]
     * @param {Number} [b=this._b]
     * @param {Number} [a=this._a]
     * @returns {Color}
     */
    value: function set() {
      var r = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._r;
      var g = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._g;
      var b = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : this._b;
      var a = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : this._a;

      this._r = r & 255;
      this._g = g & 255;
      this._b = b & 255;
      this._a = (0, _utils.clamp)(a, 0, 1);

      this._rgba = null;

      return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Color}
     */

  }, {
    key: 'setRGBA',
    value: function setRGBA(rgba) {
      this._a = (rgba >> 24 & 255) / 255;
      this._r = rgba >> 16 & 255;
      this._g = rgba >> 8 & 255;
      this._b = rgba & 255;

      this._rgba = rgba;

      return this;
    }

    /**
     * @public
     * @returns {Number}
     */

  }, {
    key: 'getRGBA',
    value: function getRGBA() {
      if (this._rgba === null) {
        this._rgba = this._a && ((this._a * 255 | 0) << 24) + (this._b << 16) + (this._g << 8) + this._r >>> 0;
      }

      return this._rgba;
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
      return this.set(color.r, color.g, color.b, color.a);
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
     * @param {Color|Object} color
     * @param {Number} [color.r]
     * @param {Number} [color.g]
     * @param {Number} [color.b]
     * @param {Number} [color.a]
     * @returns {Boolean}
     */

  }, {
    key: 'equals',
    value: function equals() {
      var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
          r = _ref.r,
          g = _ref.g,
          b = _ref.b,
          a = _ref.a;

      return (r === undefined || this.r === r) && (g === undefined || this.g === g) && (b === undefined || this.b === b) && (a === undefined || this.a === a);
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
      } else {
        array[0] = this._r;
        array[1] = this._g;
        array[2] = this._b;
      }

      array[3] = this._a;

      return array;
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

      this._rgba = null;
    }
  }, {
    key: 'r',
    get: function get() {
      return this._r;
    },
    set: function set(red) {
      this._r = red & 255;
      this._rgba = null;
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
      this._rgba = null;
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
      this._rgba = null;
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
      this._rgba = null;
    }

    /**
     * @public
     * @member {Number}
     */

  }, {
    key: 'rgba',
    get: function get() {
      return this.getRGBA();
    },
    set: function set(rgba) {
      this.setRGBA(rgba);
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

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(6);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ChannelManager
 * @extends EventEmitter
 */
var ChannelManager = function (_EventEmitter) {
  _inherits(ChannelManager, _EventEmitter);

  /**
   * @constructor
   * @param {ArrayBuffer} channelBuffer
   * @param {Number} offset
   * @param {Number} length
   */
  function ChannelManager(channelBuffer, offset, length) {
    _classCallCheck(this, ChannelManager);

    /**
     * @private
     * @member {ArrayBuffer}
     */
    var _this = _possibleConstructorReturn(this, (ChannelManager.__proto__ || Object.getPrototypeOf(ChannelManager)).call(this));

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


  _createClass(ChannelManager, [{
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
      _get(ChannelManager.prototype.__proto__ || Object.getPrototypeOf(ChannelManager.prototype), 'destroy', this).call(this);

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

  return ChannelManager;
}(_EventEmitter3.default);

exports.default = ChannelManager;

/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = __webpack_require__(1);

var _Vector = __webpack_require__(3);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

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
         * @member {?Float32Array} _array
         */
        this._array = null;

        /**
         * @private
         * @member {Number}
         */
        this._updateId = 0;
    }

    /**
     * | a | b | x |
     * | c | d | y |
     * | e | f | z |
     *
     * @public
     * @chainable
     * @param {Number} [a=this.a]
     * @param {Number} [b=this.b]
     * @param {Number} [x=this.x]
     * @param {Number} [c=this.c]
     * @param {Number} [d=this.d]
     * @param {Number} [y=this.y]
     * @param {Number} [e=this.e]
     * @param {Number} [f=this.f]
     * @param {Number} [z=this.z]
     * @returns {Matrix}
     */


    _createClass(Matrix, [{
        key: 'set',
        value: function set() {
            var a = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.a;
            var b = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.b;
            var x = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : this.x;
            var c = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : this.c;
            var d = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : this.d;
            var y = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : this.y;
            var e = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : this.e;
            var f = arguments.length > 7 && arguments[7] !== undefined ? arguments[7] : this.f;
            var z = arguments.length > 8 && arguments[8] !== undefined ? arguments[8] : this.z;

            this.a = a;this.b = b;this.x = x;
            this.c = c;this.d = d;this.y = y;
            this.e = e;this.f = f;this.z = z;

            this._updateId++;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Matrix} matrix
         * @returns {Matrix}
         */

    }, {
        key: 'copy',
        value: function copy(matrix) {
            this.a = matrix.a;this.b = matrix.b;this.x = matrix.x;
            this.c = matrix.c;this.d = matrix.d;this.y = matrix.y;
            this.e = matrix.e;this.f = matrix.f;this.z = matrix.z;

            return this;
        }

        /**
         * @public
         * @returns {Matrix}
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new Matrix(this.a, this.b, this.x, this.c, this.d, this.y, this.e, this.f, this.z);
        }

        /**
         * | a | b | x |
         * | c | d | y |
         * | e | f | z |
         *
         * @public
         * @param {Matrix|Object} matrix
         * @param {Number} [matrix.a]
         * @param {Number} [matrix.b]
         * @param {Number} [matrix.x]
         * @param {Number} [matrix.c]
         * @param {Number} [matrix.d]
         * @param {Number} [matrix.y]
         * @param {Number} [matrix.e]
         * @param {Number} [matrix.f]
         * @param {Number} [matrix.z]
         * @returns {Boolean}
         */

    }, {
        key: 'equals',
        value: function equals() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                a = _ref.a,
                b = _ref.b,
                x = _ref.x,
                c = _ref.c,
                d = _ref.d,
                y = _ref.y,
                e = _ref.e,
                f = _ref.f,
                z = _ref.z;

            return (a === undefined || this.a === a) && (b === undefined || this.b === b) && (x === undefined || this.x === x) && (c === undefined || this.c === c) && (d === undefined || this.d === d) && (y === undefined || this.y === y) && (e === undefined || this.e === e) && (f === undefined || this.f === f) && (z === undefined || this.z === z);
        }

        /**
         * @public
         * @chainable
         * @param {Matrix} matrix
         * @returns {Matrix}
         */

    }, {
        key: 'combine',
        value: function combine(matrix) {
            return this.set(this.a * matrix.a + this.c * matrix.b + this.e * matrix.x, this.b * matrix.a + this.d * matrix.b + this.f * matrix.x, this.x * matrix.a + this.y * matrix.b + this.z * matrix.x, this.a * matrix.c + this.c * matrix.d + this.e * matrix.y, this.b * matrix.c + this.d * matrix.d + this.f * matrix.y, this.x * matrix.c + this.y * matrix.d + this.z * matrix.y, this.a * matrix.e + this.c * matrix.f + this.e * matrix.z, this.b * matrix.e + this.d * matrix.f + this.f * matrix.z, this.x * matrix.e + this.y * matrix.f + this.z * matrix.z);
        }

        /**
         * @public
         * @chainable
         * @param {Matrix} [result=this]
         * @returns {Matrix}
         */

    }, {
        key: 'getInverse',
        value: function getInverse() {
            var result = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this;

            var determinant = this.a * (this.z * this.d - this.y * this.f) - this.b * (this.z * this.c - this.y * this.e) + this.x * (this.f * this.c - this.d * this.e);

            if (determinant === 0) {
                return result.copy(Matrix.Identity);
            }

            return result.set((this.z * this.d - this.y * this.f) / determinant, (this.z * this.c - this.y * this.e) / -determinant, (this.f * this.c - this.d * this.e) / determinant, (this.z * this.b - this.x * this.f) / -determinant, (this.z * this.a - this.x * this.e) / determinant, (this.f * this.a - this.b * this.e) / -determinant, (this.y * this.b - this.x * this.d) / determinant, (this.y * this.a - this.x * this.c) / -determinant, (this.d * this.a - this.b * this.c) / determinant);
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} [y=x]
         * @returns {Matrix}
         */

    }, {
        key: 'move',
        value: function move(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            return this.combine(Matrix.Temp.set(1, 0, x, 0, 1, y, 0, 0, 1));
        }

        /**
         * @public
         * @chainable
         * @param {Number} angle
         * @param {Number} [centerX=0]
         * @param {Number} [centerY=centerX]
         * @returns {Matrix}
         */

    }, {
        key: 'rotate',
        value: function rotate(angle) {
            var centerX = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
            var centerY = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : centerX;

            var radian = (0, _utils.degreesToRadians)(angle),
                cos = Math.cos(radian),
                sin = Math.sin(radian);

            return this.combine(Matrix.Temp.set(cos, -sin, centerX * (1 - cos) + centerY * sin, sin, cos, centerY * (1 - cos) - centerX * sin, 0, 0, 1));
        }

        /**
         * @public
         * @chainable
         * @param {Number} scaleX
         * @param {Number} [scaleY=scaleX]
         * @param {Number} [centerX=0]
         * @param {Number} [centerY=centerX]
         * @returns {Matrix}
         */

    }, {
        key: 'scale',
        value: function scale(scaleX) {
            var scaleY = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : scaleX;
            var centerX = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
            var centerY = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : centerX;

            return this.combine(Matrix.Temp.set(scaleX, 0, centerX * (1 - scaleX), 0, scaleY, centerY * (1 - scaleY), 0, 0, 1));
        }

        /**
         * @public
         * @param {Boolean} [transpose=false]
         * @returns {Float32Array}
         */

    }, {
        key: 'toArray',
        value: function toArray() {
            var transpose = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

            var array = this._array || (this._array = new Float32Array(9));

            if (transpose) {
                array[0] = this.a;array[1] = this.b;array[2] = this.x;
                array[3] = this.c;array[4] = this.d;array[5] = this.y;
                array[6] = this.e;array[7] = this.f;array[8] = this.z;
            } else {
                array[0] = this.a;array[1] = this.c;array[2] = this.e;
                array[3] = this.b;array[4] = this.d;array[5] = this.f;
                array[6] = this.x;array[7] = this.y;array[8] = this.z;
            }

            return array;
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

            this.a = null;this.b = null;this.x = null;
            this.c = null;this.d = null;this.y = null;
            this.e = null;this.f = null;this.z = null;
        }
    }]);

    return Matrix;
}();

/**
 * @public
 * @static
 * @readonly
 * @member {Matrix}
 */


exports.default = Matrix;
Matrix.Identity = new Matrix(1, 0, 0, 0, 1, 0, 0, 0, 1);

/**
 * @public
 * @static
 * @constant
 * @member {Matrix}
 */
Matrix.Temp = new Matrix();

/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Time
 */
var Time = function () {

    /**
     * @constructor
     * @param {Number} [time=0]
     * @param {Number} [factor=TIME.MILLISECONDS]
     */
    function Time() {
        var time = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        var factor = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _const.TIME.MILLISECONDS;

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
        key: 'set',


        /**
         * @public
         * @chainable
         * @param {Number} [time=0]
         * @param {Number} [factor=TIME.MILLISECONDS]
         * @returns {Time}
         */
        value: function set() {
            var time = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var factor = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _const.TIME.MILLISECONDS;

            this._milliseconds = time * factor;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} milliseconds
         * @returns {Time}
         */

    }, {
        key: 'setMilliseconds',
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
        key: 'setSeconds',
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
        key: 'setMinutes',
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
        key: 'setHours',
        value: function setHours(hours) {
            this.hours = hours;

            return this;
        }

        /**
         * @public
         * @param {Time|Object} time
         * @param {Number} [time.milliseconds]
         * @param {Number} [time.seconds]
         * @param {Number} [time.minutes]
         * @param {Number} [time.hours]
         * @returns {Boolean}
         */

    }, {
        key: 'equals',
        value: function equals() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                milliseconds = _ref.milliseconds,
                seconds = _ref.seconds,
                minutes = _ref.minutes,
                hours = _ref.hours;

            return (milliseconds === undefined || this.milliseconds === milliseconds) && (seconds === undefined || this.seconds === seconds) && (minutes === undefined || this.minutes === minutes) && (hours === undefined || this.hours === hours);
        }

        /**
         * @public
         * @param {Time} time
         * @returns {Boolean}
         */

    }, {
        key: 'greaterThan',
        value: function greaterThan(time) {
            return this._milliseconds > time.milliseconds;
        }

        /**
         * @public
         * @param {Time} time
         * @returns {Boolean}
         */

    }, {
        key: 'lessThan',
        value: function lessThan(time) {
            return this._milliseconds < time.milliseconds;
        }

        /**
         * @public
         * @returns {Time}
         */

    }, {
        key: 'clone',
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
        key: 'copy',
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
        key: 'add',
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
        key: 'subtract',
        value: function subtract(time) {
            this._milliseconds -= time.milliseconds;

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._milliseconds = null;
        }
    }, {
        key: 'milliseconds',
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
        key: 'seconds',
        get: function get() {
            return this._milliseconds / _const.TIME.SECONDS;
        },
        set: function set(seconds) {
            this._milliseconds = seconds * _const.TIME.SECONDS;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'minutes',
        get: function get() {
            return this._milliseconds / _const.TIME.MINUTES;
        },
        set: function set(minutes) {
            this._milliseconds = minutes * _const.TIME.MINUTES;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'hours',
        get: function get() {
            return this._milliseconds / _const.TIME.HOURS;
        },
        set: function set(hours) {
            this._milliseconds = hours * _const.TIME.HOURS;
        }
    }]);

    return Time;
}();

/**
 * @public
 * @static
 * @constant
 * @member {Time}
 */


exports.default = Time;
Time.Empty = new Time(0);

/**
 * @public
 * @static
 * @constant
 * @member {Time}
 */
Time.Temp = new Time();

/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ResourceFactory2 = __webpack_require__(15);

var _ResourceFactory3 = _interopRequireDefault(_ResourceFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ArrayBufferFactory
 * @extends ResourceFactory
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
      // eslint-disable-line
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

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ArrayBufferFactory2 = __webpack_require__(12);

var _ArrayBufferFactory3 = _interopRequireDefault(_ArrayBufferFactory2);

var _MediaSource = __webpack_require__(35);

var _MediaSource2 = _interopRequireDefault(_MediaSource);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class MediaSourceFactory
 * @extends ArrayBufferFactory
 */
var MediaSourceFactory = function (_ArrayBufferFactory) {
    _inherits(MediaSourceFactory, _ArrayBufferFactory);

    function MediaSourceFactory() {
        _classCallCheck(this, MediaSourceFactory);

        return _possibleConstructorReturn(this, (MediaSourceFactory.__proto__ || Object.getPrototypeOf(MediaSourceFactory)).apply(this, arguments));
    }

    _createClass(MediaSourceFactory, [{
        key: 'create',


        /**
         * @override
         */
        value: function create(source) {
            var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
                type = _ref.type,
                createMediaElement = _ref.createMediaElement,
                decodeAudioBuffer = _ref.decodeAudioBuffer,
                mimeType = _ref.mimeType,
                loadEvent = _ref.loadEvent;

            return _get(MediaSourceFactory.prototype.__proto__ || Object.getPrototypeOf(MediaSourceFactory.prototype), 'create', this).call(this, source, null).then(function (arrayBuffer) {
                return new _MediaSource2.default(type, arrayBuffer, { mimeType: mimeType, loadEvent: loadEvent });
            }).then(function (mediaSource) {
                return createMediaElement ? mediaSource.createMediaElement().then(function (mediaElement) {
                    return mediaSource;
                }) : mediaSource;
            }).then(function (mediaSource) {
                return decodeAudioBuffer ? mediaSource.decodeAudioBuffer().then(function (audioBuffer) {
                    return mediaSource;
                }) : mediaSource;
            });
        }
    }, {
        key: 'storageType',


        /**
         * @override
         */
        get: function get() {
            return 'mediaSource';
        }
    }]);

    return MediaSourceFactory;
}(_ArrayBufferFactory3.default);

exports.default = MediaSourceFactory;

/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _settings = __webpack_require__(2);

var _settings2 = _interopRequireDefault(_settings);

var _utils = __webpack_require__(1);

var _Size = __webpack_require__(7);

var _Size2 = _interopRequireDefault(_Size);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Texture
 */
var Texture = function () {

    /**
     * @constructor
     * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement} source
     * @param {Object} [options={}]
     * @param {Number} [options.scaleMode=settings.SCALE_MODE]
     * @param {Number} [options.wrapMode=settings.WRAP_MODE]
     * @param {Boolean} [options.premultiplyAlpha=settings.PREMULTIPLY_ALPHA]
     */
    function Texture(source) {
        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            _ref$scaleMode = _ref.scaleMode,
            scaleMode = _ref$scaleMode === undefined ? _settings2.default.SCALE_MODE : _ref$scaleMode,
            _ref$wrapMode = _ref.wrapMode,
            wrapMode = _ref$wrapMode === undefined ? _settings2.default.WRAP_MODE : _ref$wrapMode,
            _ref$premultiplyAlpha = _ref.premultiplyAlpha,
            premultiplyAlpha = _ref$premultiplyAlpha === undefined ? _settings2.default.PREMULTIPLY_ALPHA : _ref$premultiplyAlpha;

        _classCallCheck(this, Texture);

        /**
         * @private
         * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
         */
        this._source = null;

        /**
         * @private
         * @member {Size}
         */
        this._size = new _Size2.default(-1, -1);

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
         * @member {Number}
         */
        this._scaleMode = null;

        /**
         * @private
         * @member {Number}
         */
        this._wrapMode = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._premultiplyAlpha = null;

        /**
         * @private
         * @member {Number}
         */
        this._flags = _const.TEXTURE_FLAGS.NONE;

        /**
         * @private
         * @member {Boolean}
         */
        this._flipY = false;

        this.setScaleMode(scaleMode);
        this.setWrapMode(wrapMode);
        this.setPremultiplyAlpha(premultiplyAlpha);

        if (source) {
            this.setSource(source);
        }
    }

    /**
     * @public
     * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
     */


    _createClass(Texture, [{
        key: 'connect',


        /**
         * @public
         * @chainable
         * @param {WebGLRenderingContext} gl
         * @returns {Texture}
         */
        value: function connect(gl) {
            if (!this._context) {
                this._context = gl;
                this._texture = gl.createTexture();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Texture}
         */

    }, {
        key: 'disconnect',
        value: function disconnect() {
            this.unbindTexture();

            if (this._context) {
                this._context.deleteTexture(this._texture);

                this._context = null;
                this._texture = null;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} [unit]
         * @returns {Texture}
         */

    }, {
        key: 'bindTexture',
        value: function bindTexture(unit) {
            if (!this._context) {
                throw new Error('Texture has to be connected first!');
            }

            var gl = this._context;

            if (unit !== undefined) {
                gl.activeTexture(gl.TEXTURE0 + unit);
            }

            gl.bindTexture(gl.TEXTURE_2D, this._texture);

            this.update();

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Texture}
         */

    }, {
        key: 'unbindTexture',
        value: function unbindTexture() {
            if (this._context) {
                var gl = this._context;

                gl.bindTexture(gl.TEXTURE_2D, null);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} scaleMode
         * @returns {Texture}
         */

    }, {
        key: 'setScaleMode',
        value: function setScaleMode(scaleMode) {
            if (this._scaleMode !== scaleMode) {
                this._scaleMode = scaleMode;
                this._flags = (0, _utils.addFlag)(_const.TEXTURE_FLAGS.SCALE_MODE, this._flags);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} wrapMode
         * @returns {Texture}
         */

    }, {
        key: 'setWrapMode',
        value: function setWrapMode(wrapMode) {
            if (this._wrapMode !== wrapMode) {
                this._wrapMode = wrapMode;
                this._flags = (0, _utils.addFlag)(_const.TEXTURE_FLAGS.WRAP_MODE, this._flags);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Boolean} premultiplyAlpha
         * @returns {Texture}
         */

    }, {
        key: 'setPremultiplyAlpha',
        value: function setPremultiplyAlpha(premultiplyAlpha) {
            if (this._premultiplyAlpha !== premultiplyAlpha) {
                this._premultiplyAlpha = premultiplyAlpha;
                this._flags = (0, _utils.addFlag)(_const.TEXTURE_FLAGS.PREMULTIPLY_ALPHA, this._flags);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement} source
         * @returns {Texture}
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
         * @returns {Texture}
         */

    }, {
        key: 'updateSource',
        value: function updateSource() {
            this._flags = (0, _utils.addFlag)(_const.TEXTURE_FLAGS.SOURCE, this._flags);

            this.setSize((0, _utils.getMediaWidth)(this._source), (0, _utils.getMediaHeight)(this._source));

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} width
         * @param {Number} height
         * @returns {Texture}
         */

    }, {
        key: 'setSize',
        value: function setSize(width, height) {
            if (!this._size.equals({ width: width, height: height })) {
                this._size.set(width, height);
                this._flags = (0, _utils.addFlag)(_const.TEXTURE_FLAGS.SIZE, this._flags);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Texture}
         */

    }, {
        key: 'update',
        value: function update() {
            if (this._flags && this._context) {
                var gl = this._context;

                if ((0, _utils.hasFlag)(_const.TEXTURE_FLAGS.SCALE_MODE, this._flags)) {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this._scaleMode);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this._scaleMode);

                    this._flags = (0, _utils.removeFlag)(_const.TEXTURE_FLAGS.SCALE_MODE, this._flags);
                }

                if ((0, _utils.hasFlag)(_const.TEXTURE_FLAGS.WRAP_MODE, this._flags)) {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrapMode);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrapMode);

                    this._flags = (0, _utils.removeFlag)(_const.TEXTURE_FLAGS.WRAP_MODE, this._flags);
                }

                if ((0, _utils.hasFlag)(_const.TEXTURE_FLAGS.PREMULTIPLY_ALPHA, this._flags)) {
                    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);

                    this._flags = (0, _utils.removeFlag)(_const.TEXTURE_FLAGS.PREMULTIPLY_ALPHA, this._flags);
                }

                if ((0, _utils.hasFlag)(_const.TEXTURE_FLAGS.SOURCE, this._flags) && this._source) {
                    if ((0, _utils.hasFlag)(_const.TEXTURE_FLAGS.SIZE, this._flags)) {
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                    } else {
                        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                    }

                    if (this.powerOfTwo) {
                        gl.generateMipmap(gl.TEXTURE_2D);
                    }

                    this._flags = (0, _utils.removeFlag)(_const.TEXTURE_FLAGS.SOURCE | _const.TEXTURE_FLAGS.SIZE, this._flags);
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
            this.disconnect();

            this._size.destroy();
            this._size = null;

            this._source = null;
            this._scaleMode = null;
            this._wrapMode = null;
            this._premultiplyAlpha = null;
            this._flags = null;
            this._context = null;
            this._texture = null;
            this._flipY = null;
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
         * @member {Size}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(size) {
            this.setSize(size.width, size.height);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return this._size.width;
        },
        set: function set(width) {
            this.setSize(width, this.height);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._size.height;
        },
        set: function set(height) {
            this.setSize(this.width, height);
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

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'flipY',
        get: function get() {
            return this._flipY;
        },
        set: function set(flipY) {
            this._flipY = flipY;
        }

        /**
         * @public
         * @readonly
         * @member {Boolean}
         */

    }, {
        key: 'powerOfTwo',
        get: function get() {
            return (0, _utils.isPowerOfTwo)(this.width) && (0, _utils.isPowerOfTwo)(this.height);
        }
    }]);

    return Texture;
}();

exports.default = Texture;

/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
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
         * @param {Response} response
         * @returns {Promise<*>}
         */

    }, {
        key: 'process',
        value: function process(response) {
            // eslint-disable-line
            return Promise.resolve(null);
        }

        /**
         * @public
         * @param {Response} source
         * @param {Object} [options]
         * @returns {Promise<*>}
         */

    }, {
        key: 'create',
        value: function create(source, options) {
            // eslint-disable-line
            return Promise.resolve(source);
        }

        /**
         * @public
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
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Container2 = __webpack_require__(46);

var _Container3 = _interopRequireDefault(_Container2);

var _Rectangle = __webpack_require__(5);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Sprite
 * @extends Container
 */
var Sprite = function (_Container) {
    _inherits(Sprite, _Container);

    /**
     * @constructor
     * @param {?Texture|?RenderTexture} texture
     */
    function Sprite(texture) {
        _classCallCheck(this, Sprite);

        /**
         * @private
         * @member {?Texture|?RenderTexture}
         */
        var _this = _possibleConstructorReturn(this, (Sprite.__proto__ || Object.getPrototypeOf(Sprite)).call(this));

        _this._texture = null;

        /**
         * @private
         * @member {Rectangle}
         */
        _this._textureFrame = new _Rectangle2.default();

        /**
         * @private
         * @member {Color}
         */
        _this._tint = _Color2.default.White.clone();

        /**
         * @private
         * @member {Number}
         */
        _this._blendMode = _const.BLEND_MODE.NORMAL;

        /**
         * 48 Bytes for 12 4-Byte Properties:
         *
         * X/Y Top-Left
         * X/Y Top-Right
         * X/Y Bottom-Left
         * X/Y Bottom-Right
         *
         * U/V Top-Left (Packed)
         * U/V Bottom-Right (Packed)
         *
         * @private
         * @type {ArrayBuffer}
         */
        _this._vertexData = new ArrayBuffer(48);

        /**
         * @private
         * @type {Float32Array}
         */
        _this._positionData = new Float32Array(_this._vertexData, 0, 8);

        /**
         * @private
         * @type {Uint32Array}
         */
        _this._texCoordData = new Uint32Array(_this._vertexData, 32, 4);

        /**
         * @private
         * @type {Boolean}
         */
        _this._updateTexCoords = true;

        if (texture) {
            _this.setTexture(texture);
        }
        return _this;
    }

    /**
     * @public
     * @member {?Texture|?RenderTexture}
     */


    _createClass(Sprite, [{
        key: 'setTexture',


        /**
         * @public
         * @chainable
         * @param {?Texture|?RenderTexture} texture
         * @returns {Sprite}
         */
        value: function setTexture(texture) {
            if (this._texture !== texture) {
                this._texture = texture;
                this.updateTexture();
            }

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
            if (this._texture) {
                this._texture.updateSource();
                this.resetTextureFrame();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Rectangle} frame
         * @param {Boolean} [resetSize=true]
         * @returns {Sprite}
         */

    }, {
        key: 'setTextureFrame',
        value: function setTextureFrame(frame) {
            var resetSize = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

            var width = this.width,
                height = this.height;

            this._textureFrame.copy(frame);
            this._updateTexCoords = true;

            this.localBounds.set(0, 0, frame.width, frame.height);

            if (resetSize) {
                this.width = frame.width;
                this.height = frame.height;
            } else {
                this.width = width;
                this.height = height;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Sprite}
         */

    }, {
        key: 'resetTextureFrame',
        value: function resetTextureFrame() {
            return this.setTextureFrame(_Rectangle2.default.Temp.set(0, 0, this._texture.width, this._texture.height));
        }

        /**
         * @public
         * @chainable
         * @param {Color} color
         * @returns {Renderable}
         */

    }, {
        key: 'setTint',
        value: function setTint(color) {
            this._tint.copy(color);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} blendMode
         * @returns {Renderable}
         */

    }, {
        key: 'setBlendMode',
        value: function setBlendMode(blendMode) {
            this._blendMode = blendMode;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager) {
            if (this.active && displayManager.insideViewport(this)) {
                var renderer = displayManager.getRenderer('sprite');

                displayManager.setRenderer(renderer);

                renderer.render(this);

                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = this.children[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var child = _step.value;

                        child.render(displayManager);
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
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Sprite.prototype.__proto__ || Object.getPrototypeOf(Sprite.prototype), 'destroy', this).call(this);

            this._tint.destroy();
            this._tint = null;

            this._textureFrame.destroy();
            this._textureFrame = null;

            this._texture = null;
            this._blendMode = null;
            this._vertexData = null;
            this._positionData = null;
            this._texCoordData = null;
            this._updateTexCoords = null;
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
        key: 'textureFrame',
        get: function get() {
            return this._textureFrame;
        },
        set: function set(frame) {
            this.setTextureFrame(frame);
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
            this.setTint(tint);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'blendMode',
        get: function get() {
            return this._blendMode;
        },
        set: function set(blendMode) {
            this.setBlendMode(blendMode);
        }

        /**
         * @public
         * @readonly
         * @member {Float32Array}
         */

    }, {
        key: 'positionData',
        get: function get() {
            var positionData = this._positionData,
                _getLocalBounds = this.getLocalBounds(),
                left = _getLocalBounds.left,
                top = _getLocalBounds.top,
                right = _getLocalBounds.right,
                bottom = _getLocalBounds.bottom,
                _getGlobalTransform = this.getGlobalTransform(),
                a = _getGlobalTransform.a,
                b = _getGlobalTransform.b,
                c = _getGlobalTransform.c,
                d = _getGlobalTransform.d,
                x = _getGlobalTransform.x,
                y = _getGlobalTransform.y;


            positionData[0] = left * a + top * b + x;
            positionData[1] = left * c + top * d + y;

            positionData[2] = right * a + top * b + x;
            positionData[3] = right * c + top * d + y;

            positionData[4] = left * a + bottom * b + x;
            positionData[5] = left * c + bottom * d + y;

            positionData[6] = right * a + bottom * b + x;
            positionData[7] = right * c + bottom * d + y;

            return positionData;
        }

        /**
         * @public
         * @readonly
         * @member {Uint32Array}
         */

    }, {
        key: 'texCoordData',
        get: function get() {
            if (this._updateTexCoords) {
                var _textureFrame = this._textureFrame,
                    left = _textureFrame.left,
                    top = _textureFrame.top,
                    right = _textureFrame.right,
                    bottom = _textureFrame.bottom,
                    _texture = this._texture,
                    width = _texture.width,
                    height = _texture.height,
                    flipY = _texture.flipY,
                    minX = left / width * 65535 & 65535,
                    minY = (top / height * 65535 & 65535) << 16,
                    maxX = right / width * 65535 & 65535,
                    maxY = (bottom / height * 65535 & 65535) << 16;


                if (flipY) {
                    this._texCoordData[0] = maxY | minX;
                    this._texCoordData[1] = maxY | maxX;
                    this._texCoordData[2] = minY | minX;
                    this._texCoordData[3] = minY | maxX;
                } else {
                    this._texCoordData[0] = minY | minX;
                    this._texCoordData[1] = minY | maxX;
                    this._texCoordData[2] = maxY | minX;
                    this._texCoordData[3] = maxY | maxX;
                }

                this._updateTexCoords = false;
            }

            return this._texCoordData;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return Math.abs(this.scale.x) * this._textureFrame.width;
        },
        set: function set(value) {
            this.scale.x = value / this._textureFrame.width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return Math.abs(this.scale.y) * this._textureFrame.height;
        },
        set: function set(value) {
            this.scale.y = value / this._textureFrame.height;
        }
    }]);

    return Sprite;
}(_Container3.default);

exports.default = Sprite;

/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Rectangle = __webpack_require__(5);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Matrix = __webpack_require__(10);

var _Matrix2 = _interopRequireDefault(_Matrix);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Bounds
 */
var Bounds = function () {

    /**
     * @constructor
     */
    function Bounds() {
        _classCallCheck(this, Bounds);

        /**
         * @private
         * @type {Number}
         */
        this._minX = Infinity;

        /**
         * @private
         * @type {Number}
         */
        this._minY = Infinity;

        /**
         * @private
         * @type {Number}
         */
        this._maxX = -Infinity;

        /**
         * @private
         * @type {Number}
         */
        this._maxY = -Infinity;

        /**
         * @private
         * @type {Rectangle}
         */
        this._rect = new _Rectangle2.default();

        /**
         * @private
         * @type {Boolean}
         */
        this._dirty = true;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */


    _createClass(Bounds, [{
        key: 'addCoords',


        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Bounds}
         */
        value: function addCoords(x, y) {
            this._minX = Math.min(this._minX, x);
            this._minY = Math.min(this._minY, y);
            this._maxX = Math.max(this._maxX, x);
            this._maxY = Math.max(this._maxY, y);

            this._dirty = true;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Rectangle} rectangle
         * @param {Matrix} [transform]
         * @returns {Bounds}
         */

    }, {
        key: 'addRect',
        value: function addRect(rectangle, transform) {
            if (transform) {
                rectangle = rectangle.transform(transform, _Rectangle2.default.Temp);
            }

            return this.addCoords(rectangle.left, rectangle.top).addCoords(rectangle.right, rectangle.bottom);
        }

        /**
         * @public
         * @returns {Rectangle}
         */

    }, {
        key: 'getRect',
        value: function getRect() {
            if (this._dirty) {
                this._rect.set(this._minX, this._minY, this._maxX - this._minX, this._maxY - this._minY);

                this._dirty = false;
            }

            return this._rect;
        }

        /**
         * @public
         * @chainable
         * @returns {Bounds}
         */

    }, {
        key: 'reset',
        value: function reset() {
            this._minX = Infinity;
            this._minY = Infinity;
            this._maxX = -Infinity;
            this._maxY = -Infinity;

            this._dirty = true;

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._rect.destroy();
            this._rect = null;

            this._minX = null;
            this._minY = null;
            this._maxX = null;
            this._maxY = null;

            this._dirty = null;
        }
    }, {
        key: 'minX',
        get: function get() {
            return this._minX;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'minY',
        get: function get() {
            return this._minY;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'maxX',
        get: function get() {
            return this._maxX;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'maxY',
        get: function get() {
            return this._maxY;
        }
    }]);

    return Bounds;
}();

exports.default = Bounds;

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
 * @class ParticleModifier
 */
var ParticleModifier = function () {
  function ParticleModifier() {
    _classCallCheck(this, ParticleModifier);
  }

  _createClass(ParticleModifier, [{
    key: 'apply',


    /**
     * @public
     * @chainable
     * @param {Particle} particle
     * @param {Time} delta
     * @returns {ParticleModifier}
     */
    value: function apply(particle, delta) {
      // eslint-disable-line
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @chainable
     * @param {ParticleModifier} modifier
     * @returns {ParticleModifier}
     */

  }, {
    key: 'copy',
    value: function copy(modifier) {
      // eslint-disable-line
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @returns {ParticleModifier}
     */

  }, {
    key: 'clone',
    value: function clone() {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     */

  }, {
    key: 'destroy',
    value: function destroy() {
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

var _ArrayBufferFactory2 = __webpack_require__(12);

var _ArrayBufferFactory3 = _interopRequireDefault(_ArrayBufferFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class BlobFactory
 * @extends ArrayBufferFactory
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
          mimeType = _ref$mimeType === undefined ? (0, _utils.determineMimeType)(source) : _ref$mimeType;

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
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _BlobFactory2 = __webpack_require__(19);

var _BlobFactory3 = _interopRequireDefault(_BlobFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ImageFactory
 * @extends BlobFactory
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
                mimeType = _ref.mimeType;

            return _get(ImageFactory.prototype.__proto__ || Object.getPrototypeOf(ImageFactory.prototype), 'create', this).call(this, source, { mimeType: mimeType }).then(function (blob) {
                return new Promise(function (resolve, reject) {
                    var image = new Image(),
                        objectURL = URL.createObjectURL(blob);

                    _this2._objectURLs.add(objectURL);

                    image.addEventListener('load', function () {
                        return resolve(image);
                    });
                    image.addEventListener('error', function () {
                        return reject(Error('Error loading image source.'));
                    });
                    image.addEventListener('abort', function () {
                        return reject(Error('Image loading was canceled.'));
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
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _utils = __webpack_require__(1);

var _EventEmitter2 = __webpack_require__(6);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Media
 * @extends EventEmitter
 */
var Media = function (_EventEmitter) {
    _inherits(Media, _EventEmitter);

    /**
     * @constructor
     * @param {MediaSource} mediaSource
     * @param {Object} [options]
     * @property {Number} [options.volume]
     * @property {Boolean} [options.loop]
     * @property {Number} [options.speed]
     * @property {Number} [options.time]
     * @property {Boolean} [options.muted]
     */
    function Media(mediaSource, options) {
        _classCallCheck(this, Media);

        /**
         * @private
         * @member {MediaSource}
         */
        var _this = _possibleConstructorReturn(this, (Media.__proto__ || Object.getPrototypeOf(Media)).call(this));

        _this._mediaSource = mediaSource;

        /**
         * @private
         * @member {?HTMLMediaElement}
         */
        _this._mediaElement = mediaSource.mediaElement;

        /**
         * @private
         * @member {Number}
         */
        _this._duration = 0;

        /**
         * @private
         * @member {Number}
         */
        _this._volume = 1;

        /**
         * @private
         * @member {Number}
         */
        _this._speed = 1;

        /**
         * @private
         * @member {Boolean}
         */
        _this._loop = false;

        /**
         * @private
         * @member {Boolean}
         */
        _this._muted = false;

        if (options !== undefined) {
            _this.applyOptions(options);
        }
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {MediaSource}
     */


    _createClass(Media, [{
        key: 'play',


        /**
         * @public
         * @chainable
         * @param {Object} [options]
         * @property {Boolean} [options.loop]
         * @property {Number} [options.speed]
         * @property {Number} [options.volume]
         * @property {Number} [options.time]
         * @property {Boolean} [options.muted]
         * @returns {Media}
         */
        value: function play(options) {
            if (this.paused) {
                this.applyOptions(options);
                this._mediaElement.play();
                this.trigger('start');
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Media}
         */

    }, {
        key: 'pause',
        value: function pause() {
            if (this.playing) {
                this._mediaElement.pause();
                this.trigger('stop');
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Media}
         */

    }, {
        key: 'stop',
        value: function stop() {
            this.pause();
            this.currentTime = 0;

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Media}
         */

    }, {
        key: 'toggle',
        value: function toggle() {
            if (this.paused) {
                this.play();
            } else {
                this.pause();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Object} [options]
         * @property {Number} [options.volume]
         * @property {Boolean} [options.loop]
         * @property {Number} [options.speed]
         * @property {Number} [options.time]
         * @property {Boolean} [options.muted]
         * @returns {Media}
         */

    }, {
        key: 'applyOptions',
        value: function applyOptions() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                volume = _ref.volume,
                loop = _ref.loop,
                speed = _ref.speed,
                time = _ref.time,
                muted = _ref.muted;

            if (volume !== undefined) {
                this.volume = volume;
            }

            if (loop !== undefined) {
                this.loop = loop;
            }

            if (speed !== undefined) {
                this.speed = speed;
            }

            if (time !== undefined) {
                this.currentTime = time;
            }

            if (muted !== undefined) {
                this.muted = muted;
            }

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Media.prototype.__proto__ || Object.getPrototypeOf(Media.prototype), 'destroy', this).call(this);

            this.stop();

            this._mediaSource = null;
            this._mediaElement = null;
            this._duration = null;
            this._volume = null;
            this._speed = null;
            this._loop = null;
            this._muted = null;
        }
    }, {
        key: 'mediaSource',
        get: function get() {
            return this._mediaSource;
        }

        /**
         * @public
         * @readonly
         * @member {?HTMLMediaElement}
         */

    }, {
        key: 'mediaElement',
        get: function get() {
            return this._mediaElement;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'duration',
        get: function get() {
            return this._duration;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'volume',
        get: function get() {
            return this._volume;
        },
        set: function set(value) {
            var volume = (0, _utils.clamp)(value, 0, 2);

            if (this.volume !== volume) {
                this._mediaElement.volume = this._volume = volume;
            }
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'loop',
        get: function get() {
            return this._loop;
        },
        set: function set(value) {
            var loop = !!value;

            if (this.loop !== loop) {
                this._mediaElement.loop = this._loop = loop;
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'speed',
        get: function get() {
            return this._speed;
        },
        set: function set(value) {
            var speed = Math.max(0, value);

            if (this.speed !== speed) {
                this._mediaElement.playbackRate = this._speed = speed;
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'currentTime',
        get: function get() {
            return this._mediaElement.currentTime;
        },
        set: function set(currentTime) {
            this._mediaElement.currentTime = Math.max(0, currentTime);
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'muted',
        get: function get() {
            return this._muted;
        },
        set: function set(value) {
            var muted = !!value;

            if (this.muted !== muted) {
                this._mediaElement.muted = this._muted = muted;
            }
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'paused',
        get: function get() {
            return this._mediaElement.paused;
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
         * @member {?AudioNode}
         */

    }, {
        key: 'analyserTarget',
        get: function get() {
            return null;
        }
    }]);

    return Media;
}(_EventEmitter3.default);

exports.default = Media;

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _SceneNode2 = __webpack_require__(72);

var _SceneNode3 = _interopRequireDefault(_SceneNode2);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _settings = __webpack_require__(2);

var _settings2 = _interopRequireDefault(_settings);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Renderable
 * @extends SceneNode
 */
var Renderable = function (_SceneNode) {
  _inherits(Renderable, _SceneNode);

  function Renderable() {
    _classCallCheck(this, Renderable);

    return _possibleConstructorReturn(this, (Renderable.__proto__ || Object.getPrototypeOf(Renderable)).apply(this, arguments));
  }

  _createClass(Renderable, [{
    key: 'render',


    /**
     * @public
     * @chainable
     * @param {DisplayManager} displayManager
     * @returns {Renderable}
     */
    value: function render(displayManager) {
      throw new Error('Method not implemented!');
    }
  }]);

  return Renderable;
}(_SceneNode3.default);

exports.default = Renderable;

/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Vector2 = __webpack_require__(3);

var _Vector3 = _interopRequireDefault(_Vector2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ObservableVector
 * @extends Vector
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
        value: function add(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            return this.set(this._x + x, this._y + y);
        }

        /**
         * @override
         */

    }, {
        key: 'subtract',
        value: function subtract(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            return this.set(this._x - x, this._y - y);
        }

        /**
         * @override
         */

    }, {
        key: 'multiply',
        value: function multiply(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            return this.set(this._x * x, this._y * y);
        }

        /**
         * @override
         */

    }, {
        key: 'divide',
        value: function divide(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            return this.set(this._x / x, this._y / y);
        }

        /**
         * @override
         */

    }, {
        key: 'normalize',
        value: function normalize() {
            return this.divide(this.magnitude);
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
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

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
    function Clock() {
        var autoStart = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

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
            if (!this._isRunning) {
                this._startTime = Date.now();
                this._isRunning = true;
            }

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
            if (this._isRunning) {
                this._timeBuffer += Date.now() - this._startTime;
                this._isRunning = false;
            }

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
            this.reset();
            this.start();

            return this;
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

        /**
         * @public
         * @readonly
         * @member {Time}
         */

    }, {
        key: 'time',
        get: function get() {
            return this._time;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'elapsedTime',
        get: function get() {
            return this._time.setMilliseconds(this.elapsedMilliseconds);
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'elapsedMilliseconds',
        get: function get() {
            if (!this._isRunning) {
                return this._timeBuffer;
            }

            return this._timeBuffer + (Date.now() - this._startTime);
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'elapsedSeconds',
        get: function get() {
            return this.elapsedMilliseconds / _const.TIME.SECONDS;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'elapsedMinutes',
        get: function get() {
            return this.elapsedMilliseconds / _const.TIME.MINUTES;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'elapsedHours',
        get: function get() {
            return this.elapsedMilliseconds / _const.TIME.HOURS;
        }
    }]);

    return Clock;
}();

exports.default = Clock;

/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Size = __webpack_require__(7);

var _Size2 = _interopRequireDefault(_Size);

var _View = __webpack_require__(50);

var _View2 = _interopRequireDefault(_View);

var _Rectangle = __webpack_require__(5);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Vector = __webpack_require__(3);

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
     * @param {Boolean} [root = false]
     */
    function RenderTarget(width, height) {
        var root = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

        _classCallCheck(this, RenderTarget);

        /**
         * @private
         * @member {Size}
         */
        this._size = new _Size2.default(width, height);

        /**
         * @private
         * @member {Boolean}
         */
        this._root = root;

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLFramebuffer}
         */
        this._framebuffer = null;

        /**
         * @private
         * @member {Rectangle}
         */
        this._viewport = new _Rectangle2.default();

        /**
         * @private
         * @member {View}
         */
        this._defaultView = new _View2.default(width / 2, height / 2, width, height);

        /**
         * @private
         * @member {View}
         */
        this._view = this._defaultView;
    }

    /**
     * @public
     * @member {View}
     */


    _createClass(RenderTarget, [{
        key: 'connect',


        /**
         * @public
         * @chainable
         * @param {WebGLRenderingContext} context
         * @returns {RenderTarget}
         */
        value: function connect(context) {
            if (!this._context) {
                this._context = context;
                this._framebuffer = this._root ? null : context.createFramebuffer();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {RenderTarget}
         */

    }, {
        key: 'disconnect',
        value: function disconnect() {
            this.unbindFramebuffer();

            if (this._context) {
                this._context.deleteFramebuffer(this._framebuffer);

                this._context = null;
                this._framebuffer = null;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {RenderTarget}
         */

    }, {
        key: 'bindFramebuffer',
        value: function bindFramebuffer() {
            if (!this._context) {
                throw new Error('Texture has to be connected first!');
            }

            var gl = this._context;

            gl.bindFramebuffer(gl.FRAMEBUFFER, this._framebuffer);

            this.updateViewport();

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {RenderTarget}
         */

    }, {
        key: 'unbindFramebuffer',
        value: function unbindFramebuffer() {
            if (this._context) {
                var gl = this._context;

                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {View} view
         * @returns {RenderTarget}
         */

    }, {
        key: 'setView',
        value: function setView(view) {
            this._view = view || this._defaultView;
            this.updateViewport();

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} width
         * @param {Number} height
         * @returns {RenderTarget}
         */

    }, {
        key: 'setSize',
        value: function setSize(width, height) {
            if (!this._size.equals({ width: width, height: height })) {
                this._size.set(width, height);
                this._defaultView.setSize(width, height);
                this.updateViewport();
            }

            return this;
        }

        /**
         * @public
         * @param {View} [view=this._view]
         * @returns {Rectangle}
         */

    }, {
        key: 'getViewport',
        value: function getViewport() {
            var view = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._view;

            var viewport = view.viewport;

            return this._viewport.set(Math.round(viewport.x * this.width), Math.round(viewport.y * this.height), Math.round(viewport.width * this.width), Math.round(viewport.height * this.height));
        }

        /**
         * @public
         * @chainable
         * @returns {RenderTarget}
         */

    }, {
        key: 'updateViewport',
        value: function updateViewport() {
            if (this._context) {
                var gl = this._context,
                    viewport = this.getViewport();

                gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
            }

            return this;
        }

        /**
         * @public
         * @param {Vector} point
         * @param {View} [view=this._view]
         * @returns {Vector}
         */

    }, {
        key: 'mapPixelToCoords',
        value: function mapPixelToCoords(point) {
            var view = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._view;

            var viewport = this.getViewport(view),
                normalized = new _Vector2.default(-1 + 2 * (point.x - viewport.left) / viewport.width, 1 - 2 * (point.y - viewport.top) / viewport.height);

            return normalized.transform(view.getInverseTransform());
        }

        /**
         * @public
         * @param {Vector} point
         * @param {View} [view=this._view]
         * @returns {Vector}
         */

    }, {
        key: 'mapCoordsToPixel',
        value: function mapCoordsToPixel(point) {
            var view = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._view;

            var viewport = this.getViewport(view),
                normalized = point.transform(view.getTransform(), new _Vector2.default());

            return normalized.set((normalized.x + 1) / 2 * viewport.width + viewport.left | 0, (-normalized.y + 1) / 2 * viewport.height + viewport.top | 0);
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this.disconnect();

            this._defaultView.destroy();
            this._defaultView = null;

            this._viewport.destroy();
            this._viewport = null;

            this._size.destroy();
            this._size = null;

            this._root = null;
            this._view = null;
        }
    }, {
        key: 'view',
        get: function get() {
            return this._view;
        },
        set: function set(view) {
            this.setView(view);
        }

        /**
         * @public
         * @member {Size}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(size) {
            this.setSize(size.width, size.height);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return this._size.width;
        },
        set: function set(width) {
            this.setSize(width, this.height);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._size.height;
        },
        set: function set(height) {
            this.setSize(this.width, height);
        }
    }]);

    return RenderTarget;
}();

exports.default = RenderTarget;

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
         * @member {?DisplayManager}
         */
        this._displayManager = null;
    }

    /**
     * @public
     * @chainable
     * @param {*} renderable
     * @returns {Renderer}
     */


    _createClass(Renderer, [{
        key: "render",
        value: function render(renderable) {} // eslint-disable-line
        // do nothing


        /**
         * @public
         * @chainable
         * @returns {Renderer}
         */

    }, {
        key: "flush",
        value: function flush() {}
        // do nothing


        /**
         * @public
         * @param {DisplayManager} displayManager
         */

    }, {
        key: "bind",
        value: function bind(displayManager) {}
        // do nothing


        /**
         * @public
         * @chainable
         * @returns {Renderer}
         */

    }, {
        key: "unbind",
        value: function unbind() {}
        // do nothing


        /**
         * @public
         */

    }, {
        key: "destroy",
        value: function destroy() {
            this.unbind();

            this._displayManager = null;
        }
    }]);

    return Renderer;
}();

exports.default = Renderer;

/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ShaderAttribute = __webpack_require__(54);

var _ShaderAttribute2 = _interopRequireDefault(_ShaderAttribute);

var _ShaderUniform = __webpack_require__(55);

var _ShaderUniform2 = _interopRequireDefault(_ShaderUniform);

var _Program = __webpack_require__(75);

var _Program2 = _interopRequireDefault(_Program);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Shader
 */
var Shader = function () {

    /**
     * @constructor
     */
    function Shader() {
        _classCallCheck(this, Shader);

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?Program}
         */
        this._program = null;

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
    }

    /**
     * @public
     * @chainable
     * @param {WebGLRenderingContext} gl
     * @returns {Shader}
     */


    _createClass(Shader, [{
        key: 'connect',
        value: function connect(gl) {
            if (!this._context) {
                this._context = gl;
                this._program = new _Program2.default(gl, this._vertexSource, this._fragmentSource);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Shader}
         */

    }, {
        key: 'disconnect',
        value: function disconnect() {
            this.unbindProgram();

            if (this._context) {
                this._program.destroy();
                this._program = null;
                this._context = null;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Shader}
         */

    }, {
        key: 'bindProgram',
        value: function bindProgram() {
            if (!this._context) {
                throw new Error('Texture has to be connected first!');
            }

            var stride = [].concat(_toConsumableArray(this._attributes.values())).reduce(function (stride, attribute) {
                return stride + attribute.byteSize;
            }, 0);
            var offset = 0;

            this._program.bind();

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._attributes.values()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var attribute = _step.value;

                    attribute.bind(this._program, stride, offset);

                    offset += attribute.byteSize;
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

                    uniform.bind(this._program);
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

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Shader}
         */

    }, {
        key: 'unbindProgram',
        value: function unbindProgram() {
            if (this._context) {
                this._program.unbind();

                var _iteratorNormalCompletion3 = true;
                var _didIteratorError3 = false;
                var _iteratorError3 = undefined;

                try {
                    for (var _iterator3 = this._attributes.values()[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                        var attribute = _step3.value;

                        attribute.unbind();
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

                        uniform.unbind();
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
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String|String[]} source
         * @returns {Shader}
         */

    }, {
        key: 'setVertexSource',
        value: function setVertexSource(source) {
            this._vertexSource = Array.isArray(source) ? source.join('\n') : source;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String|String[]} source
         * @returns {Shader}
         */

    }, {
        key: 'setFragmentSource',
        value: function setFragmentSource(source) {
            this._fragmentSource = Array.isArray(source) ? source.join('\n') : source;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} name
         * @param {Number} type
         * @param {Number} size
         * @param {Boolean} [normalized=false]
         * @param {Boolean} [enabled=true]
         * @returns {Shader}
         */

    }, {
        key: 'setAttribute',
        value: function setAttribute(name, type, size) {
            var normalized = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
            var enabled = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : true;

            if (this._attributes.has(name)) {
                throw new Error('Attribute "' + name + '" has already been defined.');
            }

            this._attributes.set(name, new _ShaderAttribute2.default(name, type, size, normalized, enabled));

            return this;
        }

        /**
         * @public
         * @param {String} name
         * @returns {ShaderAttribute}
         */

    }, {
        key: 'getAttribute',
        value: function getAttribute(name) {
            if (!this._attributes.has(name)) {
                throw new Error('Could not find Attribute "' + name + '".');
            }

            return this._attributes.get(name);
        }

        /**
         * @public
         * @chainable
         * @param {String} name
         * @param {Number} type
         * @param {Number} [value]
         * @returns {Shader}
         */

    }, {
        key: 'setUniform',
        value: function setUniform(name, type, value) {
            if (this._uniforms.has(name)) {
                throw new Error('Uniform "' + name + '" has already been defined.');
            }

            this._uniforms.set(name, new _ShaderUniform2.default(name, type, value));

            return this;
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
            this.disconnect();

            var _iteratorNormalCompletion5 = true;
            var _didIteratorError5 = false;
            var _iteratorError5 = undefined;

            try {
                for (var _iterator5 = this._attributes.values()[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                    var attribute = _step5.value;

                    attribute.destroy();
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

                    uniform.destroy();
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

            this._attributes.clear();
            this._attributes = null;

            this._uniforms.clear();
            this._uniforms = null;

            this._vertexSource = null;
            this._fragmentSource = null;
            this._context = null;
        }
    }]);

    return Shader;
}();

exports.default = Shader;

/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Interval
 */
var Interval = function () {

    /**
     * @constructor
     * @param {Number} [min=0]
     * @param {Number} [max=min]
     */
    function Interval() {
        var min = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        var max = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : min;

        _classCallCheck(this, Interval);

        /**
         * @public
         * @member {Number}
         */
        this._min = min;

        /**
         * @public
         * @member {Number}
         */
        this._max = max;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(Interval, [{
        key: "set",


        /**
         * @public
         * @chainable
         * @param {Number} min
         * @param {Number} max
         * @returns {Interval}
         */
        value: function set(min, max) {
            this.min = min;
            this.max = max;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Interval} interval
         * @returns {Interval}
         */

    }, {
        key: "copy",
        value: function copy(interval) {
            return this.set(interval.min, interval.max);
        }

        /**
         * @public
         * @returns {Interval}
         */

    }, {
        key: "clone",
        value: function clone() {
            return new Interval(this.min, this.max);
        }

        /**
         * @public
         * @param {Interval} interval
         * @returns {Boolean}
         */

    }, {
        key: "contains",
        value: function contains(interval) {
            return interval.min > this._min && interval.max < this._max;
        }

        /**
         * @public
         * @param {Number} value
         * @returns {Boolean}
         */

    }, {
        key: "includes",
        value: function includes(value) {
            return value <= this._max && value >= this._min;
        }

        /**
         * @public
         * @param {Interval} interval
         * @returns {Boolean}
         */

    }, {
        key: "overlaps",
        value: function overlaps(interval) {
            return !(this._min > interval.max || interval.min > this._max);
        }

        /**
         * @public
         * @param {Interval} interval
         * @returns {Number}
         */

    }, {
        key: "getOverlap",
        value: function getOverlap(interval) {
            if (!this.overlaps(interval)) {
                return 0;
            }

            return Math.min(this._max, interval.max) - Math.max(this._min, interval.min);
        }

        /**
         * @public
         */

    }, {
        key: "destroy",
        value: function destroy() {
            this._min = null;
            this._max = null;
        }
    }, {
        key: "min",
        get: function get() {
            return this._min;
        },
        set: function set(min) {
            this._min = min;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: "max",
        get: function get() {
            return this._y;
        },
        set: function set(max) {
            this._max = max;
        }
    }]);

    return Interval;
}();

exports.default = Interval;

/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _Vector = __webpack_require__(3);

var _Vector2 = _interopRequireDefault(_Vector);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _Time = __webpack_require__(11);

var _Time2 = _interopRequireDefault(_Time);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class ParticleOptions
 */
var ParticleOptions = function () {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Time} [options.elapsedLifetime]
     * @param {Time} [options.totalLifetime]
     * @param {Vector} [options.position]
     * @param {Vector} [options.scale]
     * @param {Color} [options.color]
     * @param {Vector} [options.velocity]
     * @param {Number} [options.rotation]
     * @param {Number} [options.rotationSpeed]
     */
    function ParticleOptions() {
        var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
            elapsedLifetime = _ref.elapsedLifetime,
            totalLifetime = _ref.totalLifetime,
            position = _ref.position,
            scale = _ref.scale,
            color = _ref.color,
            velocity = _ref.velocity,
            rotation = _ref.rotation,
            rotationSpeed = _ref.rotationSpeed;

        _classCallCheck(this, ParticleOptions);

        /**
         * @private
         * @member {Time}
         */
        this._elapsedLifetime = elapsedLifetime && elapsedLifetime.clone() || new _Time2.default(0, _const.TIME.SECONDS);

        /**
         * @private
         * @member {Time}
         */
        this._totalLifetime = totalLifetime && totalLifetime.clone() || new _Time2.default(1, _const.TIME.SECONDS);

        /**
         * @private
         * @member {Vector}
         */
        this._position = position && position.clone() || new _Vector2.default();

        /**
         * @private
         * @member {Vector}
         */
        this._scale = scale && scale.clone() || new _Vector2.default(1, 1);

        /**
         * @private
         * @member {Color}
         */
        this._color = color && color.clone() || _Color2.default.White.clone();

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
    }

    /**
     * @public
     * @member {Time}
     */


    _createClass(ParticleOptions, [{
        key: 'destroy',


        /**
         * @override
         */
        value: function destroy() {
            this._elapsedLifetime.destroy();
            this._elapsedLifetime = null;

            this._totalLifetime.destroy();
            this._totalLifetime = null;

            this._position.destroy();
            this._position = null;

            this._velocity.destroy();
            this._velocity = null;

            this._scale.destroy();
            this._scale = null;

            this._color.destroy();
            this._color = null;

            this._rotation = null;
            this._rotationSpeed = null;
        }
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
        set: function set(degrees) {
            var rotation = degrees % 360;

            this._rotation = rotation < 0 ? rotation + 360 : rotation;
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
        set: function set(speed) {
            this._rotationSpeed = speed;
        }
    }]);

    return ParticleOptions;
}();

exports.default = ParticleOptions;

/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(6);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _ResourceContainer = __webpack_require__(31);

var _ResourceContainer2 = _interopRequireDefault(_ResourceContainer);

var _ArrayBufferFactory = __webpack_require__(12);

var _ArrayBufferFactory2 = _interopRequireDefault(_ArrayBufferFactory);

var _BlobFactory = __webpack_require__(19);

var _BlobFactory2 = _interopRequireDefault(_BlobFactory);

var _FontFactory = __webpack_require__(32);

var _FontFactory2 = _interopRequireDefault(_FontFactory);

var _ImageFactory = __webpack_require__(20);

var _ImageFactory2 = _interopRequireDefault(_ImageFactory);

var _JSONFactory = __webpack_require__(33);

var _JSONFactory2 = _interopRequireDefault(_JSONFactory);

var _MusicFactory = __webpack_require__(34);

var _MusicFactory2 = _interopRequireDefault(_MusicFactory);

var _SoundFactory = __webpack_require__(40);

var _SoundFactory2 = _interopRequireDefault(_SoundFactory);

var _StringFactory = __webpack_require__(42);

var _StringFactory2 = _interopRequireDefault(_StringFactory);

var _TextureFactory = __webpack_require__(43);

var _TextureFactory2 = _interopRequireDefault(_TextureFactory);

var _MediaSourceFactory = __webpack_require__(13);

var _MediaSourceFactory2 = _interopRequireDefault(_MediaSourceFactory);

var _VideoFactory = __webpack_require__(44);

var _VideoFactory2 = _interopRequireDefault(_VideoFactory);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ResourceLoader
 * @extends EventEmitter
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

        _this.addFactory('arrayBuffer', new _ArrayBufferFactory2.default()).addFactory('mediaSource', new _MediaSourceFactory2.default()).addFactory('blob', new _BlobFactory2.default()).addFactory('font', new _FontFactory2.default()).addFactory('music', new _MusicFactory2.default()).addFactory('sound', new _SoundFactory2.default()).addFactory('video', new _VideoFactory2.default()).addFactory('image', new _ImageFactory2.default()).addFactory('texture', new _TextureFactory2.default()).addFactory('string', new _StringFactory2.default()).addFactory('json', new _JSONFactory2.default());
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
         * @param {Function} [callback]
         * @returns {Promise}
         */

    }, {
        key: 'load',
        value: function load(callback) {
            var _this2 = this;

            var items = [].concat(_toConsumableArray(this._queue));

            var loaded = 0;

            if (callback) {
                this.once('complete', callback, this);
            }

            this._queue.clear();

            this.trigger('start', items.length, loaded, items);

            return items.map(function (item) {
                return _this2.loadItem(item);
            }).reduce(function (sequence, promise) {
                return sequence.then(function () {
                    return promise;
                }).then(function (resource) {
                    return _this2.trigger('progress', items.length, ++loaded, items, resource);
                });
            }, Promise.resolve()).then(function () {
                return _this2.trigger('complete', items.length, loaded, items, _this2._resources);
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
                        return _this3._database.saveData(factory.storageType, name, data).then(function (result) {
                            return result.data;
                        });
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
         * @param {Object<String, String>} list
         * @param {Object} [options]
         * @returns {ResourceLoader}
         */

    }, {
        key: 'addList',
        value: function addList(type, list, options) {
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = Object.entries(list)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
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
/* 31 */
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
         * @returns {*}
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
        key: "remove",
        value: function remove(type, name) {
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
/* 32 */
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
 * @class FontFactory
 * @extends ArrayBufferFactory
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
                    var fontFace = new FontFace(family, arrayBuffer, destriptors);

                    fontFace.load().then(function () {
                        if (addToDocument) {
                            document.fonts.add(fontFace);
                        }

                        resolve(fontFace);
                    }).catch(function () {
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
/* 33 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ResourceFactory2 = __webpack_require__(15);

var _ResourceFactory3 = _interopRequireDefault(_ResourceFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class JSONFactory
 * @extends ResourceFactory
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
      // eslint-disable-line
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
/* 34 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _MediaSourceFactory2 = __webpack_require__(13);

var _MediaSourceFactory3 = _interopRequireDefault(_MediaSourceFactory2);

var _Music = __webpack_require__(36);

var _Music2 = _interopRequireDefault(_Music);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class MusicFactory
 * @extends MediaSourceFactory
 */
var MusicFactory = function (_MediaSourceFactory) {
  _inherits(MusicFactory, _MediaSourceFactory);

  function MusicFactory() {
    _classCallCheck(this, MusicFactory);

    return _possibleConstructorReturn(this, (MusicFactory.__proto__ || Object.getPrototypeOf(MusicFactory)).apply(this, arguments));
  }

  _createClass(MusicFactory, [{
    key: 'create',


    /**
     * @override
     */
    value: function create(source) {
      var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          _ref$type = _ref.type,
          type = _ref$type === undefined ? 'audio' : _ref$type,
          _ref$createMediaEleme = _ref.createMediaElement,
          createMediaElement = _ref$createMediaEleme === undefined ? true : _ref$createMediaEleme,
          _ref$decodeAudioBuffe = _ref.decodeAudioBuffer,
          decodeAudioBuffer = _ref$decodeAudioBuffe === undefined ? false : _ref$decodeAudioBuffe,
          mimeType = _ref.mimeType,
          loadEvent = _ref.loadEvent;

      return _get(MusicFactory.prototype.__proto__ || Object.getPrototypeOf(MusicFactory.prototype), 'create', this).call(this, source, { type: type, createMediaElement: createMediaElement, decodeAudioBuffer: decodeAudioBuffer, mimeType: mimeType, loadEvent: loadEvent }).then(function (audioSource) {
        return new _Music2.default(audioSource);
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

  return MusicFactory;
}(_MediaSourceFactory3.default);

exports.default = MusicFactory;

/***/ }),
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _utils = __webpack_require__(1);

var _support = __webpack_require__(4);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class MediaSource
 */
var MediaSource = function () {

  /**
   * @constructor
   * @param {String} type
   * @param {ArrayBuffer} arrayBuffer
   * @param {Object} [options={}]
   * @param {String} [options.mimeType=determineMimeType(arrayBuffer)]
   * @param {String} [options.loadEvent='canplaythrough']
   */
  function MediaSource(type, arrayBuffer) {
    var _ref = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
        _ref$mimeType = _ref.mimeType,
        mimeType = _ref$mimeType === undefined ? (0, _utils.determineMimeType)(arrayBuffer) : _ref$mimeType,
        _ref$loadEvent = _ref.loadEvent,
        loadEvent = _ref$loadEvent === undefined ? 'canplaythrough' : _ref$loadEvent;

    _classCallCheck(this, MediaSource);

    /**
     * @private
     * @member {String}
     */
    this._type = type;

    /**
     * @private
     * @member {ArrayBuffer}
     */
    this._arrayBuffer = arrayBuffer;

    /**
     * @private
     * @member {String}
     */
    this._mimeType = mimeType;

    /**
     * @private
     * @member {Blob}
     */
    this._blob = new Blob([arrayBuffer], { type: mimeType });

    /**
     * @private
     * @member {String}
     */
    this._blobURL = URL.createObjectURL(this._blob);

    /**
     * @private
     * @member {String}
     */
    this._loadEvent = loadEvent;

    /**
     * @private
     * @member {?HTMLMediaElement}
     */
    this._mediaElement = null;

    /**
     * @private
     * @member {?AudioBuffer}
     */
    this._audioBuffer = null;
  }

  /**
   * @public
   * @readonly
   * @member {String}
   */


  _createClass(MediaSource, [{
    key: 'createMediaElement',


    /**
     * @public
     * @returns {Promise<HTMLMediaElement>}
     */
    value: function createMediaElement() {
      var _this = this;

      if (!this._mediaElement) {
        return new Promise(function (resolve, reject) {
          var mediaElement = document.createElement(_this._type);

          mediaElement.addEventListener(_this._loadEvent, function () {
            return resolve(_this._mediaElement = mediaElement);
          });
          mediaElement.addEventListener('error', function () {
            return reject(Error('Error loading audio source.'));
          });
          mediaElement.addEventListener('abort', function () {
            return reject(Error('Audio loading was canceled.'));
          });

          mediaElement.src = _this._blobURL;
        });
      }

      return Promise.resolve(this._mediaElement);
    }

    /**
     * @public
     * @returns {Promise<?AudioBuffer>}
     */

  }, {
    key: 'decodeAudioBuffer',
    value: function decodeAudioBuffer() {
      var _this2 = this;

      if (!this._audioBuffer && _support2.default.webAudio) {
        return (0, _utils.decodeAudioBuffer)(this._arrayBuffer).then(function (audioBuffer) {
          _this2._audioBuffer = audioBuffer;
        });
      }

      return Promise.resolve(this._audioBuffer);
    }

    /**
     * @public
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      _get(MediaSource.prototype.__proto__ || Object.getPrototypeOf(MediaSource.prototype), 'destroy', this).call(this);

      URL.revokeObjectURL(this._blobURL);

      this._type = null;
      this._arrayBuffer = null;
      this._mimeType = null;
      this._blob = null;
      this._blobURL = null;
      this._loadEvent = null;
      this._mediaElement = null;
      this._audioBuffer = null;
    }
  }, {
    key: 'type',
    get: function get() {
      return this._type;
    }

    /**
     * @public
     * @readonly
     * @member {ArrayBuffer}
     */

  }, {
    key: 'arrayBuffer',
    get: function get() {
      return this._arrayBuffer;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */

  }, {
    key: 'mimeType',
    get: function get() {
      return this._mimeType;
    }

    /**
     * @public
     * @readonly
     * @member {Blob}
     */

  }, {
    key: 'blob',
    get: function get() {
      return this._blob;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */

  }, {
    key: 'blobURL',
    get: function get() {
      return this._blobURL;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */

  }, {
    key: 'loadEvent',
    get: function get() {
      return this._loadEvent;
    }

    /**
     * @public
     * @readonly
     * @member {?HTMLMediaElement}
     */

  }, {
    key: 'mediaElement',
    get: function get() {
      return this._mediaElement;
    }

    /**
     * @public
     * @readonly
     * @member {?AudioBuffer}
     */

  }, {
    key: 'audioBuffer',
    get: function get() {
      return this._audioBuffer;
    }
  }]);

  return MediaSource;
}();

exports.default = MediaSource;

/***/ }),
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _utils = __webpack_require__(1);

var _support = __webpack_require__(4);

var _support2 = _interopRequireDefault(_support);

var _Media2 = __webpack_require__(21);

var _Media3 = _interopRequireDefault(_Media2);

var _settings = __webpack_require__(2);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Music
 * @extends Media
 */
var Music = function (_Media) {
  _inherits(Music, _Media);

  /**
   * @constructor
   * @param {MediaSource} mediaSource
   * @param {Object} [options={}]
   * @property {Number} [options.volume=settings.VOLUME_MUSIC]
   * @property {Boolean} [options.loop=settings.MEDIA_LOOP]
   * @property {Number} [options.speed=settings.MEDIA_SPEED]
   * @property {Number} [options.time=settings.MEDIA_TIME]
   * @property {Boolean} [options.muted=settings.MEDIA_MUTED]
   */
  function Music(mediaSource) {
    var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
        _ref$volume = _ref.volume,
        volume = _ref$volume === undefined ? _settings2.default.VOLUME_MUSIC : _ref$volume,
        _ref$loop = _ref.loop,
        loop = _ref$loop === undefined ? _settings2.default.MEDIA_LOOP : _ref$loop,
        _ref$speed = _ref.speed,
        speed = _ref$speed === undefined ? _settings2.default.MEDIA_SPEED : _ref$speed,
        _ref$time = _ref.time,
        time = _ref$time === undefined ? _settings2.default.MEDIA_TIME : _ref$time,
        _ref$muted = _ref.muted,
        muted = _ref$muted === undefined ? _settings2.default.MEDIA_MUTED : _ref$muted;

    _classCallCheck(this, Music);

    var _this = _possibleConstructorReturn(this, (Music.__proto__ || Object.getPrototypeOf(Music)).call(this, mediaSource, { volume: volume, loop: loop, speed: speed, time: time, muted: muted }));

    var mediaElement = _this.mediaElement;

    if (!mediaElement) {
      throw new Error('MediaElement is missing in MediaSource');
    }

    /**
     * @private
     * @member {Number}
     */
    _this._duration = mediaElement.duration;

    /**
     * @private
     * @member {Number}
     */
    _this._volume = mediaElement.volume;

    /**
     * @private
     * @member {Number}
     */
    _this._speed = mediaElement.playbackRate;

    /**
     * @private
     * @member {Boolean}
     */
    _this._loop = mediaElement.loop;

    /**
     * @private
     * @member {Boolean}
     */
    _this._muted = mediaElement.muted;

    if (_support2.default.webAudio) {

      /**
       * @private
       * @member {?GainNode}
       */
      _this._gainNode = _utils.audioContext.createGain();
      _this._gainNode.gain.value = _this.volume;
      _this._gainNode.connect(_utils.audioContext.destination);

      /**
       * @private
       * @member {?MediaElementAudioSourceNode}
       */
      _this._sourceNode = _utils.audioContext.createMediaElementSource(_this.mediaElement);
      _this._sourceNode.connect(_this._gainNode);
    }
    return _this;
  }

  /**
   * @override
   */


  _createClass(Music, [{
    key: 'destroy',


    /**
     * @override
     */
    value: function destroy() {
      _get(Music.prototype.__proto__ || Object.getPrototypeOf(Music.prototype), 'destroy', this).call(this);

      if (_support2.default.webAudio) {
        this._sourceNode.disconnect();
        this._sourceNode = null;

        this._gainNode.disconnect();
        this._gainNode = null;
      }
    }
  }, {
    key: 'volume',
    get: function get() {
      return this._volume;
    },
    set: function set(value) {
      var volume = (0, _utils.clamp)(value, 0, 2);

      if (this._volume !== volume) {
        this._volume = volume;

        if (this._gainNode) {
          this._gainNode.gain.value = volume;
        }
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

  return Music;
}(_Media3.default);

exports.default = Music;

/***/ }),
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _const = __webpack_require__(0);

var _GamepadMapping2 = __webpack_require__(38);

var _GamepadMapping3 = _interopRequireDefault(_GamepadMapping2);

var _GamepadControl = __webpack_require__(39);

var _GamepadControl2 = _interopRequireDefault(_GamepadControl);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class DefaultGamepadMapping
 * @extends GamepadMapping
 */
var DefaultGamepadMapping = function (_GamepadMapping) {
    _inherits(DefaultGamepadMapping, _GamepadMapping);

    /**
     * @constructor
     */
    function DefaultGamepadMapping() {
        _classCallCheck(this, DefaultGamepadMapping);

        var invert = { invert: true };

        return _possibleConstructorReturn(this, (DefaultGamepadMapping.__proto__ || Object.getPrototypeOf(DefaultGamepadMapping)).call(this, [new _GamepadControl2.default(0, _const.GAMEPAD.FaceBottom), new _GamepadControl2.default(1, _const.GAMEPAD.FaceLeft), new _GamepadControl2.default(2, _const.GAMEPAD.FaceRight), new _GamepadControl2.default(3, _const.GAMEPAD.FaceTop), new _GamepadControl2.default(4, _const.GAMEPAD.ShoulderLeftBottom), new _GamepadControl2.default(5, _const.GAMEPAD.ShoulderRightBottom), new _GamepadControl2.default(6, _const.GAMEPAD.ShoulderLeftTop), new _GamepadControl2.default(7, _const.GAMEPAD.ShoulderRightTop), new _GamepadControl2.default(8, _const.GAMEPAD.Select), new _GamepadControl2.default(9, _const.GAMEPAD.Start), new _GamepadControl2.default(10, _const.GAMEPAD.LeftStick), new _GamepadControl2.default(11, _const.GAMEPAD.RightStick), new _GamepadControl2.default(12, _const.GAMEPAD.DPadUp), new _GamepadControl2.default(13, _const.GAMEPAD.DPadDown), new _GamepadControl2.default(14, _const.GAMEPAD.DPadLeft), new _GamepadControl2.default(15, _const.GAMEPAD.DPadRight), new _GamepadControl2.default(16, _const.GAMEPAD.Home)], [new _GamepadControl2.default(0, _const.GAMEPAD.LeftStickLeft, invert), new _GamepadControl2.default(0, _const.GAMEPAD.LeftStickRight), new _GamepadControl2.default(1, _const.GAMEPAD.LeftStickUp, invert), new _GamepadControl2.default(1, _const.GAMEPAD.LeftStickDown), new _GamepadControl2.default(2, _const.GAMEPAD.RightStickLeft, invert), new _GamepadControl2.default(2, _const.GAMEPAD.RightStickRight), new _GamepadControl2.default(3, _const.GAMEPAD.RightStickUp, invert), new _GamepadControl2.default(3, _const.GAMEPAD.RightStickDown)]));
    }

    return DefaultGamepadMapping;
}(_GamepadMapping3.default);

exports.default = DefaultGamepadMapping;

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
/* 39 */
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
     * @param {Object} [options={}]
     * @param {Boolean} [options.invert=false]
     * @param {Boolean} [options.normalize=false]
     * @param {Number} [options.threshold=0.2]
     */
    function GamepadControl(index, channel) {
        var _ref = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
            _ref$invert = _ref.invert,
            invert = _ref$invert === undefined ? false : _ref$invert,
            _ref$normalize = _ref.normalize,
            normalize = _ref$normalize === undefined ? false : _ref$normalize,
            _ref$threshold = _ref.threshold,
            threshold = _ref$threshold === undefined ? 0.2 : _ref$threshold;

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
        this._key = channel % _const.INPUT_CHANNELS_HANDLER;

        /**
         * Transform value range from {-1..1} to {1..-1}.
         *
         * @private
         * @member {Boolean}
         */
        this._invert = invert;

        /**
         * Transform value range from {-1..1} to {0..1}.
         *
         * @private
         * @member {Boolean}
         */
        this._normalize = normalize;

        /**
         * @private
         * @member {Number}
         */
        this._threshold = threshold;
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
            var result = value;

            if (this._invert) {
                result *= -1;
            }

            if (this._normalize) {
                result = (result + 1) / 2;
            }

            return result > this._threshold ? result : 0;
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
            this._key = this._channel % _const.INPUT_CHANNELS_HANDLER;
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
            this._key = key % _const.INPUT_CHANNELS_HANDLER;
            this._channel = _const.INPUT_OFFSET_GAMEPAD + this._key;
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'invert',
        get: function get() {
            return this._invert;
        },
        set: function set(invert) {
            this._invert = invert;
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
    }]);

    return GamepadControl;
}();

exports.default = GamepadControl;

/***/ }),
/* 40 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _MediaSourceFactory2 = __webpack_require__(13);

var _MediaSourceFactory3 = _interopRequireDefault(_MediaSourceFactory2);

var _Sound = __webpack_require__(41);

var _Sound2 = _interopRequireDefault(_Sound);

var _support = __webpack_require__(4);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SoundFactory
 * @extends MediaSourceFactory
 */
var SoundFactory = function (_MediaSourceFactory) {
  _inherits(SoundFactory, _MediaSourceFactory);

  function SoundFactory() {
    _classCallCheck(this, SoundFactory);

    return _possibleConstructorReturn(this, (SoundFactory.__proto__ || Object.getPrototypeOf(SoundFactory)).apply(this, arguments));
  }

  _createClass(SoundFactory, [{
    key: 'create',


    /**
     * @override
     */
    value: function create(source) {
      var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          _ref$type = _ref.type,
          type = _ref$type === undefined ? 'audio' : _ref$type,
          _ref$createMediaEleme = _ref.createMediaElement,
          createMediaElement = _ref$createMediaEleme === undefined ? false : _ref$createMediaEleme,
          _ref$decodeAudioBuffe = _ref.decodeAudioBuffer,
          decodeAudioBuffer = _ref$decodeAudioBuffe === undefined ? true : _ref$decodeAudioBuffe,
          mimeType = _ref.mimeType,
          loadEvent = _ref.loadEvent;

      return _get(SoundFactory.prototype.__proto__ || Object.getPrototypeOf(SoundFactory.prototype), 'create', this).call(this, source, { type: type, createMediaElement: createMediaElement, decodeAudioBuffer: decodeAudioBuffer, mimeType: mimeType, loadEvent: loadEvent }).then(function (audioSource) {
        return new _Sound2.default(audioSource);
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
}(_MediaSourceFactory3.default);

exports.default = SoundFactory;

/***/ }),
/* 41 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _utils = __webpack_require__(1);

var _support = __webpack_require__(4);

var _support2 = _interopRequireDefault(_support);

var _Media2 = __webpack_require__(21);

var _Media3 = _interopRequireDefault(_Media2);

var _settings = __webpack_require__(2);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Sound
 * @extends Media
 */
var Sound = function (_Media) {
    _inherits(Sound, _Media);

    /**
     * @constructor
     * @param {MediaSource} mediaSource
     * @param {Object} [options={}]
     * @property {Number} [options.volume=settings.VOLUME_SOUND]
     * @property {Boolean} [options.loop=settings.MEDIA_LOOP]
     * @property {Number} [options.speed=settings.MEDIA_SPEED]
     * @property {Number} [options.time=settings.MEDIA_TIME]
     * @property {Boolean} [options.muted=settings.MEDIA_MUTED]
     */
    function Sound(mediaSource) {
        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            _ref$volume = _ref.volume,
            volume = _ref$volume === undefined ? _settings2.default.VOLUME_SOUND : _ref$volume,
            _ref$loop = _ref.loop,
            loop = _ref$loop === undefined ? _settings2.default.MEDIA_LOOP : _ref$loop,
            _ref$speed = _ref.speed,
            speed = _ref$speed === undefined ? _settings2.default.MEDIA_SPEED : _ref$speed,
            _ref$time = _ref.time,
            time = _ref$time === undefined ? _settings2.default.MEDIA_TIME : _ref$time,
            _ref$muted = _ref.muted,
            muted = _ref$muted === undefined ? _settings2.default.MEDIA_MUTED : _ref$muted;

        _classCallCheck(this, Sound);

        var _this = _possibleConstructorReturn(this, (Sound.__proto__ || Object.getPrototypeOf(Sound)).call(this, mediaSource, { volume: volume, loop: loop, speed: speed, time: time, muted: muted }));

        var audioBuffer = _this.audioBuffer;

        if (!audioBuffer) {
            throw new Error('AudioBuffer is missing in MediaSource');
        }

        /**
         * @private
         * @member {AudioBuffer}
         */
        _this._audioBuffer = audioBuffer;

        /**
         * @private
         * @member {Number}
         */
        _this._duration = audioBuffer.duration;

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

        if (_support2.default.webAudio) {

            /**
             * @private
             * @member {?AudioBufferSourceNode}
             */
            _this._sourceNode = null;

            /**
             * @private
             * @member {?GainNode}
             */
            _this._gainNode = _utils.audioContext.createGain();
            _this._gainNode.gain.value = _this.volume;
            _this._gainNode.connect(_utils.audioContext.destination);
        }
        return _this;
    }

    /**
     * @override
     */


    _createClass(Sound, [{
        key: 'play',


        /**
         * @override
         */
        value: function play(options) {
            if (this._paused) {
                this.applyOptions(options);

                this._sourceNode = this.createSourceNode();
                this._startTime = _utils.audioContext.currentTime;
                this._paused = false;

                this.trigger('start');
            }

            return this;
        }

        /**
         * @public
         * @returns {AudioBufferSourceNode}
         */

    }, {
        key: 'createSourceNode',
        value: function createSourceNode() {
            var sourceNode = _utils.audioContext.createBufferSource();

            sourceNode.buffer = this.mediaSource.audioBuffer;
            sourceNode.loop = this.loop;
            sourceNode.playbackRate.value = this.speed;
            sourceNode.connect(this._gainNode);
            sourceNode.start(0, this._currentTime);

            return sourceNode;
        }

        /**
         * @override
         */

    }, {
        key: 'pause',
        value: function pause() {
            if (!this._paused) {
                var duration = this.duration,
                    currentTime = this.currentTime;

                if (currentTime <= duration) {
                    this._currentTime = currentTime;
                } else {
                    this._currentTime = (currentTime - duration) * (currentTime / duration | 0);
                }

                this._sourceNode.stop(0);
                this._sourceNode.disconnect();
                this._sourceNode = null;
                this._paused = true;

                this.trigger('stop');
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Sound.prototype.__proto__ || Object.getPrototypeOf(Sound.prototype), 'destroy', this).call(this);

            if (_support2.default.webAudio) {
                this._sourceNode.disconnect();
                this._sourceNode = null;

                this._gainNode.disconnect();
                this._gainNode = null;
            }

            this._audioBuffer = null;
            this._paused = null;
            this._startTime = null;
            this._currentTime = null;
        }
    }, {
        key: 'volume',
        get: function get() {
            return this._volume;
        },
        set: function set(value) {
            var volume = (0, _utils.clamp)(value, 0, 2);

            if (this._volume !== volume) {
                this._volume = volume;

                if (this._gainNode) {
                    this._gainNode.gain.value = this.muted ? 0 : volume;
                }
            }
        }

        /**
         * @override
         */

    }, {
        key: 'loop',
        set: function set(value) {
            var loop = !!value;

            if (this._loop !== loop) {
                this._loop = loop;

                if (this._sourceNode) {
                    this._sourceNode.loop = loop;
                }
            }
        }

        /**
         * @override
         */

    }, {
        key: 'speed',
        set: function set(value) {
            var speed = Math.max(0, value);

            if (this._speed !== speed) {
                this._speed = speed;

                if (this._sourceNode) {
                    this._sourceNode.playbackRate.value = speed;
                }
            }
        }

        /**
         * @override
         */

    }, {
        key: 'currentTime',
        get: function get() {
            if (!this._startTime || !_utils.audioContext) {
                return 0;
            }

            return this._currentTime + _utils.audioContext.currentTime - this._startTime;
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
        key: 'muted',
        set: function set(value) {
            var muted = !!value;

            if (this._muted !== muted) {
                this._muted = muted;

                if (this._gainNode) {
                    this._gainNode.gain.value = muted ? 0 : this.volume;
                }
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
        }

        /**
         * @override
         */

    }, {
        key: 'playing',
        get: function get() {
            return !this._paused;
        }

        /**
         * @override
         */

    }, {
        key: 'analyserTarget',
        get: function get() {
            return this._gainNode || null;
        }
    }]);

    return Sound;
}(_Media3.default);

exports.default = Sound;

/***/ }),
/* 42 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ResourceFactory2 = __webpack_require__(15);

var _ResourceFactory3 = _interopRequireDefault(_ResourceFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class StringFactory
 * @extends ResourceFactory
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
      // eslint-disable-line
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
/* 43 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ImageFactory2 = __webpack_require__(20);

var _ImageFactory3 = _interopRequireDefault(_ImageFactory2);

var _Texture = __webpack_require__(14);

var _Texture2 = _interopRequireDefault(_Texture);

var _settings = __webpack_require__(2);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class TextureFactory
 * @extends ImageFactory
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
                scaleMode = _ref.scaleMode,
                wrapMode = _ref.wrapMode,
                premultiplyAlpha = _ref.premultiplyAlpha,
                generateMipmap = _ref.generateMipmap;

            return _get(TextureFactory.prototype.__proto__ || Object.getPrototypeOf(TextureFactory.prototype), 'create', this).call(this, source, { mimeType: mimeType }).then(function (image) {
                return new _Texture2.default(image, { scaleMode: scaleMode, wrapMode: wrapMode, premultiplyAlpha: premultiplyAlpha, generateMipmap: generateMipmap });
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
/* 44 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Video = __webpack_require__(45);

var _Video2 = _interopRequireDefault(_Video);

var _MediaSourceFactory2 = __webpack_require__(13);

var _MediaSourceFactory3 = _interopRequireDefault(_MediaSourceFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class VideoFactory
 * @extends MediaSourceFactory
 */
var VideoFactory = function (_MediaSourceFactory) {
  _inherits(VideoFactory, _MediaSourceFactory);

  function VideoFactory() {
    _classCallCheck(this, VideoFactory);

    return _possibleConstructorReturn(this, (VideoFactory.__proto__ || Object.getPrototypeOf(VideoFactory)).apply(this, arguments));
  }

  _createClass(VideoFactory, [{
    key: 'create',


    /**
     * @override
     */
    value: function create(source) {
      var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          _ref$type = _ref.type,
          type = _ref$type === undefined ? 'video' : _ref$type,
          _ref$createMediaEleme = _ref.createMediaElement,
          createMediaElement = _ref$createMediaEleme === undefined ? true : _ref$createMediaEleme,
          _ref$decodeAudioBuffe = _ref.decodeAudioBuffer,
          decodeAudioBuffer = _ref$decodeAudioBuffe === undefined ? false : _ref$decodeAudioBuffe,
          mimeType = _ref.mimeType,
          loadEvent = _ref.loadEvent;

      return _get(VideoFactory.prototype.__proto__ || Object.getPrototypeOf(VideoFactory.prototype), 'create', this).call(this, source, { type: type, createMediaElement: createMediaElement, decodeAudioBuffer: decodeAudioBuffer, mimeType: mimeType, loadEvent: loadEvent }).then(function (audioSource) {
        return new _Video2.default(audioSource);
      });
    }
  }, {
    key: 'storageType',


    /**
     * @override
     */
    get: function get() {
      return 'video';
    }
  }]);

  return VideoFactory;
}(_MediaSourceFactory3.default);

exports.default = VideoFactory;

/***/ }),
/* 45 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _utils = __webpack_require__(1);

var _Sprite2 = __webpack_require__(16);

var _Sprite3 = _interopRequireDefault(_Sprite2);

var _Texture = __webpack_require__(14);

var _Texture2 = _interopRequireDefault(_Texture);

var _support = __webpack_require__(4);

var _support2 = _interopRequireDefault(_support);

var _settings = __webpack_require__(2);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Video
 * @extends {Media|Sprite}
 */
var Video = function (_Sprite) {
    _inherits(Video, _Sprite);

    /**
     * @constructor
     * @param {MediaSource} mediaSource
     * @param {Object} [options={}]
     * @property {Number} [options.volume=settings.VOLUME_VIDEO]
     * @property {Boolean} [options.loop=settings.MEDIA_LOOP]
     * @property {Number} [options.speed=settings.MEDIA_SPEED]
     * @property {Number} [options.time=settings.MEDIA_TIME]
     * @property {Boolean} [options.muted=settings.MEDIA_MUTED]
     */
    function Video(mediaSource) {
        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            _ref$volume = _ref.volume,
            volume = _ref$volume === undefined ? _settings2.default.VOLUME_VIDEO : _ref$volume,
            _ref$loop = _ref.loop,
            loop = _ref$loop === undefined ? _settings2.default.MEDIA_LOOP : _ref$loop,
            _ref$speed = _ref.speed,
            speed = _ref$speed === undefined ? _settings2.default.MEDIA_SPEED : _ref$speed,
            _ref$time = _ref.time,
            time = _ref$time === undefined ? _settings2.default.MEDIA_TIME : _ref$time,
            _ref$muted = _ref.muted,
            muted = _ref$muted === undefined ? _settings2.default.MEDIA_MUTED : _ref$muted;

        _classCallCheck(this, Video);

        var _this = _possibleConstructorReturn(this, (Video.__proto__ || Object.getPrototypeOf(Video)).call(this, new _Texture2.default(mediaSource.mediaElement)));

        var mediaElement = mediaSource.mediaElement;

        /**
         * @private
         * @member {MediaSource}
         */
        _this._mediaSource = mediaSource;

        /**
         * @private
         * @member {?HTMLMediaElement}
         */
        _this._mediaElement = mediaElement;

        /**
         * @private
         * @member {Number}
         */
        _this._duration = mediaElement ? mediaElement.duration : 0;

        /**
         * @private
         * @member {Number}
         */
        _this._volume = mediaElement ? mediaElement.volume : 1;

        /**
         * @private
         * @member {Number}
         */
        _this._speed = mediaElement ? mediaElement.playbackRate : 1;

        /**
         * @private
         * @member {Boolean}
         */
        _this._loop = mediaElement ? mediaElement.loop : false;

        /**
         * @private
         * @member {Boolean}
         */
        _this._muted = mediaElement ? mediaElement.muted : false;

        if (_support2.default.webAudio) {

            /**
             * @private
             * @member {?GainNode}
             */
            _this._gainNode = _utils.audioContext.createGain();
            _this._gainNode.gain.value = _this.volume;
            _this._gainNode.connect(_utils.audioContext.destination);

            /**
             * @private
             * @member {?MediaElementAudioSourceNode}
             */
            _this._sourceNode = _utils.audioContext.createMediaElementSource(_this._mediaElement);
            _this._sourceNode.connect(_this._gainNode);
        }

        _this.applyOptions({ volume: volume, loop: loop, speed: speed, time: time, muted: muted });
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {MediaSource}
     */


    _createClass(Video, [{
        key: 'play',


        /**
         * @public
         * @chainable
         * @param {Object} [options]
         * @property {Boolean} [options.loop]
         * @property {Number} [options.speed]
         * @property {Number} [options.volume]
         * @property {Number} [options.time]
         * @property {Boolean} [options.muted]
         * @returns {Video}
         */
        value: function play(options) {
            if (this.paused) {
                this.applyOptions(options);
                this._mediaElement.play();
                this.trigger('start');
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Video}
         */

    }, {
        key: 'pause',
        value: function pause() {
            if (this.playing) {
                this._mediaElement.pause();
                this.trigger('stop');
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Video}
         */

    }, {
        key: 'stop',
        value: function stop() {
            this.pause();
            this.currentTime = 0;

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Video}
         */

    }, {
        key: 'toggle',
        value: function toggle() {
            if (this.paused) {
                this.play();
            } else {
                this.pause();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Object} [options]
         * @property {Number} [options.volume]
         * @property {Boolean} [options.loop]
         * @property {Number} [options.speed]
         * @property {Number} [options.time]
         * @property {Boolean} [options.muted]
         * @returns {Video}
         */

    }, {
        key: 'applyOptions',
        value: function applyOptions() {
            var _ref2 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                volume = _ref2.volume,
                loop = _ref2.loop,
                speed = _ref2.speed,
                time = _ref2.time,
                muted = _ref2.muted;

            if (volume !== undefined) {
                this.volume = volume;
            }

            if (loop !== undefined) {
                this.loop = loop;
            }

            if (speed !== undefined) {
                this.speed = speed;
            }

            if (time !== undefined) {
                this.currentTime = time;
            }

            if (muted !== undefined) {
                this.muted = muted;
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager) {
            if (this.active) {
                this.texture.updateSource();

                _get(Video.prototype.__proto__ || Object.getPrototypeOf(Video.prototype), 'render', this).call(this, displayManager);
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Video.prototype.__proto__ || Object.getPrototypeOf(Video.prototype), 'destroy', this).call(this);

            this.stop();

            if (_support2.default.webAudio) {
                this._sourceNode.disconnect();
                this._sourceNode = null;

                this._gainNode.disconnect();
                this._gainNode = null;
            }

            this._mediaSource = null;
            this._mediaElement = null;
            this._duration = null;
            this._volume = null;
            this._speed = null;
            this._loop = null;
            this._muted = null;
        }
    }, {
        key: 'mediaSource',
        get: function get() {
            return this._mediaSource;
        }

        /**
         * @public
         * @readonly
         * @member {?HTMLMediaElement}
         */

    }, {
        key: 'mediaElement',
        get: function get() {
            return this._mediaElement;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'duration',
        get: function get() {
            return this._duration;
        }

        /**
         * @public
         * @member {Number}
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

                if (this._gainNode) {
                    this._gainNode.gain.value = this.muted ? 0 : volume;
                }
            }
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
            var loop = !!value;

            if (this._loop !== loop) {
                this._mediaElement.loop = this._loop = loop;
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'speed',
        get: function get() {
            return this._speed;
        },
        set: function set(value) {
            var speed = Math.max(0, value);

            if (this._speed !== speed) {
                this._mediaElement.playbackRate = this._speed = speed;
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'currentTime',
        get: function get() {
            return this._mediaElement.currentTime;
        },
        set: function set(currentTime) {
            this._mediaElement.currentTime = Math.max(0, currentTime);
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'muted',
        get: function get() {
            return this._muted;
        },
        set: function set(value) {
            var muted = !!value;

            if (this._muted !== muted) {
                this._muted = muted;

                if (this._gainNode) {
                    this._gainNode.gain.value = muted ? 0 : this.volume;
                }
            }
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'paused',
        get: function get() {
            return this._mediaElement.paused;
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
         * @member {?AudioContext}
         */

    }, {
        key: 'audioContext',
        get: function get() {
            return _utils.audioContext;
        }

        /**
         * @public
         * @readonly
         * @member {?AudioNode}
         */

    }, {
        key: 'analyserTarget',
        get: function get() {
            return this._gainNode || null;
        }
    }]);

    return Video;
}(_Sprite3.default);

exports.default = Video;

/***/ }),
/* 46 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderable2 = __webpack_require__(22);

var _Renderable3 = _interopRequireDefault(_Renderable2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Container
 * @extends Renderable
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
            return this.addChildAt(child, this._children.length);
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
            if (firstChild !== secondChild) {
                this._children[this.getChildIndex(firstChild)] = secondChild;
                this._children[this.getChildIndex(secondChild)] = firstChild;
            }

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

            (0, _utils.removeItems)(this._children, this.getChildIndex(child), 1);

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

            if (index !== -1) {
                this.removeChildAt(index);
            }

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

            if (range < 0 || range > end) {
                throw new Error('Values are outside the acceptable range.');
            }

            (0, _utils.removeItems)(this._children, begin, range);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager) {
            if (this.active) {
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = this._children[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var child = _step.value;

                        child.render(displayManager);
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
         * @override
         */

    }, {
        key: 'updateBounds',
        value: function updateBounds() {
            this._bounds.reset().addRect(this.getLocalBounds(), this.getGlobalTransform());

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this._children[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var child = _step2.value;

                    if (child.active) {
                        this._bounds.addRect(child.getBounds());
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
        }
    }, {
        key: 'children',
        get: function get() {
            return this._children;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return Math.abs(this.scale.x) * this.bounds.width;
        },
        set: function set(value) {
            this.scale.x = value / this.bounds.width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return Math.abs(this.scale.y) * this.bounds.height;
        },
        set: function set(value) {
            this.scale.y = value / this.bounds.height;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'left',
        get: function get() {
            return this.x - this.width * this.origin.x;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'top',
        get: function get() {
            return this.y - this.height * this.origin.y;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'right',
        get: function get() {
            return this.x + this.width - this.origin.x;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'bottom',
        get: function get() {
            return this.y + this.height - this.origin.y;
        }
    }]);

    return Container;
}(_Renderable3.default);

exports.default = Container;

/***/ }),
/* 47 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(6);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _ObservableVector = __webpack_require__(23);

var _ObservableVector2 = _interopRequireDefault(_ObservableVector);

var _Matrix = __webpack_require__(10);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Transformable
 * @extends EventEmitter
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
        _this._origin = new _ObservableVector2.default(_this._setDirty, _this);

        /**
         * @private
         * @member {Number}
         */
        _this._rotation = 0;

        /**
         * @private
         * @member {Number}
         */
        _this._sin = 0;

        /**
         * @private
         * @member {Number}
         */
        _this._cos = 1;

        /**
         * @private
         * @member {Boolean}
         */
        _this._updateTransform = true;
        return _this;
    }

    /**
     * @public
     * @member {ObservableVector}
     */


    _createClass(Transformable, [{
        key: 'getTransform',


        /**
         * @public
         * @chainable
         * @returns {Matrix}
         */
        value: function getTransform() {
            if (this._updateTransform) {
                this.updateTransform();
                this._updateTransform = false;
            }

            return this._transform;
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
                scale = this._scale,
                origin = this._origin,
                position = this._position;

            transform.a = scale.x * this._cos;
            transform.b = scale.y * this._sin;

            transform.c = scale.x * -this._sin;
            transform.d = scale.y * this._cos;

            transform.x = origin.x * -transform.a - origin.y * transform.b + position.x;
            transform.y = origin.x * -transform.c - origin.y * transform.d + position.y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} [y=x]
         * @returns {Transformable}
         */

    }, {
        key: 'setPosition',
        value: function setPosition(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            this._position.set(x, y);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} [y=x]
         * @returns {Transformable}
         */

    }, {
        key: 'setScale',
        value: function setScale(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            this._scale.set(x, y);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} [y=x]
         * @returns {Transformable}
         */

    }, {
        key: 'setOrigin',
        value: function setOrigin(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            this._origin.set(x, y);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} degrees
         * @returns {Transformable}
         */

    }, {
        key: 'setRotation',
        value: function setRotation(degrees) {
            var trimmed = degrees % 360,
                rotation = trimmed < 0 ? trimmed + 360 : trimmed,
                radians = (0, _utils.degreesToRadians)(rotation);

            this._rotation = rotation;
            this._cos = Math.cos(radians);
            this._sin = Math.sin(radians);

            this._setDirty();

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
            this._sin = null;
            this._cos = null;

            this._updateTransform = null;
        }

        /**
         * @private
         */

    }, {
        key: '_setDirty',
        value: function _setDirty() {
            this._updateTransform = true;
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
         * @member {ObservableVector}
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
         * @member {ObservableVector}
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
    }]);

    return Transformable;
}(_EventEmitter3.default);

exports.default = Transformable;

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
 * @class SceneManager
 */
var SceneManager = function () {

    /**
     * @constructor
     * @param {Application} app
     */
    function SceneManager(app) {
        _classCallCheck(this, SceneManager);

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

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
         * @public
         */

    }, {
        key: 'startScene',
        value: function startScene() {
            if (!this._currentScene) {
                throw new Error('No scene was specified, use changeScene()!');
            }

            if (this._sceneActive) {
                throw new Error('Scene can only be started once!');
            }

            this._sceneActive = true;
            this._currentScene.init(this._app.loader.resources);
        }

        /**
         * @public
         */

    }, {
        key: 'stopScene',
        value: function stopScene() {
            if (!this._currentScene) {
                return;
            }

            if (this._sceneActive) {
                this._currentScene.unload();
                this._sceneActive = false;
            }

            this._currentScene.destroy();
            this._currentScene = null;

            this._app.loader.off();
        }

        /**
         * @public
         * @param {Scene} scene
         */

    }, {
        key: 'changeScene',
        value: function changeScene(scene) {
            var _this = this;

            this.stopScene();

            this._currentScene = scene;
            this._currentScene.app = this._app;
            this._currentScene.load(this._app.loader);

            this._app.loader.load(function () {
                return _this.startScene();
            });
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this.stopScene();

            this._currentScene = null;
            this._sceneActive = null;
            this._app = null;
        }
    }]);

    return SceneManager;
}();

exports.default = SceneManager;

/***/ }),
/* 49 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _support = __webpack_require__(4);

var _support2 = _interopRequireDefault(_support);

var _RenderTarget = __webpack_require__(25);

var _RenderTarget2 = _interopRequireDefault(_RenderTarget);

var _SpriteRenderer = __webpack_require__(52);

var _SpriteRenderer2 = _interopRequireDefault(_SpriteRenderer);

var _ParticleRenderer = __webpack_require__(58);

var _ParticleRenderer2 = _interopRequireDefault(_ParticleRenderer);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class DisplayManager
 */
var DisplayManager = function () {

    /**
     * @constructor
     * @param {Application} app
     * @param {Object} [config]
     * @param {Number} [config.width=800]
     * @param {Number} [config.height=600]
     * @param {Color} [config.clearColor=Color.Black]
     * @param {Object} [config.contextOptions]
     */
    function DisplayManager(app) {
        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            _ref$width = _ref.width,
            width = _ref$width === undefined ? 800 : _ref$width,
            _ref$height = _ref.height,
            height = _ref$height === undefined ? 600 : _ref$height,
            _ref$clearColor = _ref.clearColor,
            clearColor = _ref$clearColor === undefined ? new _Color2.default() : _ref$clearColor,
            _ref$contextOptions = _ref.contextOptions,
            contextOptions = _ref$contextOptions === undefined ? {
            alpha: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            stencil: true,
            depth: false
        } : _ref$contextOptions;

        _classCallCheck(this, DisplayManager);

        if (!_support2.default.webGL) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = app.canvas;

        /**
         * @private
         * @member {?WebGLRenderingContext}
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

        if (this._contextLost) {
            this._restoreContext();
        }

        /**
         * @private
         * @member {Map<String, Renderer>}
         */
        this._renderers = new Map();

        /**
         * @private
         * @member {?RenderTarget}
         */
        this._renderTarget = null;

        /**
         * @private
         * @member {?Renderer}
         */
        this._renderer = null;

        /**
         * @private
         * @member {?Shader}
         */
        this._shader = null;

        /**
         * @private
         * @member {?Number}
         */
        this._blendMode = null;

        /**
         * @private
         * @member {Number}
         */
        this._textureUnit = 0;

        /**
         * @private
         * @member {?Texture}
         */
        this._texture = null;

        /**
         * @private
         * @member {Color}
         */
        this._clearColor = new _Color2.default();

        /**
         * @private
         * @member {RenderTarget}
         */
        this._rootRenderTarget = new _RenderTarget2.default(width, height, true);

        this._setupContext();
        this._addEvents();

        this.addRenderer('sprite', new _SpriteRenderer2.default());
        this.addRenderer('particle', new _ParticleRenderer2.default());

        this.setRenderTarget(this._rootRenderTarget);
        this.setBlendMode(_const.BLEND_MODE.NORMAL);
        this.setClearColor(clearColor);

        this.resize(width, height);
    }

    /**
     * @public
     * @member {WebGLRenderingContext}
     */


    _createClass(DisplayManager, [{
        key: 'setRenderTarget',


        /**
         * @public
         * @chainable
         * @param {?RenderTarget|?RenderTexture} renderTarget
         * @returns {DisplayManager}
         */
        value: function setRenderTarget(target) {
            var renderTarget = target || this._rootRenderTarget;

            if (this._renderTarget !== renderTarget) {
                if (this._renderTarget) {
                    this._renderTarget.unbindFramebuffer();
                    this._renderTarget = null;
                }

                if (renderTarget) {
                    renderTarget.connect(this._context);
                    renderTarget.bindFramebuffer();
                }

                this._renderTarget = renderTarget;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Renderer} renderer
         * @returns {DisplayManager}
         */

    }, {
        key: 'setRenderer',
        value: function setRenderer(renderer) {
            var newRenderer = renderer || null;

            if (this._renderer !== newRenderer) {
                if (this._renderer) {
                    this._renderer.unbind();
                    this._renderer = null;
                }

                this._renderer = newRenderer && newRenderer.bind(this);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {?Shader} shader
         * @returns {DisplayManager}
         */

    }, {
        key: 'setShader',
        value: function setShader(shader) {
            var newShader = shader || null;

            if (this._shader !== newShader) {
                if (this._shader) {
                    this._shader.unbindProgram();
                    this._shader = null;
                }

                if (newShader) {
                    newShader.connect(this._context);
                    newShader.bindProgram();
                }

                this._shader = newShader;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {?Texture|?RenderTexture} texture
         * @param {Number} [unit]
         * @returns {DisplayManager}
         */

    }, {
        key: 'setTexture',
        value: function setTexture(texture, unit) {
            var newTexture = texture || null;

            if (unit !== undefined) {
                this.setTextureUnit(unit);
            }

            if (this._texture !== newTexture) {
                if (this._texture) {
                    this._texture.unbindTexture();
                    this._texture = null;
                }

                if (newTexture) {
                    newTexture.connect(this._context);
                    newTexture.bindTexture();
                }

                this._texture = newTexture;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} blendMode
         * @returns {DisplayManager}
         */

    }, {
        key: 'setBlendMode',
        value: function setBlendMode(blendMode) {
            if (blendMode !== this._blendMode) {
                var gl = this._context;

                this._blendMode = blendMode;

                switch (blendMode) {
                    case _const.BLEND_MODE.ADD:
                        gl.blendFunc(gl.ONE, gl.ONE);
                        break;
                    case _const.BLEND_MODE.SUBTRACT:
                        gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
                        break;
                    case _const.BLEND_MODE.MULTIPLY:
                        gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
                        break;
                    case _const.BLEND_MODE.SCREEN:
                        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
                        break;
                    default:
                        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                        break;
                }
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} unit
         * @returns {DisplayManager}
         */

    }, {
        key: 'setTextureUnit',
        value: function setTextureUnit(unit) {
            var textureUnit = unit | 0;

            if (this._textureUnit !== textureUnit) {
                var gl = this._context;

                this._textureUnit = textureUnit;

                gl.activeTexture(gl.TEXTURE0 + textureUnit);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Color} color
         * @returns {DisplayManager}
         */

    }, {
        key: 'setClearColor',
        value: function setClearColor(color) {
            if (!this._clearColor.equals({
                r: color.r,
                g: color.g,
                b: color.b
            })) {
                var gl = this._context;

                this._clearColor.copy(color);

                gl.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} name
         * @param {SpriteRenderer|ParticleRenderer|Renderer} renderer
         * @returns {DisplayManager}
         */

    }, {
        key: 'addRenderer',
        value: function addRenderer(name, renderer) {
            if (this._renderers.has(name)) {
                throw new Error('Renderer "' + name + '" was already added.');
            }

            this._renderers.set(name, renderer);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} name
         * @returns {Renderer}
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
         * @chainable
         * @param {Color} [color]
         * @returns {DisplayManager}
         */

    }, {
        key: 'clear',
        value: function clear(color) {
            var gl = this._context;

            if (color) {
                this.setClearColor(color);
            }

            gl.clear(gl.COLOR_BUFFER_BIT);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} width
         * @param {Number} height
         * @returns {DisplayManager}
         */

    }, {
        key: 'resize',
        value: function resize(width, height) {
            this._canvas.width = width;
            this._canvas.height = height;

            this._rootRenderTarget.setSize(width, height);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Renderable|*} renderable
         * @returns {DisplayManager}
         */

    }, {
        key: 'draw',
        value: function draw(renderable) {
            if (!this._contextLost) {
                renderable.render(this);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {DisplayManager}
         */

    }, {
        key: 'display',
        value: function display() {
            if (this._renderer && !this._contextLost) {
                this._renderer.flush();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} count
         * @returns {DisplayManager}
         */

    }, {
        key: 'drawElements',
        value: function drawElements(count) {
            var gl = this._context;

            gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);

            return this;
        }

        /**
         * @public
         * @param {Renderable} renderable
         * @param {View} [view=this._renderTarget.view]
         * @returns {Boolean}
         */

    }, {
        key: 'insideViewport',
        value: function insideViewport(renderable) {
            var view = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._renderTarget.view;

            return view.getBounds().intersectsRect(renderable.getBounds());
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._removeEvents();

            this.setRenderTarget(null);
            this.setRenderer(null);
            this.setShader(null);
            this.setTexture(null);

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

            this._renderers.clear();
            this._renderers = null;

            this._clearColor.destroy();
            this._clearColor = null;

            this._rootRenderTarget.destroy();
            this._rootRenderTarget = null;

            this._canvas = null;
            this._context = null;
            this._contextLost = null;
            this._renderTarget = null;
            this._renderer = null;
            this._shader = null;
            this._blendMode = null;
            this._texture = null;
            this._textureUnit = null;
        }

        /**
         * @override
         */

    }, {
        key: '_createContext',
        value: function _createContext(options) {
            try {
                return this._canvas.getContext('webgl', options) || this._canvas.getContext('experimental-webgl', options);
            } catch (e) {
                return null;
            }
        }

        /**
         * @private
         */

    }, {
        key: '_restoreContext',
        value: function _restoreContext() {
            var gl = this._context;

            if (gl.getExtension('WEBGL_lose_context')) {
                gl.getExtension('WEBGL_lose_context').restoreContext();
            }
        }

        /**
         * @private
         */

    }, {
        key: '_setupContext',
        value: function _setupContext() {
            var gl = this._context;

            gl.enable(gl.BLEND);
            gl.disable(gl.DEPTH_TEST);
            gl.disable(gl.CULL_FACE);

            gl.blendEquation(gl.FUNC_ADD);
            gl.colorMask(true, true, true, false);
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
        key: '_onContextLost',
        value: function _onContextLost() {
            this._contextLost = true;

            this._restoreContext();
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
         * @readonly
         * @member {?RenderTarget}
         */

    }, {
        key: 'renderTarget',
        get: function get() {
            return this._renderTarget;
        }

        /**
         * @public
         * @readonly
         * @member {?Texture}
         */

    }, {
        key: 'texture',
        get: function get() {
            return this._texture;
        }

        /**
         * @public
         * @member {?Renderer}
         */

    }, {
        key: 'renderer',
        get: function get() {
            return this._renderer;
        },
        set: function set(renderer) {
            this.setRenderer(renderer);
        }

        /**
         * @public
         * @member {?Shader}
         */

    }, {
        key: 'shader',
        get: function get() {
            return this._shader;
        },
        set: function set(shader) {
            this.setShader(shader);
        }

        /**
         * @public
         * @member {BlendMode}
         */

    }, {
        key: 'blendMode',
        get: function get() {
            return this._blendMode;
        },
        set: function set(blendMode) {
            this.setBlendMode(blendMode);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'textureUnit',
        get: function get() {
            return this._textureUnit;
        },
        set: function set(textureUnit) {
            this.setTextureUnit(textureUnit);
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
/* 50 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ObservableVector = __webpack_require__(23);

var _ObservableVector2 = _interopRequireDefault(_ObservableVector);

var _Rectangle = __webpack_require__(5);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Matrix = __webpack_require__(10);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _utils = __webpack_require__(1);

var _ObservableSize = __webpack_require__(51);

var _ObservableSize2 = _interopRequireDefault(_ObservableSize);

var _Bounds = __webpack_require__(17);

var _Bounds2 = _interopRequireDefault(_Bounds);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class View
 */
var View = function () {

    /**
     * @constructor
     * @param {Number} centerX
     * @param {Number} centerY
     * @param {Number} width
     * @param {Number} height
     */
    function View(centerX, centerY, width, height) {
        _classCallCheck(this, View);

        /**
         * @private
         * @member {ObservableVector}
         */
        this._center = new _ObservableVector2.default(this._setDirty, this, centerX, centerY);

        /**
         * @private
         * @member {ObservableSize}
         */
        this._size = new _ObservableSize2.default(this._setDirty, this, width, height);

        /**
         * @private
         * @member {Number}
         */
        this._rotation = 0;

        /**
         * @private
         * @member {Number}
         */
        this._sin = 0;

        /**
         * @private
         * @member {Number}
         */
        this._cos = 1;

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
         * @member {Matrix}
         */
        this._inverseTransform = new _Matrix2.default();

        /**
         * @private
         * @member {Bounds}
         */
        this._bounds = new _Bounds2.default();

        /**
         * @private
         * @member {Boolean}
         */
        this._updateTransform = true;

        /**
         * @private
         * @member {Boolean}
         */
        this._updateInverseTransform = true;

        /**
         * @private
         * @member {Boolean}
         */
        this._updateBounds = true;

        /**
         * @private
         * @member {Number}
         */
        this._updateId = 0;
    }

    /**
     * @public
     * @member {ObservableVector}
     */


    _createClass(View, [{
        key: 'setCenter',


        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {View}
         */
        value: function setCenter(x, y) {
            this._center.set(x, y);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} width
         * @param {Number} height
         * @returns {View}
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
         * @param {Number} degrees
         * @returns {View}
         */

    }, {
        key: 'setRotation',
        value: function setRotation(degrees) {
            var trimmed = degrees % 360,
                rotation = trimmed < 0 ? trimmed + 360 : trimmed,
                radians = (0, _utils.degreesToRadians)(rotation);

            this._rotation = rotation < 0 ? rotation + 360 : rotation;
            this._cos = Math.cos(radians);
            this._sin = Math.sin(radians);

            this._setDirty();

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {View}
         */

    }, {
        key: 'move',
        value: function move(x, y) {
            this.setCenter(this._center.x + x, this._center.y + y);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} factor
         * @returns {View}
         */

    }, {
        key: 'zoom',
        value: function zoom(factor) {
            this.setSize(this._size.width * factor, this._size.height * factor);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} degrees
         * @returns {View}
         */

    }, {
        key: 'rotate',
        value: function rotate(degrees) {
            this.setRotation(this._rotation + degrees);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} centerX
         * @param {Number} centerY
         * @param {Number} width
         * @param {Number} height
         * @returns {View}
         */

    }, {
        key: 'reset',
        value: function reset(centerX, centerY, width, height) {
            this._size.set(width, height);
            this._center.set(centerX, centerY);
            this._viewport.set(0, 0, 1, 1);
            this._rotation = 0;
            this._sin = 0;
            this._cos = 1;

            this._setDirty();

            return this;
        }

        /**
         * @public
         * @returns {Matrix}
         */

    }, {
        key: 'getTransform',
        value: function getTransform() {
            if (this._updateTransform) {
                this.updateTransform();
                this._updateTransform = false;
            }

            return this._transform;
        }

        /**
         * @public
         * @chainable
         * @returns {View}
         */

    }, {
        key: 'updateTransform',
        value: function updateTransform() {
            var transform = this._transform,
                centerX = this._center.x,
                centerY = this._center.y,
                sin = this._sin,
                cos = this._cos,
                a = 2 / this._size.width,
                b = -2 / this._size.height,
                c = -a * centerX,
                d = -b * centerY,
                x = -centerX * cos - centerY * sin + centerX,
                y = centerX * sin - centerY * cos + centerY;

            transform.a = a * cos;
            transform.b = a * sin;
            transform.x = a * x + c;

            transform.c = -b * sin;
            transform.d = b * cos;
            transform.y = b * y + d;

            return this;
        }

        /**
         * @public
         * @returns {Matrix}
         */

    }, {
        key: 'getInverseTransform',
        value: function getInverseTransform() {
            if (this._updateInverseTransform) {
                this.getTransform().getInverse(this._inverseTransform);

                this._updateInverseTransform = false;
            }

            return this._inverseTransform;
        }

        /**
         * @public
         * @returns {Rectangle}
         */

    }, {
        key: 'getBounds',
        value: function getBounds() {
            if (this._updateBounds) {
                this.updateBounds();
                this._updateBounds = false;
            }

            return this._bounds.getRect();
        }

        /**
         * @public
         * @chainable
         * @returns {View}
         */

    }, {
        key: 'updateBounds',
        value: function updateBounds() {
            var offsetX = this.width / 2,
                offsetY = this.height / 2;

            this._bounds.reset().addCoords(this._center.x - offsetX, this._center.y - offsetY).addCoords(this._center.x + offsetX, this._center.y + offsetY);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {View} view
         * @returns {View}
         */

    }, {
        key: 'copy',
        value: function copy(view) {
            this.center = view.center;
            this.size = view.size;
            this.rotation = view.rotation;
            this.viewport = view.viewport;

            return this;
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

            this._inverseTransform.destroy();
            this._inverseTransform = null;

            this._bounds.destroy();
            this._bounds = null;

            this._rotation = null;
            this._cos = null;
            this._sin = null;

            this._updateTransform = null;
            this._updateInverseTransform = null;
            this._updateBounds = null;
            this._updateId = null;
        }

        /**
         * @private
         */

    }, {
        key: '_setDirty',
        value: function _setDirty() {
            this._updateTransform = true;
            this._updateInverseTransform = true;
            this._updateBounds = true;
            this._updateId++;
        }
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
         * @member {ObservableSize}
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
            return this._size.width;
        },
        set: function set(width) {
            this._size.width = width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._size.height;
        },
        set: function set(height) {
            this._size.height = height;
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
            this._setDirty();
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'updateId',
        get: function get() {
            return this._updateId;
        }
    }]);

    return View;
}();

exports.default = View;

/***/ }),
/* 51 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Size2 = __webpack_require__(7);

var _Size3 = _interopRequireDefault(_Size2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ObservableSize
 * @extends Size
 */
var ObservableSize = function (_Size) {
    _inherits(ObservableSize, _Size);

    /**
     * @constructor
     * @param {Function} callback
     * @param {*} scope
     * @param {Number} [width=0]
     * @param {Number} [height=0]
     */
    function ObservableSize(callback, scope) {
        var width = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
        var height = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;

        _classCallCheck(this, ObservableSize);

        /**
         * @private
         * @member {Function}
         */
        var _this = _possibleConstructorReturn(this, (ObservableSize.__proto__ || Object.getPrototypeOf(ObservableSize)).call(this, width, height));

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


    _createClass(ObservableSize, [{
        key: 'set',


        /**
         * @override
         */
        value: function set() {
            var width = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._width;
            var height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._height;

            if (this._width !== width || this._height !== height) {
                this._width = width;
                this._height = height;
                this._callback.call(this._scope);
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'add',
        value: function add(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            return this.set(this._width + x, this._height + y);
        }

        /**
         * @override
         */

    }, {
        key: 'subtract',
        value: function subtract(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            return this.set(this._width - x, this._height - y);
        }

        /**
         * @override
         */

    }, {
        key: 'multiply',
        value: function multiply(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            return this.set(this._width * x, this._height * y);
        }

        /**
         * @override
         */

    }, {
        key: 'divide',
        value: function divide(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;

            return this.set(this._width / x, this._height / y);
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(size) {
            return this.set(size.width, size.height);
        }

        /**
         * @override
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new ObservableSize(this._callback, this._scope, this._width, this._height);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(ObservableSize.prototype.__proto__ || Object.getPrototypeOf(ObservableSize.prototype), 'destroy', this).call(this);

            this._callback = null;
            this._scope = null;
        }
    }, {
        key: 'width',
        get: function get() {
            return this._width;
        },
        set: function set(width) {
            if (this._width !== width) {
                this._width = width;
                this._callback.call(this._scope);
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._height;
        },
        set: function set(height) {
            if (this._height !== height) {
                this._height = height;
                this._callback.call(this._scope);
            }
        }
    }]);

    return ObservableSize;
}(_Size3.default);

exports.default = ObservableSize;

/***/ }),
/* 52 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
        value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Renderer2 = __webpack_require__(26);

var _Renderer3 = _interopRequireDefault(_Renderer2);

var _SpriteShader = __webpack_require__(53);

var _SpriteShader2 = _interopRequireDefault(_SpriteShader);

var _settings = __webpack_require__(2);

var _settings2 = _interopRequireDefault(_settings);

var _Buffer = __webpack_require__(57);

var _Buffer2 = _interopRequireDefault(_Buffer);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SpriteRenderer
 * @extends Renderer
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

                _this._batchSize = _settings2.default.BATCH_SIZE_SPRITES;

                /**
                 * @private
                 * @member {Number}
                 */
                _this._batchIndex = 0;

                /**
                 * 4 x 4 Properties:
                 * 2 = position (x, y) +
                 * 1 = texCoord (packed uv) +
                 * 1 = color    (ARGB int)
                 *
                 * @private
                 * @member {Number}
                 */
                _this._attributeCount = 16;

                /**
                 * @private
                 * @member {?DisplayManager}
                 */
                _this._displayManager = null;

                /**
                 * @private
                 * @member {?Buffer}
                 */
                _this._vertexBuffer = null;

                /**
                 * @private
                 * @member {?Buffer}
                 */
                _this._indexBuffer = null;

                /**
                 * @private
                 * @member {SpriteShader}
                 */
                _this._shader = new _SpriteShader2.default();

                /**
                 * @private
                 * @member {ArrayBuffer}
                 */
                _this._vertexData = new ArrayBuffer(_this._batchSize * _this._attributeCount * 4);

                /**
                 * @private
                 * @member {Uint16Array}
                 */
                _this._indexData = new Uint16Array(_this._batchSize * 6);

                /**
                 * @private
                 * @member {Float32Array}
                 */
                _this._float32View = new Float32Array(_this._vertexData);

                /**
                 * @private
                 * @member {Uint32Array}
                 */
                _this._uint32View = new Uint32Array(_this._vertexData);

                /**
                 * @private
                 * @member {?Texture}
                 */
                _this._currentTexture = null;

                /**
                 * @private
                 * @member {?Number}
                 */
                _this._currentBlendMode = null;

                /**
                 * @private
                 * @member {?View}
                 */
                _this._currentView = null;

                /**
                 * @private
                 * @member {Number}
                 */
                _this._viewId = -1;

                _this.fillIndexData(_this._indexData);
                return _this;
        }

        /**
         * @public
         * @readonly
         * @member {Boolean}
         */


        _createClass(SpriteRenderer, [{
                key: 'fillIndexData',


                /**
                 * @public
                 * @param {Uint16Array} data
                 * @returns {SpriteRenderer}
                 */
                value: function fillIndexData(data) {
                        var len = data.length;

                        for (var i = 0, offset = 0; i < len; i += 6, offset += 4) {
                                data[i] = offset;
                                data[i + 1] = offset + 1;
                                data[i + 2] = offset + 3;
                                data[i + 3] = offset;
                                data[i + 4] = offset + 2;
                                data[i + 5] = offset + 3;
                        }

                        return this;
                }

                /**
                 * @override
                 */

        }, {
                key: 'bind',
                value: function bind(displayManager) {
                        if (!this._displayManager) {
                                var gl = displayManager.context;

                                this._vertexBuffer = new _Buffer2.default(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW, this._vertexData);
                                this._indexBuffer = new _Buffer2.default(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW, this._indexData);
                                this._displayManager = displayManager;
                        }

                        this._vertexBuffer.bind();
                        this._indexBuffer.bind();
                        this._displayManager.setShader(this._shader);

                        return this;
                }

                /**
                 * @override
                 */

        }, {
                key: 'unbind',
                value: function unbind() {
                        if (this.bound) {
                                this.flush();

                                this._vertexBuffer.unbind();
                                this._indexBuffer.unbind();
                                this._displayManager.setShader(null);

                                this._currentTexture = null;
                                this._currentBlendMode = null;
                                this._currentView = null;
                                this._viewId = -1;
                        }

                        return this;
                }

                /**
                 * @override
                 */

        }, {
                key: 'render',
                value: function render(sprite) {
                        var float32View = this._float32View,
                            uint32View = this._uint32View,
                            texture = sprite.texture,
                            blendMode = sprite.blendMode,
                            positionData = sprite.positionData,
                            texCoordData = sprite.texCoordData,
                            batchFull = this._batchIndex >= this._batchSize,
                            textureChanged = texture !== this._currentTexture,
                            blendModeChanged = blendMode !== this._currentBlendMode,
                            flush = textureChanged || blendModeChanged || batchFull,
                            index = flush ? 0 : this._batchIndex * this._attributeCount;

                        if (flush) {
                                this.flush();

                                if (textureChanged) {
                                        this._currentTexture = texture;
                                        this._displayManager.setTexture(texture);
                                }

                                if (blendModeChanged) {
                                        this._currentBlendMode = blendMode;
                                        this._displayManager.setBlendMode(blendMode);
                                }
                        }

                        texture.update();

                        // X / Y
                        float32View[index] = positionData[0];
                        float32View[index + 1] = positionData[1];

                        // X / Y
                        float32View[index + 4] = positionData[2];
                        float32View[index + 5] = positionData[3];

                        // X / Y
                        float32View[index + 8] = positionData[4];
                        float32View[index + 9] = positionData[5];

                        // X / Y
                        float32View[index + 12] = positionData[6];
                        float32View[index + 13] = positionData[7];

                        // U / V
                        uint32View[index + 2] = texCoordData[0];
                        uint32View[index + 6] = texCoordData[1];
                        uint32View[index + 10] = texCoordData[2];
                        uint32View[index + 14] = texCoordData[3];

                        // Tint
                        uint32View[index + 3] = uint32View[index + 7] = uint32View[index + 11] = uint32View[index + 15] = sprite.tint.getRGBA();

                        this._batchIndex++;

                        return this;
                }

                /**
                 * @override
                 */

        }, {
                key: 'flush',
                value: function flush() {
                        if (this.bound && this._batchIndex > 0) {
                                var view = this._displayManager.renderTarget.view,
                                    viewId = view.updateId;

                                if (this._currentView !== view || this._viewId !== viewId) {
                                        this._currentView = view;
                                        this._viewId = viewId;

                                        this._shader.setProjection(view.getTransform());
                                }

                                this._vertexBuffer.setData(this._float32View.subarray(0, this._batchIndex * this._attributeCount));
                                this._displayManager.drawElements(this._batchIndex * 6);
                                this._batchIndex = 0;
                        }

                        return this;
                }

                /**
                 * @override
                 */

        }, {
                key: 'destroy',
                value: function destroy() {
                        this.unbind();

                        if (this._vertexBuffer) {
                                this._vertexBuffer.destroy();
                                this._vertexBuffer = null;
                        }

                        if (this._indexBuffer) {
                                this._indexBuffer.destroy();
                                this._indexBuffer = null;
                        }

                        this._shader.destroy();
                        this._shader = null;

                        this._uint32View = null;
                        this._float32View = null;
                        this._viewId = null;
                        this._batchSize = null;
                        this._batchIndex = null;
                        this._attributeCount = null;
                        this._currentTexture = null;
                        this._currentBlendMode = null;
                        this._currentView = null;
                        this._displayManager = null;
                }
        }, {
                key: 'bound',
                get: function get() {
                        return this._displayManager && this._displayManager.renderer === this;
                }
        }]);

        return SpriteRenderer;
}(_Renderer3.default);

exports.default = SpriteRenderer;

/***/ }),
/* 53 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _Shader2 = __webpack_require__(27);

var _Shader3 = _interopRequireDefault(_Shader2);

var _path = __webpack_require__(56);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SpriteShader
 * @extends Shader
 */
var SpriteShader = function (_Shader) {
    _inherits(SpriteShader, _Shader);

    /**
     * @constructor
     */
    function SpriteShader() {
        _classCallCheck(this, SpriteShader);

        var _this = _possibleConstructorReturn(this, (SpriteShader.__proto__ || Object.getPrototypeOf(SpriteShader)).call(this));

        _this.setVertexSource('precision lowp float;\r\n\r\nattribute vec2 aVertexPosition;\r\nattribute vec2 aTextureCoord;\r\nattribute vec4 aColor;\r\n\r\nuniform mat3 projectionMatrix;\r\n\r\nvarying vec2 vTextureCoord;\r\nvarying vec4 vColor;\r\n\r\nvoid main(void) {\r\n    vTextureCoord = aTextureCoord;\r\n    vColor = vec4(aColor.rgb * aColor.a, aColor.a);\r\n\r\n    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\r\n}\r\n');
        _this.setFragmentSource('precision lowp float;\r\n\r\nuniform sampler2D uSampler;\r\n\r\nvarying vec2 vTextureCoord;\r\nvarying vec4 vColor;\r\n\r\nvoid main(void) {\r\n    gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor;\r\n}\r\n');

        _this.setAttribute('aVertexPosition', _const.ATTRIBUTE_TYPE.FLOAT, 2, false);
        _this.setAttribute('aTextureCoord', _const.ATTRIBUTE_TYPE.UNSIGNED_SHORT, 2, true);
        _this.setAttribute('aColor', _const.ATTRIBUTE_TYPE.UNSIGNED_BYTE, 4, true);

        _this.setUniform('projectionMatrix', _const.UNIFORM_TYPE.FLOAT_MAT3);
        _this.setUniform('uSampler', _const.UNIFORM_TYPE.SAMPLER_2D, 0);
        return _this;
    }

    /**
     * @override
     */


    _createClass(SpriteShader, [{
        key: 'setProjection',
        value: function setProjection(projection) {
            this.getUniform('projectionMatrix').setValue(projection.toArray(false));
        }
    }]);

    return SpriteShader;
}(_Shader3.default);

exports.default = SpriteShader;

/***/ }),
/* 54 */
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
     * @param {String} name
     * @param {Number} type
     * @param {Number} size
     * @param {Boolean} [normalized=false]
     * @param {Boolean} [enabled=true]
     */
    function ShaderAttribute(name, type, size) {
        var normalized = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
        var enabled = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : true;

        _classCallCheck(this, ShaderAttribute);

        /**
         * @private
         * @member {?Program}
         */
        this._program = null;

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
        key: 'setEnabled',


        /**
         * @public
         * @chainable
         * @param {Boolean} enabled
         * @returns {ShaderAttribute}
         */
        value: function setEnabled(enabled) {
            if (this._enabled !== enabled) {
                this._enabled = enabled;
                this.upload();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Program} program
         * @param {Number} stride
         * @param {Number} offset
         * @returns {ShaderAttribute}
         */

    }, {
        key: 'bind',
        value: function bind(program, stride, offset) {
            if (!this._program) {
                this._program = program;
            }

            if (!this._bound) {
                this._bound = true;
                this._program.setVertexPointer(this._name, this._size, this._type, this._normalized, stride, offset);
                this.upload();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {ShaderAttribute}
         */

    }, {
        key: 'unbind',
        value: function unbind() {
            this._bound = false;

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {ShaderAttribute}
         */

    }, {
        key: 'upload',
        value: function upload() {
            if (this._bound) {
                this._program.toggleVertexArray(this._name, this._enabled);
            }

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._program = null;
            this._name = null;
            this._type = null;
            this._size = null;
            this._normalized = null;
            this._enabled = null;
            this._bound = null;
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
         * @readonly
         * @member {Boolean}
         */

    }, {
        key: 'enabled',
        get: function get() {
            return this._enabled;
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
/* 55 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

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
     * @param {String} name
     * @param {Number} type
     * @param {Number|Number[]|ArrayBufferView} [value]
     */
    function ShaderUniform(name, type, value) {
        _classCallCheck(this, ShaderUniform);

        /**
         * @private
         * @member {Program}
         */
        this._program = null;

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
         * @member {Number|Number[]|ArrayBufferView}
         */
        this._value = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._dirty = false;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;

        if (value !== undefined) {
            this.setValue(value);
        }
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */


    _createClass(ShaderUniform, [{
        key: 'setValue',


        /**
         * @public
         * @chainable
         * @param {Number|Number[]|ArrayBufferView} value
         * @returns {ShaderUniform}
         */
        value: function setValue(value) {
            this._value = value;
            this._dirty = true;
            this.upload();

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Program} program
         * @returns {ShaderUniform}
         */

    }, {
        key: 'bind',
        value: function bind(program) {
            if (!this._program) {
                this._program = program;
            }

            if (!this._bound) {
                this._bound = true;
                this.upload();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {ShaderUniform}
         */

    }, {
        key: 'unbind',
        value: function unbind() {
            this._bound = false;

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {ShaderUniform}
         */

    }, {
        key: 'upload',
        value: function upload() {
            if (this._bound && this._dirty) {
                this._program.setUniformValue(this._name, this._value, this._type);
                this._dirty = false;
            }

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._program = null;
            this._name = null;
            this._type = null;
            this._value = null;
            this._dirty = null;
            this._bound = null;
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
         * @readonly
         * @member {Number|Number[]|ArrayBufferView}
         */

    }, {
        key: 'value',
        get: function get() {
            return this._value;
        }
    }]);

    return ShaderUniform;
}();

exports.default = ShaderUniform;

/***/ }),
/* 56 */
/***/ (function(module, exports, __webpack_require__) {

/* WEBPACK VAR INJECTION */(function(process) {// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(76)))

/***/ }),
/* 57 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var EMPTY_ARRAY_BUFFER = new ArrayBuffer(0);

/**
 * @class Buffer
 */

var Buffer = function () {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context
     * @param {Number} bufferType
     * @param {Number} drawType
     * @param {ArrayBuffer|ArrayBufferView} data
     */
    function Buffer(context, bufferType, drawType, data) {
        _classCallCheck(this, Buffer);

        if (!context) {
            throw new Error('No Rendering Context was provided.');
        }

        /**
         * @private
         * @member {WebGLRenderingContext}
         */
        this._context = context;

        /**
         * @private
         * @member {WebGLBuffer}
         */
        this._buffer = context.createBuffer();

        /**
         * @private
         * @member {Number}
         */
        this._bufferType = bufferType;

        /**
         * @private
         * @member {Number}
         */
        this._drawType = drawType;

        /**
         * @private
         * @member {ArrayBuffer|ArrayBufferView}
         */
        this._data = EMPTY_ARRAY_BUFFER;

        if (data) {
            this.setData(data);
        }
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */


    _createClass(Buffer, [{
        key: 'setData',


        /**
         * @public
         * @chainable
         * @returns {Buffer}
         */
        value: function setData(data) {
            var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

            var gl = this._context;

            this.bind();

            if (this._data.byteLength >= data.byteLength) {
                gl.bufferSubData(this._bufferType, offset, data);
            } else {
                gl.bufferData(this._bufferType, data, this._drawType);
            }

            this._data = data;

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Buffer}
         */

    }, {
        key: 'bind',
        value: function bind() {
            if (!this.bound) {
                var gl = this._context;

                gl.bindBuffer(this._bufferType, this._buffer);
                gl.bufferData(this._bufferType, this._data, this._drawType);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Buffer}
         */

    }, {
        key: 'unbind',
        value: function unbind() {
            if (this.bound) {
                var gl = this._context;

                gl.bindBuffer(this._bufferType, null);
            }

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            var gl = this._context;

            gl.deleteBuffer(this._buffer);

            this._context = null;
            this._buffer = null;
            this._bufferType = null;
            this._drawType = null;
            this._data = null;
        }
    }, {
        key: 'bound',
        get: function get() {
            var gl = this._context,
                binding = this._bufferType === gl.ARRAY_BUFFER ? gl.ARRAY_BUFFER_BINDING : gl.ELEMENT_ARRAY_BUFFER_BINDING;

            return this._buffer === gl.getParameter(binding);
        }

        /**
         * @public
         * @readonly
         * @member {ArrayBuffer|ArrayBufferView}
         */

    }, {
        key: 'data',
        get: function get() {
            return this._data;
        }
    }]);

    return Buffer;
}();

exports.default = Buffer;

/***/ }),
/* 58 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Renderer2 = __webpack_require__(26);

var _Renderer3 = _interopRequireDefault(_Renderer2);

var _ParticleShader = __webpack_require__(59);

var _ParticleShader2 = _interopRequireDefault(_ParticleShader);

var _utils = __webpack_require__(1);

var _settings = __webpack_require__(2);

var _settings2 = _interopRequireDefault(_settings);

var _Buffer = __webpack_require__(57);

var _Buffer2 = _interopRequireDefault(_Buffer);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ParticleRenderer
 * @extends Renderer
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

        _this._batchSize = _settings2.default.BATCH_SIZE_PARTICLES;

        /**
         * @private
         * @member {Number}
         */
        _this._batchIndex = 0;

        /**
         * 4 x 10 Properties:
         * 2 = vertexPos     (x, y) +
         * 2 = textureCoords (x, y) +
         * 2 = position      (x, y) +
         * 2 = scale         (x, y) +
         * 1 = rotation      (x, y) +
         * 1 = color         (ARGB int)
         *
         * @private
         * @member {Number}
         */
        _this._attributeCount = 40;

        /**
         * @private
         * @member {?DisplayManager}
         */
        _this._displayManager = null;

        /**
         * @private
         * @member {?Buffer}
         */
        _this._vertexBuffer = null;

        /**
         * @private
         * @member {?Buffer}
         */
        _this._indexBuffer = null;

        /**
         * @private
         * @member {ParticleShader}
         */
        _this._shader = new _ParticleShader2.default();

        /**
         * @private
         * @member {ArrayBuffer}
         */
        _this._vertexData = new ArrayBuffer(_this._batchSize * _this._attributeCount * 4);

        /**
         * @private
         * @member {Uint16Array}
         */
        _this._indexData = new Uint16Array(_this._batchSize * 6);

        /**
         * @private
         * @member {Float32Array}
         */
        _this._float32View = new Float32Array(_this._vertexData);

        /**
         * @private
         * @member {Uint32Array}
         */
        _this._uint32View = new Uint32Array(_this._vertexData);

        /**
         * @private
         * @member {?Texture}
         */
        _this._currentTexture = null;

        /**
         * @private
         * @member {?Number}
         */
        _this._currentBlendMode = null;

        /**
         * @private
         * @member {?View}
         */
        _this._currentView = null;

        /**
         * @private
         * @member {Number}
         */
        _this._viewId = -1;

        _this.fillIndexData(_this._indexData);
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */


    _createClass(ParticleRenderer, [{
        key: 'fillIndexData',


        /**
         * @public
         * @param {Uint16Array} data
         * @returns {SpriteRenderer}
         */
        value: function fillIndexData(data) {
            var len = data.length;

            for (var i = 0, offset = 0; i < len; i += 6, offset += 4) {
                data[i] = offset;
                data[i + 1] = offset + 1;
                data[i + 2] = offset + 3;
                data[i + 3] = offset;
                data[i + 4] = offset + 2;
                data[i + 5] = offset + 3;
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'bind',
        value: function bind(displayManager) {
            if (!this._displayManager) {
                var gl = displayManager.context;

                this._vertexBuffer = new _Buffer2.default(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW, this._vertexData);
                this._indexBuffer = new _Buffer2.default(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW, this._indexData);
                this._displayManager = displayManager;
            }

            this._vertexBuffer.bind();
            this._indexBuffer.bind();
            this._displayManager.setShader(this._shader);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'unbind',
        value: function unbind() {
            if (this.bound) {
                this.flush();

                this._vertexBuffer.unbind();
                this._indexBuffer.unbind();
                this._displayManager.setShader(null);

                this._currentTexture = null;
                this._currentBlendMode = null;
                this._currentView = null;
                this._viewId = -1;
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(emitter) {
            var float32View = this._float32View,
                uint32View = this._uint32View,
                texture = emitter.texture,
                blendMode = emitter.blendMode,
                particles = emitter.activeParticles,
                textureFrame = emitter.textureFrame,
                textureCoords = emitter.textureCoords,
                textureChanged = texture !== this._currentTexture,
                blendModeChanged = blendMode !== this._currentBlendMode;

            if (textureChanged || blendModeChanged) {
                this.flush();

                if (textureChanged) {
                    this._currentTexture = texture;
                    this._displayManager.setTexture(texture);
                }

                if (blendModeChanged) {
                    this._currentBlendMode = blendMode;
                    this._displayManager.setBlendMode(blendMode);
                }
            }

            texture.update();

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = particles[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var particle = _step.value;

                    if (this._batchIndex >= this._batchSize) {
                        this.flush();
                    }

                    var index = this._batchIndex * this._attributeCount,
                        position = particle.position,
                        scale = particle.scale,
                        rotation = particle.rotation,
                        color = particle.color;


                    float32View[index] = float32View[index + 11] = textureFrame.x;
                    float32View[index + 1] = float32View[index + 20] = textureFrame.y;

                    float32View[index + 2] = float32View[index + 22] = textureCoords.x;
                    float32View[index + 3] = float32View[index + 13] = textureCoords.y;

                    float32View[index + 10] = float32View[index + 30] = textureFrame.width;
                    float32View[index + 21] = float32View[index + 31] = textureFrame.height;

                    float32View[index + 12] = float32View[index + 32] = textureCoords.width;
                    float32View[index + 23] = float32View[index + 33] = textureCoords.height;

                    float32View[index + 4] = float32View[index + 14] = float32View[index + 24] = float32View[index + 34] = position.x;

                    float32View[index + 5] = float32View[index + 15] = float32View[index + 25] = float32View[index + 35] = position.y;

                    float32View[index + 6] = float32View[index + 16] = float32View[index + 26] = float32View[index + 36] = scale.x;

                    float32View[index + 7] = float32View[index + 17] = float32View[index + 27] = float32View[index + 37] = scale.y;

                    float32View[index + 8] = float32View[index + 18] = float32View[index + 28] = float32View[index + 38] = (0, _utils.degreesToRadians)(rotation);

                    uint32View[index + 9] = uint32View[index + 19] = uint32View[index + 29] = uint32View[index + 39] = color.getRGBA();

                    this._batchIndex++;
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
         * @override
         */

    }, {
        key: 'flush',
        value: function flush() {
            if (this.bound && this._batchIndex > 0) {
                var view = this._displayManager.renderTarget.view,
                    viewId = view.updateId;

                if (this._currentView !== view || this._viewId !== viewId) {
                    this._currentView = view;
                    this._viewId = viewId;

                    this._shader.setProjection(view.getTransform());
                }

                this._vertexBuffer.setData(this._float32View.subarray(0, this._batchIndex * this._attributeCount));
                this._displayManager.drawElements(this._batchIndex * 6);
                this._batchIndex = 0;
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this.unbind();

            if (this._vertexBuffer) {
                this._vertexBuffer.destroy();
                this._vertexBuffer = null;
            }

            if (this._indexBuffer) {
                this._indexBuffer.destroy();
                this._indexBuffer = null;
            }

            this._shader.destroy();
            this._shader = null;

            this._uint32View = null;
            this._float32View = null;
            this._viewId = null;
            this._batchSize = null;
            this._batchIndex = null;
            this._attributeCount = null;
            this._currentTexture = null;
            this._currentBlendMode = null;
            this._currentView = null;
            this._displayManager = null;
        }
    }, {
        key: 'bound',
        get: function get() {
            return this._displayManager && this._displayManager.renderer === this;
        }
    }]);

    return ParticleRenderer;
}(_Renderer3.default);

exports.default = ParticleRenderer;

/***/ }),
/* 59 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _Shader2 = __webpack_require__(27);

var _Shader3 = _interopRequireDefault(_Shader2);

var _path = __webpack_require__(56);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ParticleShader
 * @extends Shader
 */
var ParticleShader = function (_Shader) {
    _inherits(ParticleShader, _Shader);

    /**
     * @constructor
     */
    function ParticleShader() {
        _classCallCheck(this, ParticleShader);

        var _this = _possibleConstructorReturn(this, (ParticleShader.__proto__ || Object.getPrototypeOf(ParticleShader)).call(this));

        _this.setVertexSource('precision lowp float;\n\nattribute vec2 aVertexPosition;\nattribute vec2 aTextureCoord;\nattribute vec2 aPosition;\nattribute vec2 aScale;\nattribute float aRotation;\nattribute vec4 aColor;\n\nuniform mat3 projectionMatrix;\n\nvarying vec2 vTextureCoord;\nvarying vec4 vColor;\n\nvoid main(void) {\n    vTextureCoord = aTextureCoord;\n    vColor = vec4(aColor.rgb * aColor.a, aColor.a);\n\n    vec2 pos = vec2(\n        (aVertexPosition.x * cos(aRotation)) - (aVertexPosition.y * sin(aRotation)),\n        (aVertexPosition.x * sin(aRotation)) + (aVertexPosition.y * cos(aRotation))\n    );\n\n    gl_Position = vec4((projectionMatrix * vec3((pos * aScale) + aPosition, 1.0)).xy, 0.0, 1.0);\n}\n');
        _this.setFragmentSource('precision lowp float;\n\nuniform sampler2D uSampler;\n\nvarying vec2 vTextureCoord;\nvarying vec4 vColor;\n\nvoid main(void) {\n    gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor;\n}\n');

        _this.setAttribute('aVertexPosition', _const.ATTRIBUTE_TYPE.FLOAT, 2, false);
        _this.setAttribute('aTextureCoord', _const.ATTRIBUTE_TYPE.FLOAT, 2, false);
        _this.setAttribute('aPosition', _const.ATTRIBUTE_TYPE.FLOAT, 2, false);
        _this.setAttribute('aScale', _const.ATTRIBUTE_TYPE.FLOAT, 2, false);
        _this.setAttribute('aRotation', _const.ATTRIBUTE_TYPE.FLOAT, 1, false);
        _this.setAttribute('aColor', _const.ATTRIBUTE_TYPE.UNSIGNED_BYTE, 4, true);

        _this.setUniform('projectionMatrix', _const.UNIFORM_TYPE.FLOAT_MAT3);
        _this.setUniform('uSampler', _const.UNIFORM_TYPE.SAMPLER_2D, 0);
        return _this;
    }

    /**
     * @override
     */


    _createClass(ParticleShader, [{
        key: 'setProjection',
        value: function setProjection(projection) {
            this.getUniform('projectionMatrix').setValue(projection.toArray(false));
        }
    }]);

    return ParticleShader;
}(_Shader3.default);

exports.default = ParticleShader;

/***/ }),
/* 60 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _ChannelManager2 = __webpack_require__(9);

var _ChannelManager3 = _interopRequireDefault(_ChannelManager2);

var _Keyboard = __webpack_require__(61);

var _Keyboard2 = _interopRequireDefault(_Keyboard);

var _GamepadManager = __webpack_require__(62);

var _GamepadManager2 = _interopRequireDefault(_GamepadManager);

var _PointerManager = __webpack_require__(64);

var _PointerManager2 = _interopRequireDefault(_PointerManager);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class InputManager
 * @extends ChannelManager
 */
var InputManager = function (_ChannelManager) {
    _inherits(InputManager, _ChannelManager);

    /**
     * @constructor
     * @param {Application} app
     */
    function InputManager(app) {
        _classCallCheck(this, InputManager);

        /**
         * @private
         * @member {Application}
         */
        var _this = _possibleConstructorReturn(this, (InputManager.__proto__ || Object.getPrototypeOf(InputManager)).call(this, new ArrayBuffer(_const.INPUT_CHANNELS_GLOBAL * 4), 0, _const.INPUT_CHANNELS_GLOBAL));

        _this._app = app;

        /**
         * @private
         * @member {Set<Input>}
         */
        _this._inputs = new Set();

        /**
         * @private
         * @member {Keyboard}
         */
        _this._keyboard = new _Keyboard2.default(app, _this.channelBuffer);

        /**
         * @private
         * @member {PointerManager}
         */
        _this._pointerManager = new _PointerManager2.default(app, _this.channelBuffer);

        /**
         * @private
         * @member {GamepadManager}
         */
        _this._gamepadManager = new _GamepadManager2.default(app, _this.channelBuffer);
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
            this._pointerManager.update();
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(InputManager.prototype.__proto__ || Object.getPrototypeOf(InputManager.prototype), 'destroy', this).call(this);

            this._inputs.clear();
            this._inputs = null;

            this._keyboard.destroy();
            this._keyboard = null;

            this._pointerManager.destroy();
            this._pointerManager = null;

            this._gamepadManager.destroy();
            this._gamepadManager = null;

            this._app = null;
        }
    }]);

    return InputManager;
}(_ChannelManager3.default);

exports.default = InputManager;

/***/ }),
/* 61 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _utils = __webpack_require__(1);

var _ChannelManager2 = __webpack_require__(9);

var _ChannelManager3 = _interopRequireDefault(_ChannelManager2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var FLAGS = {
  NONE: 0,
  KEY_DOWN: 1 << 0,
  KEY_UP: 1 << 1
};

/**
 * @class Keyboard
 * @extends ChannelManager
 */

var Keyboard = function (_ChannelManager) {
  _inherits(Keyboard, _ChannelManager);

  /**
   * @constructor
   * @param {Application} app
   * @param {ArrayBuffer} channelBuffer
   */
  function Keyboard(app, channelBuffer) {
    _classCallCheck(this, Keyboard);

    /**
     * @private
     * @member {Application}
     */
    var _this = _possibleConstructorReturn(this, (Keyboard.__proto__ || Object.getPrototypeOf(Keyboard)).call(this, channelBuffer, _const.INPUT_OFFSET_KEYBOARD, _const.INPUT_CHANNELS_DEVICE));

    _this._app = app;

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
    _this._flags = FLAGS.NONE;

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

      if ((0, _utils.hasFlag)(FLAGS.KEY_DOWN, this._flags)) {
        this.trigger('keyboard:down', this._channelsPressed, this);
        this._channelsPressed.clear();

        this._flags = (0, _utils.removeFlag)(FLAGS.KEY_DOWN, this._flags);
      }

      if ((0, _utils.hasFlag)(FLAGS.KEY_UP, this._flags)) {
        this.trigger('keyboard:up', this._channelsReleased, this);
        this._channelsReleased.clear();

        this._flags = (0, _utils.removeFlag)(FLAGS.KEY_UP, this._flags);
      }
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
      this._app = null;
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

      this._flags = (0, _utils.addFlag)(FLAGS.KEY_DOWN, this._flags);
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

      this._flags = (0, _utils.addFlag)(FLAGS.KEY_UP, this._flags);
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
      return _const.INPUT_OFFSET_KEYBOARD + key % _const.INPUT_CHANNELS_DEVICE;
    }

    /**
     * @public
     * @static
     * @param {Number} channel
     * @returns {Number}
     */

  }, {
    key: 'getKeyCode',
    value: function getKeyCode(channel) {
      return channel % _const.INPUT_CHANNELS_DEVICE;
    }
  }]);

  return Keyboard;
}(_ChannelManager3.default);

exports.default = Keyboard;

/***/ }),
/* 62 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _Gamepad = __webpack_require__(63);

var _Gamepad2 = _interopRequireDefault(_Gamepad);

var _ChannelManager2 = __webpack_require__(9);

var _ChannelManager3 = _interopRequireDefault(_ChannelManager2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var navigator = window.navigator;

/**
 * @class GamepadManager
 * @extends ChannelManager
 */

var GamepadManager = function (_ChannelManager) {
    _inherits(GamepadManager, _ChannelManager);

    /**
     * @constructor
     * @param {Application} app
     * @param {ArrayBuffer} channelBuffer
     */
    function GamepadManager(app, channelBuffer) {
        _classCallCheck(this, GamepadManager);

        /**
         * @private
         * @member {Application}
         */
        var _this = _possibleConstructorReturn(this, (GamepadManager.__proto__ || Object.getPrototypeOf(GamepadManager)).call(this, channelBuffer, _const.INPUT_OFFSET_GAMEPAD, _const.INPUT_CHANNELS_DEVICE));

        _this._app = app;

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
            var app = this._app,
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
                    app.trigger('gamepad:add', gamepad, currentGamepads);
                } else {
                    var _gamepad = currentGamepads.get(i);

                    currentGamepads.delete(i);
                    app.trigger('gamepad:remove', _gamepad, currentGamepads);
                    _gamepad.destroy();
                }

                app.trigger('gamepad:change', currentGamepads);
            }

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = currentGamepads.values()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var _gamepad2 = _step.value;

                    _gamepad2.update();
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

            this._app = null;
        }
    }, {
        key: 'gamepads',
        get: function get() {
            return this._gamepads;
        }
    }]);

    return GamepadManager;
}(_ChannelManager3.default);

exports.default = GamepadManager;

/***/ }),
/* 63 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _settings = __webpack_require__(2);

var _settings2 = _interopRequireDefault(_settings);

var _ChannelManager2 = __webpack_require__(9);

var _ChannelManager3 = _interopRequireDefault(_ChannelManager2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Gamepad
 * @extends ChannelManager
 */
var Gamepad = function (_ChannelManager) {
    _inherits(Gamepad, _ChannelManager);

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
        var _this = _possibleConstructorReturn(this, (Gamepad.__proto__ || Object.getPrototypeOf(Gamepad)).call(this, channelBuffer, _const.INPUT_OFFSET_GAMEPAD + gamepad.index * _const.INPUT_CHANNELS_HANDLER, _const.INPUT_CHANNELS_HANDLER));

        _this._gamepad = gamepad;

        /**
         * @private
         * @member {GamepadMapping}
         */
        _this._mapping = _settings2.default.GAMEPAD_MAPPING;
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
    }]);

    return Gamepad;
}(_ChannelManager3.default);

exports.default = Gamepad;

/***/ }),
/* 64 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _support = __webpack_require__(4);

var _support2 = _interopRequireDefault(_support);

var _ChannelManager2 = __webpack_require__(9);

var _ChannelManager3 = _interopRequireDefault(_ChannelManager2);

var _Pointer = __webpack_require__(65);

var _Pointer2 = _interopRequireDefault(_Pointer);

var _Vector = __webpack_require__(3);

var _Vector2 = _interopRequireDefault(_Vector);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var FLAGS = {
    NONE: 0,
    ENTER: 1 << 0,
    LEAVE: 1 << 1,
    MOVE: 1 << 2,
    DOWN: 1 << 3,
    UP: 1 << 4,
    CANCEL: 1 << 5,
    SCROLL: 1 << 6
},
    passive = _support2.default.eventOptions ? {
    capture: true,
    passive: true
} : true,
    active = _support2.default.eventOptions ? {
    capture: true,
    passive: false
} : true;

/**
 * @typedef {MouseEvent} PointerEvent
 * @property {Number} pointerId
 * @property {Number} width
 * @property {Number} height
 * @property {Number} pressure
 * @property {Number} tiltX
 * @property {Number} tiltY
 * @property {Number} tangentialPressure
 * @property {Number} twist
 * @property {String} pointerType
 * @property {Boolean} isPrimary
 */

/**
 * @class PointerManager
 * @extends ChannelManager
 */

var PointerManager = function (_ChannelManager) {
    _inherits(PointerManager, _ChannelManager);

    /**
     * @constructor
     * @param {Application} app
     * @param {ArrayBuffer} channelBuffer
     */
    function PointerManager(app, channelBuffer) {
        _classCallCheck(this, PointerManager);

        /**
         * @private
         * @member {Application}
         */
        var _this = _possibleConstructorReturn(this, (PointerManager.__proto__ || Object.getPrototypeOf(PointerManager)).call(this, channelBuffer, _const.INPUT_OFFSET_POINTER, _const.INPUT_CHANNELS_DEVICE));

        _this._app = app;

        /**
         * @private
         * @member {Map<Number, Pointer>}
         */
        _this._pointers = new Map();

        /**
         * @private
         * @member {Set<Pointer>}
         */
        _this._pointersEntered = new Set();

        /**
         * @private
         * @member {Set<Pointer>}
         */
        _this._pointersLeft = new Set();

        /**
         * @private
         * @member {Set<Pointer>}
         */
        _this._pointersMoved = new Set();

        /**
         * @private
         * @member {Set<Pointer>}
         */
        _this._pointersDown = new Set();

        /**
         * @private
         * @member {Set<Pointer>}
         */
        _this._pointersUp = new Set();

        /**
         * @private
         * @member {Set<Pointer>}
         */
        _this._pointersCancelled = new Set();

        /**
         * @private
         * @member {Vector}
         */
        _this._scrollDelta = new _Vector2.default(0, 0);

        /**
         * @private
         * @member {Number}
         */
        _this._flags = FLAGS.NONE;

        _this._addEventListeners();
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Map<Number, Pointer>}
     */


    _createClass(PointerManager, [{
        key: 'update',


        /**
         * @override
         */
        value: function update() {
            if (this._flags) {
                if ((0, _utils.hasFlag)(FLAGS.ENTER, this._flags)) {
                    this._triggerPointerEvents('enter', this._pointersEntered);
                    this._pointersEntered.clear();
                    this._flags = (0, _utils.removeFlag)(FLAGS.ENTER, this._flags);
                }

                if ((0, _utils.hasFlag)(FLAGS.LEAVE, this._flags)) {
                    this._triggerPointerEvents('leave', this._pointersLeft);
                    this._pointersLeft.clear();
                    this._flags = (0, _utils.removeFlag)(FLAGS.LEAVE, this._flags);
                }

                if ((0, _utils.hasFlag)(FLAGS.MOVE, this._flags)) {
                    this._triggerPointerEvents('move', this._pointersMoved);
                    this._pointersMoved.clear();
                    this._flags = (0, _utils.removeFlag)(FLAGS.MOVE, this._flags);
                }

                if ((0, _utils.hasFlag)(FLAGS.DOWN, this._flags)) {
                    this._triggerPointerEvents('down', this._pointersDown);
                    this._pointersDown.clear();

                    this._flags = (0, _utils.removeFlag)(FLAGS.DOWN, this._flags);
                }

                if ((0, _utils.hasFlag)(FLAGS.UP, this._flags)) {
                    this._triggerPointerEvents('up', this._pointersUp);
                    this._pointersUp.clear();

                    this._flags = (0, _utils.removeFlag)(FLAGS.UP, this._flags);
                }

                if ((0, _utils.hasFlag)(FLAGS.CANCEL, this._flags)) {
                    this._triggerPointerEvents('cancel', this._pointersCancelled);
                    this._pointersCancelled.clear();

                    this._flags = (0, _utils.removeFlag)(FLAGS.CANCEL, this._flags);
                }

                if ((0, _utils.hasFlag)(FLAGS.SCROLL, this._flags)) {
                    this._app.trigger('mouse:scroll', this._scrollDelta, this._pointers);
                    this._scrollDelta.set(0, 0);

                    this._flags = (0, _utils.removeFlag)(FLAGS.SCROLL, this._flags);
                }
            }

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._pointers.values()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var pointer = _step.value;

                    pointer.update();
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
        key: 'destroy',
        value: function destroy() {
            _get(PointerManager.prototype.__proto__ || Object.getPrototypeOf(PointerManager.prototype), 'destroy', this).call(this);

            this._removeEventListeners();

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this._pointers.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var pointer = _step2.value;

                    pointer.destroy();
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

            this._pointers.clear();
            this._pointers = null;

            this._pointersEntered.clear();
            this._pointersEntered = null;

            this._pointersLeft.clear();
            this._pointersLeft = null;

            this._pointersDown.clear();
            this._pointersDown = null;

            this._pointersUp.clear();
            this._pointersUp = null;

            this._pointersCancelled.clear();
            this._pointersCancelled = null;

            this._scrollDelta.destroy();
            this._scrollDelta = null;

            this._flags = null;
            this._app = null;
        }

        /**
         * @private
         */

    }, {
        key: '_addEventListeners',
        value: function _addEventListeners() {
            var canvas = this._app.canvas;

            this._onEnterHandler = this._onEnter.bind(this);
            this._onLeaveHandler = this._onLeave.bind(this);
            this._onMoveHandler = this._onMove.bind(this);
            this._onDownHandler = this._onDown.bind(this);
            this._onUpHandler = this._onUp.bind(this);
            this._onCancelHandler = this._onCancel.bind(this);
            this._onScrollHandler = this._onScroll.bind(this);

            canvas.addEventListener('pointerover', this._onEnterHandler, passive);
            canvas.addEventListener('pointerleave', this._onLeaveHandler, passive);
            canvas.addEventListener('pointercancel', this._onCancelHandler, passive);
            canvas.addEventListener('pointermove', this._onMoveHandler, passive);
            canvas.addEventListener('pointerdown', this._onDownHandler, active);
            canvas.addEventListener('pointerup', this._onUpHandler, active);
            canvas.addEventListener('wheel', this._onScrollHandler, active);
            canvas.addEventListener('contextmenu', _utils.stopEvent, active);
            canvas.addEventListener('selectstart', _utils.stopEvent, active);
        }

        /**
         * @private
         */

    }, {
        key: '_removeEventListeners',
        value: function _removeEventListeners() {
            var canvas = this._app.canvas;

            canvas.removeEventListener('pointerover', this._onEnterHandler, passive);
            canvas.removeEventListener('pointerleave', this._onLeaveHandler, passive);
            canvas.removeEventListener('pointercancel', this._onCancelHandler, passive);
            canvas.removeEventListener('pointermove', this._onMoveHandler, passive);
            canvas.removeEventListener('pointerdown', this._onDownHandler, active);
            canvas.removeEventListener('pointerup', this._onUpHandler, active);
            canvas.removeEventListener('wheel', this._onScrollHandler, active);
            canvas.removeEventListener('contextmenu', _utils.stopEvent, active);
            canvas.removeEventListener('selectstart', _utils.stopEvent, active);

            this._onEnterHandler = null;
            this._onLeaveHandler = null;
            this._onMoveHandler = null;
            this._onDownHandler = null;
            this._onUpHandler = null;
            this._onCancelHandler = null;
        }

        /**
         * @private
         * @param {PointerEvent} event
         */

    }, {
        key: '_onEnter',
        value: function _onEnter(event) {
            var pointer = new _Pointer2.default(event, this.channelBuffer);

            this._pointers.set(pointer.id, pointer);
            this._pointersEntered.add(pointer);
            this._flags = (0, _utils.addFlag)(FLAGS.ENTER, this._flags);
        }

        /**
         * @private
         * @param {PointerEvent} event
         */

    }, {
        key: '_onLeave',
        value: function _onLeave(event) {
            var pointer = this._updatePointer(event);

            this._pointers.delete(pointer.id);
            this._pointersLeft.add(pointer);
            this._flags = (0, _utils.addFlag)(FLAGS.LEAVE, this._flags);
        }

        /**
         * @private
         * @param {PointerEvent} event
         */

    }, {
        key: '_onDown',
        value: function _onDown(event) {
            this._pointersDown.add(this._updatePointer(event));
            this._flags = (0, _utils.addFlag)(FLAGS.DOWN, this._flags);

            event.preventDefault();
        }

        /**
         * @private
         * @param {PointerEvent} event
         */

    }, {
        key: '_onUp',
        value: function _onUp(event) {
            this._pointersUp.add(this._updatePointer(event));
            this._flags = (0, _utils.addFlag)(FLAGS.UP, this._flags);

            event.preventDefault();
        }

        /**
         * @private
         * @param {PointerEvent} event
         */

    }, {
        key: '_onCancel',
        value: function _onCancel(event) {
            this._pointersCancelled.add(this._updatePointer(event));
            this._flags = (0, _utils.addFlag)(FLAGS.CANCEL, this._flags);
        }

        /**
         * @private
         * @param {PointerEvent} event
         */

    }, {
        key: '_onMove',
        value: function _onMove(event) {
            this._pointersMoved.add(this._updatePointer(event));
            this._flags = (0, _utils.addFlag)(FLAGS.MOVE, this._flags);
        }

        /**
         * @private
         * @param {WheelEvent} event
         */

    }, {
        key: '_onScroll',
        value: function _onScroll(event) {
            this._scrollDelta.add(event.deltaX, event.deltaY);
            this._flags = (0, _utils.addFlag)(FLAGS.SCROLL, this._flags);
        }

        /**
         * @private
         * @param {PointerEvent} event
         * @returns {Pointer}
         */

    }, {
        key: '_updatePointer',
        value: function _updatePointer(event) {
            if (!this._pointers.has(event.pointerId)) {
                throw new Error('Could not find Pointer with id "' + event.pointerId + '".');
            }

            return this._pointers.get(event.pointerId).setEventData(event);
        }

        /**
         * @private
         * @param {String} event
         * @param {Set<Pointer>} pointers
         */

    }, {
        key: '_triggerPointerEvents',
        value: function _triggerPointerEvents(event, pointers) {
            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {
                for (var _iterator3 = pointers[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                    var pointer = _step3.value;

                    this._app.trigger('pointer:' + event, pointer, this._pointers);

                    if (pointer.type === 'mouse') {
                        this._app.trigger('mouse:' + event, pointer, this._pointers);
                    } else if (pointer.type === 'touch') {
                        this._app.trigger('touch:' + event, pointer, this._pointers);
                    } else if (pointer.type === 'pen') {
                        this._app.trigger('pen:' + event, pointer, this._pointers);
                    }
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
    }, {
        key: 'pointers',
        get: function get() {
            return this._pointers;
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
    }]);

    return PointerManager;
}(_ChannelManager3.default);

exports.default = PointerManager;

/***/ }),
/* 65 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _ChannelManager2 = __webpack_require__(9);

var _ChannelManager3 = _interopRequireDefault(_ChannelManager2);

var _Vector = __webpack_require__(3);

var _Vector2 = _interopRequireDefault(_Vector);

var _Size = __webpack_require__(7);

var _Size2 = _interopRequireDefault(_Size);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @private
 * @type {Object<String, Number>}
 * @property {Number} NONE
 * @property {Number} POSITION
 * @property {Number} SIZE
 * @property {Number} TILT
 * @property {Number} BUTTONS
 * @property {Number} PRESSURE
 * @property {Number} ROTATION
 */
var FLAGS = {
    NONE: 0,
    POSITION: 1 << 0,
    SIZE: 1 << 1,
    TILT: 1 << 2,
    BUTTONS: 1 << 3,
    PRESSURE: 1 << 4,
    ROTATION: 1 << 5
};

/**
 * @class Pointer
 * @extends ChannelManager
 */

var Pointer = function (_ChannelManager) {
    _inherits(Pointer, _ChannelManager);

    /**
     * @constructor
     * @param {PointerEvent} event
     * @param {ArrayBuffer} channelBuffer
     */
    function Pointer(event, channelBuffer) {
        _classCallCheck(this, Pointer);

        var _this = _possibleConstructorReturn(this, (Pointer.__proto__ || Object.getPrototypeOf(Pointer)).call(this, channelBuffer, _const.INPUT_OFFSET_POINTER, _const.INPUT_CHANNELS_HANDLER));

        var bounds = event.target.getBoundingClientRect();

        /**
         * @private
         * @member {Number}
         */
        _this._id = event.pointerId;

        /**
         * @private
         * @member {String}
         */
        _this._type = event.pointerType;

        /**
         * @private
         * @member {Vector}
         */
        _this._position = new _Vector2.default(event.clientX - bounds.left, event.clientY - bounds.top);

        /**
         * @private
         * @member {Size}
         */
        _this._size = new _Size2.default(event.width, event.height);

        /**
         * @private
         * @member {Vector}
         */
        _this._tilt = new _Vector2.default(event.tiltX, event.tiltY);

        /**
         * @private
         * @member {Number}
         */
        _this._buttons = event.buttons;

        /**
         * @private
         * @member {Number}
         */
        _this._pressure = event.pressure;

        /**
         * @private
         * @member {Number}
         */
        _this._rotation = event.twist;

        /**
         * @private
         * @member {Number}
         */
        _this._flags = FLAGS.NONE;
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */


    _createClass(Pointer, [{
        key: 'setEventData',


        /**
         * @public
         * @chainable
         * @param {PointerEvent} event
         * @returns {Pointer}
         */
        value: function setEventData(event) {
            var bounds = event.target.getBoundingClientRect(),
                x = event.clientX - bounds.left,
                y = event.clientY - bounds.top;

            if (this._position.x !== x || this._position.y !== y) {
                this._position.set(x, y);

                this._flags = (0, _utils.addFlag)(FLAGS.POSITION, this._flags);
            }

            if (this._size.width !== event.width || this._size.height !== event.height) {
                this._size.set(event.width, event.height);

                this._flags = (0, _utils.addFlag)(FLAGS.SIZE, this._flags);
            }

            if (this._tilt.x !== event.tiltX || this._tilt.y !== event.tiltY) {
                this._tilt.set(event.tiltX, event.tiltY);

                this._flags = (0, _utils.addFlag)(FLAGS.TILT, this._flags);
            }

            if (this._buttons !== event.buttons) {
                this._buttons = event.buttons;

                this._flags = (0, _utils.addFlag)(FLAGS.BUTTONS, this._flags);
            }

            if (this._pressure !== event.pressure) {
                this._pressure = event.pressure;

                this._flags = (0, _utils.addFlag)(FLAGS.PRESSURE, this._flags);
            }

            if (this._rotation !== event.twist) {
                this._rotation = event.twist;

                this._flags = (0, _utils.addFlag)(FLAGS.ROTATION, this._flags);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Pointer}
         */

    }, {
        key: 'update',
        value: function update() {
            if (!this._flags) {
                return this;
            }

            if ((0, _utils.hasFlag)(FLAGS.POSITION, this._flags)) {
                this.trigger('move', this._position, this);

                this._flags = (0, _utils.removeFlag)(FLAGS.POSITION, this._flags);
            }

            if ((0, _utils.hasFlag)(FLAGS.SIZE, this._flags)) {
                this.trigger('resize', this._size, this);

                this._flags = (0, _utils.removeFlag)(FLAGS.SIZE, this._flags);
            }

            if ((0, _utils.hasFlag)(FLAGS.TILT, this._flags)) {
                this.trigger('tilt', this._tilt, this);

                this._flags = (0, _utils.removeFlag)(FLAGS.TILT, this._flags);
            }

            if ((0, _utils.hasFlag)(FLAGS.ROTATION, this._flags)) {
                this.trigger('rotate', this._rotation, this);

                this._flags = (0, _utils.removeFlag)(FLAGS.ROTATION, this._flags);
            }

            if ((0, _utils.hasFlag)(FLAGS.BUTTONS, this._flags)) {
                this.trigger('buttonsChanged', this._buttons, this);

                this._flags = (0, _utils.removeFlag)(FLAGS.BUTTONS, this._flags);
            }

            if ((0, _utils.hasFlag)(FLAGS.PRESSURE, this._flags)) {
                this.trigger('pressureChanged', this._pressure, this);

                this._flags = (0, _utils.removeFlag)(FLAGS.PRESSURE, this._flags);
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Pointer.prototype.__proto__ || Object.getPrototypeOf(Pointer.prototype), 'destroy', this).call(this);

            this._position.destroy();
            this._position = null;

            this._size.destroy();
            this._size = null;

            this._tilt.destroy();
            this._tilt = null;

            this._id = null;
            this._type = null;
            this._buttons = null;
            this._pressure = null;
            this._rotation = null;
            this._flags = null;
        }
    }, {
        key: 'id',
        get: function get() {
            return this._id;
        }

        /**
         * @public
         * @readonly
         * @member {String}
         */

    }, {
        key: 'type',
        get: function get() {
            return this._type;
        }

        /**
         * @public
         * @readonly
         * @member {Vector}
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
         * @member {Size}
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
        key: 'width',
        get: function get() {
            return this._size.width;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._size.height;
        }

        /**
         * @public
         * @readonly
         * @member {Vector}
         */

    }, {
        key: 'tilt',
        get: function get() {
            return this._tilt;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'buttons',
        get: function get() {
            return this._buttons;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'pressure',
        get: function get() {
            return this._pressure;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'rotation',
        get: function get() {
            return this._rotation;
        }
    }]);

    return Pointer;
}(_ChannelManager3.default);

exports.default = Pointer;

/***/ }),
/* 66 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Interval = __webpack_require__(28);

var _Interval2 = _interopRequireDefault(_Interval);

var _Vector = __webpack_require__(3);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Polygon
 */
var Polygon = function () {

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     * @param {Vector[]} [points=[]]
     */
    function Polygon() {
        var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        var points = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];

        _classCallCheck(this, Polygon);

        /**
         * @private
         * @member {Vector}
         */
        this._position = new _Vector2.default(x, y);

        /**
         * @private
         * @member {Vector[]}
         */
        this._points = points.map(function (point) {
            return point.clone();
        });
    }

    /**
     * @public
     * @member {Vector}
     */


    _createClass(Polygon, [{
        key: 'setPoints',


        /**
         * @public
         * @chainable
         * @param {Vector[]} newPoints
         * @returns {Polygon}
         */
        value: function setPoints(newPoints) {
            var points = this._points,
                len = points.length,
                diff = len - newPoints.length;

            for (var i = 0; i < len; i++) {
                points[i].copy(newPoints[i]);
            }

            if (diff > 0) {
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = points.splice(newPoints.length, diff)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var point = _step.value;

                        point.destroy();
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
            } else if (diff < 0) {
                for (var _i = len; _i < newPoints.length; _i++) {
                    points.push(newPoints[_i].clone());
                }
            }
        }

        /**
         * @public
         * @chainable
         * @param {Vector} axis
         * @param {Interval} [result=new Interval()]
         * @returns {Interval}
         */

    }, {
        key: 'project',
        value: function project(axis) {
            var result = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : new _Interval2.default();

            var min = Infinity,
                max = -Infinity;

            axis.normalize();

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this._points[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var point = _step2.value;

                    var projection = axis.dot(point);

                    min = Math.min(min, projection);
                    max = Math.max(max, projection);
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

            return result.set(min, max);
        }

        /**
         * @override
         */

    }, {
        key: 'set',
        value: function set(x, y, points) {
            this._position.set(x, y);
            this.setPoints(points);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(polygon) {
            this._position.copy(polygon.position);
            this.setPoints(polygon.points);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new Polygon(this.x, this.y, this.points);
        }

        /**
         * @public
         * @param {Polygon|Object} polygon
         * @param {Vector[]} polygon.points
         * @returns {Boolean}
         */

    }, {
        key: 'equals',
        value: function equals() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                points = _ref.points;

            return points.length === this.points.length && this.points.every(function (point, index) {
                return point.equals(points[index]);
            });
        }

        /**
         * @override
         */

    }, {
        key: 'contains',
        value: function contains(x, y, transform) {
            var points = this._points,
                len = points.length,
                tempA = new _Vector2.default(),
                tempB = new _Vector2.default();

            var inside = false;

            for (var i = 0, j = len - 1; i < len; j = i++) {
                var pointA = points[i],
                    pointB = points[j];

                if (transform) {
                    pointA = pointA.transform(transform, tempA);
                    pointB = pointB.transform(transform, tempB);
                }

                if (pointA.y > y !== pointB.y > y && x < (pointB.x - pointA.x) * ((y - pointA.y) / (pointB.y - pointA.y)) + pointA.x) {
                    inside = !inside;
                }
            }

            return inside;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {

                for (var _iterator3 = this._points[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                    var point = _step3.value;

                    point.destroy();
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

            this._position.destroy();
            this._position = null;

            this._points.length = 0;
            this._points = null;
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
         * @member {Vector[]}
         */

    }, {
        key: 'points',
        get: function get() {
            return this._points;
        },
        set: function set(points) {
            this.setPoints(points);
        }
    }]);

    return Polygon;
}();

/**
 * @public
 * @static
 * @constant
 * @member {Polygon}
 */


exports.default = Polygon;
Polygon.Empty = new Polygon(0, 0, []);

/**
 * @public
 * @static
 * @constant
 * @member {Polygon}
 */
Polygon.Temp = new Polygon();

/***/ }),
/* 67 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class TextStyle
 */
var TextStyle = function () {

    /**
     * @constructor
     * @param {TextStyle|Object} [style = {}]
     * @param {String} [style.align='left']
     * @param {String} [style.fill='black']
     * @param {String} [style.stroke='black']
     * @param {Number} [style.strokeThickness=0]
     * @param {Number} [style.fontSize=20]
     * @param {String} [style.fontWeight='bold']
     * @param {String} [style.fontFamily='Arial']
     * @param {Boolean} [style.wordWrap=false]
     * @param {Number} [style.wordWrapWidth=100]
     * @param {String} [style.baseline='alphabetic']
     * @param {String} [style.lineJoin='miter']
     * @param {Number} [style.miterLimit=10]
     * @param {Number} [style.padding=0]
     */
    function TextStyle() {
        var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
            _ref$align = _ref.align,
            align = _ref$align === undefined ? 'left' : _ref$align,
            _ref$fill = _ref.fill,
            fill = _ref$fill === undefined ? 'black' : _ref$fill,
            _ref$stroke = _ref.stroke,
            stroke = _ref$stroke === undefined ? 'black' : _ref$stroke,
            _ref$strokeThickness = _ref.strokeThickness,
            strokeThickness = _ref$strokeThickness === undefined ? 0 : _ref$strokeThickness,
            _ref$fontSize = _ref.fontSize,
            fontSize = _ref$fontSize === undefined ? 20 : _ref$fontSize,
            _ref$fontWeight = _ref.fontWeight,
            fontWeight = _ref$fontWeight === undefined ? 'bold' : _ref$fontWeight,
            _ref$fontFamily = _ref.fontFamily,
            fontFamily = _ref$fontFamily === undefined ? 'Arial' : _ref$fontFamily,
            _ref$wordWrap = _ref.wordWrap,
            wordWrap = _ref$wordWrap === undefined ? false : _ref$wordWrap,
            _ref$wordWrapWidth = _ref.wordWrapWidth,
            wordWrapWidth = _ref$wordWrapWidth === undefined ? 100 : _ref$wordWrapWidth,
            _ref$baseline = _ref.baseline,
            baseline = _ref$baseline === undefined ? 'alphabetic' : _ref$baseline,
            _ref$lineJoin = _ref.lineJoin,
            lineJoin = _ref$lineJoin === undefined ? 'miter' : _ref$lineJoin,
            _ref$miterLimit = _ref.miterLimit,
            miterLimit = _ref$miterLimit === undefined ? 10 : _ref$miterLimit,
            _ref$padding = _ref.padding,
            padding = _ref$padding === undefined ? 0 : _ref$padding;

        _classCallCheck(this, TextStyle);

        /**
         * @private
         * @member {String}
         */
        this._align = align;

        /**
         * @private
         * @member {String}
         */
        this._fill = fill;

        /**
         * @private
         * @member {String}
         */
        this._stroke = stroke;

        /**
         * @private
         * @member {Number}
         */
        this._strokeThickness = strokeThickness;

        /**
         * @private
         * @member {Number}
         */
        this._fontSize = fontSize;

        /**
         * @private
         * @member {String}
         */
        this._fontWeight = fontWeight;

        /**
         * @private
         * @member {String}
         */
        this._fontFamily = fontFamily;

        /**
         * @private
         * @member {Boolean}
         */
        this._wordWrap = wordWrap;

        /**
         * @private
         * @member {Number}
         */
        this._wordWrapWidth = wordWrapWidth;

        /**
         * @private
         * @member {String}
         */
        this._baseline = baseline;

        /**
         * @private
         * @member {String}
         */
        this._lineJoin = lineJoin;

        /**
         * @private
         * @member {Number}
         */
        this._miterLimit = miterLimit;

        /**
         * @private
         * @member {Number}
         */
        this._padding = padding;

        /**
         * @private
         * @member {Boolean}
         */
        this._dirty = true;
    }

    /**
     * @public
     * @member {String}
     */


    _createClass(TextStyle, [{
        key: 'apply',


        /**
         * @public
         * @chainable
         * @param {CanvasRenderingContext2D} context
         * @returns {TextStyle}
         */
        value: function apply(context) {
            context.font = this.font;
            context.fillStyle = this.fill;
            context.strokeStyle = this.stroke;
            context.lineWidth = this.strokeThickness;
            context.textBaseline = this.baseline;
            context.lineJoin = this.lineJoin;
            context.miterLimit = this.miterLimit;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {TextStyle} style
         * @returns {TextStyle}
         */

    }, {
        key: 'copy',
        value: function copy(style) {
            if (style !== this) {
                this.align = style.align;
                this.fill = style.fill;
                this.stroke = style.stroke;
                this.strokeThickness = style.strokeThickness;
                this.fontSize = style.fontSize;
                this.fontWeight = style.fontWeight;
                this.fontFamily = style.fontFamily;
                this.wordWrap = style.wordWrap;
                this.wordWrapWidth = style.wordWrapWidth;
                this.baseline = style.baseline;
                this.lineJoin = style.lineJoin;
                this.miterLimit = style.miterLimit;
                this.padding = style.padding;
                this.dirty = style.dirty;
            }

            return this;
        }

        /**
         * @public
         * @returns {TextStyle}
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new TextStyle().copy(this);
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._align = null;
            this._fill = null;
            this._stroke = null;
            this._strokeThickness = null;
            this._fontSize = null;
            this._fontWeight = null;
            this._fontFamily = null;
            this._wordWrap = null;
            this._wordWrapWidth = null;
            this._baseline = null;
            this._lineJoin = null;
            this._miterLimit = null;
            this._padding = null;
            this._dirty = null;
        }
    }, {
        key: 'align',
        get: function get() {
            return this._align;
        },
        set: function set(align) {
            if (this._align !== align) {
                this._align = align;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {String}
         */

    }, {
        key: 'fill',
        get: function get() {
            return this._fill;
        },
        set: function set(fill) {
            if (this._fill !== fill) {
                this._fill = fill;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {String}
         */

    }, {
        key: 'stroke',
        get: function get() {
            return this._stroke;
        },
        set: function set(stroke) {
            if (this._stroke !== stroke) {
                this._stroke = stroke;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'strokeThickness',
        get: function get() {
            return this._strokeThickness;
        },
        set: function set(strokeThickness) {
            if (this._strokeThickness !== strokeThickness) {
                this._strokeThickness = strokeThickness;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'fontSize',
        get: function get() {
            return this._fontSize;
        },
        set: function set(fontSize) {
            if (this._fontSize !== fontSize) {
                this._fontSize = fontSize;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {String}
         */

    }, {
        key: 'fontWeight',
        get: function get() {
            return this._fontWeight;
        },
        set: function set(fontWeight) {
            if (this._fontWeight !== fontWeight) {
                this._fontWeight = fontWeight;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {String}
         */

    }, {
        key: 'fontFamily',
        get: function get() {
            return this._fontFamily;
        },
        set: function set(fontFamily) {
            if (this._fontFamily !== fontFamily) {
                this._fontFamily = fontFamily;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'wordWrap',
        get: function get() {
            return this._wordWrap;
        },
        set: function set(wordWrap) {
            if (this._wordWrap !== wordWrap) {
                this._wordWrap = wordWrap;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'wordWrapWidth',
        get: function get() {
            return this._wordWrapWidth;
        },
        set: function set(wordWrapWidth) {
            if (this._wordWrapWidth !== wordWrapWidth) {
                this._wordWrapWidth = wordWrapWidth;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {String}
         */

    }, {
        key: 'baseline',
        get: function get() {
            return this._baseline;
        },
        set: function set(baseline) {
            if (this._baseline !== baseline) {
                this._baseline = baseline;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {String}
         */

    }, {
        key: 'lineJoin',
        get: function get() {
            return this._lineJoin;
        },
        set: function set(lineJoin) {
            if (this._lineJoin !== lineJoin) {
                this._lineJoin = lineJoin;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'miterLimit',
        get: function get() {
            return this._miterLimit;
        },
        set: function set(miterLimit) {
            if (this._miterLimit !== miterLimit) {
                this._miterLimit = miterLimit;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'padding',
        get: function get() {
            return this._padding;
        },
        set: function set(padding) {
            if (this._padding !== padding) {
                this._padding = padding;
                this._dirty = true;
            }
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'dirty',
        get: function get() {
            return this._dirty;
        },
        set: function set(dirty) {
            this._dirty = dirty;
        }

        /**
         * @public
         * @readonly
         * @member {String}
         */

    }, {
        key: 'font',
        get: function get() {
            return this._fontWeight + ' ' + this._fontSize + 'px ' + this._fontFamily;
        }
    }]);

    return TextStyle;
}();

exports.default = TextStyle;

/***/ }),
/* 68 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Vector = __webpack_require__(3);

var _Vector2 = _interopRequireDefault(_Vector);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _Time = __webpack_require__(11);

var _Time2 = _interopRequireDefault(_Time);

var _const = __webpack_require__(0);

var _ParticleOptions = __webpack_require__(29);

var _ParticleOptions2 = _interopRequireDefault(_ParticleOptions);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Particle
 */
var Particle = function () {

    /**
     * @constructor
     * @param {ParticleOptions|Particle} options
     */
    function Particle(options) {
        _classCallCheck(this, Particle);

        /**
         * @private
         * @member {Time}
         */
        this._elapsedLifetime = options.elapsedLifetime.clone();

        /**
         * @private
         * @member {Time}
         */
        this._totalLifetime = options.totalLifetime.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._position = options.position.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._velocity = options.velocity.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._scale = options.scale.clone();

        /**
         * @private
         * @member {Color}
         */
        this._color = options.color.clone();

        /**
         * @private
         * @member {Number}
         */
        this._rotation = options.rotation;

        /**
         * @private
         * @member {Number}
         */
        this._rotationSpeed = options.rotationSpeed;
    }

    /**
     * @public
     * @member {Vector}
     */


    _createClass(Particle, [{
        key: 'update',


        /**
         * @public
         * @chainable
         * @param {Time} delta
         * @returns {Particle}
         */
        value: function update(delta) {
            var seconds = delta.seconds;

            this._elapsedLifetime.add(delta);
            this._position.add(seconds * this._velocity.x, seconds * this._velocity.y);
            this._rotation += seconds * this._rotationSpeed;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {ParticleOptions} options
         * @returns {Particle}
         */

    }, {
        key: 'reset',
        value: function reset(options) {
            this._elapsedLifetime.set(0, _const.TIME.SECONDS);
            this._totalLifetime.copy(options.totalLifetime);
            this._position.copy(options.position);
            this._velocity.copy(options.velocity);
            this._scale.copy(options.scale);
            this._color.copy(options.color);
            this._rotation = options.rotation;
            this._rotationSpeed = options.rotationSpeed;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Particle} particle
         * @returns {Particle}
         */

    }, {
        key: 'copy',
        value: function copy(particle) {
            this._elapsedLifetime.copy(particle.elapsedLifetime);
            this._totalLifetime.copy(particle.totalLifetime);
            this._position.copy(particle.position);
            this._velocity.copy(particle.velocity);
            this._scale.copy(particle.scale);
            this._color.copy(particle.color);
            this._rotation = particle.rotation;
            this._rotationSpeed = particle.rotationSpeed;

            return this;
        }

        /**
         * @public
         * @returns {Particle}
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new Particle(this);
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._elapsedLifetime.destroy();
            this._elapsedLifetime = null;

            this._totalLifetime.destroy();
            this._totalLifetime = null;

            this._position.destroy();
            this._position = null;

            this._velocity.destroy();
            this._velocity = null;

            this._scale.destroy();
            this._scale = null;

            this._color.destroy();
            this._color = null;

            this._rotation = null;
            this._rotationSpeed = null;
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
        set: function set(degrees) {
            var rotation = degrees % 360;

            this._rotation = rotation < 0 ? rotation + 360 : rotation;
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
            this._scale.copy(scale);
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
            return _Time2.default.Temp.set(this._totalLifetime.milliseconds - this._elapsedLifetime.milliseconds);
        }

        /**
         * @public
         * @readonly
         * @member {Time}
         */

    }, {
        key: 'elapsedRatio',
        get: function get() {
            return this._elapsedLifetime.milliseconds / this._totalLifetime.milliseconds;
        }

        /**
         * @public
         * @readonly
         * @member {Time}
         */

    }, {
        key: 'remainingRatio',
        get: function get() {
            return this.remainingLifetime.milliseconds / this._totalLifetime.milliseconds;
        }

        /**
         * @public
         * @readonly
         * @member {Boolean}
         */

    }, {
        key: 'isExpired',
        get: function get() {
            return this._elapsedLifetime.greaterThan(this._totalLifetime);
        }
    }]);

    return Particle;
}();

exports.default = Particle;

/***/ }),
/* 69 */
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

var _content = __webpack_require__(70);

Object.keys(_content).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _content[key];
        }
    });
});

var _core = __webpack_require__(73);

Object.keys(_core).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _core[key];
        }
    });
});

var _graphics = __webpack_require__(82);

Object.keys(_graphics).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _graphics[key];
        }
    });
});

var _particles = __webpack_require__(86);

Object.keys(_particles).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _particles[key];
        }
    });
});

var _input = __webpack_require__(91);

Object.keys(_input).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _input[key];
        }
    });
});

var _math = __webpack_require__(93);

Object.keys(_math).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _math[key];
        }
    });
});

var _media = __webpack_require__(95);

Object.keys(_media).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _media[key];
        }
    });
});

var _support = __webpack_require__(4);

var support = _interopRequireWildcard(_support);

var _utils = __webpack_require__(1);

var utils = _interopRequireWildcard(_utils);

var _settings = __webpack_require__(2);

var settings = _interopRequireWildcard(_settings);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

exports.support = support;
exports.utils = utils;
exports.settings = settings; /**
                              * @namespace Exo
                              */

/***/ }),
/* 70 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _Database = __webpack_require__(71);

Object.defineProperty(exports, 'Database', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Database).default;
  }
});

var _ResourceLoader = __webpack_require__(30);

Object.defineProperty(exports, 'ResourceLoader', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ResourceLoader).default;
  }
});

var _ResourceContainer = __webpack_require__(31);

Object.defineProperty(exports, 'ResourceContainer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ResourceContainer).default;
  }
});

var _ResourceFactory = __webpack_require__(15);

Object.defineProperty(exports, 'ResourceFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ResourceFactory).default;
  }
});

var _BlobFactory = __webpack_require__(19);

Object.defineProperty(exports, 'BlobFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_BlobFactory).default;
  }
});

var _FontFactory = __webpack_require__(32);

Object.defineProperty(exports, 'FontFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_FontFactory).default;
  }
});

var _ArrayBufferFactory = __webpack_require__(12);

Object.defineProperty(exports, 'ArrayBufferFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ArrayBufferFactory).default;
  }
});

var _MediaSourceFactory = __webpack_require__(13);

Object.defineProperty(exports, 'MediaSourceFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_MediaSourceFactory).default;
  }
});

var _MusicFactory = __webpack_require__(34);

Object.defineProperty(exports, 'MusicFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_MusicFactory).default;
  }
});

var _SoundFactory = __webpack_require__(40);

Object.defineProperty(exports, 'SoundFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SoundFactory).default;
  }
});

var _VideoFactory = __webpack_require__(44);

Object.defineProperty(exports, 'VideoFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_VideoFactory).default;
  }
});

var _ImageFactory = __webpack_require__(20);

Object.defineProperty(exports, 'ImageFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ImageFactory).default;
  }
});

var _TextureFactory = __webpack_require__(43);

Object.defineProperty(exports, 'TextureFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_TextureFactory).default;
  }
});

var _JSONFactory = __webpack_require__(33);

Object.defineProperty(exports, 'JSONFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_JSONFactory).default;
  }
});

var _StringFactory = __webpack_require__(42);

Object.defineProperty(exports, 'StringFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_StringFactory).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 71 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _support = __webpack_require__(4);

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
        key: 'deleteDatabase',
        value: function deleteDatabase() {
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
/* 72 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Transformable2 = __webpack_require__(47);

var _Transformable3 = _interopRequireDefault(_Transformable2);

var _Matrix = __webpack_require__(10);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _Rectangle = __webpack_require__(5);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Bounds = __webpack_require__(17);

var _Bounds2 = _interopRequireDefault(_Bounds);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SceneNode
 * @extends Transformable
 */
var SceneNode = function (_Transformable) {
    _inherits(SceneNode, _Transformable);

    /**
     * @constructor
     */
    function SceneNode() {
        _classCallCheck(this, SceneNode);

        /**
         * @private
         * @member {?SceneNode}
         */
        var _this = _possibleConstructorReturn(this, (SceneNode.__proto__ || Object.getPrototypeOf(SceneNode)).call(this));

        _this._parent = null;

        /**
         * @private
         * @member {Boolean}
         */
        _this._active = true;

        /**
         * @private
         * @member {Matrix}
         */
        _this._globalTransform = new _Matrix2.default();

        /**
         * @private
         * @member {Rectangle}
         */
        _this._localBounds = new _Rectangle2.default();

        /**
         * @private
         * @member {Bounds}
         */
        _this._bounds = new _Bounds2.default();
        return _this;
    }

    /**
     * @public
     * @member {?Scene}
     */


    _createClass(SceneNode, [{
        key: 'getLocalBounds',


        /**
         * @public
         * @returns {Rectangle}
         */
        value: function getLocalBounds() {
            return this._localBounds;
        }

        /**
         * @public
         * @returns {Rectangle}
         */

    }, {
        key: 'getBounds',
        value: function getBounds() {
            this.updateParentTransforms();
            this.updateBounds();

            return this._bounds.getRect();
        }

        /**
         * @public
         * @chainable
         * @returns {SceneNode}
         */

    }, {
        key: 'updateBounds',
        value: function updateBounds() {
            this._bounds.reset().addRect(this.getLocalBounds(), this.getGlobalTransform());

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {SceneNode}
         */

    }, {
        key: 'updateParentTransforms',
        value: function updateParentTransforms() {
            if (this._parent) {
                this._parent.updateParentTransforms();
            }

            if (this._updateTransform) {
                this.updateTransform();
                this._updateTransform = false;
            }

            return this;
        }

        /**
         * @public
         * @returns {Matrix}
         */

    }, {
        key: 'getGlobalTransform',
        value: function getGlobalTransform() {
            this._globalTransform.copy(this.getTransform());

            if (this._parent) {
                this._globalTransform.combine(this._parent.getGlobalTransform());
            }

            return this._globalTransform;
        }

        /**
         * @public
         * @param {Number} x
         * @param {Number} [y=x]
         * @param {Boolean} [relative=true]
         * @returns {SceneNode}
         */

    }, {
        key: 'setOrigin',
        value: function setOrigin(x) {
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : x;
            var relative = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;

            if (relative) {
                var bounds = this.getBounds();

                x *= bounds.width;
                y *= bounds.height;
            }

            this.origin.set(x, y);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(SceneNode.prototype.__proto__ || Object.getPrototypeOf(SceneNode.prototype), 'destroy', this).call(this);

            this._globalTransform.destroy();
            this._globalTransform = null;

            this._localBounds.destroy();
            this._localBounds = null;

            this._bounds.destroy();
            this._bounds = null;

            this._parent = null;
            this._active = null;
        }
    }, {
        key: 'scene',
        get: function get() {
            return this._scene;
        },
        set: function set(scene) {
            this._scene = scene;
        }

        /**
         * @public
         * @member {?SceneNode}
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
         * @member {Boolean}
         */

    }, {
        key: 'active',
        get: function get() {
            return this._active;
        },
        set: function set(active) {
            this._active = active;
        }

        /**
         * @public
         * @readonly
         * @member {Matrix}
         */

    }, {
        key: 'globalTransform',
        get: function get() {
            return this.getGlobalTransform();
        }

        /**
         * @public
         * @readonly
         * @member {Rectangle}
         */

    }, {
        key: 'localBounds',
        get: function get() {
            return this.getLocalBounds();
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
    }]);

    return SceneNode;
}(_Transformable3.default);

exports.default = SceneNode;

/***/ }),
/* 73 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _EventEmitter = __webpack_require__(6);

Object.defineProperty(exports, 'EventEmitter', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_EventEmitter).default;
  }
});

var _Application = __webpack_require__(74);

Object.defineProperty(exports, 'Application', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Application).default;
  }
});

var _Quadtree = __webpack_require__(77);

Object.defineProperty(exports, 'Quadtree', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Quadtree).default;
  }
});

var _Scene = __webpack_require__(78);

Object.defineProperty(exports, 'Scene', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Scene).default;
  }
});

var _SceneManager = __webpack_require__(48);

Object.defineProperty(exports, 'SceneManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SceneManager).default;
  }
});

var _Color = __webpack_require__(8);

Object.defineProperty(exports, 'Color', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Color).default;
  }
});

var _Time = __webpack_require__(11);

Object.defineProperty(exports, 'Time', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Time).default;
  }
});

var _Clock = __webpack_require__(24);

Object.defineProperty(exports, 'Clock', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Clock).default;
  }
});

var _Timer = __webpack_require__(79);

Object.defineProperty(exports, 'Timer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Timer).default;
  }
});

var _Bounds = __webpack_require__(17);

Object.defineProperty(exports, 'Bounds', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Bounds).default;
  }
});

var _Random = __webpack_require__(80);

Object.defineProperty(exports, 'Random', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Random).default;
  }
});

var _Collision = __webpack_require__(81);

Object.defineProperty(exports, 'Collision', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Collision).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 74 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(6);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _Clock = __webpack_require__(24);

var _Clock2 = _interopRequireDefault(_Clock);

var _SceneManager = __webpack_require__(48);

var _SceneManager2 = _interopRequireDefault(_SceneManager);

var _DisplayManager = __webpack_require__(49);

var _DisplayManager2 = _interopRequireDefault(_DisplayManager);

var _InputManager = __webpack_require__(60);

var _InputManager2 = _interopRequireDefault(_InputManager);

var _ResourceLoader = __webpack_require__(30);

var _ResourceLoader2 = _interopRequireDefault(_ResourceLoader);

var _settings = __webpack_require__(2);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Application
 * @extends EventEmitter
 */
var Application = function (_EventEmitter) {
    _inherits(Application, _EventEmitter);

    /**
     * @constructor
     * @param {Object} [options]
     * @param {String} [options.basePath='']
     * @param {Number} [options.width=800]
     * @param {Number} [options.height=600]
     * @param {?HTMLCanvasElement|?String} [options.canvas=null]
     * @param {?HTMLCanvasElement|?String} [options.canvasParent=null]
     * @param {Color} [options.blendMode=BLEND_MODES.NORMAL]
     * @param {Color} [options.clearColor=Color.White]
     * @param {Boolean} [options.clearBeforeRender=true]
     * @param {Object} [options.contextOptions]
     */
    function Application(options) {
        _classCallCheck(this, Application);

        var _this = _possibleConstructorReturn(this, (Application.__proto__ || Object.getPrototypeOf(Application)).call(this));

        var config = Object.assign({}, _settings2.default.GAME_CONFIG, options);

        /**
         * @private
         * @member {Object}
         */
        _this._config = config;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        _this._canvas = config.canvas instanceof HTMLCanvasElement ? config.canvas : document.createElement('canvas');

        /**
         * @private
         * @member {HTMLElement}
         */
        _this._canvasParent = (typeof config.canvasParent === 'string' ? document.querySelector(config.canvasParent) : config.canvasParent) || null;

        /**
         * @private
         * @member {ResourceLoader}
         */
        _this._loader = new _ResourceLoader2.default(config);

        /**
         * @private
         * @member {DisplayManager}
         */
        _this._displayManager = new _DisplayManager2.default(_this, config);

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
        _this._updateHandler = _this.update.bind(_this);

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
        _this._isRunning = false;

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


    _createClass(Application, [{
        key: 'start',


        /**
         * @public
         * @chainable
         * @param {Scene} scene
         * @returns {Application}
         */
        value: function start(scene) {
            if (!this._isRunning) {
                this._isRunning = true;
                this._sceneManager.changeScene(scene);
                this._delta.restart();

                this._updateId = requestAnimationFrame(this._updateHandler);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Application}
         */

    }, {
        key: 'stop',
        value: function stop() {
            if (this._isRunning) {
                this._isRunning = false;
                this._sceneManager.stopScene();
                this._delta.stop();

                cancelAnimationFrame(this._updateId);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Application}
         */

    }, {
        key: 'update',
        value: function update() {
            if (this._isRunning) {
                this._inputManager.update();
                this._sceneManager.update(this._delta.elapsedTime);
                this._delta.restart();

                this._updateId = requestAnimationFrame(this._updateHandler);
            }

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Application.prototype.__proto__ || Object.getPrototypeOf(Application.prototype), 'destroy', this).call(this);

            if (this._isRunning) {
                this.stop();
            }

            if (this._canvasParent) {
                this._canvasParent.removeChild(this._canvas);
            }

            this._loader.destroy();
            this._loader = null;

            this._inputManager.destroy();
            this._inputManager = null;

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
            this._isRunning = null;
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

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'FPS',
        get: function get() {
            return 1000 / this._delta.elapsedTime.milliseconds;
        }
    }]);

    return Application;
}(_EventEmitter3.default);

exports.default = Application;

/***/ }),
/* 75 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Program
 */
var Program = function () {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context
     * @param {String} vertexSource
     * @param {String} fragmentSource
     */
    function Program(context, vertexSource, fragmentSource) {
        _classCallCheck(this, Program);

        if (!context) {
            throw new Error('No Rendering Context was provided.');
        }

        /**
         * @private
         * @member {WebGLRenderingContext}
         */
        this._context = context;

        /**
         * @private
         * @member {WebGLShader}
         */
        this._vertexShader = this.createShader(context.VERTEX_SHADER, vertexSource);

        /**
         * @private
         * @member {WebGLShader}
         */
        this._fragmentShader = this.createShader(context.FRAGMENT_SHADER, fragmentSource);

        /**
         * @private
         * @member {WebGLProgram}
         */
        this._program = this.createProgram(this._vertexShader, this._fragmentShader);

        /**
         * @private
         * @member {Map<String, WebGLUniformLocation>}
         */
        this._uniformLocations = new Map();

        /**
         * @private
         * @member {Map<String, Number>}
         */
        this._attributeLocations = new Map();
    }

    /**
     * @public
     * @param {Number} type
     * @param {String} source
     * @returns {WebGLShader}
     */


    _createClass(Program, [{
        key: 'createShader',
        value: function createShader(type, source) {
            var gl = this._context,
                shader = gl.createShader(type);

            gl.shaderSource(shader, source);
            gl.compileShader(shader);

            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.log(gl.getShaderInfoLog(shader)); // eslint-disable-line

                return null;
            }

            return shader;
        }

        /**
         * @public
         * @param {WebGLShader} vertexShader
         * @param {WebGLShader} fragmentShader
         * @returns {?WebGLProgram}
         */

    }, {
        key: 'createProgram',
        value: function createProgram(vertexShader, fragmentShader) {
            var gl = this._context,
                program = gl.createProgram();

            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);

            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                gl.detachShader(program, vertexShader);
                gl.detachShader(program, fragmentShader);

                gl.deleteProgram(program);

                console.error('gl.VALIDATE_STATUS', gl.getProgramParameter(program, gl.VALIDATE_STATUS)); // eslint-disable-line
                console.error('gl.getError()', gl.getError()); // eslint-disable-line

                if (gl.getProgramInfoLog(program)) {
                    console.warn('gl.getProgramInfoLog()', gl.getProgramInfoLog(program)); // eslint-disable-line
                }

                return null;
            }

            return program;
        }

        /**
         * @public
         * @param {String} uniform
         * @returns {WebGLUniformLocation}
         */

    }, {
        key: 'getUniformLocation',
        value: function getUniformLocation(uniform) {
            if (!this._uniformLocations.has(uniform)) {
                var location = this._context.getUniformLocation(this._program, uniform);

                if (!location) {
                    throw new Error('Uniform "' + this._name + '" is not available.');
                }

                this._uniformLocations.set(uniform, location);
            }

            return this._uniformLocations.get(uniform);
        }

        /**
         * @public
         * @param {String} attribute
         * @returns {Number}
         */

    }, {
        key: 'getAttributeLocation',
        value: function getAttributeLocation(attribute) {
            if (!this._attributeLocations.has(attribute)) {
                var location = this._context.getAttribLocation(this._program, attribute);

                if (location === -1) {
                    throw new Error('Attribute "' + this._name + '" is not available.');
                }

                this._attributeLocations.set(attribute, location);
            }

            return this._attributeLocations.get(attribute);
        }

        /**
         * @public
         * @chainable
         * @param {String} uniform
         * @param {Number|Number[]|ArrayBufferView|Texture} value
         * @param {Number} type
         * @returns {Program}
         */

    }, {
        key: 'setUniformValue',
        value: function setUniformValue(uniform, value, type) {
            var gl = this._context,
                location = this.getUniformLocation(uniform);

            switch (type) {
                case _const.UNIFORM_TYPE.INT:
                    gl.uniform1i(location, value);break;
                case _const.UNIFORM_TYPE.FLOAT:
                    gl.uniform1f(location, value);break;
                case _const.UNIFORM_TYPE.FLOAT_VEC2:
                    gl.uniform2fv(location, value);break;
                case _const.UNIFORM_TYPE.FLOAT_VEC3:
                    gl.uniform3fv(location, value);break;
                case _const.UNIFORM_TYPE.FLOAT_VEC4:
                    gl.uniform4fv(location, value);break;
                case _const.UNIFORM_TYPE.INT_VEC2:
                    gl.uniform2iv(location, value);break;
                case _const.UNIFORM_TYPE.INT_VEC3:
                    gl.uniform3iv(location, value);break;
                case _const.UNIFORM_TYPE.INT_VEC4:
                    gl.uniform4iv(location, value);break;
                case _const.UNIFORM_TYPE.BOOL:
                    gl.uniform1i(location, value);break;
                case _const.UNIFORM_TYPE.BOOL_VEC2:
                    gl.uniform2iv(location, value);break;
                case _const.UNIFORM_TYPE.BOOL_VEC3:
                    gl.uniform3iv(location, value);break;
                case _const.UNIFORM_TYPE.BOOL_VEC4:
                    gl.uniform4iv(location, value);break;
                case _const.UNIFORM_TYPE.FLOAT_MAT2:
                    gl.uniformMatrix2fv(location, false, value);break;
                case _const.UNIFORM_TYPE.FLOAT_MAT3:
                    gl.uniformMatrix3fv(location, false, value);break;
                case _const.UNIFORM_TYPE.FLOAT_MAT4:
                    gl.uniformMatrix4fv(location, false, value);break;
                case _const.UNIFORM_TYPE.SAMPLER_2D:
                    gl.uniform1i(location, value);break;
                default:
                    throw new Error('Unknown uniform type "' + type + '".');
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} attribute
         * @param {Number} size
         * @param {Number} type
         * @param {boolean} normalized
         * @param {Number} stride
         * @param {Number} offset
         * @returns {Program}
         */

    }, {
        key: 'setVertexPointer',
        value: function setVertexPointer(attribute, size, type, normalized, stride, offset) {
            var gl = this._context,
                location = this.getAttributeLocation(attribute);

            gl.vertexAttribPointer(location, size, type, normalized, stride, offset);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} attribute
         * @param {Boolean} enabled
         * @returns {Program}
         */

    }, {
        key: 'toggleVertexArray',
        value: function toggleVertexArray(attribute, enabled) {
            var gl = this._context,
                location = this.getAttributeLocation(attribute);

            if (enabled) {
                gl.enableVertexAttribArray(location);
            } else {
                gl.disableVertexAttribArray(location);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Program}
         */

    }, {
        key: 'bind',
        value: function bind() {
            this._context.useProgram(this._program);

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Program}
         */

    }, {
        key: 'unbind',
        value: function unbind() {
            this._context.useProgram(null);

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            var gl = this._context;

            gl.deleteShader(this._vertexShader);
            gl.deleteShader(this._fragmentShader);
            gl.deleteProgram(this._program);

            this._uniformLocations.clear();
            this._uniformLocations = null;

            this._attributeLocations.clear();
            this._attributeLocations = null;

            this._context = null;
            this._vertexShader = null;
            this._fragmentShader = null;
            this._program = null;
        }
    }]);

    return Program;
}();

exports.default = Program;

/***/ }),
/* 76 */
/***/ (function(module, exports) {

// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };


/***/ }),
/* 77 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Rectangle = __webpack_require__(5);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _settings = __webpack_require__(2);

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
    function Quadtree() {
        var bounds = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : _Rectangle2.default.Empty;
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
        this._nodes = new Map();

        /**
         * @private
         * @member {Set<SceneNode>}
         */
        this._children = new Set();
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
                for (var _iterator = this._nodes.values()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var node = _step.value;

                    node.clear();
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

            this._nodes.clear();
            this._children.clear();

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {SceneNode} child
         * @returns {Quadtree}
         */

    }, {
        key: 'insert',
        value: function insert(child) {
            var children = this._children,
                node = this._getNode(child);

            if (node) {
                node.insert(child);

                return this;
            }

            children.add(child);

            if (children.size > _settings2.default.QUAD_TREE_MAX_OBJECTS && this._level < _settings2.default.QUAD_TREE_MAX_LEVEL) {
                this._split();

                var _iteratorNormalCompletion2 = true;
                var _didIteratorError2 = false;
                var _iteratorError2 = undefined;

                try {
                    for (var _iterator2 = children[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                        var _child = _step2.value;

                        var _node = this._getNode(_child);

                        if (_node) {
                            children.delete(_child);
                            _node.insert(_child);
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
         * @param {SceneNode} child
         * @returns {SceneNode[]}
         */

    }, {
        key: 'getRelatedChildren',
        value: function getRelatedChildren(child) {
            var node = this._getNode(child);

            return node ? [].concat(_toConsumableArray(node.getRelatedChildren(child)), _toConsumableArray(this._children)) : [].concat(_toConsumableArray(this._children));
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._bounds.destroy();
            this._bounds = null;

            this._nodes.clear();
            this._nodes = null;

            this._children.clear();
            this._children = null;

            this._level = null;
        }

        /**
         * @private
         */

    }, {
        key: '_split',
        value: function _split() {
            if (!this._nodes.size) {
                return;
            }

            var rect = _Rectangle2.default.Temp,
                nodeLevel = this._level + 1,
                bounds = this._bounds,
                width = bounds.width / 2 | 0,
                height = bounds.height / 2 | 0,
                left = bounds.left,
                top = bounds.top,
                right = left + width,
                bottom = top + height;

            this._nodes.set(0, new Quadtree(rect.set(left, top, width, height), nodeLevel)).set(1, new Quadtree(rect.set(right, top, width, height), nodeLevel)).set(2, new Quadtree(rect.set(left, bottom, width, height), nodeLevel)).set(3, new Quadtree(rect.set(right, bottom, width, height), nodeLevel));
        }

        /**
         * @private
         * @param {SceneNode} child
         * @returns {?Quadtree}
         */

    }, {
        key: '_getNode',
        value: function _getNode(child) {
            var bounds = child.getBounds();

            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {
                for (var _iterator3 = this._nodes.values()[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                    var node = _step3.value;

                    if (bounds.containsRect(node.getBounds())) {
                        return node;
                    }
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
        key: 'nodes',
        get: function get() {
            return this._nodes;
        }

        /**
         * @public
         * @readonly
         * @member {Set<SceneNode>}
         */

    }, {
        key: 'children',
        get: function get() {
            return this._children;
        }
    }]);

    return Quadtree;
}();

exports.default = Quadtree;

/***/ }),
/* 78 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(6);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _Bounds = __webpack_require__(17);

var _Bounds2 = _interopRequireDefault(_Bounds);

var _Rectangle = __webpack_require__(5);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Scene
 * @extends EventEmitter
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
         * @member {Application}
         */
        var _this = _possibleConstructorReturn(this, (Scene.__proto__ || Object.getPrototypeOf(Scene)).call(this));

        _this._app = null;

        if (prototype) {
            Object.assign(_this, prototype);
        }
        return _this;
    }

    /**
     * @public
     * @member {Application}
     */


    _createClass(Scene, [{
        key: 'load',


        /**
         * @public
         * @param {ResourceLoader} loader
         */
        value: function load(loader) {} // eslint-disable-line
        // do nothing


        /**
         * @public
         * @param {ResourceContainer} resources
         */

    }, {
        key: 'init',
        value: function init(resources) {} // eslint-disable-line
        // do nothing


        /**
         * @public
         * @param {Time} delta
         */

    }, {
        key: 'update',
        value: function update(delta) {} // eslint-disable-line
        // do nothing


        /**
         * @public
         */

    }, {
        key: 'unload',
        value: function unload() {}
        // do nothing


        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Scene.prototype.__proto__ || Object.getPrototypeOf(Scene.prototype), 'destroy', this).call(this);

            this._app = null;
        }
    }, {
        key: 'app',
        get: function get() {
            return this._app;
        },
        set: function set(app) {
            this._app = app;
        }
    }]);

    return Scene;
}(_EventEmitter3.default);

exports.default = Scene;

/***/ }),
/* 79 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _Clock2 = __webpack_require__(24);

var _Clock3 = _interopRequireDefault(_Clock2);

var _Time = __webpack_require__(11);

var _Time2 = _interopRequireDefault(_Time);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Timer
 * @extends Clock
 */
var Timer = function (_Clock) {
    _inherits(Timer, _Clock);

    /**
     * @constructor
     * @param {Boolean} autoStart
     * @param {Number} [timeLimit=0]
     * @param {Number} [factor=TIME.MILLISECONDS]
     */
    function Timer(autoStart) {
        var timeLimit = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        var factor = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : _const.TIME.MILLISECONDS;

        _classCallCheck(this, Timer);

        /**
         * @private
         * @member {Number}
         */
        var _this = _possibleConstructorReturn(this, (Timer.__proto__ || Object.getPrototypeOf(Timer)).call(this, false));

        _this._limit = timeLimit;

        if (autoStart) {
            _this.restart(timeLimit, factor);
        }
        return _this;
    }

    /**
     * @override
     */


    _createClass(Timer, [{
        key: 'reset',


        /**
         * @public
         * @chainable
         * @param {Number} [timeLimit=this._limit]
         * @param {Number} [factor=TIME.MILLISECONDS]
         * @returns {Timer}
         */
        value: function reset() {
            var timeLimit = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._limit;
            var factor = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _const.TIME.MILLISECONDS;

            this._limit = timeLimit * factor;
            this._timeBuffer = 0;
            this._isRunning = false;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} [timeLimit=this._limit]
         * @param {Number} [factor=TIME.MILLISECONDS]
         * @returns {Timer}
         */

    }, {
        key: 'restart',
        value: function restart() {
            var timeLimit = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._limit;
            var factor = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _const.TIME.MILLISECONDS;

            this.reset(timeLimit, factor);
            this.start();

            return this;
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
            return this.elapsedMilliseconds >= this._limit;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'remainingMilliseconds',
        get: function get() {
            return Math.max(0, this._limit - this.elapsedMilliseconds);
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'remainingSeconds',
        get: function get() {
            return this.remainingMilliseconds / _const.TIME.SECONDS;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'remainingMinutes',
        get: function get() {
            return this.remainingMilliseconds / _const.TIME.MINUTES;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'remainingHours',
        get: function get() {
            return this.remainingMilliseconds / _const.TIME.HOURS;
        }
    }]);

    return Timer;
}(_Clock3.default);

exports.default = Timer;

/***/ }),
/* 80 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var limit = Math.pow(2, 32) - 1;

/**
 * @class Random
 */

var Random = function () {

    /**
     * @constructor
     * @param {Number} [seed]
     */
    function Random(seed) {
        _classCallCheck(this, Random);

        /**
         * @private
         * @type {Number[]}
         */
        this._state = new Uint32Array(624);

        /**
         * @private
         * @type {Number}
         */
        this._iteration = 0;

        /**
         * @private
         * @type {?Number}
         */
        this._seed = null;

        /**
         * @private
         * @type {?Number}
         */
        this._value = null;

        this.seed = seed;

        this._twist();
    }

    /**
     * @public
     * @readonly
     * @member {?Number}
     */


    _createClass(Random, [{
        key: "reset",


        /**
         * @public
         * @returns {Random}
         */
        value: function reset() {
            this._state[0] = this._seed;

            for (var i = 1; i < 624; i++) {
                var s = this._state[i - 1] ^ this._state[i - 1] >>> 30;

                this._state[i] = (((s & 0xffff0000) >>> 16) * 1812433253 << 16) + (s & 0x0000ffff) * 1812433253 + i;
                this._state[i] |= 0;
            }

            this._iteration = 0;

            return this;
        }

        /**
         * @public
         * @param {Number} [min=0]
         * @param {Number} [max=1]
         * @returns {Number}
         */

    }, {
        key: "next",
        value: function next() {
            var min = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var max = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

            if (this._iteration >= 624) {
                this._twist();
            }

            this._value = this._state[this._iteration++];
            this._value ^= this._value >>> 11;
            this._value ^= this._value << 7 & 0x9d2c5680;
            this._value ^= this._value << 15 & 0xefc60000;
            this._value ^= this._value >>> 18;
            this._value = (this._value >>> 0) / limit * (max - min) + min;

            return this._value;
        }

        /**
         * @public
         */

    }, {
        key: "destroy",
        value: function destroy() {
            this._state = null;
            this._iteration = null;
            this._seed = null;
            this._value = null;
        }

        /**
         * @private
         */

    }, {
        key: "_twist",
        value: function _twist() {
            var state = this._state;

            // first 624-397=227 words
            for (var i = 0; i < 227; i++) {
                var bits = state[i] & 0x80000000 | state[i + 1] & 0x7fffffff;

                state[i] = state[i + 397] ^ bits >>> 1 ^ (bits & 1) * 0x9908b0df;
            }

            // remaining words (except the very last one)
            for (var _i = 227; _i < 623; _i++) {
                var bits = state[_i] & 0x80000000 | state[_i + 1] & 0x7fffffff;

                state[_i] = state[_i - 227] ^ bits >>> 1 ^ (bits & 1) * 0x9908b0df;
            }

            // last word is computed pretty much the same way, but i + 1 must wrap around to 0
            var bits = state[623] & 0x80000000 | state[0] & 0x7fffffff;

            state[623] = state[396] ^ bits >>> 1 ^ (bits & 1) * 0x9908b0df;

            // word used for next random number
            this._iteration = 0;
            this._value = null;
        }
    }, {
        key: "seed",
        get: function get() {
            return this._value;
        },
        set: function set(seed) {
            this._seed = seed;
            this.reset();

            return this;
        }

        /**
         * @public
         * @readonly
         * @member {?Number}
         */

    }, {
        key: "value",
        get: function get() {
            return this._value;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: "iteration",
        get: function get() {
            return this._iteration;
        }
    }]);

    return Random;
}();

exports.default = Random;

/***/ }),
/* 81 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Vector = __webpack_require__(3);

var _Vector2 = _interopRequireDefault(_Vector);

var _Interval = __webpack_require__(28);

var _Interval2 = _interopRequireDefault(_Interval);

var _Polygon = __webpack_require__(66);

var _Polygon2 = _interopRequireDefault(_Polygon);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Collision
 */
var Collision = function () {

    /**
     * @constructor
     * @param {Object} options
     * @param {*} options.shapeA
     * @param {*} options.shapeB
     * @param {Number} options.distance
     * @param {Vector} options.separation
     * @param {Boolean} options.shapeAInB
     * @param {Boolean} options.shapeBInA
     */
    function Collision() {
        var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
            shapeA = _ref.shapeA,
            shapeB = _ref.shapeB,
            _ref$distance = _ref.distance,
            distance = _ref$distance === undefined ? 0 : _ref$distance,
            _ref$separation = _ref.separation,
            separation = _ref$separation === undefined ? _Vector2.default.Empty : _ref$separation,
            _ref$shapeAInB = _ref.shapeAInB,
            shapeAInB = _ref$shapeAInB === undefined ? false : _ref$shapeAInB,
            _ref$shapeBInA = _ref.shapeBInA,
            shapeBInA = _ref$shapeBInA === undefined ? false : _ref$shapeBInA;

        _classCallCheck(this, Collision);

        /**
         * @private
         * @member {*}
         */
        this._shapeA = shapeA;

        /**
         * @private
         * @member {*}
         */
        this._shapeB = shapeB;

        /**
         * @private
         * @member {Number}
         */
        this._distance = distance;

        /**
         * @private
         * @member {Vector}
         */
        this._separation = separation.clone();

        /**
         * @private
         * @member {Boolean}
         */
        this._shapeAInB = shapeAInB;

        /**
         * @private
         * @member {Boolean}
         */
        this._shapeBInA = shapeBInA;
    }

    /**
     * @public
     * @member {*}
     */


    _createClass(Collision, [{
        key: 'destroy',


        /**
         * @public
         */
        value: function destroy() {
            this._shapeA = null;
            this._shapeB = null;
            this._distance = null;
            this._separation = null;
            this._shapeAInB = null;
            this._shapeBInA = null;
        }

        /**
         * @public
         * @static
         * @param {Polygon} polygonA
         * @param {Polygon} polygonB
         * @returns {?Collision}
         */

    }, {
        key: 'shapeA',
        get: function get() {
            return this._shapeA;
        },
        set: function set(value) {
            this._shapeA = value;
        }

        /**
         * @public
         * @member {*}
         */

    }, {
        key: 'shapeB',
        get: function get() {
            return this._shapeB;
        },
        set: function set(value) {
            this._shapeB = value;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'distance',
        get: function get() {
            return this._distance;
        },
        set: function set(value) {
            this._distance = value;
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'separation',
        get: function get() {
            return this._separation;
        },
        set: function set(value) {
            this._separation.copy(value);
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'shapeAInB',
        get: function get() {
            return this._shapeAInB;
        },
        set: function set(value) {
            this._shapeAInB = value;
        }

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'shapeBInA',
        get: function get() {
            return this._shapeBInA;
        },
        set: function set(value) {
            this._shapeBInA = value;
        }
    }], [{
        key: 'checkPolygonPolygon',
        value: function checkPolygonPolygon(polygonA, polygonB) {
            var axis = _Vector2.default.Temp,
                pointsA = polygonA.points,
                pointsB = polygonB.points,
                lenA = pointsA.length,
                lenB = pointsB.length,
                projA = new _Interval2.default(),
                projB = new _Interval2.default(),
                separation = new _Vector2.default();

            var containsA = false,
                containsB = false,
                shapeAInB = true,
                shapeBInA = true,
                distance = Infinity,
                overlap = void 0;

            for (var i = 0; i < lenA; i++) {
                var point = pointsA[i],
                    nextPoint = pointsA[(i + 1) % lenA];

                axis.copy(nextPoint).subtract(point.x, point.y).perp();

                polygonA.project(axis, projA);
                polygonB.project(axis, projB);

                if (!projA.overlaps(projB)) {
                    return null;
                }

                containsA = projB.contains(projA);
                containsB = projA.contains(projB);

                if (!containsA && shapeAInB) {
                    shapeAInB = false;
                }

                if (!containsB && shapeBInA) {
                    shapeBInA = false;
                }

                overlap = projA.getOverlap(projB);

                if (containsA || containsB) {
                    overlap += Math.min(Math.abs(projA.min - projB.min), Math.abs(projA.max - projB.max));
                }

                if (overlap < distance) {
                    distance = overlap;
                    separation.copy(axis);
                }
            }

            for (var _i = 0; _i < lenB; _i++) {
                var _point = pointsB[_i],
                    _nextPoint = pointsB[(_i + 1) % lenB];

                axis.copy(_nextPoint).subtract(_point.x, _point.y).perp();

                polygonA.project(axis, projA);
                polygonB.project(axis, projB);

                if (!projA.overlaps(projB)) {
                    return null;
                }

                containsA = projB.contains(projA);
                containsB = projA.contains(projB);

                if (!containsA && shapeAInB) {
                    shapeAInB = false;
                }

                if (!containsB && shapeBInA) {
                    shapeBInA = false;
                }

                overlap = projA.getOverlap(projB);

                if (containsA || containsB) {
                    overlap += Math.min(Math.abs(projA.min - projB.min), Math.abs(projA.max - projB.max));
                }

                if (overlap < distance) {
                    distance = overlap;
                    separation.copy(axis);
                }
            }

            return new Collision({
                shapeA: polygonA,
                shapeB: polygonB,
                distance: distance,
                separation: separation,
                shapeAInB: shapeAInB,
                shapeBInA: shapeBInA
            });
        }

        /**
         * @public
         * @static
         * @param {Polygon} polygon
         * @param {Rectangle} rect
         * @returns {?Collision}
         */

    }, {
        key: 'checkPolygonRectangle',
        value: function checkPolygonRectangle(polygon, rect) {
            return Collision.checkPolygonPolygon(polygon, _Polygon2.default.Temp.set(0, 0, [new _Vector2.default(rect.left, rect.top), new _Vector2.default(rect.right, rect.top), new _Vector2.default(rect.left, rect.bottom), new _Vector2.default(rect.right, rect.bottom)]));
        }

        /**
         * @public
         * @static
         * @param {Polygon} polygon
         * @param {Circle} circle
         * @returns {?Collision}
         */

    }, {
        key: 'checkPolygonCircle',
        value: function checkPolygonCircle(polygon, circle) {}

        /**
         * @public
         * @static
         * @param {Circle} circleA
         * @param {Circle} circleB
         * @returns {?Collision}
         */

    }, {
        key: 'checkCircleCircle',
        value: function checkCircleCircle(circleA, circleB) {
            var distance = circleA.position.distanceTo(circleB.x, circleB.y),
                totalRadius = circleA.radius + circleB.radius;

            return distance > totalRadius ? null : new Collision({
                shapeA: circleA,
                shapeB: circleB,
                distance: distance,
                separation: circleB.position.clone().subtract(circleA.x, circleA.y).normalize().multiply(totalRadius - distance),
                shapeAInB: circleA.radius <= circleB.radius && distance <= circleB.radius - circleA.radius,
                shapeBInA: circleB.radius <= circleA.radius && distance <= circleA.radius - circleB.radius
            });
        }

        /**
         * @public
         * @static
         * @param {Circle} circle
         * @param {Rectangle} rect
         * @returns {?Collision}
         */

    }, {
        key: 'checkCircleRectangle',
        value: function checkCircleRectangle(circle, rect) {}

        /**
         * @public
         * @static
         * @param {Rectangle} rectA
         * @param {Rectangle} rectB
         * @returns {?Collision}
         */

    }, {
        key: 'checkRectangleRectangle',
        value: function checkRectangleRectangle(rectA, rectB) {
            if (rectB.left > rectA.right || rectB.top > rectA.bottom) {
                return null;
            }

            if (rectA.left > rectB.right || rectA.top > rectB.bottom) {
                return null;
            }

            return new Collision({
                shapeA: rectA,
                shapeB: rectB,
                distance: 0,
                separation: _Vector2.default.Empty,
                shapeAInB: rectB.containsRect(rectA),
                shapeBInA: rectA.containsRect(rectB)
            });
        }
    }]);

    return Collision;
}();

exports.default = Collision;

/***/ }),
/* 82 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _DisplayManager = __webpack_require__(49);

Object.defineProperty(exports, 'DisplayManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_DisplayManager).default;
  }
});

var _RenderTarget = __webpack_require__(25);

Object.defineProperty(exports, 'RenderTarget', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_RenderTarget).default;
  }
});

var _RenderTexture = __webpack_require__(83);

Object.defineProperty(exports, 'RenderTexture', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_RenderTexture).default;
  }
});

var _Texture = __webpack_require__(14);

Object.defineProperty(exports, 'Texture', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Texture).default;
  }
});

var _View = __webpack_require__(50);

Object.defineProperty(exports, 'View', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_View).default;
  }
});

var _Renderer = __webpack_require__(26);

Object.defineProperty(exports, 'Renderer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Renderer).default;
  }
});

var _Renderable = __webpack_require__(22);

Object.defineProperty(exports, 'Renderable', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Renderable).default;
  }
});

var _Container = __webpack_require__(46);

Object.defineProperty(exports, 'Container', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Container).default;
  }
});

var _Text = __webpack_require__(84);

Object.defineProperty(exports, 'Text', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Text).default;
  }
});

var _TextStyle = __webpack_require__(67);

Object.defineProperty(exports, 'TextStyle', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_TextStyle).default;
  }
});

var _Shader = __webpack_require__(27);

Object.defineProperty(exports, 'Shader', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Shader).default;
  }
});

var _ShaderAttribute = __webpack_require__(54);

Object.defineProperty(exports, 'ShaderAttribute', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ShaderAttribute).default;
  }
});

var _ShaderUniform = __webpack_require__(55);

Object.defineProperty(exports, 'ShaderUniform', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ShaderUniform).default;
  }
});

var _Sprite = __webpack_require__(16);

Object.defineProperty(exports, 'Sprite', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Sprite).default;
  }
});

var _Spritesheet = __webpack_require__(85);

Object.defineProperty(exports, 'Spritesheet', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Spritesheet).default;
  }
});

var _SpriteRenderer = __webpack_require__(52);

Object.defineProperty(exports, 'SpriteRenderer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SpriteRenderer).default;
  }
});

var _SpriteShader = __webpack_require__(53);

Object.defineProperty(exports, 'SpriteShader', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SpriteShader).default;
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

var _settings = __webpack_require__(2);

var _settings2 = _interopRequireDefault(_settings);

var _utils = __webpack_require__(1);

var _const = __webpack_require__(0);

var _RenderTarget2 = __webpack_require__(25);

var _RenderTarget3 = _interopRequireDefault(_RenderTarget2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class RenderTexture
 * @extends RenderTarget
 */
var RenderTexture = function (_RenderTarget) {
    _inherits(RenderTexture, _RenderTarget);

    /**
     * @constructor
     * @param {Number} width
     * @param {Number} height
     * @param {Object} [options={}]
     * @param {Number} [options.scaleMode=settings.SCALE_MODE]
     * @param {Number} [options.wrapMode=settings.WRAP_MODE]
     * @param {Boolean} [options.premultiplyAlpha=settings.PREMULTIPLY_ALPHA]
     */
    function RenderTexture(width, height) {
        var _ref = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
            _ref$scaleMode = _ref.scaleMode,
            scaleMode = _ref$scaleMode === undefined ? _settings2.default.SCALE_MODE : _ref$scaleMode,
            _ref$wrapMode = _ref.wrapMode,
            wrapMode = _ref$wrapMode === undefined ? _settings2.default.WRAP_MODE : _ref$wrapMode,
            _ref$premultiplyAlpha = _ref.premultiplyAlpha,
            premultiplyAlpha = _ref$premultiplyAlpha === undefined ? _settings2.default.PREMULTIPLY_ALPHA : _ref$premultiplyAlpha;

        _classCallCheck(this, RenderTexture);

        /**
         * @private
         * @member {?DataView}
         */
        var _this = _possibleConstructorReturn(this, (RenderTexture.__proto__ || Object.getPrototypeOf(RenderTexture)).call(this, width, height, false));

        _this._source = null;

        /**
         * @private
         * @member {?WebGLTexture}
         */
        _this._texture = null;

        /**
         * @private
         * @member {Number}
         */
        _this._scaleMode = null;

        /**
         * @private
         * @member {Number}
         */
        _this._wrapMode = null;

        /**
         * @private
         * @member {Boolean}
         */
        _this._premultiplyAlpha = null;

        /**
         * @private
         * @member {Number}
         */
        _this._flags = _const.TEXTURE_FLAGS.SOURCE | _const.TEXTURE_FLAGS.SIZE;

        /**
         * @private
         * @member {Boolean}
         */
        _this._flipY = true;

        _this.setScaleMode(scaleMode);
        _this.setWrapMode(wrapMode);
        _this.setPremultiplyAlpha(premultiplyAlpha);
        return _this;
    }

    /**
     * @public
     * @member {?DataView}
     */


    _createClass(RenderTexture, [{
        key: 'connect',


        /**
         * @override
         */
        value: function connect(gl) {
            if (!this._context) {
                this._context = gl;
                this._texture = gl.createTexture();
                this._framebuffer = gl.createFramebuffer();

                this.bindTexture();
                this.bindFramebuffer();

                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._texture, 0);

                this.unbindTexture();
                this.unbindFramebuffer();
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'disconnect',
        value: function disconnect() {
            this.unbindFramebuffer();
            this.unbindTexture();

            if (this._context) {
                this._context.deleteFramebuffer(this._framebuffer);
                this._context.deleteTexture(this._texture);

                this._context = null;
                this._texture = null;
                this._framebuffer = null;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {RenderTarget}
         */

    }, {
        key: 'bindTexture',
        value: function bindTexture(unit) {
            if (!this._context) {
                throw new Error('Texture has to be connected first!');
            }

            var gl = this._context;

            if (unit !== undefined) {
                gl.activeTexture(gl.TEXTURE0 + unit);
            }

            gl.bindTexture(gl.TEXTURE_2D, this._texture);

            this.update();

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {RenderTexture}
         */

    }, {
        key: 'unbindTexture',
        value: function unbindTexture() {
            if (this._context) {
                var gl = this._context;

                gl.bindTexture(gl.TEXTURE_2D, null);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} scaleMode
         * @returns {RenderTexture}
         */

    }, {
        key: 'setScaleMode',
        value: function setScaleMode(scaleMode) {
            if (this._scaleMode !== scaleMode) {
                this._scaleMode = scaleMode;
                this._flags = (0, _utils.addFlag)(_const.TEXTURE_FLAGS.SCALE_MODE, this._flags);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} wrapMode
         * @returns {RenderTexture}
         */

    }, {
        key: 'setWrapMode',
        value: function setWrapMode(wrapMode) {
            if (this._wrapMode !== wrapMode) {
                this._wrapMode = wrapMode;
                this._flags = (0, _utils.addFlag)(_const.TEXTURE_FLAGS.WRAP_MODE, this._flags);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Boolean} premultiplyAlpha
         * @returns {RenderTexture}
         */

    }, {
        key: 'setPremultiplyAlpha',
        value: function setPremultiplyAlpha(premultiplyAlpha) {
            if (this._premultiplyAlpha !== premultiplyAlpha) {
                this._premultiplyAlpha = premultiplyAlpha;
                this._flags = (0, _utils.addFlag)(_const.TEXTURE_FLAGS.PREMULTIPLY_ALPHA, this._flags);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {?DataView} source
         * @returns {RenderTexture}
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
         * @returns {RenderTexture}
         */

    }, {
        key: 'updateSource',
        value: function updateSource() {
            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'setSize',
        value: function setSize(width, height) {
            if (!this._size.equals({ width: width, height: height })) {
                this._size.set(width, height);
                this._defaultView.setSize(width, height);
                this.updateViewport();

                this._flags = (0, _utils.addFlag)(_const.TEXTURE_FLAGS.SIZE, this._flags);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {RenderTexture}
         */

    }, {
        key: 'update',
        value: function update() {
            if (this._flags && this._context) {
                var gl = this._context;

                if ((0, _utils.hasFlag)(_const.TEXTURE_FLAGS.SCALE_MODE, this._flags)) {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this._scaleMode);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this._scaleMode);

                    this._flags = (0, _utils.removeFlag)(_const.TEXTURE_FLAGS.SCALE_MODE, this._flags);
                }

                if ((0, _utils.hasFlag)(_const.TEXTURE_FLAGS.WRAP_MODE, this._flags)) {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrapMode);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrapMode);

                    this._flags = (0, _utils.removeFlag)(_const.TEXTURE_FLAGS.WRAP_MODE, this._flags);
                }

                if ((0, _utils.hasFlag)(_const.TEXTURE_FLAGS.PREMULTIPLY_ALPHA, this._flags)) {
                    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);

                    this._flags = (0, _utils.removeFlag)(_const.TEXTURE_FLAGS.PREMULTIPLY_ALPHA, this._flags);
                }

                if ((0, _utils.hasFlag)(_const.TEXTURE_FLAGS.SOURCE, this._flags)) {
                    if ((0, _utils.hasFlag)(_const.TEXTURE_FLAGS.SIZE, this._flags) || !this._source) {
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                    } else {
                        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                    }

                    if (this.powerOfTwo) {
                        gl.generateMipmap(gl.TEXTURE_2D);
                    }

                    this._flags = (0, _utils.removeFlag)(_const.TEXTURE_FLAGS.SOURCE | _const.TEXTURE_FLAGS.SIZE, this._flags);
                }
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(RenderTexture.prototype.__proto__ || Object.getPrototypeOf(RenderTexture.prototype), 'destroy', this).call(this);

            this._source = null;
            this._texture = null;
            this._scaleMode = null;
            this._wrapMode = null;
            this._premultiplyAlpha = null;
            this._flags = null;
            this._flipY = null;
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

        /**
         * @public
         * @member {Boolean}
         */

    }, {
        key: 'flipY',
        get: function get() {
            return this._flipY;
        },
        set: function set(flipY) {
            this._flipY = flipY;
        }
    }]);

    return RenderTexture;
}(_RenderTarget3.default);

exports.default = RenderTexture;

/***/ }),
/* 84 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _Sprite2 = __webpack_require__(16);

var _Sprite3 = _interopRequireDefault(_Sprite2);

var _Texture = __webpack_require__(14);

var _Texture2 = _interopRequireDefault(_Texture);

var _TextStyle = __webpack_require__(67);

var _TextStyle2 = _interopRequireDefault(_TextStyle);

var _Rectangle = __webpack_require__(5);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var heightCache = new Map();

/**
 * @class Text
 * @extends Sprite
 */

var Text = function (_Sprite) {
    _inherits(Text, _Sprite);

    /**
     * @constructor
     * @param {String} text
     * @param {TextStyle|Object} [style]
     * @param {HTMLCanvasElement} [canvas=document.createElement('canvas')]
     */
    function Text(text, style) {
        var canvas = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : document.createElement('canvas');

        _classCallCheck(this, Text);

        /**
         * @private
         * @member {String}
         */
        var _this = _possibleConstructorReturn(this, (Text.__proto__ || Object.getPrototypeOf(Text)).call(this, new _Texture2.default(canvas)));

        _this._text = null;

        /**
         * @private
         * @member {TextStyle}
         */
        _this._style = null;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        _this._canvas = canvas;

        /**
         * @private
         * @member {CanvasRenderingContext2D}
         */
        _this._context = _this._canvas.getContext('2d');

        /**
         * @private
         * @member {Boolean}
         */
        _this._dirty = true;

        _this.setText(text).setStyle(style).updateTexture();
        return _this;
    }

    /**
     * @public
     * @member {String}
     */


    _createClass(Text, [{
        key: 'setText',


        /**
         * @public
         * @chainable
         * @param {String} text
         * @returns {Text}
         */
        value: function setText(text) {
            if (this._text !== text) {
                this._text = text;
                this._dirty = true;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {TextStyle|Object} style
         * @returns {Text}
         */

    }, {
        key: 'setStyle',
        value: function setStyle(style) {
            this._style = style instanceof _TextStyle2.default ? style : new _TextStyle2.default(style);
            this._dirty = true;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {HTMLCanvasElement} canvas
         * @returns {Text}
         */

    }, {
        key: 'setCanvas',
        value: function setCanvas(canvas) {
            if (this._canvas !== canvas) {
                this._canvas = canvas;
                this._context = canvas.getContext('2d');
                this._dirty = true;

                this.setTextureFrame(_Rectangle2.default.Temp.set(0, 0, canvas.width, canvas.height));
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'updateTexture',
        value: function updateTexture() {
            if (this._style && (this._dirty || this._style.dirty)) {
                var canvas = this._canvas,
                    context = this._context,
                    style = this._style.apply(context),
                    text = style.wordWrap ? this.getWordWrappedText() : this._text,
                    lineHeight = Text.determineFontHeight(context.font) + style.strokeThickness,
                    lines = text.split(_const.NEWLINE),
                    lineMetrics = lines.map(function (line) {
                    return context.measureText(line);
                }),
                    maxLineWidth = lineMetrics.reduce(function (max, measure) {
                    return Math.max(max, measure.width);
                }, 0),
                    canvasWidth = Math.ceil(maxLineWidth + style.strokeThickness + style.padding * 2),
                    canvasHeight = Math.ceil(lineHeight * lines.length + style.padding * 2);

                if (canvasWidth !== canvas.width || canvasHeight !== canvas.height) {
                    canvas.width = canvasWidth;
                    canvas.height = canvasHeight;

                    this.setTextureFrame(_Rectangle2.default.Temp.set(0, 0, canvasWidth, canvasHeight));
                } else {
                    context.clearRect(0, 0, canvasWidth, canvasHeight);
                }

                style.apply(context);

                for (var i = 0; i < lines.length; i++) {
                    var metrics = lineMetrics[i],
                        lineWidth = maxLineWidth - metrics.width,
                        offset = style.align === 'right' ? lineWidth : lineWidth / 2,
                        padding = style.padding + style.strokeThickness / 2,
                        lineX = metrics.actualBoundingBoxLeft + (style.align === 'left' ? 0 : offset) + padding,
                        lineY = metrics.fontBoundingBoxAscent + lineHeight * i + padding;

                    if (style.stroke && style.strokeThickness) {
                        context.strokeText(lines[i], lineX, lineY);
                    }

                    if (style.fill) {
                        context.fillText(lines[i], lineX, lineY);
                    }
                }

                this.texture.updateSource();

                this._dirty = false;
                this._style.dirty = false;
            }

            return this;
        }

        /**
         * @public
         * @returns {String}
         */

    }, {
        key: 'getWordWrappedText',
        value: function getWordWrappedText() {
            var context = this._context,
                wrapWidth = this._style.wordWrapWidth,
                lines = this._text.split('\n'),
                spaceWidth = context.measureText(' ').width;

            var spaceLeft = wrapWidth,
                result = '';

            for (var y = 0; y < lines.length; y++) {
                var words = lines[y].split(' ');

                if (y > 0) {
                    result += '\n';
                }

                for (var x = 0; x < words.length; x++) {
                    var word = words[x],
                        wordWidth = context.measureText(word).width,
                        pairWidth = wordWidth + spaceWidth;

                    if (pairWidth > spaceLeft) {
                        if (x > 0) {
                            result += '\n';
                        }

                        spaceLeft = wrapWidth;
                    } else {
                        spaceLeft -= pairWidth;
                    }

                    result += word + ' ';
                }
            }

            return result;
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager) {
            if (this.active) {
                this.updateTexture();

                _get(Text.prototype.__proto__ || Object.getPrototypeOf(Text.prototype), 'render', this).call(this, displayManager);
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Text.prototype.__proto__ || Object.getPrototypeOf(Text.prototype), 'destroy', this).call(this);

            this._text = null;
            this._style = null;
            this._canvas = null;
            this._context = null;
            this._dirty = null;
        }

        /**
         * @private
         * @static
         * @param {String} font
         * @returns {Number}
         */

    }, {
        key: 'text',
        get: function get() {
            return this._text;
        },
        set: function set(text) {
            this.setText(text);
        }

        /**
         * @public
         * @member {TextStyle}
         */

    }, {
        key: 'style',
        get: function get() {
            return this._style;
        },
        set: function set(style) {
            this.setStyle(style);
        }

        /**
         * @public
         * @member {HTMLCanvasElement}
         */

    }, {
        key: 'canvas',
        get: function get() {
            return this._canvas;
        },
        set: function set(canvas) {
            this.setCanvas(canvas);
        }
    }], [{
        key: 'determineFontHeight',
        value: function determineFontHeight(font) {
            if (!heightCache.has(font)) {
                var body = document.body,
                    dummy = document.createElement('div');

                dummy.appendChild(document.createTextNode('M'));
                dummy.setAttribute('style', 'font: ' + font + ';position:absolute;top:0;left:0');

                body.appendChild(dummy);
                heightCache.set(font, dummy.offsetHeight);
                body.removeChild(dummy);
            }

            return heightCache.get(font);
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

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Texture = __webpack_require__(14);

var _Texture2 = _interopRequireDefault(_Texture);

var _Rectangle = __webpack_require__(5);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Sprite2 = __webpack_require__(16);

var _Sprite3 = _interopRequireDefault(_Sprite2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Spritesheet
 * @extends Sprite
 */
var Spritesheet = function (_Sprite) {
    _inherits(Spritesheet, _Sprite);

    /**
     * @constructor
     * @param {?Texture|?RenderTexture} texture
     * @param {Object<String, Object>[]} frames
     * @param {String} [startFrame]
     */
    function Spritesheet(texture, frames, startFrame) {
        _classCallCheck(this, Spritesheet);

        /**
         * @private
         * @type {Map<String, Rectangle>}
         */
        var _this = _possibleConstructorReturn(this, (Spritesheet.__proto__ || Object.getPrototypeOf(Spritesheet)).call(this, texture));

        _this._frames = new Map();

        /**
         * @private
         * @type {String[]}
         */
        _this._frameNames = [];

        /**
         * @private
         * @type {String}
         */
        _this._currentFrame = null;

        _this.parse(frames);

        if (startFrame !== undefined) {
            _this.setFrame(startFrame);
        } else {
            _this.setFrame(_this._frameNames[0]);
        }
        return _this;
    }

    /**
     * @param {Object<String, Object>[]} frames
     * @param {Boolean} [clearOldFrames=true]
     * @return {SpriteSheet}
     */


    _createClass(Spritesheet, [{
        key: 'parse',
        value: function parse(frames) {
            var clearOldFrames = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

            if (clearOldFrames) {
                this.clearFrames();
            }

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = Object.keys(frames)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var name = _step.value;

                    this.addFrame(name, frames[name]);
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
         * @param {String} name
         * @param {Object} frame
         * @param {Number} [frame.x]
         * @param {Number} [frame.y]
         * @param {Number} [frame.width]
         * @param {Number} [frame.height]
         * @return {SpriteSheet}
         */

    }, {
        key: 'addFrame',
        value: function addFrame(name) {
            var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
                x = _ref.x,
                y = _ref.y,
                width = _ref.width,
                height = _ref.height;

            this._frames.set(name, new _Rectangle2.default(x, y, width, height));
            this._frameNames.push(name);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} name
         * @returns {SpriteSheet}
         */

    }, {
        key: 'removeFrame',
        value: function removeFrame(name) {
            var frame = this.getFrame(name),
                index = this._frameNames.indexOf(name);

            this._frames.delete(name);
            (0, _utils.removeItems)(this._frameNames, index, 1);
            frame.destroy();

            return this;
        }

        /**
         * @public
         * @param {String} name
         * @returns {Rectangle}
         */

    }, {
        key: 'getFrame',
        value: function getFrame(name) {
            if (!this._frames.has(name)) {
                throw new Error('Spritesheet could not find frame "' + name + '".');
            }

            return this._frames.get(name);
        }

        /**
         * @public
         * @chainable
         * @param {String} name
         * @returns {SpriteSheet}
         */

    }, {
        key: 'setFrame',
        value: function setFrame(name) {
            if (this._currentFrame !== name) {
                this._currentFrame = name;
                this.setTextureFrame(this.getFrame(name));
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {SpriteSheet}
         */

    }, {
        key: 'clearFrames',
        value: function clearFrames() {
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this._frames.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var frame = _step2.value;

                    frame.destroy();
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

            this._frames.clear();
            this._frameNames.length = 0;

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Spritesheet.prototype.__proto__ || Object.getPrototypeOf(Spritesheet.prototype), 'destroy', this).call(this);

            this.clearFrames();

            this._frames = null;
            this._frameNames = null;
            this._currentFrame = null;
        }
    }]);

    return Spritesheet;
}(_Sprite3.default);

exports.default = Spritesheet;

/***/ }),
/* 86 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _Particle = __webpack_require__(68);

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

var _ParticleOptions = __webpack_require__(29);

Object.defineProperty(exports, 'ParticleOptions', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleOptions).default;
  }
});

var _ParticleShader = __webpack_require__(59);

Object.defineProperty(exports, 'ParticleShader', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleShader).default;
  }
});

var _ParticleRenderer = __webpack_require__(58);

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

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderable2 = __webpack_require__(22);

var _Renderable3 = _interopRequireDefault(_Renderable2);

var _Particle = __webpack_require__(68);

var _Particle2 = _interopRequireDefault(_Particle);

var _Rectangle = __webpack_require__(5);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Time = __webpack_require__(11);

var _Time2 = _interopRequireDefault(_Time);

var _ParticleOptions = __webpack_require__(29);

var _ParticleOptions2 = _interopRequireDefault(_ParticleOptions);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ParticleEmitter
 * @extends Renderable
 */
var ParticleEmitter = function (_Renderable) {
    _inherits(ParticleEmitter, _Renderable);

    /**
     * @constructor
     * @param {Texture} texture
     * @param {ParticleOptions|Object} [particleOptions]
     */
    function ParticleEmitter(texture, particleOptions) {
        _classCallCheck(this, ParticleEmitter);

        /**
         * @private
         * @member {Boolean}
         */
        var _this = _possibleConstructorReturn(this, (ParticleEmitter.__proto__ || Object.getPrototypeOf(ParticleEmitter)).call(this));

        _this._updateTexCoords = true;

        /**
         * @private
         * @member {Set<Particle>}
         */
        _this._activeParticles = new Set();

        /**
         * @private
         * @member {Particle[]}
         */
        _this._unusedParticles = [];

        /**
         * @private
         * @member {ParticleOptions}
         */
        _this._particleOptions = new _ParticleOptions2.default(particleOptions);

        /**
         * @private
         * @member {Texture}
         */
        _this._texture = null;

        /**
         * @private
         * @member {Rectangle}
         */
        _this._textureFrame = new _Rectangle2.default();

        /**
         * @private
         * @member {Rectangle}
         */
        _this._textureCoords = new _Rectangle2.default();

        /**
         * @private
         * @member {Number}
         */
        _this._emissionRate = 1;

        /**
         * @private
         * @member {Number}
         */
        _this._emissionDelta = 0;

        /**
         * @private
         * @member {ParticleModifier[]}
         */
        _this._modifiers = [];

        /**
         * @private
         * @member {Number}
         */
        _this._blendMode = _const.BLEND_MODE.NORMAL;

        if (texture) {
            _this.setTexture(texture);
        }
        return _this;
    }

    /**
     * @public
     * @member {Set<Particle>}
     */


    _createClass(ParticleEmitter, [{
        key: 'setTexture',


        /**
         * @public
         * @chainable
         * @param {Texture} texture
         * @returns {ParticleEmitter}
         */
        value: function setTexture(texture) {
            if (this._texture !== texture) {
                this._texture = texture;
                this.resetTextureFrame();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Rectangle} frame
         * @returns {ParticleEmitter}
         */

    }, {
        key: 'setTextureFrame',
        value: function setTextureFrame(frame) {
            this._textureFrame.copy(frame);
            this._updateTexCoords = true;

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {ParticleEmitter}
         */

    }, {
        key: 'resetTextureFrame',
        value: function resetTextureFrame() {
            return this.setTextureFrame(_Rectangle2.default.Temp.set(0, 0, this._texture.width, this._texture.height));
        }

        /**
         * @public
         * @chainable
         * @param {Number} blendMode
         * @returns {Renderable}
         */

    }, {
        key: 'setBlendMode',
        value: function setBlendMode(blendMode) {
            this._blendMode = blendMode;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} particlesPerSecond
         * @returns {ParticleEmitter}
         */

    }, {
        key: 'setEmissionRate',
        value: function setEmissionRate(particlesPerSecond) {
            this._emissionRate = particlesPerSecond;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {ParticleModifier} modifier
         * @returns {ParticleEmitter}
         */

    }, {
        key: 'addModifier',
        value: function addModifier(modifier) {
            this._modifiers.push(modifier);

            return this;
        }

        /**
         * @public
         * @param {Time} time
         * @returns {Number}
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
         * @chainable
         * @param {Time} delta
         * @returns {ParticleEmitter}
         */

    }, {
        key: 'update',
        value: function update(delta) {
            var particleCount = this.computeParticleCount(delta),
                particleOptions = this._particleOptions,
                activeParticles = this._activeParticles,
                unusedParticles = this._unusedParticles,
                modifiers = this._modifiers,
                unusedCount = unusedParticles.length,
                difference = unusedCount - particleCount,
                freeParticles = unusedParticles.splice(Math.max(0, difference), Math.min(unusedCount, particleCount));

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = freeParticles[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var particle = _step.value;

                    activeParticles.add(particle.reset(particleOptions));
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

            for (var i = Math.min(0, difference); i < 0; i++) {
                activeParticles.add(new _Particle2.default(particleOptions));
            }

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = activeParticles[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var _particle = _step2.value;

                    _particle.update(delta);

                    if (_particle.isExpired) {
                        unusedParticles.push(_particle);
                        activeParticles.delete(_particle);

                        continue;
                    }

                    var _iteratorNormalCompletion3 = true;
                    var _didIteratorError3 = false;
                    var _iteratorError3 = undefined;

                    try {
                        for (var _iterator3 = modifiers[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                            var modifier = _step3.value;

                            modifier.apply(_particle, delta);
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

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager) {
            if (this.active && displayManager.insideViewport(this)) {
                var renderer = displayManager.getRenderer('particle');

                displayManager.setRenderer(renderer);

                renderer.render(this);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {ParticleEmitter} emitter
         * @returns {ParticleEmitter}
         */

    }, {
        key: 'copy',
        value: function copy(emitter) {
            this.activeParticles = emitter.activeParticles;
            this.particleOptions = emitter.particleOptions;
            this.texture = emitter.texture;
            this.textureFrame = emitter.textureFrame;
            this.emissionRate = emitter.emissionRate;
            this.modifiers = emitter.modifiers;

            return this;
        }

        /**
         * @public
         * @returns {ParticleEmitter}
         */

    }, {
        key: 'clone',
        value: function clone() {
            var emitter = new ParticleEmitter(this._texture, this._particleOptions);

            return emitter.copy(this);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(ParticleEmitter.prototype.__proto__ || Object.getPrototypeOf(ParticleEmitter.prototype), 'destroy', this).call(this);

            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
                for (var _iterator4 = this._activeParticles[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                    var particle = _step4.value;

                    particle.destroy();
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

            var _iteratorNormalCompletion5 = true;
            var _didIteratorError5 = false;
            var _iteratorError5 = undefined;

            try {
                for (var _iterator5 = this._unusedParticles[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                    var _particle2 = _step5.value;

                    _particle2.destroy();
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

            this._activeParticles.clear();
            this._activeParticles = null;

            this._unusedParticles.length = 0;
            this._unusedParticles = null;

            this._particleOptions.destroy();
            this._particleOptions = null;

            this._textureFrame.destroy();
            this._textureFrame = null;

            this._textureCoords.destroy();
            this._textureCoords = null;

            this._modifiers.length = 0;
            this._modifiers = null;

            this._texture = null;
            this._blendMode = null;
            this._emissionRate = null;
            this._emissionDelta = null;
            this._updateTexCoords = null;
        }
    }, {
        key: 'activeParticles',
        get: function get() {
            return this._activeParticles;
        },
        set: function set(newParticles) {
            var activeParticles = this._activeParticles,
                unusedParticles = this._unusedParticles,
                activeArray = [].concat(_toConsumableArray(activeParticles)),
                newArray = [].concat(_toConsumableArray(newParticles)),
                activeLength = activeArray.length,
                newLength = newArray.length,
                diff = activeLength - newLength;

            for (var i = 0; i < activeLength; i++) {
                activeArray[i].copy(newArray[i]);
            }

            if (diff > 0) {
                for (var _i = 0; _i < diff; _i++) {
                    var particle = activeArray[_i];

                    unusedParticles.push(particle);
                    activeParticles.delete(particle);
                }
            } else if (diff < 0) {
                for (var _i2 = activeLength; _i2 < newLength; _i2++) {
                    var _particle3 = unusedParticles.pop();

                    activeParticles.add(_particle3 ? _particle3.copy(newArray[_i2]) : newArray[_i2].clone());
                }
            }
        }

        /**
         * @public
         * @member {ParticleOptions}
         */

    }, {
        key: 'particleOptions',
        get: function get() {
            return this._particleOptions;
        },
        set: function set(options) {
            this._particleOptions = options;
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
            this.setTexture(texture);
        }

        /**
         * @public
         * @member {Rectangle}
         */

    }, {
        key: 'textureFrame',
        get: function get() {
            return this._textureFrame;
        },
        set: function set(frame) {
            this.setTextureFrame(frame);
        }

        /**
         * @public
         * @member {Rectangle}
         */

    }, {
        key: 'textureCoords',
        get: function get() {
            if (this._updateTexCoords) {
                var frame = this._textureFrame,
                    texture = this._texture;

                this._textureCoords.set(frame.left / texture.width, frame.top / texture.height, frame.right / texture.width, frame.bottom / texture.height);

                this._updateTexCoords = false;
            }

            return this._textureCoords;
        },
        set: function set(textureCoords) {
            this._textureCoords.copy(textureCoords);
            this._updateTexCoords = false;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'blendMode',
        get: function get() {
            return this._blendMode;
        },
        set: function set(blendMode) {
            this.setBlendMode(blendMode);
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
            this.setEmissionRate(particlesPerSecond);
        }

        /**
         * @public
         * @member {ParticleModifier[]}
         */

    }, {
        key: 'modifiers',
        get: function get() {
            return this._modifiers;
        },
        set: function set(newModifiers) {
            var _iteratorNormalCompletion6 = true;
            var _didIteratorError6 = false;
            var _iteratorError6 = undefined;

            try {
                for (var _iterator6 = this._modifiers[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                    var modifier = _step6.value;

                    modifier.destroy();
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

            this._modifiers.length = 0;

            var _iteratorNormalCompletion7 = true;
            var _didIteratorError7 = false;
            var _iteratorError7 = undefined;

            try {
                for (var _iterator7 = newModifiers[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                    var _modifier = _step7.value;

                    this._modifiers.push(_modifier.clone());
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
    }]);

    return ParticleEmitter;
}(_Renderable3.default);

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

var _Vector = __webpack_require__(3);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ForceModifier
 * @extends ParticleModifier
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

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(modifier) {
            this.acceleration = modifier.acceleration;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new ForceModifier(this._acceleration);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._acceleration.destroy();
            this._acceleration = null;
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

var _Vector = __webpack_require__(3);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ScaleModifier
 * @extends ParticleModifier
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

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(modifier) {
            this.scaleFactor = modifier.scaleFactor;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new ScaleModifier(this._scaleFactor);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._scaleFactor.destroy();
            this._scaleFactor = null;
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
 * @extends ParticleModifier
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
      particle.rotationSpeed = particle.rotationSpeed + delta.seconds * this._angularAcceleration;
    }

    /**
     * @override
     */

  }, {
    key: 'copy',
    value: function copy(modifier) {
      this.angularAcceleration = modifier.angularAcceleration;

      return this;
    }

    /**
     * @override
     */

  }, {
    key: 'clone',
    value: function clone() {
      return new TorqueModifier(this._angularAcceleration);
    }

    /**
     * @override
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      this._angularAcceleration = null;
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

/***/ }),
/* 91 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _ChannelManager = __webpack_require__(9);

Object.defineProperty(exports, 'ChannelManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ChannelManager).default;
  }
});

var _Input = __webpack_require__(92);

Object.defineProperty(exports, 'Input', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Input).default;
  }
});

var _InputManager = __webpack_require__(60);

Object.defineProperty(exports, 'InputManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_InputManager).default;
  }
});

var _Keyboard = __webpack_require__(61);

Object.defineProperty(exports, 'Keyboard', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Keyboard).default;
  }
});

var _GamepadControl = __webpack_require__(39);

Object.defineProperty(exports, 'GamepadControl', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_GamepadControl).default;
  }
});

var _GamepadMapping = __webpack_require__(38);

Object.defineProperty(exports, 'GamepadMapping', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_GamepadMapping).default;
  }
});

var _DefaultGamepadMapping = __webpack_require__(37);

Object.defineProperty(exports, 'DefaultGamepadMapping', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_DefaultGamepadMapping).default;
  }
});

var _Gamepad = __webpack_require__(63);

Object.defineProperty(exports, 'Gamepad', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Gamepad).default;
  }
});

var _GamepadManager = __webpack_require__(62);

Object.defineProperty(exports, 'GamepadManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_GamepadManager).default;
  }
});

var _Pointer = __webpack_require__(65);

Object.defineProperty(exports, 'Pointer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Pointer).default;
  }
});

var _PointerManager = __webpack_require__(64);

Object.defineProperty(exports, 'PointerManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_PointerManager).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 92 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _settings = __webpack_require__(2);

var _settings2 = _interopRequireDefault(_settings);

var _EventEmitter2 = __webpack_require__(6);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Input
 * @extends EventEmitter
 */
var Input = function (_EventEmitter) {
    _inherits(Input, _EventEmitter);

    /**
     * @constructor
     * @param {Set<Number>|Number[]|Number} channels
     * @param {Object} [options={}]
     * @param {Function} [options.start]
     * @param {Function} [options.stop]
     * @param {Function} [options.active]
     * @param {Function} [options.trigger]
     * @param {*} [options.context]
     * @param {Number} [options.gamepadIndex=0]
     * @param {Number} [options.pointerIndex=0]
     * @param {Number} [options.threshold=settings.THRESHOLD_INPUT]
     */
    function Input(channels) {
        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            start = _ref.start,
            stop = _ref.stop,
            active = _ref.active,
            trigger = _ref.trigger,
            context = _ref.context,
            _ref$gamepadIndex = _ref.gamepadIndex,
            gamepadIndex = _ref$gamepadIndex === undefined ? 0 : _ref$gamepadIndex,
            _ref$pointerIndex = _ref.pointerIndex,
            pointerIndex = _ref$pointerIndex === undefined ? 0 : _ref$pointerIndex,
            _ref$threshold = _ref.threshold,
            threshold = _ref$threshold === undefined ? _settings2.default.THRESHOLD_INPUT : _ref$threshold;

        _classCallCheck(this, Input);

        /**
         * @private
         * @member {Set<Number>}
         */
        var _this = _possibleConstructorReturn(this, (Input.__proto__ || Object.getPrototypeOf(Input)).call(this));

        _this._channels = new Set(typeof channels === 'number' ? [channels] : channels);

        /**
         * @private
         * @member {Number}
         */
        _this._threshold = threshold;

        /**
         * @private
         * @member {Number}
         */
        _this._pointerIndex = pointerIndex;

        /**
         * @private
         * @member {Number}
         */
        _this._pointerOffset = pointerIndex * _const.INPUT_CHANNELS_HANDLER;

        /**
         * @private
         * @member {Number}
         */
        _this._gamepadIndex = gamepadIndex;

        /**
         * @private
         * @member {Number}
         */
        _this._gamepadOffset = gamepadIndex * _const.INPUT_CHANNELS_HANDLER;

        /**
         * @private
         * @member {Number}
         */
        _this._triggered = 0;

        /**
         * @private
         * @member {Number}
         */
        _this._value = 0;

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
     * @member {Set<Number>}
     */


    _createClass(Input, [{
        key: 'update',


        /**
         * @public
         * @param {Float32Array} channels
         */
        value: function update(channels) {
            this._value = 0;

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._channels[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var channel = _step.value;

                    var offset = channel >= _const.INPUT_OFFSET_GAMEPAD ? this._gamepadOffset : channel >= _const.INPUT_OFFSET_POINTER && this._pointerOffset || 0;

                    this._value = Math.max(channels[channel + offset], this._value);
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
                if (!this._triggered) {
                    this._triggered = Date.now();
                    this.trigger('start', this._value);
                }

                this.trigger('active', this._value);
            } else if (this._triggered) {
                this.trigger('stop', this._value);

                if (Date.now() - this._triggered < this._threshold) {
                    this.trigger('trigger', this._value);
                }

                this._triggered = 0;
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

            this._threshold = null;
            this._pointerIndex = null;
            this._pointerOffset = null;
            this._gamepadIndex = null;
            this._gamepadOffset = null;
            this._triggered = null;
            this._value = null;
        }
    }, {
        key: 'channels',
        get: function get() {
            return this._channels;
        },
        set: function set(channels) {
            this._channels.clear();

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = channels[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var channel = _step2.value;

                    this._channels.add(channel);
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
         * @member {Number}
         */

    }, {
        key: 'pointerIndex',
        get: function get() {
            return this._pointerIndex;
        },
        set: function set(index) {
            this._pointerIndex = index;
            this._pointerOffset = index * _const.INPUT_CHANNELS_HANDLER;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'gamepadIndex',
        get: function get() {
            return this._gamepadIndex;
        },
        set: function set(index) {
            this._gamepadIndex = index;
            this._gamepadOffset = index * _const.INPUT_CHANNELS_HANDLER;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'pointerOffset',
        get: function get() {
            return this._pointerOffset;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'gamepadOffset',
        get: function get() {
            return this._gamepadOffset;
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
    }]);

    return Input;
}(_EventEmitter3.default);

exports.default = Input;

/***/ }),
/* 93 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _Vector = __webpack_require__(3);

Object.defineProperty(exports, 'Vector', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Vector).default;
  }
});

var _ObservableVector = __webpack_require__(23);

Object.defineProperty(exports, 'ObservableVector', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ObservableVector).default;
  }
});

var _Matrix = __webpack_require__(10);

Object.defineProperty(exports, 'Matrix', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Matrix).default;
  }
});

var _Transformable = __webpack_require__(47);

Object.defineProperty(exports, 'Transformable', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Transformable).default;
  }
});

var _Interval = __webpack_require__(28);

Object.defineProperty(exports, 'Interval', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Interval).default;
  }
});

var _Rectangle = __webpack_require__(5);

Object.defineProperty(exports, 'Rectangle', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Rectangle).default;
  }
});

var _Circle = __webpack_require__(94);

Object.defineProperty(exports, 'Circle', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Circle).default;
  }
});

var _Polygon = __webpack_require__(66);

Object.defineProperty(exports, 'Polygon', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Polygon).default;
  }
});

var _Size = __webpack_require__(7);

Object.defineProperty(exports, 'Size', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Size).default;
  }
});

var _ObservableSize = __webpack_require__(51);

Object.defineProperty(exports, 'ObservableSize', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ObservableSize).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 94 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Vector = __webpack_require__(3);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Circle
 */
var Circle = function () {

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
        this._position = new _Vector2.default(x, y);

        /**
         * @private
         * @member {Number}
         */
        this._radius = radius;
    }

    /**
     * @public
     * @member {Vector}
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
         * @public
         * @param {Circle|Object} circle
         * @param {Number} [circle.x]
         * @param {Number} [circle.y]
         * @param {Number} [circle.radius]
         * @returns {Boolean}
         */

    }, {
        key: 'equals',
        value: function equals() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                x = _ref.x,
                y = _ref.y,
                radius = _ref.radius;

            return (x === undefined || this.x === x) && (y === undefined || this.y === y) && (radius === undefined || this.radius === radius);
        }

        /**
         * @override
         */

    }, {
        key: 'contains',
        value: function contains(x, y, transform) {
            var position = this._position;

            if (transform) {
                position = position.transform(transform, _Vector2.default.Temp);
            }

            return position.distanceTo(x, y) <= this._radius;
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
}();

/**
 * @public
 * @static
 * @constant
 * @member {Circle}
 */


exports.default = Circle;
Circle.Empty = new Circle(0, 0, 0);

/**
 * @public
 * @static
 * @constant
 * @member {Circle}
 */
Circle.Temp = new Circle();

/***/ }),
/* 95 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _Media = __webpack_require__(21);

Object.defineProperty(exports, 'Media', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Media).default;
  }
});

var _Sound = __webpack_require__(41);

Object.defineProperty(exports, 'Sound', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Sound).default;
  }
});

var _Music = __webpack_require__(36);

Object.defineProperty(exports, 'Music', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Music).default;
  }
});

var _Video = __webpack_require__(45);

Object.defineProperty(exports, 'Video', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Video).default;
  }
});

var _MediaSource = __webpack_require__(35);

Object.defineProperty(exports, 'MediaSource', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_MediaSource).default;
  }
});

var _AudioAnalyser = __webpack_require__(96);

Object.defineProperty(exports, 'AudioAnalyser', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_AudioAnalyser).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 96 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _support = __webpack_require__(4);

var _support2 = _interopRequireDefault(_support);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class AudioAnalyser
 */
var AudioAnalyser = function () {

    /**
     * @constructor
     * @param {Media|Sound|Music|Video} media
     * @param {Object} [options={}]
     * @param {Number} [options.fftSize=2048]
     * @param {Number} [options.minDecibels=-100]
     * @param {Number} [options.maxDecibels=-30]
     * @param {Number} [options.smoothingTimeConstant=0.8]
     */
    function AudioAnalyser(media) {
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

        if (!_support2.default.webAudio) {
            throw new Error('Web Audio API should be enabled when using the audio analyzer.');
        }

        /**
         * @private
         * @member {?AnalyserNode}
         */
        this._analyser = _utils.audioContext.createAnalyser();
        this._analyser.fftSize = fftSize;
        this._analyser.minDecibels = minDecibels;
        this._analyser.maxDecibels = maxDecibels;
        this._analyser.smoothingTimeConstant = smoothingTimeConstant;

        /**
         * @private
         * @member {?AudioNode}
         */
        this._analyserTarget = null;

        /**
         * @private
         * @member {Media|Sound|Music|Video}
         */
        this._media = media;

        /**
         * @private
         * @member {?Uint8Array}
         */
        this._timeDomainData = null;

        /**
         * @private
         * @member {?Uint8Array}
         */
        this._frequencyData = null;

        /**
         * @private
         * @member {?Float32Array}
         */
        this._preciseTimeDomainData = null;

        /**
         * @private
         * @member {?Float32Array}
         */
        this._preciseFrequencyData = null;
    }

    /**
     * @public
     * @chainable
     * @returns {AudioAnalyser}
     */


    _createClass(AudioAnalyser, [{
        key: 'connect',
        value: function connect() {
            if (_support2.default.webAudio && !this._analyserTarget) {
                if (!this._media.analyserTarget) {
                    throw new Error('No AudioNode on property analyserTarget.');
                }

                this._analyserTarget = this._media.analyserTarget;
                this._analyserTarget.connect(this._analyser);
            }

            return this;
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
            if (this._analyserTarget) {
                this._analyserTarget.disconnect();
                this._analyserTarget = null;
            }

            this._analyser.disconnect();
            this._analyser = null;

            this._media = null;
            this._timeDomainData = null;
            this._frequencyData = null;
            this._preciseTimeDomainData = null;
            this._preciseFrequencyData = null;
        }
    }, {
        key: 'timeDomainData',
        get: function get() {
            this.connect();

            if (!this._timeDomainData) {
                this._timeDomainData = new Uint8Array(this._analyser.frequencyBinCount);
            }

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
            this.connect();

            if (!this._frequencyData) {
                this._frequencyData = new Uint8Array(this._analyser.frequencyBinCount);
            }

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
            this.connect();

            if (!this._preciseTimeDomainData) {
                this._preciseTimeDomainData = new Float32Array(this._analyser.frequencyBinCount);
            }

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
            this.connect();

            if (!this._preciseFrequencyData) {
                this._preciseFrequencyData = new Float32Array(this._analyser.frequencyBinCount);
            }

            this._analyser.getFloatFrequencyData(this._preciseFrequencyData);

            return this._preciseFrequencyData;
        }
    }]);

    return AudioAnalyser;
}();

exports.default = AudioAnalyser;

/***/ })
/******/ ]);
//# sourceMappingURL=exo.build.js.map