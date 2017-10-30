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
/******/ 	return __webpack_require__(__webpack_require__.s = 71);
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
 */
SHAPE = exports.SHAPE = {
    NONE: 0,
    POLYGON: 1,
    RECTANGLE: 2,
    CIRCLE: 3
},


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
 * @name INPUT_DEVICE
 * @type {Object<String, Number>}
 * @property {Number} KEYBOARD
 * @property {Number} POINTER
 * @property {Number} GAMEPAD
 */
INPUT_DEVICE = exports.INPUT_DEVICE = {
    KEYBOARD: 0,
    POINTER: 1,
    GAMEPAD: 2
},


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
INPUT_CHANNELS_GLOBAL = exports.INPUT_CHANNELS_GLOBAL = Object.keys(INPUT_DEVICE).length * INPUT_CHANNELS_DEVICE,


/**
 * @public
 * @constant
 * @name INPUT_DEVICE
 * @type {Object<String, Number>}
 * @property {Number} KEYBOARD
 * @property {Number} POINTER
 * @property {Number} GAMEPAD
 */
INPUT_OFFSET = exports.INPUT_OFFSET = Object.keys(INPUT_DEVICE).reduce(function (result, property) {
    result[property] = INPUT_DEVICE[property] * INPUT_CHANNELS_DEVICE;

    return result;
}, {}),


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
    Backspace: INPUT_OFFSET.KEYBOARD + 8,
    Tab: INPUT_OFFSET.KEYBOARD + 9,
    Clear: INPUT_OFFSET.KEYBOARD + 12,
    Enter: INPUT_OFFSET.KEYBOARD + 13,
    Shift: INPUT_OFFSET.KEYBOARD + 16,
    Control: INPUT_OFFSET.KEYBOARD + 17,
    Alt: INPUT_OFFSET.KEYBOARD + 18,
    Pause: INPUT_OFFSET.KEYBOARD + 19,
    CapsLock: INPUT_OFFSET.KEYBOARD + 20,
    Escape: INPUT_OFFSET.KEYBOARD + 27,
    Space: INPUT_OFFSET.KEYBOARD + 32,
    PageUp: INPUT_OFFSET.KEYBOARD + 33,
    PageDown: INPUT_OFFSET.KEYBOARD + 34,
    End: INPUT_OFFSET.KEYBOARD + 35,
    Home: INPUT_OFFSET.KEYBOARD + 36,
    Left: INPUT_OFFSET.KEYBOARD + 37,
    Up: INPUT_OFFSET.KEYBOARD + 38,
    Right: INPUT_OFFSET.KEYBOARD + 39,
    Down: INPUT_OFFSET.KEYBOARD + 40,
    Insert: INPUT_OFFSET.KEYBOARD + 45,
    Delete: INPUT_OFFSET.KEYBOARD + 46,
    Help: INPUT_OFFSET.KEYBOARD + 47,
    Zero: INPUT_OFFSET.KEYBOARD + 48,
    One: INPUT_OFFSET.KEYBOARD + 49,
    Two: INPUT_OFFSET.KEYBOARD + 50,
    Three: INPUT_OFFSET.KEYBOARD + 51,
    Four: INPUT_OFFSET.KEYBOARD + 52,
    Five: INPUT_OFFSET.KEYBOARD + 53,
    Six: INPUT_OFFSET.KEYBOARD + 54,
    Seven: INPUT_OFFSET.KEYBOARD + 55,
    Eight: INPUT_OFFSET.KEYBOARD + 56,
    Nine: INPUT_OFFSET.KEYBOARD + 57,
    A: INPUT_OFFSET.KEYBOARD + 65,
    B: INPUT_OFFSET.KEYBOARD + 66,
    C: INPUT_OFFSET.KEYBOARD + 67,
    D: INPUT_OFFSET.KEYBOARD + 68,
    E: INPUT_OFFSET.KEYBOARD + 69,
    F: INPUT_OFFSET.KEYBOARD + 70,
    G: INPUT_OFFSET.KEYBOARD + 71,
    H: INPUT_OFFSET.KEYBOARD + 72,
    I: INPUT_OFFSET.KEYBOARD + 73,
    J: INPUT_OFFSET.KEYBOARD + 74,
    K: INPUT_OFFSET.KEYBOARD + 75,
    L: INPUT_OFFSET.KEYBOARD + 76,
    M: INPUT_OFFSET.KEYBOARD + 77,
    N: INPUT_OFFSET.KEYBOARD + 78,
    O: INPUT_OFFSET.KEYBOARD + 79,
    P: INPUT_OFFSET.KEYBOARD + 80,
    Q: INPUT_OFFSET.KEYBOARD + 81,
    R: INPUT_OFFSET.KEYBOARD + 82,
    S: INPUT_OFFSET.KEYBOARD + 83,
    T: INPUT_OFFSET.KEYBOARD + 84,
    U: INPUT_OFFSET.KEYBOARD + 85,
    V: INPUT_OFFSET.KEYBOARD + 86,
    W: INPUT_OFFSET.KEYBOARD + 87,
    X: INPUT_OFFSET.KEYBOARD + 88,
    Y: INPUT_OFFSET.KEYBOARD + 89,
    Z: INPUT_OFFSET.KEYBOARD + 90,
    NumPad0: INPUT_OFFSET.KEYBOARD + 96,
    NumPad1: INPUT_OFFSET.KEYBOARD + 97,
    NumPad2: INPUT_OFFSET.KEYBOARD + 98,
    NumPad3: INPUT_OFFSET.KEYBOARD + 99,
    NumPad4: INPUT_OFFSET.KEYBOARD + 100,
    NumPad5: INPUT_OFFSET.KEYBOARD + 101,
    NumPad6: INPUT_OFFSET.KEYBOARD + 102,
    NumPad7: INPUT_OFFSET.KEYBOARD + 103,
    NumPad8: INPUT_OFFSET.KEYBOARD + 104,
    NumPad9: INPUT_OFFSET.KEYBOARD + 105,
    NumPadMultiply: INPUT_OFFSET.KEYBOARD + 106,
    NumPadAdd: INPUT_OFFSET.KEYBOARD + 107,
    NumPadEnter: INPUT_OFFSET.KEYBOARD + 108,
    NumPadSubtract: INPUT_OFFSET.KEYBOARD + 109,
    NumPadDecimal: INPUT_OFFSET.KEYBOARD + 110,
    NumPadDivide: INPUT_OFFSET.KEYBOARD + 111,
    F1: INPUT_OFFSET.KEYBOARD + 112,
    F2: INPUT_OFFSET.KEYBOARD + 113,
    F3: INPUT_OFFSET.KEYBOARD + 114,
    F4: INPUT_OFFSET.KEYBOARD + 115,
    F5: INPUT_OFFSET.KEYBOARD + 116,
    F6: INPUT_OFFSET.KEYBOARD + 117,
    F7: INPUT_OFFSET.KEYBOARD + 118,
    F8: INPUT_OFFSET.KEYBOARD + 119,
    F9: INPUT_OFFSET.KEYBOARD + 120,
    F10: INPUT_OFFSET.KEYBOARD + 121,
    F11: INPUT_OFFSET.KEYBOARD + 122,
    F12: INPUT_OFFSET.KEYBOARD + 123,
    NumLock: INPUT_OFFSET.KEYBOARD + 144,
    ScrollLock: INPUT_OFFSET.KEYBOARD + 145,
    Colon: INPUT_OFFSET.KEYBOARD + 186,
    Equals: INPUT_OFFSET.KEYBOARD + 187,
    Comma: INPUT_OFFSET.KEYBOARD + 188,
    Dash: INPUT_OFFSET.KEYBOARD + 189,
    Period: INPUT_OFFSET.KEYBOARD + 190,
    QuestionMark: INPUT_OFFSET.KEYBOARD + 191,
    Tilde: INPUT_OFFSET.KEYBOARD + 192,
    OpenBracket: INPUT_OFFSET.KEYBOARD + 219,
    BackwardSlash: INPUT_OFFSET.KEYBOARD + 220,
    ClosedBracket: INPUT_OFFSET.KEYBOARD + 221,
    Quotes: INPUT_OFFSET.KEYBOARD + 222
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
    MouseLeft: INPUT_OFFSET.POINTER + 0,
    MouseMiddle: INPUT_OFFSET.POINTER + 1,
    MouseRight: INPUT_OFFSET.POINTER + 2,
    MouseBack: INPUT_OFFSET.POINTER + 3,
    MouseForward: INPUT_OFFSET.POINTER + 4,
    MouseMove: INPUT_OFFSET.POINTER + 5,
    MouseScroll: INPUT_OFFSET.POINTER + 6,
    PenContact: INPUT_OFFSET.POINTER + 7,
    PenBarrel: INPUT_OFFSET.POINTER + 8,
    PenEraser: INPUT_OFFSET.POINTER + 9
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
 * @property {Number} LeftTriggerBottom
 * @property {Number} RightTriggerBottom
 * @property {Number} LeftTriggerTop
 * @property {Number} RightTriggerTop
 * @property {Number} Select
 * @property {Number} Start
 * @property {Number} LeftStick
 * @property {Number} RightStick
 * @property {Number} DPadUp
 * @property {Number} DPadDown
 * @property {Number} DPadLeft
 * @property {Number} DPadRight
 * @property {Number} Special
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
    FaceBottom: INPUT_OFFSET.GAMEPAD + 0,
    FaceLeft: INPUT_OFFSET.GAMEPAD + 1,
    FaceRight: INPUT_OFFSET.GAMEPAD + 2,
    FaceTop: INPUT_OFFSET.GAMEPAD + 3,
    LeftTriggerBottom: INPUT_OFFSET.GAMEPAD + 4,
    RightTriggerBottom: INPUT_OFFSET.GAMEPAD + 5,
    LeftTriggerTop: INPUT_OFFSET.GAMEPAD + 6,
    RightTriggerTop: INPUT_OFFSET.GAMEPAD + 7,
    Select: INPUT_OFFSET.GAMEPAD + 8,
    Start: INPUT_OFFSET.GAMEPAD + 9,
    LeftStick: INPUT_OFFSET.GAMEPAD + 10,
    RightStick: INPUT_OFFSET.GAMEPAD + 11,
    DPadUp: INPUT_OFFSET.GAMEPAD + 12,
    DPadDown: INPUT_OFFSET.GAMEPAD + 13,
    DPadLeft: INPUT_OFFSET.GAMEPAD + 14,
    DPadRight: INPUT_OFFSET.GAMEPAD + 15,
    Special: INPUT_OFFSET.GAMEPAD + 16,
    LeftStickLeft: INPUT_OFFSET.GAMEPAD + 17,
    LeftStickRight: INPUT_OFFSET.GAMEPAD + 18,
    LeftStickUp: INPUT_OFFSET.GAMEPAD + 19,
    LeftStickDown: INPUT_OFFSET.GAMEPAD + 20,
    RightStickLeft: INPUT_OFFSET.GAMEPAD + 21,
    RightStickRight: INPUT_OFFSET.GAMEPAD + 22,
    RightStickUp: INPUT_OFFSET.GAMEPAD + 23,
    RightStickDown: INPUT_OFFSET.GAMEPAD + 24
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
 * @typedef {Object} BlendMode
 * @property {Number} src
 * @property {Number} dst
 */

/**
 * @public
 * @constant
 * @name BLEND_MODE
 * @type {Object<String, BlendMode>}
 * @property {BlendMode} NORMAL
 * @property {BlendMode} ADD
 * @property {BlendMode} MULTIPLY
 * @property {BlendMode} SCREEN
 */
BLEND_MODE = exports.BLEND_MODE = {
    NORMAL: {
        src: 0x0001,
        dst: 0x0303
    },
    ADD: {
        src: 0x0302,
        dst: 0x0304
    },
    MULTIPLY: {
        src: 0x0304,
        dst: 0x0303
    },
    SCREEN: {
        src: 0x0302,
        dst: 0x0001
    }
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
exports.removeFlag = exports.addFlag = exports.hasFlag = exports.determineMimeType = exports.removeItems = exports.rgbToHex = exports.inRange = exports.isPowerOfTwo = exports.sign = exports.clamp = exports.radiansToDegrees = exports.degreesToRadians = exports.decodeAudioBuffer = exports.supportsCodec = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _const = __webpack_require__(0);

var _support = __webpack_require__(5);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var

/**
 * @private
 * @constant
 * @type {HTMLAudioElement}
 */
audio = document.createElement('audio'),


/**
 * @private
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
    return degree * _const.DEG_TO_RAD;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} radian
 * @returns {Number}
 */
radiansToDegrees = function radiansToDegrees(radian) {
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
clamp = function clamp(value, min, max) {
    return Math.min(Math.max(value, Math.min(max, value)), Math.max(min, max));
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
 * @private
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
 * @private
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
};

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

/***/ }),
/* 2 */
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
         * @param {Vector} vector
         * @returns {Boolean}
         */

    }, {
        key: "equals",
        value: function equals(vector) {
            return vector === this || this._x === vector.x && this._y === vector.y;
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
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _const = __webpack_require__(0);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _DefaultGamepadMapping = __webpack_require__(44);

var _DefaultGamepadMapping2 = _interopRequireDefault(_DefaultGamepadMapping);

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
        soundVolume: 1,
        musicVolume: 1,
        masterVolume: 1,
        videoVolume: 1,
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
     * @type {Object<String, Number>}
     * @default BLEND_MODE.NORMAL
     */
    BLEND_MODE: _const.BLEND_MODE.MULTIPLY,

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
    BATCH_LIMIT_SPRITES: 2500,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 5000
     */
    BATCH_LIMIT_PARTICLES: 5000,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 300
     */
    INPUT_THRESHOLD: 300,

    /**
     * @public
     * @static
     * @type {GamepadMapping}
     * @default {DefaultGamepadMapping}
     */
    GAMEPAD_MAPPING: new _DefaultGamepadMapping2.default()
};

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _utils = __webpack_require__(1);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Shape2 = __webpack_require__(17);

var _Shape3 = _interopRequireDefault(_Shape2);

var _Collision = __webpack_require__(18);

var _Collision2 = _interopRequireDefault(_Collision);

var _Size = __webpack_require__(13);

var _Size2 = _interopRequireDefault(_Size);

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
         * @member {Size}
         */
        var _this = _possibleConstructorReturn(this, (Rectangle.__proto__ || Object.getPrototypeOf(Rectangle)).call(this, x, y));

        _this._size = new _Size2.default(width, height);
        return _this;
    }

    /**
     * @override
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
            this.position.set(x, y);
            this._size.set(width, height);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(rectangle) {
            this.position.copy(rectangle.position);
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
        key: 'equals',
        value: function equals(rectangle) {
            return rectangle === this || this.position.equals(rectangle.position) && this._size.equals(rectangle.size);
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
         * @override
         */

    }, {
        key: 'getCollision',
        value: function getCollision(shape) {
            switch (shape.type) {
                case _const.SHAPE.RECTANGLE:
                    return _Collision2.default.checkRectangleRectangle(this, shape);
                case _const.SHAPE.CIRCLE:
                    return _Collision2.default.checkCircleRectangle(shape, this);
                case _const.SHAPE.POLYGON:
                    return _Collision2.default.checkPolygonRectangle(shape, this);
                case _const.SHAPE.NONE:
                default:
                    throw new Error('Invalid Shape Type "' + shape.type + '".');
            }
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Rectangle.prototype.__proto__ || Object.getPrototypeOf(Rectangle.prototype), 'destroy', this).call(this);

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
}(_Shape3.default);

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

var _utils = __webpack_require__(1);

var _Vector = __webpack_require__(2);

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
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */


    _createClass(Matrix, [{
        key: 'set',


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
         * @returns {Matrix}
         */

    }, {
        key: 'inverse',
        value: function inverse() {
            var determinant = this.a * (this.z * this.d - this.y * this.f) - this.b * (this.z * this.c - this.y * this.e) + this.x * (this.f * this.c - this.d * this.e);

            if (determinant !== 0) {
                return this.set((this.z * this.d - this.y * this.f) / determinant, (this.z * this.c - this.y * this.e) / -determinant, (this.f * this.c - this.d * this.e) / determinant, (this.z * this.b - this.x * this.f) / -determinant, (this.z * this.a - this.x * this.e) / determinant, (this.f * this.a - this.b * this.e) / -determinant, (this.y * this.b - this.x * this.d) / determinant, (this.y * this.a - this.x * this.c) / -determinant, (this.d * this.a - this.b * this.c) / determinant);
            }

            return this.copy(Matrix.Identity);
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} [y=x]
         * @returns {Matrix}
         */

    }, {
        key: 'translate',
        value: function translate(x) {
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

            return transpose ? this.transposedArray : this.array;
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
    }, {
        key: 'array',
        get: function get() {
            var array = this._array || (this._array = new Float32Array(9));

            array[0] = this.a;array[1] = this.c;array[2] = this.e;
            array[3] = this.b;array[4] = this.d;array[5] = this.f;
            array[6] = this.x;array[7] = this.y;array[8] = this.z;

            return array;
        }

        /**
         * @public
         * @readonly
         * @member {Float32Array}
         */

    }, {
        key: 'transposedArray',
        get: function get() {
            var array = this._array || (this._array = new Float32Array(9));

            array[0] = this.a;array[1] = this.b;array[2] = this.x;
            array[3] = this.c;array[4] = this.d;array[5] = this.y;
            array[6] = this.e;array[7] = this.f;array[8] = this.z;

            return array;
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
     * @returns {Boolean}
     * @param {Color} color
     * @param {Boolean} [ignoreAlpha=false]
     */

  }, {
    key: 'equals',
    value: function equals(color) {
      var ignoreAlpha = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

      return color === this || this._r === color.r && this._g === color.g && this._b === color.b && (ignoreAlpha || this._a === color.a);
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
 * @extends {EventEmitter}
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
         * @param {Time} time
         * @returns {Boolean}
         */

    }, {
        key: 'equals',
        value: function equals(time) {
            return this._milliseconds === time.milliseconds;
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
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ResourceFactory2 = __webpack_require__(14);

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
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ArrayBufferFactory2 = __webpack_require__(11);

var _ArrayBufferFactory3 = _interopRequireDefault(_ArrayBufferFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class BlobFactory
 * @extends {ArrayBufferFactory}
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
/* 13 */
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
         * @param {Size} Size
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
         * @param {Size} size
         * @returns {Boolean}
         */

    }, {
        key: "equals",
        value: function equals(size) {
            return size === this || this._width === size.width && this._height === size.height;
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
/* 14 */
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
            // eslint-disable-line
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
            // eslint-disable-line
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
/* 15 */
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
 * @abstract
 * @class Playable
 * @extends {EventEmitter}
 */
var Playable = function (_EventEmitter) {
    _inherits(Playable, _EventEmitter);

    /**
     * @constructor
     * @param {HTMLMediaElement|AudioBuffer} source
     */
    function Playable(source) {
        _classCallCheck(this, Playable);

        /**
         * @private
         * @member {HTMLMediaElement|AudioBuffer}
         */
        var _this = _possibleConstructorReturn(this, (Playable.__proto__ || Object.getPrototypeOf(Playable)).call(this));

        _this._source = source;

        /**
         * @private
         * @member {Number}
         */
        _this._duration = source.duration || 0;

        /**
         * @private
         * @member {Number}
         */
        _this._volume = source.volume || 1;

        /**
         * @private
         * @member {Number}
         */
        _this._speed = source.playbackRate || 1;

        /**
         * @private
         * @member {Boolean}
         */
        _this._loop = source.loop || false;
        return _this;
    }

    /**
     * @public
     * @abstract
     * @readonly
     * @member {?AudioContext}
     */


    _createClass(Playable, [{
        key: 'connect',


        /**
         * @public
         * @abstract
         * @param {MediaManager} mediaManager
         */
        value: function connect(mediaManager) {} // eslint-disable-line
        // do nothing


        /**
         * @public
         * @param {Object} [options]
         * @param {Boolean} [options.loop]
         * @param {Number} [options.speed]
         * @param {Number} [options.volume]
         * @param {Number} [options.time]
         */

    }, {
        key: 'play',
        value: function play(options) {
            if (this.paused) {
                this.applyOptions(options);
                this._source.play();
                this.trigger('start');
            }
        }

        /**
         * @public
         */

    }, {
        key: 'pause',
        value: function pause() {
            if (this.playing) {
                this._source.pause();
                this.trigger('stop');
            }
        }

        /**
         * @public
         */

    }, {
        key: 'stop',
        value: function stop() {
            this.pause();
            this.currentTime = 0;
        }

        /**
         * @public
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
         * @param {Object} [options]
         * @param {Boolean} [options.loop]
         * @param {Number} [options.speed]
         * @param {Number} [options.volume]
         * @param {Number} [options.time]
         */

    }, {
        key: 'applyOptions',
        value: function applyOptions() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                loop = _ref.loop,
                speed = _ref.speed,
                volume = _ref.volume,
                time = _ref.time;

            if (loop !== undefined) {
                this.loop = loop;
            }

            if (speed !== undefined) {
                this.speed = speed;
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
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Playable.prototype.__proto__ || Object.getPrototypeOf(Playable.prototype), 'destroy', this).call(this);

            this.stop();

            this._source = null;
            this._duration = null;
            this._volume = null;
            this._speed = null;
            this._loop = null;
        }
    }, {
        key: 'audioContext',
        get: function get() {
            return null;
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

        /**
         * @public
         * @readonly
         * @member {HTMLMediaElement|*}
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
                this._source.volume = this._volume = volume;
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
                this._source.loop = this._loop = loop;
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
                this._source.playbackRate = this._speed = speed;
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
    }]);

    return Playable;
}(_EventEmitter3.default);

exports.default = Playable;

/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _settings = __webpack_require__(3);

var _settings2 = _interopRequireDefault(_settings);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var FLAGS = {
    NONE: 0,
    SCALE_MODE: 1 << 0,
    WRAP_MODE: 1 << 1,
    PREMULTIPLY_ALPHA: 1 << 2,
    SOURCE: 1 << 3,
    SOURCE_FRAME: 1 << 4
};

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
         * @member {Rectangle}
         */
        this._sourceFrame = new _Rectangle2.default();

        /**
         * @private
         * @member {?RenderState}
         */
        this._renderState = null;

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
        this._flags = FLAGS.SCALE_MODE | FLAGS.WRAP_MODE | FLAGS.PREMULTIPLY_ALPHA;

        if (source) {
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
                this.updateSource();
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
                this._flags = (0, _utils.addFlag)(FLAGS.SCALE_MODE, this._flags);
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
                this._flags = (0, _utils.addFlag)(FLAGS.WRAP_MODE, this._flags);
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
                this._flags = (0, _utils.addFlag)(FLAGS.PREMULTIPLY_ALPHA, this._flags);
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
            this._flags = (0, _utils.addFlag)(FLAGS.SOURCE | FLAGS.SOURCE_FRAME, this._flags);

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
            if (this._flags && this._renderState) {
                if ((0, _utils.hasFlag)(FLAGS.SCALE_MODE, this._flags)) {
                    this._renderState.setScaleMode(this, this._scaleMode);

                    this._flags = (0, _utils.removeFlag)(FLAGS.SCALE_MODE, this._flags);
                }

                if ((0, _utils.hasFlag)(FLAGS.WRAP_MODE, this._flags)) {
                    this._renderState.setWrapMode(this, this._wrapMode);

                    this._flags = (0, _utils.removeFlag)(FLAGS.WRAP_MODE, this._flags);
                }

                if ((0, _utils.hasFlag)(FLAGS.PREMULTIPLY_ALPHA, this._flags)) {
                    this._renderState.setPremultiplyAlpha(this, this._premultiplyAlpha);

                    this._flags = (0, _utils.removeFlag)(FLAGS.PREMULTIPLY_ALPHA, this._flags);
                }

                if ((0, _utils.hasFlag)(FLAGS.SOURCE, this._flags) && this._source) {
                    this._renderState.setTextureImage(this, this._source);

                    this._flags = (0, _utils.removeFlag)(FLAGS.SOURCE, this._flags);
                }
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {RenderState} renderState
         * @param {Number}  [unit]
         * @returns {Texture}
         */

    }, {
        key: 'bind',
        value: function bind(renderState, unit) {
            if (!this._renderState) {
                this._renderState = renderState;
            }

            this._renderState.bindTexture(this, unit);

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            if (this._renderState) {
                this._renderState.removeTexture(this);
                this._renderState = null;
            }

            this._source = null;

            this._sourceFrame.destroy();
            this._sourceFrame = null;

            this._scaleMode = null;
            this._wrapMode = null;
            this._premultiplyAlpha = null;
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
         * @readonly
         * @member {Rectangle}
         */

    }, {
        key: 'sourceFrame',
        get: function get() {
            if ((0, _utils.hasFlag)(FLAGS.SOURCE_FRAME, this._flags)) {
                if (this._source) {
                    this._sourceFrame.set(0, 0, this._source.videoWidth || this._source.width, this._source.videoHeight || this._source.height);
                } else {
                    this._sourceFrame.set(0, 0, 0, 0);
                }

                this._flags = (0, _utils.removeFlag)(FLAGS.SOURCE_FRAME, this._flags);
            }

            return this._sourceFrame;
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
         * @readonly
         * @member {Size}
         */

    }, {
        key: 'size',
        get: function get() {
            return this.sourceFrame.size;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return this.sourceFrame.width;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this.sourceFrame.height;
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

var _const = __webpack_require__(0);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @abstract
 * @class Shape
 */
var Shape = function () {

    /**
     * @constructor
     */
    function Shape() {
        var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

        _classCallCheck(this, Shape);

        /**
         * @private
         * @member {Vector}
         */
        this._position = new _Vector2.default(x, y);

        /**
         * @private
         * @member {?Rectangle|?Bounds} _bounds
         */
        this._bounds = null;
    }

    /**
     * @public
     * @abstract
     * @readonly
     * @member {Number}
     */


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
         * @param {Shape|Rectangle|Circle|Polygon} shape
         */

    }, {
        key: 'copy',
        value: function copy(shape) {
            throw new Error('Method not implemented!');
        }

        /**
         * @public
         * @abstract
         * @returns {Shape|Rectangle|Circle|Polygon}
         */

    }, {
        key: 'clone',
        value: function clone() {
            throw new Error('Method not implemented!');
        }

        /**
         * @public
         * @abstract
         * @param {Shape|Rectangle|Circle|Polygon} shape
         */

    }, {
        key: 'equals',
        value: function equals(shape) {
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
         * @param {Number} x
         * @param {Number} y
         * @param {Matrix} [transform]
         * @returns {Boolean}
         */

    }, {
        key: 'contains',
        value: function contains(x, y, transform) {
            throw new Error('Method not implemented!');
        }

        /**
         * @public
         * @abstract
         * @param {Shape|Rectangle|Circle|Polygon} shape
         * @returns {?Collision}
         */

    }, {
        key: 'getCollision',
        value: function getCollision(shape) {
            throw new Error('Method not implemented!');
        }

        /**
         * @public
         * @abstract
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            if (this._bounds) {
                this._bounds.destroy();
                this._bounds = null;
            }

            this._position.destroy();
            this._position = null;
        }
    }, {
        key: 'type',
        get: function get() {
            return _const.SHAPE.NONE;
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
         * @readonly
         * @member {Rectangle}
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
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Interval = __webpack_require__(25);

var _Interval2 = _interopRequireDefault(_Interval);

var _Polygon = __webpack_require__(43);

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
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Matrix = __webpack_require__(7);

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
         * @param {Vector} point
         * @param {Matrix} [transform]
         * @returns {Bounds}
         */

    }, {
        key: 'addPoint',
        value: function addPoint(point, transform) {
            if (transform) {
                point = point.transform(transform, _Vector2.default.Temp);
            }

            return this.addCoords(point.x, point.y);
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
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _SceneNode2 = __webpack_require__(27);

var _SceneNode3 = _interopRequireDefault(_SceneNode2);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _settings = __webpack_require__(3);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Renderable
 * @extends {SceneNode}
 */
var Renderable = function (_SceneNode) {
    _inherits(Renderable, _SceneNode);

    /**
     * @constructor
     */
    function Renderable() {
        _classCallCheck(this, Renderable);

        /**
         * @private
         * @member {Color}
         */
        var _this = _possibleConstructorReturn(this, (Renderable.__proto__ || Object.getPrototypeOf(Renderable)).call(this));

        _this._tint = _Color2.default.White.clone();

        /**
         * @private
         * @member {Number}
         */
        _this._blendMode = _settings2.default.BLEND_MODE;
        return _this;
    }

    /**
     * @public
     * @member {Color}
     */


    _createClass(Renderable, [{
        key: 'render',


        /**
         * @public
         * @virtual
         * @chainable
         * @param {DisplayManager} displayManager
         * @returns {Renderable}
         */
        value: function render(displayManager) {
            throw new Error('Method not implemented!');
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Renderable.prototype.__proto__ || Object.getPrototypeOf(Renderable.prototype), 'destroy', this).call(this);

            this._tint.destroy();
            this._tint = null;

            this._blendMode = null;
        }
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
         * @member {Object}
         */

    }, {
        key: 'blendMode',
        get: function get() {
            return this._blendMode;
        },
        set: function set(blendMode) {
            this._blendMode = blendMode;
        }
    }]);

    return Renderable;
}(_SceneNode3.default);

exports.default = Renderable;

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
 * @abstract
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
     * @abstract
     * @param {Particle} particle
     * @param {Time} delta
     */
    value: function apply(particle, delta) {
      // eslint-disable-line
      throw new Error('Method not implemented!');
    }
  }]);

  return ParticleModifier;
}();

exports.default = ParticleModifier;

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ArrayBufferFactory2 = __webpack_require__(11);

var _ArrayBufferFactory3 = _interopRequireDefault(_ArrayBufferFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class AudioBufferFactory
 * @extends {ArrayBufferFactory}
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
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _BlobFactory2 = __webpack_require__(12);

var _BlobFactory3 = _interopRequireDefault(_BlobFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class AudioFactory
 * @extends {BlobFactory}
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
                        return reject(Error('Error loading audio source.'));
                    });
                    audio.addEventListener('abort', function () {
                        return reject(Error('Audio loading was canceled.'));
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
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _BlobFactory2 = __webpack_require__(12);

var _BlobFactory3 = _interopRequireDefault(_BlobFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ImageFactory
 * @extends {BlobFactory}
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
/* 25 */
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
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _Time = __webpack_require__(10);

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
      return this.getElapsedMilliseconds() / _const.TIME.SECONDS;
    }

    /**
     * @public
     * @returns {Number}
     */

  }, {
    key: 'getElapsedMinutes',
    value: function getElapsedMinutes() {
      return this.getElapsedMilliseconds() / _const.TIME.MINUTES;
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
  }]);

  return Clock;
}();

exports.default = Clock;

/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Transformable2 = __webpack_require__(49);

var _Transformable3 = _interopRequireDefault(_Transformable2);

var _Matrix = __webpack_require__(7);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Bounds = __webpack_require__(19);

var _Bounds2 = _interopRequireDefault(_Bounds);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SceneNode
 * @extends {Transformable}
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
         * @member {?Scene}
         */
        var _this = _possibleConstructorReturn(this, (SceneNode.__proto__ || Object.getPrototypeOf(SceneNode)).call(this));

        _this._scene = null;

        /**
         * @private
         * @member {?SceneNode}
         */
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

            if (this._dirtyTransform) {
                this.updateTransform();
                this._dirtyTransform = false;
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

            this._scene = null;
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
/* 28 */
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
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Size = __webpack_require__(13);

var _Size2 = _interopRequireDefault(_Size);

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
         * @member {Size}
         */
        this._size = new _Size2.default(width, height);

        /**
         * @private
         * @member {?RenderState}
         */
        this._renderState = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._isRoot = isRoot;
    }

    /**
     * @public
     * @member {Boolean}
     */


    _createClass(RenderTarget, [{
        key: 'bind',


        /**
         * @public
         * @param {RenderState} renderState
         */
        value: function bind(renderState) {
            if (!this._renderState) {
                this._renderState = renderState;
            }

            this._renderState.bindRenderTarget(this);

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            if (this._renderState) {
                this._renderState.removeRenderTarget(this);
                this._renderState = null;
            }

            this._size.destroy();
            this._size = null;

            this._isRoot = null;
        }
    }, {
        key: 'isRoot',
        get: function get() {
            return this._isRoot;
        },
        set: function set(isRoot) {
            this._isRoot = isRoot;
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
            this._size.width = width | 0;
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
            this._size.height = height | 0;
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
         * @member {?RenderState}
         */
        this._renderState = null;

        /**
         * @private
         * @member {?WebGLBuffer}
         */
        this._vertexBuffer = null;

        /**
         * @private
         * @member {?WebGLBuffer}
         */
        this._indexBuffer = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;
    }

    /**
     * @public
     * @member {Boolean}
     */


    _createClass(Renderer, [{
        key: "bind",


        /**
         * @abstract
         * @public
         * @param {RenderState} renderState
         */
        value: function bind(renderState) {}
        // do nothing


        /**
         * @abstract
         * @public
         * @chainable
         * @returns {Renderer}
         */

    }, {
        key: "unbind",
        value: function unbind() {}
        // do nothing


        /**
         * @abstract
         * @public
         * @chainable
         * @param {*} renderable
         * @returns {Renderer}
         */

    }, {
        key: "render",
        value: function render(renderable) {} // eslint-disable-line
        // do nothing


        /**
         * @abstract
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
         */

    }, {
        key: "destroy",
        value: function destroy() {
            if (this._bound) {
                this.unbind();
            }

            if (this._renderState) {
                this._renderState.deleteBuffer(this._indexBuffer);
                this._indexBuffer = null;

                this._renderState.deleteBuffer(this._vertexBuffer);
                this._vertexBuffer = null;

                this._renderState = null;
            }

            this._bound = null;
        }
    }, {
        key: "bound",
        get: function get() {
            return this._bound;
        },
        set: function set(value) {
            this._bound = value;
        }
    }]);

    return Renderer;
}();

exports.default = Renderer;

/***/ }),
/* 31 */
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
         * @member {?RenderState}
         */
        this._renderState = null;

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
        key: 'bind',


        /**
         * @public
         * @chainable
         * @param {RenderState} renderState
         * @returns {Shader}
         */
        value: function bind(renderState) {
            if (!this._renderState) {
                this._renderState = renderState;
                this._program = renderState.compileProgram(this._vertexSource, this._fragmentSource);
            }

            if (!this._bound) {
                var _renderState = this._renderState,
                    program = this._program;

                _renderState.useProgram(program);

                var offset = 0;

                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = this._attributes.values()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var attribute = _step.value;

                        attribute.bind(_renderState, program, this._stride, offset);

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

                        uniform.bind(_renderState, program);
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

                this._bound = true;
            }

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'unbind',
        value: function unbind() {
            if (this._bound) {
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

                this._bound = false;
            }

            return this;
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
            var _iteratorNormalCompletion5 = true;
            var _didIteratorError5 = false;
            var _iteratorError5 = undefined;

            try {
                for (var _iterator5 = attributes[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                    var item = _step5.value;

                    var attribute = item instanceof _ShaderAttribute2.default ? item : new _ShaderAttribute2.default(item);

                    this._attributes.set(attribute.name, attribute);
                    this._stride += attribute.byteSize;
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
            var _iteratorNormalCompletion6 = true;
            var _didIteratorError6 = false;
            var _iteratorError6 = undefined;

            try {
                for (var _iterator6 = uniforms[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                    var item = _step6.value;

                    var uniform = item instanceof _ShaderUniform2.default ? item : new _ShaderUniform2.default(item);

                    this._uniforms.set(uniform.name, uniform);
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

            var _iteratorNormalCompletion7 = true;
            var _didIteratorError7 = false;
            var _iteratorError7 = undefined;

            try {
                for (var _iterator7 = this._attributes.values()[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                    var attribute = _step7.value;

                    attribute.destroy();
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

            var _iteratorNormalCompletion8 = true;
            var _didIteratorError8 = false;
            var _iteratorError8 = undefined;

            try {
                for (var _iterator8 = this._uniforms.values()[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
                    var uniform = _step8.value;

                    uniform.destroy();
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

            if (this._renderState) {
                this._renderState.deleteProgram(this._program);
                this._renderState = null;
                this._program = null;
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
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Container2 = __webpack_require__(67);

var _Container3 = _interopRequireDefault(_Container2);

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Sprite
 * @extends {Container}
 */
var Sprite = function (_Container) {
    _inherits(Sprite, _Container);

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
         * @private
         * @member {Rectangle}
         */
        _this._textureFrame = new _Rectangle2.default();

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
     * @member {Texture}
     */


    _createClass(Sprite, [{
        key: 'setTexture',


        /**
         * @public
         * @chainable
         * @param {Texture} texture
         * @returns {Sprite}
         */
        value: function setTexture(texture) {
            this._texture = texture;
            this.updateTexture();

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Rectangle} frame
         * @returns {Sprite}
         */

    }, {
        key: 'setTextureFrame',
        value: function setTextureFrame(frame) {
            this._textureFrame.copy(frame);
            this._updateTexCoords = true;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager) {
            if (this.active) {
                displayManager.render(this, 'sprite');

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
         * @public
         * @returns {Float32Array}
         */

    }, {
        key: 'getPositionData',
        value: function getPositionData() {
            this.updatePositionData();

            return this._positionData;
        }

        /**
         * @public
         * @chainable
         * @returns {Sprite}
         */

    }, {
        key: 'updatePositionData',
        value: function updatePositionData() {
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

            return this;
        }

        /**
         * @public
         * @returns {Uint32Array}
         */

    }, {
        key: 'getTexCoordData',
        value: function getTexCoordData() {
            if (this._updateTexCoords) {
                this.updateTexCoordData();
                this._updateTexCoords = false;
            }

            return this._texCoordData;
        }

        /**
         * @public
         * @chainable
         * @returns {Sprite}
         */

    }, {
        key: 'updateTexCoordData',
        value: function updateTexCoordData() {
            var texCoordData = this._texCoordData,
                _textureFrame = this._textureFrame,
                left = _textureFrame.left,
                top = _textureFrame.top,
                right = _textureFrame.right,
                bottom = _textureFrame.bottom,
                _texture = this._texture,
                width = _texture.width,
                height = _texture.height,
                minX = left / width * 65535 & 65535,
                minY = (top / height * 65535 & 65535) << 16,
                maxX = right / width * 65535 & 65535,
                maxY = (bottom / height * 65535 & 65535) << 16;


            texCoordData[0] = minY | minX;
            texCoordData[1] = minY | maxX;
            texCoordData[2] = maxY | minX;
            texCoordData[3] = maxY | maxX;

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
                this._localBounds.set(0, 0, this._texture.width, this._texture.height);
                this.setTextureFrame(this._texture.sourceFrame);
                this.scale.set(1, 1);
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

            this._texture = null;

            this._textureFrame.destroy();
            this._textureFrame = null;

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
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return Math.abs(this.scale.x) * this._texture.width;
        },
        set: function set(value) {
            this.scale.x = value / this._texture.width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return Math.abs(this.scale.y) * this._texture.height;
        },
        set: function set(value) {
            this.scale.y = value / this._texture.height;
        }
    }]);

    return Sprite;
}(_Container3.default);

exports.default = Sprite;

/***/ }),
/* 33 */
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

var _ResourceContainer = __webpack_require__(34);

var _ResourceContainer2 = _interopRequireDefault(_ResourceContainer);

var _ArrayBufferFactory = __webpack_require__(11);

var _ArrayBufferFactory2 = _interopRequireDefault(_ArrayBufferFactory);

var _AudioBufferFactory = __webpack_require__(22);

var _AudioBufferFactory2 = _interopRequireDefault(_AudioBufferFactory);

var _AudioFactory = __webpack_require__(23);

var _AudioFactory2 = _interopRequireDefault(_AudioFactory);

var _BlobFactory = __webpack_require__(12);

var _BlobFactory2 = _interopRequireDefault(_BlobFactory);

var _FontFactory = __webpack_require__(35);

var _FontFactory2 = _interopRequireDefault(_FontFactory);

var _ImageFactory = __webpack_require__(24);

var _ImageFactory2 = _interopRequireDefault(_ImageFactory);

var _JSONFactory = __webpack_require__(36);

var _JSONFactory2 = _interopRequireDefault(_JSONFactory);

var _MusicFactory = __webpack_require__(37);

var _MusicFactory2 = _interopRequireDefault(_MusicFactory);

var _SoundFactory = __webpack_require__(39);

var _SoundFactory2 = _interopRequireDefault(_SoundFactory);

var _StringFactory = __webpack_require__(41);

var _StringFactory2 = _interopRequireDefault(_StringFactory);

var _TextureFactory = __webpack_require__(42);

var _TextureFactory2 = _interopRequireDefault(_TextureFactory);

var _VideoFactory = __webpack_require__(47);

var _VideoFactory2 = _interopRequireDefault(_VideoFactory);

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

        _this.addFactory('arrayBuffer', new _ArrayBufferFactory2.default()).addFactory('audioBuffer', new _AudioBufferFactory2.default()).addFactory('audio', new _AudioFactory2.default()).addFactory('blob', new _BlobFactory2.default()).addFactory('font', new _FontFactory2.default()).addFactory('image', new _ImageFactory2.default()).addFactory('json', new _JSONFactory2.default()).addFactory('music', new _MusicFactory2.default()).addFactory('sound', new _SoundFactory2.default()).addFactory('string', new _StringFactory2.default()).addFactory('texture', new _TextureFactory2.default()).addFactory('video', new _VideoFactory2.default());
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
/* 34 */
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
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ArrayBufferFactory2 = __webpack_require__(11);

var _ArrayBufferFactory3 = _interopRequireDefault(_ArrayBufferFactory2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class FontFactory
 * @extends {ArrayBufferFactory}
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
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ResourceFactory2 = __webpack_require__(14);

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
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _AudioFactory2 = __webpack_require__(23);

var _AudioFactory3 = _interopRequireDefault(_AudioFactory2);

var _Music = __webpack_require__(38);

var _Music2 = _interopRequireDefault(_Music);

var _support = __webpack_require__(5);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class MusicFactory
 * @extends {AudioFactory}
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
/* 38 */
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

        var _this = _possibleConstructorReturn(this, (Music.__proto__ || Object.getPrototypeOf(Music)).call(this, audio));

        if (!_support2.default.webAudio) {
            throw new Error('Web Audio API is not supported, use the fallback Audio instead.');
        }

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
     * @override
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
            this._gainNode.gain.value = this._volume;

            this._sourceNode = this._audioContext.createMediaElementSource(this.source);
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
        key: 'analyserTarget',
        get: function get() {
            return this._gainNode;
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

                if (this._gainNode) {
                    this._gainNode.gain.value = volume;
                }
            }
        }
    }]);

    return Music;
}(_Playable3.default);

exports.default = Music;

/***/ }),
/* 39 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _AudioBufferFactory2 = __webpack_require__(22);

var _AudioBufferFactory3 = _interopRequireDefault(_AudioBufferFactory2);

var _Sound = __webpack_require__(40);

var _Sound2 = _interopRequireDefault(_Sound);

var _support = __webpack_require__(5);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SoundFactory
 * @extends {AudioBufferFactory}
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
/* 40 */
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

        var _this = _possibleConstructorReturn(this, (Sound.__proto__ || Object.getPrototypeOf(Sound)).call(this, audioBuffer));

        if (!_support2.default.webAudio) {
            throw new Error('Web Audio API is not supported, use the fallback Audio instead.');
        }

        /**
         * @private
         * @member {?AudioContext}
         */
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
        return _this;
    }

    /**
     * @override
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
            this._gainNode.gain.value = this._volume;
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

            this.applyOptions(options);

            this._sourceNode = this._audioContext.createBufferSource();
            this._sourceNode.buffer = this.source;
            this._sourceNode.loop = this._loop;
            this._sourceNode.playbackRate.value = this._speed;

            this._sourceNode.connect(this._gainNode);
            this._sourceNode.start(0, this._currentTime);

            this._startTime = this._audioContext.currentTime;
            this._paused = false;

            this.trigger('start');
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

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Sound.prototype.__proto__ || Object.getPrototypeOf(Sound.prototype), 'destroy', this).call(this);

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
        key: 'analyserTarget',
        get: function get() {
            return this._gainNode;
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

                if (this._gainNode) {
                    this._gainNode.gain.value = volume;
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
    }]);

    return Sound;
}(_Playable3.default);

exports.default = Sound;

/***/ }),
/* 41 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ResourceFactory2 = __webpack_require__(14);

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
/* 42 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _ImageFactory2 = __webpack_require__(24);

var _ImageFactory3 = _interopRequireDefault(_ImageFactory2);

var _Texture = __webpack_require__(16);

var _Texture2 = _interopRequireDefault(_Texture);

var _settings = __webpack_require__(3);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class TextureFactory
 * @extends {ImageFactory}
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
                return new _Texture2.default(image, { scaleMode: scaleMode, wrapMode: wrapMode, premultiplyAlpha: premultiplyAlpha });
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
/* 43 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _Shape2 = __webpack_require__(17);

var _Shape3 = _interopRequireDefault(_Shape2);

var _Collision = __webpack_require__(18);

var _Collision2 = _interopRequireDefault(_Collision);

var _Bounds = __webpack_require__(19);

var _Bounds2 = _interopRequireDefault(_Bounds);

var _Interval = __webpack_require__(25);

var _Interval2 = _interopRequireDefault(_Interval);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

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
         * @member {Vector[]}
         */
        var _this = _possibleConstructorReturn(this, (Polygon.__proto__ || Object.getPrototypeOf(Polygon)).call(this, x, y));

        _this._points = points.map(function (point) {
            return point.clone();
        });
        return _this;
    }

    /**
     * @override
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
            this.position.set(x, y);
            this.setPoints(points);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(polygon) {
            this.position.copy(polygon.position);
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
         * @override
         */

    }, {
        key: 'equals',
        value: function equals(polygon) {
            return polygon === this || this._points.length === polygon.points.length && this._points.every(function (point, index) {
                return point.equals(polygon.points[index]);
            });
        }

        /**
         * @override
         */

    }, {
        key: 'getBounds',
        value: function getBounds() {
            if (!this._bounds) {
                this._bounds = new _Bounds2.default();
            } else {
                this._bounds.reset();
            }

            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {
                for (var _iterator3 = this._points[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                    var point = _step3.value;

                    this._bounds.addCoords(point.x + this.x, point.y + this.y);
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

            return this._bounds.getRect();
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
        key: 'getCollision',
        value: function getCollision(shape) {
            switch (shape.type) {
                case _const.SHAPE.RECTANGLE:
                    return _Collision2.default.checkPolygonRectangle(this, shape);
                case _const.SHAPE.CIRCLE:
                    return _Collision2.default.checkPolygonCircle(this, shape);
                case _const.SHAPE.POLYGON:
                    return _Collision2.default.checkPolygonPolygon(this, shape);
                case _const.SHAPE.NONE:
                default:
                    throw new Error('Invalid Shape Type "' + shape.type + '".');
            }
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Polygon.prototype.__proto__ || Object.getPrototypeOf(Polygon.prototype), 'destroy', this).call(this);

            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
                for (var _iterator4 = this._points[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                    var point = _step4.value;

                    point.destroy();
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

            this._points.length = 0;
            this._points = null;
        }
    }, {
        key: 'type',
        get: function get() {
            return _const.SHAPE.POLYGON;
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
}(_Shape3.default);

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
/* 44 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _const = __webpack_require__(0);

var _GamepadMapping2 = __webpack_require__(45);

var _GamepadMapping3 = _interopRequireDefault(_GamepadMapping2);

var _GamepadControl = __webpack_require__(46);

var _GamepadControl2 = _interopRequireDefault(_GamepadControl);

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

        return _possibleConstructorReturn(this, (DefaultGamepadMapping.__proto__ || Object.getPrototypeOf(DefaultGamepadMapping)).call(this, [new _GamepadControl2.default(0, _const.GAMEPAD.FaceBottom), new _GamepadControl2.default(1, _const.GAMEPAD.FaceLeft), new _GamepadControl2.default(2, _const.GAMEPAD.FaceRight), new _GamepadControl2.default(3, _const.GAMEPAD.FaceTop), new _GamepadControl2.default(4, _const.GAMEPAD.LeftTriggerBottom), new _GamepadControl2.default(5, _const.GAMEPAD.RightTriggerBottom), new _GamepadControl2.default(6, _const.GAMEPAD.LeftTriggerTop), new _GamepadControl2.default(7, _const.GAMEPAD.RightTriggerTop), new _GamepadControl2.default(8, _const.GAMEPAD.Select), new _GamepadControl2.default(9, _const.GAMEPAD.Start), new _GamepadControl2.default(10, _const.GAMEPAD.LeftStick), new _GamepadControl2.default(11, _const.GAMEPAD.RightStick), new _GamepadControl2.default(12, _const.GAMEPAD.DPadUp), new _GamepadControl2.default(13, _const.GAMEPAD.DPadDown), new _GamepadControl2.default(14, _const.GAMEPAD.DPadLeft), new _GamepadControl2.default(15, _const.GAMEPAD.DPadRight), new _GamepadControl2.default(16, _const.GAMEPAD.Special)], [new _GamepadControl2.default(0, _const.GAMEPAD.LeftStickLeft, { negate: true }), new _GamepadControl2.default(0, _const.GAMEPAD.LeftStickRight), new _GamepadControl2.default(1, _const.GAMEPAD.LeftStickUp, { negate: true }), new _GamepadControl2.default(1, _const.GAMEPAD.LeftStickDown), new _GamepadControl2.default(2, _const.GAMEPAD.RightStickLeft, { negate: true }), new _GamepadControl2.default(2, _const.GAMEPAD.RightStickRight), new _GamepadControl2.default(3, _const.GAMEPAD.RightStickUp, { negate: true }), new _GamepadControl2.default(3, _const.GAMEPAD.RightStickDown)]));
    }

    return DefaultGamepadMapping;
}(_GamepadMapping3.default);

exports.default = DefaultGamepadMapping;

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
/* 46 */
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
        this._key = channel % _const.INPUT_CHANNELS_HANDLER;

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
            var result = value;

            if (this._negate) {
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
            this._channel = _const.INPUT_OFFSET.GAMEPAD + this._key;
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
/* 47 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _BlobFactory2 = __webpack_require__(12);

var _BlobFactory3 = _interopRequireDefault(_BlobFactory2);

var _utils = __webpack_require__(1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class VideoFactory
 * @extends {BlobFactory}
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
                        return reject(Error('Error loading video source.'));
                    });
                    video.addEventListener('abort', function () {
                        return reject(Error('Video loading was canceled.'));
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
/* 48 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Renderable = __webpack_require__(20);

var _Renderable2 = _interopRequireDefault(_Renderable);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

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

        app.on('scene:change', this.changeScene, this).on('scene:start', this.startScene, this).on('scene:stop', this.stopScene, this);
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

            var displayManager = this._app.displayManager;

            this._currentScene.update(delta);

            displayManager.begin();

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._currentScene.nodes[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var node = _step.value;

                    if (node instanceof _Renderable2.default) {
                        node.render(displayManager);
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

            displayManager.end();
        }

        /**
         * @public
         */

    }, {
        key: 'startScene',
        value: function startScene() {
            if (!this._currentScene) {
                throw new Error('No scene was specified, use scene:change!');
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
            this.stopScene();

            this._currentScene = scene;
            this._currentScene.app = this._app;
            this._currentScene.load(this._app.loader);
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._app.trigger('scene:stop').off('scene:change', this.changeScene, this).off('scene:start', this.startScene, this).off('scene:stop', this.stopScene, this);

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

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(6);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _ObservableVector = __webpack_require__(28);

var _ObservableVector2 = _interopRequireDefault(_ObservableVector);

var _Matrix = __webpack_require__(7);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _utils = __webpack_require__(1);

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
        _this._dirtyTransform = true;
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
            if (this._dirtyTransform) {
                this.updateTransform();
                this._dirtyTransform = false;
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
        key: 'translate',
        value: function translate(x, y) {
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

        /**
         * @public
         * @member {Matrix}
         */

    }, {
        key: 'transform',
        get: function get() {
            return this.getTransform();
        },
        set: function set(transform) {
            this._transform.copy(transform);
        }
    }]);

    return Transformable;
}(_EventEmitter3.default);

exports.default = Transformable;

/***/ }),
/* 50 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _RenderState = __webpack_require__(51);

var _RenderState2 = _interopRequireDefault(_RenderState);

var _RenderTarget = __webpack_require__(29);

var _RenderTarget2 = _interopRequireDefault(_RenderTarget);

var _SpriteRenderer = __webpack_require__(52);

var _SpriteRenderer2 = _interopRequireDefault(_SpriteRenderer);

var _ParticleRenderer = __webpack_require__(57);

var _ParticleRenderer2 = _interopRequireDefault(_ParticleRenderer);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _View = __webpack_require__(59);

var _View2 = _interopRequireDefault(_View);

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _settings = __webpack_require__(3);

var _settings2 = _interopRequireDefault(_settings);

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
     * @param {Application} app
     * @param {Object} [config]
     * @param {Number} [config.width=800]
     * @param {Number} [config.height=600]
     * @param {Color} [config.clearColor=Color.Black]
     * @param {Boolean} [config.clearBeforeRender=true]
     * @param {Object} [config.contextOptions]
     */
    function DisplayManager(app) {
        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            _ref$width = _ref.width,
            width = _ref$width === undefined ? 800 : _ref$width,
            _ref$height = _ref.height,
            height = _ref$height === undefined ? 600 : _ref$height,
            _ref$clearColor = _ref.clearColor,
            clearColor = _ref$clearColor === undefined ? _Color2.default.Black : _ref$clearColor,
            _ref$clearBeforeRende = _ref.clearBeforeRender,
            clearBeforeRender = _ref$clearBeforeRende === undefined ? true : _ref$clearBeforeRende,
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

        if (this._contextLost && this._context.getExtension('WEBGL_lose_context')) {
            this._context.getExtension('WEBGL_lose_context').restoreContext();
        }

        this._setupGL();

        /**
         * @private
         * @member {Map<String, Renderer>}
         */
        this._renderers = new Map();

        /**
         * @private
         * @member {RenderTarget}
         */
        this._renderTarget = new _RenderTarget2.default(width, height, true);

        /**
         * @private
         * @member {View}
         */
        this._view = new _View2.default(new _Rectangle2.default(0, 0, width, height));

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
         * @member {RenderState}
         */
        this._renderState = new _RenderState2.default(this._context);
        this._renderState.blendMode = _settings2.default.BLEND_MODE;
        this._renderState.clearColor = clearColor;

        this._renderTarget.bind(this._renderState);

        this.addRenderer('sprite', new _SpriteRenderer2.default()).addRenderer('particle', new _ParticleRenderer2.default()).resize(width, height);
    }

    /**
     * @public
     * @readonly
     * @member {RenderState}
     */


    _createClass(DisplayManager, [{
        key: 'addRenderer',


        /**
         * @public
         * @chainable
         * @param {String} name
         * @param {SpriteRenderer|ParticleRenderer|Renderer} renderer
         * @returns {DisplayManager}
         */
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
         * @returns {DisplayManager}
         */

    }, {
        key: 'updateViewport',
        value: function updateViewport() {
            var width = this._renderTarget.width,
                height = this._renderTarget.height,
                ratio = this._view.viewport;

            this._renderState.viewport = _Rectangle2.default.Temp.set(Math.round(width * ratio.x), Math.round(height * ratio.y), Math.round(width * ratio.width), Math.round(height * ratio.height));

            this._renderState.projection = this._view.getTransform();

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

            this._renderTarget.width = width;
            this._renderTarget.height = height;

            this.updateViewport();

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {View} view
         * @returns {DisplayManager}
         */

    }, {
        key: 'setView',
        value: function setView(view) {
            this._view.copy(view);

            this.updateViewport();

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {DisplayManager}
         */

    }, {
        key: 'resetView',
        value: function resetView() {
            this._view.reset(_Rectangle2.default.Temp.set(0, 0, this._renderTarget.width, this._renderTarget.height));

            this.updateViewport();

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {DisplayManager}
         */

    }, {
        key: 'begin',
        value: function begin() {
            if (this._isRendering || this._contextLost) {
                return this;
            }

            if (this._clearBeforeRender) {
                this._renderState.clear();
            }

            this._isRendering = true;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Renderable} renderable
         * @param {String} renderer
         * @returns {DisplayManager}
         */

    }, {
        key: 'render',
        value: function render(renderable, renderer) {
            if (!this._isRendering || this._contextLost) {
                return this;
            }

            if (renderable.active && this.isVisible(renderable)) {
                this._renderState.renderer = this.getRenderer(renderer);
                this._renderState.renderer.render(renderable);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {DisplayManager}
         */

    }, {
        key: 'end',
        value: function end() {
            if (!this._isRendering || this._contextLost) {
                return this;
            }

            if (this._renderState.renderer) {
                this._renderState.renderer.flush();
            }

            this._isRendering = false;

            return this;
        }

        /**
         * @public
         * @param {Renderable} renderable
         * @returns {Boolean}
         */

    }, {
        key: 'isVisible',
        value: function isVisible(renderable) {
            return renderable.active;
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

            this._renderers.clear();
            this._renderers = null;

            this._renderState.destroy();
            this._renderState = null;

            this._view = null;

            this._clearBeforeRender = null;
            this._isRendering = null;
            this._contextLost = null;
            this._context = null;
            this._canvas = null;
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
        key: '_setupGL',
        value: function _setupGL() {
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
        key: 'renderState',
        get: function get() {
            return this._renderState;
        }
    }]);

    return DisplayManager;
}();

exports.default = DisplayManager;

/***/ }),
/* 51 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _RenderTarget = __webpack_require__(29);

var _RenderTarget2 = _interopRequireDefault(_RenderTarget);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _Matrix = __webpack_require__(7);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _GLTexture = __webpack_require__(76);

var _GLTexture2 = _interopRequireDefault(_GLTexture);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class RenderState
 */
var RenderState = function () {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context
     */
    function RenderState(context) {
        _classCallCheck(this, RenderState);

        if (!context) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        /**
         * @private
         * @member {WebGLRenderingContext}
         */
        this._context = context;

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
         * @member {?Object}
         */
        this._blendMode = null;

        /**
         * @private
         * @member {?WebGLFramebuffer}
         */
        this._glFramebuffer = null;

        /**
         * @private
         * @member {WeakMap<RenderTarget, WebGLFramebuffer>}
         */
        this._glFramebuffers = new WeakMap();

        /**
         * @private
         * @member {Number}
         */
        this._textureUnit = -1;

        /**
         * @private
         * @member {?GLTexture}
         */
        this._glTexture = null;

        /**
         * @private
         * @member {WeakMap<Texture, GLTexture>}
         */
        this._glTextures = new WeakMap();

        /**
         * @private
         * @member {Color}
         */
        this._clearColor = new _Color2.default();

        /**
         * @private
         * @member {Rectangle}
         */
        this._viewport = new _Rectangle2.default();

        /**
         * @private
         * @member {Matrix}
         */
        this._projection = new _Matrix2.default();
    }

    /**
     * @public
     * @member {?BlendMode}
     */


    _createClass(RenderState, [{
        key: 'clear',


        /**
         * @public
         * @chainable
         * @param {Color} [color]
         * @returns {RenderState}
         */
        value: function clear(color) {
            var gl = this._context;

            if (color !== undefined) {
                this.clearColor = color;
            }

            gl.clear(gl.COLOR_BUFFER_BIT);

            return this;
        }

        /**
         * @public
         * @returns {WebGLBuffer}
         */

    }, {
        key: 'createBuffer',
        value: function createBuffer() {
            return this._context.createBuffer();
        }

        /**
         * @public
         * @param {RenderTarget} renderTarget
         * @returns {?WebGLFramebuffer}
         */

    }, {
        key: 'getGLFramebuffer',
        value: function getGLFramebuffer(renderTarget) {
            if (!this._glFramebuffers.has(renderTarget)) {
                this._glFramebuffers.set(renderTarget, renderTarget.isRoot ? null : this._context.createFramebuffer());
            }

            return this._glFramebuffers.get(renderTarget);
        }

        /**
         * @public
         * @param {RenderTarget} renderTarget
         * @returns {RenderState}
         */

    }, {
        key: 'removeRenderTarget',
        value: function removeRenderTarget(renderTarget) {
            if (this._glFramebuffers.has(renderTarget)) {
                var gl = this._context,
                    glFramebuffer = this._glFramebuffers.get(renderTarget);

                if (this._glFramebuffer === glFramebuffer) {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                    this._glFramebuffer = null;
                }

                gl.deleteFramebuffer(glFramebuffer);

                this._glFramebuffers.delete(renderTarget);
            }

            return this;
        }

        /**
         * @public
         * @param {RenderTarget} renderTarget
         * @param {Number} [unit}
         */

    }, {
        key: 'bindRenderTarget',
        value: function bindRenderTarget(renderTarget) {
            this.glFramebuffer = this.getGLFramebuffer(renderTarget);

            return this;
        }

        /**
         * @public
         * @param {Texture} texture
         * @returns {GLTexture}
         */

    }, {
        key: 'getGLTexture',
        value: function getGLTexture(texture) {
            if (!this._glTextures.has(texture)) {
                this._glTextures.set(texture, new _GLTexture2.default(this._context));
            }

            return this._glTextures.get(texture);
        }

        /**
         * @public
         * @param {Texture} texture
         * @returns {RenderState}
         */

    }, {
        key: 'removeTexture',
        value: function removeTexture(texture) {
            if (this._glTextures.has(texture)) {
                var glTexture = this._glTextures.get(texture);

                if (this._glTexture === glTexture) {
                    this._glTexture.unbind();
                    this._glTexture = null;
                }

                glTexture.destroy();

                this._glTextures.delete(texture);
            }

            return this;
        }

        /**
         * @public
         * @param {Texture} texture
         * @param {Number} [unit}
         */

    }, {
        key: 'bindTexture',
        value: function bindTexture(texture, unit) {
            if (unit !== undefined) {
                this.textureUnit = unit;
            }

            this.glTexture = this.getGLTexture(texture);

            return this;
        }

        /**
         * @public
         * @param {Texture} texture
         * @param {Number} scaleMode
         */

    }, {
        key: 'setScaleMode',
        value: function setScaleMode(texture, scaleMode) {
            return this.bindTexture(texture).getGLTexture(texture).setScaleMode(scaleMode);
        }

        /**
         * @public
         * @param {Texture} texture
         * @param {Number} wrapMode
         */

    }, {
        key: 'setWrapMode',
        value: function setWrapMode(texture, wrapMode) {
            return this.bindTexture(texture).getGLTexture(texture).setWrapMode(wrapMode);
        }

        /**
         * @public
         * @param {Texture} texture
         * @param {Boolean} premultiplyAlpha
         */

    }, {
        key: 'setPremultiplyAlpha',
        value: function setPremultiplyAlpha(texture, premultiplyAlpha) {
            return this.bindTexture(texture).getGLTexture(texture).setPremultiplyAlpha(premultiplyAlpha);
        }

        /**
         * @public
         * @param {Texture} texture
         * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} source
         */

    }, {
        key: 'setTextureImage',
        value: function setTextureImage(texture, source) {
            return this.bindTexture(texture).getGLTexture(texture).setTextureImage(source);
        }

        /**
         * @public
         * @param {Number} size
         * @param {Number} attributeCount
         * @returns {ArrayBuffer}
         */

    }, {
        key: 'createVertexBuffer',
        value: function createVertexBuffer(size, attributeCount) {
            return new ArrayBuffer(size * attributeCount * 4);
        }

        /**
         * @public
         * @param {Number} size
         * @returns {Uint16Array}
         */

    }, {
        key: 'createIndexBuffer',
        value: function createIndexBuffer(size) {
            var buffer = new Uint16Array(size * 6),
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
         * @chainable
         * @param {Color} [color]
         * @returns {RenderState}
         */

    }, {
        key: 'bindVertexBuffer',
        value: function bindVertexBuffer(buffer, data) {
            var gl = this._context;

            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Color} [color]
         * @returns {RenderState}
         */

    }, {
        key: 'bindIndexBuffer',
        value: function bindIndexBuffer(buffer, data) {
            var gl = this._context;

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);

            return this;
        }

        /**
         * @public
         * @param {Float32Array} data
         * @param {Number} [offset=0]
         */

    }, {
        key: 'setVertexSubData',
        value: function setVertexSubData(data) {
            var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

            var gl = this._context;

            // todo - bind buffer

            gl.bufferSubData(gl.ARRAY_BUFFER, offset, data);
        }

        /**
         * @public
         * @param {WebGLBuffer} buffer
         */

    }, {
        key: 'deleteBuffer',
        value: function deleteBuffer(buffer) {
            this._context.deleteBuffer(buffer);
        }

        /**
         * @public
         * @param {WebGLBuffer} buffer
         */

    }, {
        key: 'drawElements',
        value: function drawElements(count) {
            var gl = this._context;

            gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
        }

        /**
         * @public
         * @param {Number} type
         * @param {String} source
         * @returns {WebGLShader}
         */

    }, {
        key: 'compileShader',
        value: function compileShader(type, source) {
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
         * @param {String} vertexSource
         * @param {String} fragmentSource
         * @returns {?WebGLProgram}
         */

    }, {
        key: 'compileProgram',
        value: function compileProgram(vertexSource, fragmentSource) {
            var gl = this._context,
                vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource),
                fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource),
                program = gl.createProgram();

            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);

            gl.linkProgram(program);

            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
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
         * @chainable
         * @param {WebGLProgram} program
         * @returns {RenderState}
         */

    }, {
        key: 'deleteProgram',
        value: function deleteProgram(program) {
            this._context.deleteProgram(program);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {WebGLProgram} program
         * @returns {RenderState}
         */

    }, {
        key: 'useProgram',
        value: function useProgram(program) {
            this._context.useProgram(program);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {WebGLUniformLocation} location
         * @param {Number|Array|Texture} value
         * @param {Number} type
         * @param {Number} [unit]
         * @returns {RenderState}
         */

    }, {
        key: 'setUniformValue',
        value: function setUniformValue(location, value, type, unit) {
            var gl = this._context;

            switch (type) {
                case _const.UNIFORM_TYPE.INT:
                    gl.uniform1i(location, value);

                    return this;
                case _const.UNIFORM_TYPE.FLOAT:
                    gl.uniform1f(location, value);

                    return this;
                case _const.UNIFORM_TYPE.FLOAT_VEC2:
                    gl.uniform2fv(location, value);

                    return this;
                case _const.UNIFORM_TYPE.FLOAT_VEC3:
                    gl.uniform3fv(location, value);

                    return this;
                case _const.UNIFORM_TYPE.FLOAT_VEC4:
                    gl.uniform4fv(location, value);

                    return this;
                case _const.UNIFORM_TYPE.INT_VEC2:
                    gl.uniform2iv(location, value);

                    return this;
                case _const.UNIFORM_TYPE.INT_VEC3:
                    gl.uniform3iv(location, value);

                    return this;
                case _const.UNIFORM_TYPE.INT_VEC4:
                    gl.uniform4iv(location, value);

                    return this;
                case _const.UNIFORM_TYPE.BOOL:
                    gl.uniform1i(location, value);

                    return this;
                case _const.UNIFORM_TYPE.BOOL_VEC2:
                    gl.uniform2iv(location, value);

                    return this;
                case _const.UNIFORM_TYPE.BOOL_VEC3:
                    gl.uniform3iv(location, value);

                    return this;
                case _const.UNIFORM_TYPE.BOOL_VEC4:
                    gl.uniform4iv(location, value);

                    return this;
                case _const.UNIFORM_TYPE.FLOAT_MAT2:
                    gl.uniformMatrix2fv(location, false, value);

                    return this;
                case _const.UNIFORM_TYPE.FLOAT_MAT3:
                    gl.uniformMatrix3fv(location, false, value);

                    return this;
                case _const.UNIFORM_TYPE.FLOAT_MAT4:
                    gl.uniformMatrix4fv(location, false, value);

                    return this;
                case _const.UNIFORM_TYPE.SAMPLER_2D:
                    value.bind(this, unit).update();

                    gl.uniform1i(location, unit);

                    return this;
                default:
                    throw new Error('Unknown uniform type ' + this._type);
            }

            return this;
        }
    }, {
        key: 'getUniformLocation',
        value: function getUniformLocation(program, name) {
            return this._context.getUniformLocation(program, name);
        }
    }, {
        key: 'getAttributeLocation',
        value: function getAttributeLocation(program, name) {
            return this._context.getAttribLocation(program, name);
        }
    }, {
        key: 'setVertexPointer',
        value: function setVertexPointer(location, size, type, normalized, stride, offset) {
            this._context.vertexAttribPointer(location, size, type, normalized, stride, offset);
        }
    }, {
        key: 'toggleVertexArray',
        value: function toggleVertexArray(location, enabled) {
            if (enabled) {
                this._context.enableVertexAttribArray(location);
            } else {
                this._context.disableVertexAttribArray(location);
            }
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._clearColor.destroy();
            this._clearColor = null;

            this._viewport.destroy();
            this._viewport = null;

            this._projection.destroy();
            this._projection = null;

            this._context = null;

            this._glFramebuffer = null;
            this._glFramebuffers = null;

            this._textureUnit = null;
            this._glTexture = null;
            this._glTextures = null;

            this._blendMode = null;
            this._shader = null;
            this._renderer = null;
        }
    }, {
        key: 'blendMode',
        get: function get() {
            return this._blendMode;
        },
        set: function set(blendMode) {
            if (blendMode && blendMode !== this._blendMode) {
                this._context.blendFunc(blendMode.src, blendMode.dst);

                this._blendMode = blendMode;
            }
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
            if (shader && shader !== this._shader) {
                if (this._shader) {
                    this._shader.unbind();
                }

                this._shader = shader;
                this._shader.bind(this);
            }
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
            if (renderer && renderer !== this._renderer) {
                if (this._renderer) {
                    this._renderer.unbind();
                }

                this._renderer = renderer;
                this._renderer.bind(this);
                this._renderer.setProjection(this._projection);
            }
        }

        /**
         * @public
         * @member {?WebGLFramebuffer}
         */

    }, {
        key: 'glFramebuffer',
        get: function get() {
            return this._glFramebuffer;
        },
        set: function set(value) {
            var gl = this._context,
                glFramebuffer = value || null;

            if (glFramebuffer !== this._glFramebuffer) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, glFramebuffer);
                this._glFramebuffer = glFramebuffer;
            }
        }

        /**
         * @public
         * @member {?GLTexture}
         */

    }, {
        key: 'glTexture',
        get: function get() {
            return this._glTexture;
        },
        set: function set(glTexture) {
            if (glTexture && glTexture !== this._glTexture) {
                this._glTexture = glTexture.bind();
            }
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
        set: function set(value) {
            var textureUnit = value | 0;

            if (textureUnit !== this._textureUnit) {
                var gl = this._context;

                gl.activeTexture(gl.TEXTURE0 + textureUnit);

                this._textureUnit = textureUnit;
            }
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
            if (color && !this._clearColor.equals(color, true)) {
                this._context.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);

                this._clearColor.copy(color);
            }
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
            if (viewport && !viewport.equals(this._viewport)) {
                this._context.viewport(viewport.x, viewport.y, viewport.width, viewport.height);

                this._viewport.copy(viewport);
            }
        }

        /**
         * @public
         * @member {Matrix}
         */

    }, {
        key: 'projection',
        get: function get() {
            return this._projection;
        },
        set: function set(projection) {
            this._projection.copy(projection);

            if (this._renderer) {
                this._renderer.setProjection(projection);
            }
        }
    }]);

    return RenderState;
}();

exports.default = RenderState;

/***/ }),
/* 52 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
        value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderer2 = __webpack_require__(30);

var _Renderer3 = _interopRequireDefault(_Renderer2);

var _SpriteShader = __webpack_require__(53);

var _SpriteShader2 = _interopRequireDefault(_SpriteShader);

var _settings = __webpack_require__(3);

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
                 * @member {SpriteShader}
                 */
                var _this = _possibleConstructorReturn(this, (SpriteRenderer.__proto__ || Object.getPrototypeOf(SpriteRenderer)).call(this));

                _this._shader = new _SpriteShader2.default();

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
                 * @member {Number}
                 */
                _this._batchSize = 0;

                /**
                 * @private
                 * @member {Number}
                 */
                _this._batchLimit = _settings2.default.BATCH_LIMIT_SPRITES;

                /**
                 * @private
                 * @member {?ArrayBuffer}
                 */
                _this._vertexData = null;

                /**
                 * @private
                 * @member {?Uint16Array}
                 */
                _this._indexData = null;

                /**
                 * @private
                 * @member {?Float32Array}
                 */
                _this._floatView = null;

                /**
                 * @private
                 * @member {?Uint32Array}
                 */
                _this._uintView = null;

                /**
                 * @private
                 * @member {?Texture}
                 */
                _this._currentTexture = null;
                return _this;
        }

        /**
         * @override
         */


        _createClass(SpriteRenderer, [{
                key: 'bind',
                value: function bind(renderState) {
                        if (!this._renderState) {
                                this._renderState = renderState;

                                this._indexBuffer = renderState.createBuffer();
                                this._vertexBuffer = renderState.createBuffer();

                                this._indexData = renderState.createIndexBuffer(this._batchLimit);
                                this._vertexData = renderState.createVertexBuffer(this._batchLimit, this._attributeCount);

                                this._uintView = new Uint32Array(this._vertexData);
                                this._floatView = new Float32Array(this._vertexData);
                        }

                        if (!this.bound) {
                                renderState.bindVertexBuffer(this._vertexBuffer, this._vertexData).bindIndexBuffer(this._indexBuffer, this._indexData);

                                renderState.shader = this._shader;

                                this.bound = true;
                        }

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
                                this._shader.unbind();
                                this.bound = false;
                        }

                        return this;
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
                key: 'render',
                value: function render(sprite) {
                        var batchLimitReached = this._batchSize >= this._batchLimit,
                            textureChanged = this._currentTexture !== sprite.texture,
                            flush = textureChanged || batchLimitReached,
                            index = flush ? 0 : this._batchSize * this._attributeCount,
                            floatView = this._floatView,
                            uintView = this._uintView,
                            positionData = sprite.getPositionData(),
                            texCoordData = sprite.getTexCoordData();

                        if (flush) {
                                this.flush();

                                if (textureChanged) {
                                        this._currentTexture = sprite.texture;
                                        this._shader.setSpriteTexture(this._currentTexture);
                                }
                        }

                        this._currentTexture.update();

                        // X / Y
                        floatView[index] = positionData[0];
                        floatView[index + 1] = positionData[1];

                        // X / Y
                        floatView[index + 4] = positionData[2];
                        floatView[index + 5] = positionData[3];

                        // X / Y
                        floatView[index + 8] = positionData[4];
                        floatView[index + 9] = positionData[5];

                        // X / Y
                        floatView[index + 12] = positionData[6];
                        floatView[index + 13] = positionData[7];

                        // U / V
                        uintView[index + 2] = texCoordData[0];
                        uintView[index + 6] = texCoordData[1];
                        uintView[index + 10] = texCoordData[2];
                        uintView[index + 14] = texCoordData[3];

                        // Tint
                        uintView[index + 3] = uintView[index + 7] = uintView[index + 11] = uintView[index + 15] = sprite.tint.getRGBA();

                        this._batchSize++;

                        return this;
                }

                /**
                 * @override
                 */

        }, {
                key: 'flush',
                value: function flush() {
                        if (this._batchSize) {
                                this._renderState.setVertexSubData(this._floatView.subarray(0, this._batchSize * this._attributeCount));
                                this._renderState.drawElements(this._batchSize * 6);

                                this._batchSize = 0;
                        }

                        return this;
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

                        this._indexData = null;
                        this._vertexData = null;
                        this._floatView = null;
                        this._uintView = null;
                        this._batchSize = null;
                        this._batchLimit = null;
                        this._attributeCount = null;
                        this._currentTexture = null;
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

var _Shader2 = __webpack_require__(31);

var _Shader3 = _interopRequireDefault(_Shader2);

var _path = __webpack_require__(56);

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

        _this.setVertexSource('precision lowp float;\r\n\r\nattribute vec2 aVertexPosition;\r\nattribute vec2 aTextureCoord;\r\nattribute vec4 aColor;\r\n\r\nuniform mat3 projectionMatrix;\r\n\r\nvarying vec2 vTextureCoord;\r\nvarying vec4 vColor;\r\n\r\nvoid main(void) {\r\n    vTextureCoord = aTextureCoord;\r\n    vColor = vec4(aColor.rgb * aColor.a, aColor.a);\r\n\r\n    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\r\n}\r\n');
        _this.setFragmentSource('precision lowp float;\r\n\r\nuniform sampler2D uSampler;\r\n\r\nvarying vec2 vTextureCoord;\r\nvarying vec4 vColor;\r\n\r\nvoid main(void) {\r\n    gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor;\r\n}\r\n');

        _this.setAttributes([{
            name: 'aVertexPosition',
            type: _const.ATTRIBUTE_TYPE.FLOAT,
            size: 2,
            normalized: false
        }, {
            name: 'aTextureCoord',
            type: _const.ATTRIBUTE_TYPE.UNSIGNED_SHORT,
            size: 2,
            normalized: true
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
         * @member {?RenderState}
         */
        this._renderState = null;

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
        key: 'setEnabled',


        /**
         * @public
         * @param {Boolean} enabled
         */
        value: function setEnabled(enabled) {
            if (this._enabled !== enabled) {
                this._enabled = enabled;

                if (this._bound) {
                    this.upload();
                }
            }
        }

        /**
         * @public
         * @param {Number} stride
         * @param {Number} offset
         */

    }, {
        key: 'bind',
        value: function bind(renderState, program, stride, offset) {
            if (!this._renderState) {
                this._renderState = renderState;
                this._location = renderState.getAttributeLocation(program, this._name);

                if (this._location === -1) {
                    throw new Error('Attribute location for attribute "' + this._name + '" is not available.');
                }
            }

            if (!this._bound) {
                this._bound = true;
                this._renderState.setVertexPointer(this._location, this._size, this._type, this._normalized, stride, offset);
                this.upload();
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
        key: 'upload',
        value: function upload() {
            this._renderState.toggleVertexArray(this._location, this._enabled);
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

            this._renderState = null;
            this._name = null;
            this._enabled = null;
            this._location = null;
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
/* 55 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Matrix = __webpack_require__(7);

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
         * @member {?RenderState}
         */
        this._renderState = null;

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
        key: 'setValue',


        /**
         * @public
         * @param {*} value
         */
        value: function setValue(value) {
            this._value = value;
            this._dirty = true;

            this.upload();
        }

        /**
         * @param {Matrix} matrix
         * @param {Boolean} [transpose=this._transpose]
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
        value: function bind(renderState, program) {
            if (!this._renderState) {
                this._renderState = renderState;
                this._location = renderState.getUniformLocation(program, this._name);
            }

            if (!this._bound) {
                this._bound = true;

                this.upload();
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
        key: 'upload',
        value: function upload() {
            if (this._bound && this._dirty) {
                this._renderState.setUniformValue(this._location, this._value, this._type, this._unit);

                this._dirty = false;
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
            this._renderState = null;
            this._location = null;
            this._bound = null;
            this._unit = null;
            this._transpose = null;
            this._dirty = null;
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

/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(77)))

/***/ }),
/* 57 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderer2 = __webpack_require__(30);

var _Renderer3 = _interopRequireDefault(_Renderer2);

var _ParticleShader = __webpack_require__(58);

var _ParticleShader2 = _interopRequireDefault(_ParticleShader);

var _utils = __webpack_require__(1);

var _settings = __webpack_require__(3);

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
         * @member {?ParticleShader}
         */
        var _this = _possibleConstructorReturn(this, (ParticleRenderer.__proto__ || Object.getPrototypeOf(ParticleRenderer)).call(this));

        _this._shader = new _ParticleShader2.default();

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
         * @member {Number}
         */
        _this._batchSize = 0;

        /**
         * @private
         * @member {Number}
         */
        _this._batchLimit = _settings2.default.BATCH_LIMIT_PARTICLES;

        /**
         * @private
         * @member {?ArrayBuffer}
         */
        _this._vertexData = null;

        /**
         * @private
         * @member {?Uint16Array}
         */
        _this._indexData = null;

        /**
         * @private
         * @member {?Float32Array}
         */
        _this._floatView = null;

        /**
         * @private
         * @member {?Uint32Array}
         */
        _this._uintView = null;

        /**
         * @member {?Texture}
         * @private
         */
        _this._currentTexture = null;
        return _this;
    }

    /**
     * @override
     */


    _createClass(ParticleRenderer, [{
        key: 'bind',
        value: function bind(renderState) {
            if (!this._renderState) {
                this._renderState = renderState;

                this._indexBuffer = renderState.createBuffer();
                this._vertexBuffer = renderState.createBuffer();

                this._indexData = renderState.createIndexBuffer(this._batchLimit);
                this._vertexData = renderState.createVertexBuffer(this._batchLimit, this._attributeCount);

                this._uintView = new Uint32Array(this._vertexData);
                this._floatView = new Float32Array(this._vertexData);
            }

            if (!this.bound) {
                renderState.bindVertexBuffer(this._vertexBuffer, this._vertexData).bindIndexBuffer(this._indexBuffer, this._indexData);

                renderState.shader = this._shader;

                this.bound = true;
            }

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
                this._shader.unbind();
                this.bound = false;
            }

            return this;
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
        key: 'render',
        value: function render(emitter) {
            var batchLimitReached = this._batchSize >= this._batchLimit,
                textureChanged = this._currentTexture !== emitter.texture,
                flush = textureChanged || batchLimitReached,
                floatView = this._floatView,
                uintView = this._uintView,
                particles = emitter.particles,
                textureFrame = emitter.textureFrame,
                textureCoords = emitter.textureCoords;

            if (flush) {
                this.flush();

                if (textureChanged) {
                    this._currentTexture = emitter.texture;
                    this._shader.setParticleTexture(this._currentTexture);
                }
            }

            this._currentTexture.update();

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = particles[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var particle = _step.value;

                    if (this._batchSize >= this._batchLimit) {
                        this.flush();
                    }

                    var index = this._batchSize * this._attributeCount,
                        position = particle.position,
                        scale = particle.scale,
                        rotation = particle.rotation,
                        color = particle.color;


                    floatView[index] = floatView[index + 11] = textureFrame.x;
                    floatView[index + 1] = floatView[index + 20] = textureFrame.y;

                    floatView[index + 10] = floatView[index + 30] = textureFrame.width;
                    floatView[index + 21] = floatView[index + 31] = textureFrame.height;

                    floatView[index + 2] = floatView[index + 22] = textureCoords.x;
                    floatView[index + 3] = floatView[index + 13] = textureCoords.y;

                    floatView[index + 12] = floatView[index + 32] = textureCoords.width;
                    floatView[index + 23] = floatView[index + 33] = textureCoords.height;

                    floatView[index + 4] = floatView[index + 14] = floatView[index + 24] = floatView[index + 34] = position.x;

                    floatView[index + 5] = floatView[index + 15] = floatView[index + 25] = floatView[index + 35] = position.y;

                    floatView[index + 6] = floatView[index + 16] = floatView[index + 26] = floatView[index + 36] = scale.x;

                    floatView[index + 7] = floatView[index + 17] = floatView[index + 27] = floatView[index + 37] = scale.y;

                    floatView[index + 8] = floatView[index + 18] = floatView[index + 28] = floatView[index + 38] = (0, _utils.degreesToRadians)(rotation);

                    uintView[index + 9] = uintView[index + 19] = uintView[index + 29] = uintView[index + 39] = color.getRGBA();

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

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'flush',
        value: function flush() {
            if (this._batchSize) {
                this._renderState.setVertexSubData(this._floatView.subarray(0, this._batchSize * this._attributeCount));
                this._renderState.drawElements(this._batchSize * 6);

                this._batchSize = 0;
            }

            return this;
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

            this._indexData = null;
            this._vertexData = null;
            this._floatView = null;
            this._uintView = null;
            this._batchSize = null;
            this._batchLimit = null;
            this._attributeCount = null;
            this._currentTexture = null;
        }
    }]);

    return ParticleRenderer;
}(_Renderer3.default);

exports.default = ParticleRenderer;

/***/ }),
/* 58 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _Shader2 = __webpack_require__(31);

var _Shader3 = _interopRequireDefault(_Shader2);

var _path = __webpack_require__(56);

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

        _this.setVertexSource('precision lowp float;\n\nattribute vec2 aVertexPosition;\nattribute vec2 aTextureCoord;\nattribute vec2 aPosition;\nattribute vec2 aScale;\nattribute float aRotation;\nattribute vec4 aColor;\n\nuniform mat3 projectionMatrix;\n\nvarying vec2 vTextureCoord;\nvarying vec4 vColor;\n\nvoid main(void) {\n    vTextureCoord = aTextureCoord;\n    vColor = vec4(aColor.rgb * aColor.a, aColor.a);\n\n    vec2 pos = vec2(\n        (aVertexPosition.x * cos(aRotation)) - (aVertexPosition.y * sin(aRotation)),\n        (aVertexPosition.x * sin(aRotation)) + (aVertexPosition.y * cos(aRotation))\n    );\n\n    gl_Position = vec4((projectionMatrix * vec3((pos * aScale) + aPosition, 1.0)).xy, 0.0, 1.0);\n}\n');
        _this.setFragmentSource('precision lowp float;\n\nuniform sampler2D uSampler;\n\nvarying vec2 vTextureCoord;\nvarying vec4 vColor;\n\nvoid main(void) {\n    gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor;\n}\n');

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
            name: 'aPosition',
            type: _const.ATTRIBUTE_TYPE.FLOAT,
            size: 2,
            normalized: false
        }, {
            name: 'aScale',
            type: _const.ATTRIBUTE_TYPE.FLOAT,
            size: 2,
            normalized: false
        }, {
            name: 'aRotation',
            type: _const.ATTRIBUTE_TYPE.FLOAT,
            size: 1,
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
/* 59 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ObservableVector = __webpack_require__(28);

var _ObservableVector2 = _interopRequireDefault(_ObservableVector);

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Matrix = __webpack_require__(7);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _utils = __webpack_require__(1);

var _ObservableSize = __webpack_require__(78);

var _ObservableSize2 = _interopRequireDefault(_ObservableSize);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

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
         * @member {ObservableSize}
         */
        this._size = new _ObservableSize2.default(this._onChangeSize, this);

        /**
         * @private
         * @member {Vector}
         */
        this._offsetCenter = new _Vector2.default();

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
         * @member {Boolean}
         */
        this._dirtyTransform = true;

        this.reset(viewRectangle);
    }

    /**
     * @public
     * @member {ObservableVector}
     */


    _createClass(View, [{
        key: 'move',


        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {View}
         */
        value: function move(x, y) {
            this._center.add(x, y);

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
            this._size.multiply(factor);

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
            this.rotation += degrees;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Rectangle} rectangle
         * @returns {View}
         */

    }, {
        key: 'reset',
        value: function reset(rectangle) {
            this._size.copy(rectangle.size);
            this._center.set(rectangle.x + this._offsetCenter.x, rectangle.y + this._offsetCenter.y);
            this._rotation = 0;
            this._cos = 1;
            this._sin = 0;

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
            if (this._dirtyTransform) {
                this.updateTransform();
                this._dirtyTransform = false;
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
                center = this._center,
                a = 2 / this._size.width,
                b = -2 / this._size.height,
                c = center.x * -a,
                d = center.y * -b,
                x = center.x * -this._cos - center.y * this._sin + center.x,
                y = center.x * this._sin - center.y * this._cos + center.y;

            transform.a = a * this._cos;
            transform.b = a * this._sin;

            transform.c = b * -this._sin;
            transform.d = b * this._cos;

            transform.x = a * x + c;
            transform.y = b * y + d;

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
            this.viewport = view.viewport;
            this.transform = view.transform;
            this.rotation = view.rotation;

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

            this._offsetCenter.destroy();
            this._offsetCenter = null;

            this._size.destroy();
            this._size = null;

            this._viewport.destroy();
            this._viewport = null;

            this._transform.destroy();
            this._transform = null;

            this._rotation = null;
            this._cos = null;
            this._sin = null;

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

        /**
         * @private
         */

    }, {
        key: '_onChangeSize',
        value: function _onChangeSize() {
            this._offsetCenter.set(this._size.width / 2 | 0, this._size.height / 2 | 0);
            this._setDirty();
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
        key: 'rotation',
        get: function get() {
            return this._rotation;
        },
        set: function set(degrees) {
            var trimmed = degrees % 360,
                rotation = trimmed < 0 ? trimmed + 360 : trimmed,
                radians = (0, _utils.degreesToRadians)(rotation);

            this._rotation = rotation < 0 ? rotation + 360 : rotation;
            this._cos = Math.cos(radians);
            this._sin = Math.sin(radians);

            this._setDirty();
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
            return this.getTransform();
        },
        set: function set(transform) {
            this._transform.copy(transform);
        }

        /**
         * @public
         * @readonly
         * @member {Vector}
         */

    }, {
        key: 'offsetCenter',
        get: function get() {
            return this._offsetCenter;
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
         * @member {Number}
         */

    }, {
        key: 'left',
        get: function get() {
            return this._center.x - this._offsetCenter.x;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'top',
        get: function get() {
            return this._center.y - this._offsetCenter.y;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'right',
        get: function get() {
            return this._center.x + this._offsetCenter.x;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'bottom',
        get: function get() {
            return this._center.y + this._offsetCenter.y;
        }
    }]);

    return View;
}();

exports.default = View;

/***/ }),
/* 60 */
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
   * @param {Application} app
   * @param {Object} [options={}]
   * @param {Number} [options.masterVolume=1]
   * @param {Number} [options.musicVolume=1]
   * @param {Number} [options.soundVolume=1]
   * @param {Number} [options.videoVolume=1]
   */
  function MediaManager(app) {
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
     * @member {Application}
     */
    this._app = app;

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

    app.on('media:play', this.play, this).on('media:volume:master', this.setMasterVolume, this).on('media:volume:sound', this.setSoundVolume, this).on('media:volume:music', this.setMusicVolume, this).on('media:volume:video', this.setVideoVolume, this);
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
     * @param {Number} [options.speed]
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
      this._app.off('media:play', this.play, this).off('media:volume:master', this.setMasterVolume, this).off('media:volume:sound', this.setSoundVolume, this).off('media:volume:music', this.setMusicVolume, this);

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
      this._app = null;
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
/* 61 */
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

var _Keyboard = __webpack_require__(62);

var _Keyboard2 = _interopRequireDefault(_Keyboard);

var _GamepadManager = __webpack_require__(63);

var _GamepadManager2 = _interopRequireDefault(_GamepadManager);

var _PointerManager = __webpack_require__(65);

var _PointerManager2 = _interopRequireDefault(_PointerManager);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class InputManager
 * @extends {ChannelManager}
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

        app.on('input:add', _this.add, _this).on('input:remove', _this.remove, _this).on('input:clear', _this.clear, _this);
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

            this._app.off('input:add', this.add, this).off('input:remove', this.remove, this).off('input:clear', this.clear, this);

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
/* 62 */
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

var _utils = __webpack_require__(1);

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
 * @extends {ChannelManager}
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
    var _this = _possibleConstructorReturn(this, (Keyboard.__proto__ || Object.getPrototypeOf(Keyboard)).call(this, channelBuffer, _const.INPUT_OFFSET.KEYBOARD, _const.INPUT_CHANNELS_DEVICE));

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
      return _const.INPUT_OFFSET.KEYBOARD + key % _const.INPUT_CHANNELS_DEVICE;
    }
  }]);

  return Keyboard;
}(_ChannelManager3.default);

exports.default = Keyboard;

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

var _Gamepad = __webpack_require__(64);

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
 * @extends {ChannelManager}
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
        var _this = _possibleConstructorReturn(this, (GamepadManager.__proto__ || Object.getPrototypeOf(GamepadManager)).call(this, channelBuffer, _const.INPUT_OFFSET.GAMEPAD, _const.INPUT_CHANNELS_DEVICE));

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
/* 64 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _settings = __webpack_require__(3);

var _settings2 = _interopRequireDefault(_settings);

var _ChannelManager2 = __webpack_require__(9);

var _ChannelManager3 = _interopRequireDefault(_ChannelManager2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Gamepad
 * @extends {ChannelManager}
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
        var _this = _possibleConstructorReturn(this, (Gamepad.__proto__ || Object.getPrototypeOf(Gamepad)).call(this, channelBuffer, _const.INPUT_OFFSET.GAMEPAD + gamepad.index * _const.INPUT_CHANNELS_HANDLER, _const.INPUT_CHANNELS_HANDLER));

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

            return _const.INPUT_OFFSET.GAMEPAD + index * _const.INPUT_CHANNELS_HANDLER + key % _const.INPUT_CHANNELS_HANDLER;
        }
    }]);

    return Gamepad;
}(_ChannelManager3.default);

exports.default = Gamepad;

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

var _support = __webpack_require__(5);

var _support2 = _interopRequireDefault(_support);

var _ChannelManager2 = __webpack_require__(9);

var _ChannelManager3 = _interopRequireDefault(_ChannelManager2);

var _Pointer = __webpack_require__(66);

var _Pointer2 = _interopRequireDefault(_Pointer);

var _Vector = __webpack_require__(2);

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
 * @extends {ChannelManager}
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
        var _this = _possibleConstructorReturn(this, (PointerManager.__proto__ || Object.getPrototypeOf(PointerManager)).call(this, channelBuffer, _const.INPUT_OFFSET.POINTER, _const.INPUT_CHANNELS_DEVICE));

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

            if (!this._flags) {
                return;
            }

            if ((0, _utils.hasFlag)(FLAGS.ENTER, this._flags)) {
                this._app.trigger('pointer:enter', this._pointersEntered, this._pointers);
                this._pointersEntered.clear();

                this._flags = (0, _utils.removeFlag)(FLAGS.ENTER, this._flags);
            }

            if ((0, _utils.hasFlag)(FLAGS.LEAVE, this._flags)) {
                this._app.trigger('pointer:leave', this._pointersLeft, this._pointers);

                var _iteratorNormalCompletion2 = true;
                var _didIteratorError2 = false;
                var _iteratorError2 = undefined;

                try {
                    for (var _iterator2 = this._pointersLeft[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                        var _pointer = _step2.value;

                        _pointer.destroy();
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

                this._pointersLeft.clear();
                this._flags = (0, _utils.removeFlag)(FLAGS.LEAVE, this._flags);
            }

            if ((0, _utils.hasFlag)(FLAGS.MOVE, this._flags)) {
                this._app.trigger('pointer:move', this._pointersMoved, this._pointers);
                this._pointersMoved.clear();

                this._flags = (0, _utils.removeFlag)(FLAGS.MOVE, this._flags);
            }

            if ((0, _utils.hasFlag)(FLAGS.DOWN, this._flags)) {
                this._app.trigger('pointer:down', this._pointersDown, this._pointers);
                this._pointersDown.clear();

                this._flags = (0, _utils.removeFlag)(FLAGS.DOWN, this._flags);
            }

            if ((0, _utils.hasFlag)(FLAGS.UP, this._flags)) {
                this._app.trigger('pointer:up', this._pointersUp, this._pointers);
                this._pointersUp.clear();

                this._flags = (0, _utils.removeFlag)(FLAGS.UP, this._flags);
            }

            if ((0, _utils.hasFlag)(FLAGS.CANCEL, this._flags)) {
                this._app.trigger('pointer:cancel', this._pointersCancelled, this._pointers);
                this._pointersCancelled.clear();

                this._flags = (0, _utils.removeFlag)(FLAGS.CANCEL, this._flags);
            }

            if ((0, _utils.hasFlag)(FLAGS.SCROLL, this._flags)) {
                this._app.trigger('pointer:scroll', this._scrollDelta, this._pointers);
                this._scrollDelta.set(0, 0);

                this._flags = (0, _utils.removeFlag)(FLAGS.SCROLL, this._flags);
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

            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {
                for (var _iterator3 = this._pointers.values()[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                    var pointer = _step3.value;

                    pointer.destroy();
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
            this._stopEventHandler = this._stopEvent.bind(this);

            canvas.addEventListener('pointerover', this._onEnterHandler, passive);
            canvas.addEventListener('pointerleave', this._onLeaveHandler, passive);
            canvas.addEventListener('pointercancel', this._onCancelHandler, passive);
            canvas.addEventListener('pointermove', this._onMoveHandler, passive);
            canvas.addEventListener('pointerdown', this._onDownHandler, active);
            canvas.addEventListener('pointerup', this._onUpHandler, active);
            canvas.addEventListener('wheel', this._onScrollHandler, active);
            canvas.addEventListener('contextmenu', this._stopEventHandler, active);
            canvas.addEventListener('selectstart', this._stopEventHandler, active);
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
            canvas.removeEventListener('contextmenu', this._stopEventHandler, active);
            canvas.removeEventListener('selectstart', this._stopEventHandler, active);

            this._onEnterHandler = null;
            this._onLeaveHandler = null;
            this._onMoveHandler = null;
            this._onDownHandler = null;
            this._onUpHandler = null;
            this._onCancelHandler = null;
            this._stopEventHandler = null;
        }

        /**
         * @private
         * @param {PointerEvent} event
         * @fires Pointer#enter
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
         * @fires Pointer#leave
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
         * @fires Pointer#down
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
         * @fires Pointer#up
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
         * @fires Pointer#cancel
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
         * @fires Pointer#move
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
         * @fires Pointer#scroll
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
         */

    }, {
        key: '_stopEvent',
        value: function _stopEvent(event) {
            event.preventDefault();
            event.stopImmediatePropagation();
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
/* 66 */
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

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Size = __webpack_require__(13);

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
 * @extends {ChannelManager}
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

        var _this = _possibleConstructorReturn(this, (Pointer.__proto__ || Object.getPrototypeOf(Pointer)).call(this, channelBuffer, _const.INPUT_OFFSET.POINTER, _const.INPUT_CHANNELS_HANDLER));

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
/* 67 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderable2 = __webpack_require__(20);

var _Renderable3 = _interopRequireDefault(_Renderable2);

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
            return this.x - this.width + this.origin.x;
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
        key: 'right',
        get: function get() {
            return this.x + this.width + this.origin.x;
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
    }]);

    return Container;
}(_Renderable3.default);

exports.default = Container;

/***/ }),
/* 68 */
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

var _Time = __webpack_require__(10);

var _Time2 = _interopRequireDefault(_Time);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Particle
 */
var Particle = function () {

    /**
     * @constructor
     * @param {ParticleOptions} options
     */
    function Particle(options) {
        _classCallCheck(this, Particle);

        /**
         * @private
         * @member {Time}
         */
        this._totalLifetime = options.totalLifetime.clone();

        /**
         * @private
         * @member {Time}
         */
        this._elapsedLifetime = new _Time2.default();

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
         * @param {Time} delta
         */
        value: function update(delta) {
            var seconds = delta.seconds;

            this._elapsedLifetime.add(delta);
            this._position.add(seconds * this._velocity.x, seconds * this._velocity.y);
            this._rotation += seconds * this._rotationSpeed;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._totalLifetime.destroy();
            this._totalLifetime = null;

            this._elapsedLifetime.destroy();
            this._elapsedLifetime = null;

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
            return _Time2.default.Temp.set(this.totalLifetime.milliseconds - this.elapsedLifetime.milliseconds);
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
/* 69 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

var _Color = __webpack_require__(8);

var _Color2 = _interopRequireDefault(_Color);

var _Time = __webpack_require__(10);

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
            _get(ParticleOptions.prototype.__proto__ || Object.getPrototypeOf(ParticleOptions.prototype), 'destroy', this).call(this);

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
        set: function set(rotation) {
            this._rotation = rotation % 360;
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
/* 70 */
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
     * @param {Number[]} keys
     */


    _createClass(RC4, [{
        key: "setKeys",
        value: function setKeys(keys) {
            var oldKeys = this._keys,
                newKeys = keys && keys.length || [1],
                len = newKeys.length,
                width = 256,
                mask = 255;

            this._i = 0;
            this._j = 0;

            oldKeys.length = 0;

            for (var i = 0; i < width; i++) {
                oldKeys[i] = i;
            }

            for (var _i = 0, j = 0; _i < width; _i++) {
                var t = oldKeys[_i];

                j = mask & j + newKeys[_i % len] + t;

                oldKeys[_i] = oldKeys[j];
                oldKeys[j] = t;
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

            var c = count,
                result = 0,
                i = this._i,
                j = this._j,
                t = void 0;

            while (c--) {
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
/* 71 */
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

var _content = __webpack_require__(72);

Object.keys(_content).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _content[key];
        }
    });
});

var _core = __webpack_require__(74);

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

var _extras = __webpack_require__(85);

Object.keys(_extras).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _extras[key];
        }
    });
});

var _input = __webpack_require__(90);

Object.keys(_input).forEach(function (key) {
    if (key === "default" || key === "__esModule") return;
    Object.defineProperty(exports, key, {
        enumerable: true,
        get: function get() {
            return _input[key];
        }
    });
});

var _math = __webpack_require__(92);

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

var _support = __webpack_require__(5);

var support = _interopRequireWildcard(_support);

var _utils = __webpack_require__(1);

var utils = _interopRequireWildcard(_utils);

var _settings = __webpack_require__(3);

var settings = _interopRequireWildcard(_settings);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

exports.support = support;
exports.utils = utils;
exports.settings = settings; /**
                              * @namespace Exo
                              */

/***/ }),
/* 72 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _Database = __webpack_require__(73);

Object.defineProperty(exports, 'Database', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Database).default;
  }
});

var _ResourceLoader = __webpack_require__(33);

Object.defineProperty(exports, 'ResourceLoader', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ResourceLoader).default;
  }
});

var _ResourceContainer = __webpack_require__(34);

Object.defineProperty(exports, 'ResourceContainer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ResourceContainer).default;
  }
});

var _ResourceFactory = __webpack_require__(14);

Object.defineProperty(exports, 'ResourceFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ResourceFactory).default;
  }
});

var _ArrayBufferFactory = __webpack_require__(11);

Object.defineProperty(exports, 'ArrayBufferFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ArrayBufferFactory).default;
  }
});

var _AudioBufferFactory = __webpack_require__(22);

Object.defineProperty(exports, 'AudioBufferFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_AudioBufferFactory).default;
  }
});

var _AudioFactory = __webpack_require__(23);

Object.defineProperty(exports, 'AudioFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_AudioFactory).default;
  }
});

var _BlobFactory = __webpack_require__(12);

Object.defineProperty(exports, 'BlobFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_BlobFactory).default;
  }
});

var _FontFactory = __webpack_require__(35);

Object.defineProperty(exports, 'FontFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_FontFactory).default;
  }
});

var _ImageFactory = __webpack_require__(24);

Object.defineProperty(exports, 'ImageFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ImageFactory).default;
  }
});

var _JSONFactory = __webpack_require__(36);

Object.defineProperty(exports, 'JSONFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_JSONFactory).default;
  }
});

var _MusicFactory = __webpack_require__(37);

Object.defineProperty(exports, 'MusicFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_MusicFactory).default;
  }
});

var _SoundFactory = __webpack_require__(39);

Object.defineProperty(exports, 'SoundFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SoundFactory).default;
  }
});

var _StringFactory = __webpack_require__(41);

Object.defineProperty(exports, 'StringFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_StringFactory).default;
  }
});

var _TextureFactory = __webpack_require__(42);

Object.defineProperty(exports, 'TextureFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_TextureFactory).default;
  }
});

var _VideoFactory = __webpack_require__(47);

Object.defineProperty(exports, 'VideoFactory', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_VideoFactory).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 73 */
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
/* 74 */
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

var _Application = __webpack_require__(75);

Object.defineProperty(exports, 'Application', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Application).default;
  }
});

var _Quadtree = __webpack_require__(79);

Object.defineProperty(exports, 'Quadtree', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Quadtree).default;
  }
});

var _Scene = __webpack_require__(80);

Object.defineProperty(exports, 'Scene', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Scene).default;
  }
});

var _SceneNode = __webpack_require__(27);

Object.defineProperty(exports, 'SceneNode', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_SceneNode).default;
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

var _Time = __webpack_require__(10);

Object.defineProperty(exports, 'Time', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Time).default;
  }
});

var _Clock = __webpack_require__(26);

Object.defineProperty(exports, 'Clock', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Clock).default;
  }
});

var _Timer = __webpack_require__(81);

Object.defineProperty(exports, 'Timer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Timer).default;
  }
});

var _Bounds = __webpack_require__(19);

Object.defineProperty(exports, 'Bounds', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Bounds).default;
  }
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

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(6);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _Clock = __webpack_require__(26);

var _Clock2 = _interopRequireDefault(_Clock);

var _SceneManager = __webpack_require__(48);

var _SceneManager2 = _interopRequireDefault(_SceneManager);

var _DisplayManager = __webpack_require__(50);

var _DisplayManager2 = _interopRequireDefault(_DisplayManager);

var _MediaManager = __webpack_require__(60);

var _MediaManager2 = _interopRequireDefault(_MediaManager);

var _InputManager = __webpack_require__(61);

var _InputManager2 = _interopRequireDefault(_InputManager);

var _ResourceLoader = __webpack_require__(33);

var _ResourceLoader2 = _interopRequireDefault(_ResourceLoader);

var _settings = __webpack_require__(3);

var _settings2 = _interopRequireDefault(_settings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Application
 * @extends {EventEmitter}
 */
var Application = function (_EventEmitter) {
    _inherits(Application, _EventEmitter);

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
         * @member {MediaManager}
         */
        _this._mediaManager = new _MediaManager2.default(_this, config);

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
                this._sceneManager.update(this._delta.getElapsedTime());
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

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'FPS',
        get: function get() {
            return 1000 / this._delta.getElapsedTime().milliseconds;
        }
    }]);

    return Application;
}(_EventEmitter3.default);

exports.default = Application;

/***/ }),
/* 76 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _settings = __webpack_require__(3);

var _settings2 = _interopRequireDefault(_settings);

var _Size = __webpack_require__(13);

var _Size2 = _interopRequireDefault(_Size);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class GLTexture
 */
var GLTexture = function () {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context
     */
    function GLTexture(context) {
        _classCallCheck(this, GLTexture);

        if (!context) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        /**
         * @private
         * @member {WebGLRenderingContext}
         */
        this._context = context;

        /**
         * @private
         * @member {WebGLTexture}
         */
        this._texture = context.createTexture();

        /**
         * @private
         * @member {Size}
         */
        this._size = new _Size2.default(-1, -1);
    }

    /**
     * @public
     * @chainable
     * @returns {GLTexture}
     */


    _createClass(GLTexture, [{
        key: 'bind',
        value: function bind() {
            var gl = this._context;

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
         * @public
         * @chainable
         * @param {Number} scaleMode
         * @returns {GLTexture}
         */

    }, {
        key: 'setScaleMode',
        value: function setScaleMode(scaleMode) {
            var gl = this._context;

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, scaleMode);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, scaleMode);

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
            var gl = this._context;

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);

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
            var gl = this._context;

            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplyAlpha);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} source
         * @returns {GLTexture}
         */

    }, {
        key: 'setTextureImage',
        value: function setTextureImage(source) {
            var gl = this._context,
                width = source.videoWidth || source.width,
                height = source.videoHeight || source.height;

            if (this._size.width !== width || this._size.height !== height) {
                this._size.set(width, height);

                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            } else {
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
            }

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._context.deleteTexture(this._texture);

            this._size.destroy();
            this._size = null;

            this._texture = null;
            this._context = null;
        }
    }]);

    return GLTexture;
}();

exports.default = GLTexture;

/***/ }),
/* 77 */
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
/* 78 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Size2 = __webpack_require__(13);

var _Size3 = _interopRequireDefault(_Size2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ObservableSize
 * @extends {Size]
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
        value: function add(width) {
            var height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : width;

            return this.set(this._width + width, this._height + height);
        }

        /**
         * @override
         */

    }, {
        key: 'subtract',
        value: function subtract(width) {
            var height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : width;

            return this.set(this._width - width, this._height - height);
        }

        /**
         * @override
         */

    }, {
        key: 'multiply',
        value: function multiply(width) {
            var height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : width;

            return this.set(this._width * width, this._height * height);
        }

        /**
         * @override
         */

    }, {
        key: 'divide',
        value: function divide(width) {
            var height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : width;

            return this.set(this._width / width, this._height / height);
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
/* 79 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _settings = __webpack_require__(3);

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
/* 80 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(6);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _SceneNode = __webpack_require__(27);

var _SceneNode2 = _interopRequireDefault(_SceneNode);

var _Bounds = __webpack_require__(19);

var _Bounds2 = _interopRequireDefault(_Bounds);

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

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
         * @member {Application}
         */
        var _this = _possibleConstructorReturn(this, (Scene.__proto__ || Object.getPrototypeOf(Scene)).call(this));

        _this._app = null;

        /**
         * @private
         * @member {Set<SceneNode>}
         */
        _this._nodes = new Set();

        /**
         * @private
         * @member {Bounds}
         */
        _this._bounds = new _Bounds2.default();

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
        key: 'hasNode',


        /**
         * @public
         * @param {SceneNode} node
         * @returns {Boolean}
         */
        value: function hasNode(node) {
            return this._nodes.has(node);
        }

        /**
         * @public
         * @chainable
         * @param {SceneNode} node
         * @returns {Scene}
         */

    }, {
        key: 'addNode',
        value: function addNode(node) {
            if (node.scene !== this) {
                if (node.scene) {
                    node.scene.removeNode(node);
                }

                node.scene = this;

                this._nodes.add(node);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {SceneNode} node
         * @returns {Scene}
         */

    }, {
        key: 'removeNode',
        value: function removeNode(node) {
            if (node.scene === this) {
                node.scene = null;
                this._nodes.delete(node);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Scene}
         */

    }, {
        key: 'clearNodes',
        value: function clearNodes() {
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._nodes[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var node = _step.value;

                    this.removeNode(node);
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
         * @returns {Rectangle}
         */

    }, {
        key: 'getBounds',
        value: function getBounds() {
            this._bounds.reset();

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this._nodes[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var node = _step2.value;

                    if (node.active) {
                        this._bounds.addRect(node.getBounds());
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

            return this._bounds.getRect();
        }

        /**
         * @public
         * @abstract
         * @param {ResourceLoader} loader
         */

    }, {
        key: 'load',
        value: function load(loader) {
            // eslint-disable-line
            this._app.trigger('scene:start');
        }

        /**
         * @public
         * @abstract
         * @param {ResourceContainer} resources
         */

    }, {
        key: 'init',
        value: function init(resources) {} // eslint-disable-line
        // do nothing


        /**
         * @public
         * @abstract
         * @param {Time} delta
         */

    }, {
        key: 'update',
        value: function update(delta) {} // eslint-disable-line
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

            this.clearNodes();

            this._bounds.destroy();
            this._bounds = null;

            this._nodes = null;
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

        /**
         * @public
         * @readonly
         * @member {Set<SceneNode>}
         */

    }, {
        key: 'nodes',
        get: function get() {
            return this._nodes;
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

    return Scene;
}(_EventEmitter3.default);

exports.default = Scene;

/***/ }),
/* 81 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

var _Clock2 = __webpack_require__(26);

var _Clock3 = _interopRequireDefault(_Clock2);

var _Time = __webpack_require__(10);

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
     * @param {Number} [factor=TIME.MILLISECONDS]
     * @returns {Timer}
     */
    value: function reset(timeLimit) {
      var factor = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _const.TIME.MILLISECONDS;

      this._limit = timeLimit * factor;
      this._timeBuffer = 0;
      this._isRunning = false;

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} timeLimit
     * @param {Number} [factor=TIME.MILLISECONDS]
     * @returns {Timer}
     */

  }, {
    key: 'restart',
    value: function restart(timeLimit) {
      var factor = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _const.TIME.MILLISECONDS;

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
      return this.getRemainingMilliseconds() / _const.TIME.SECONDS;
    }

    /**
     * @public
     * @returns {Number}
     */

  }, {
    key: 'getRemainingMinutes',
    value: function getRemainingMinutes() {
      return this.getRemainingMilliseconds() / _const.TIME.MINUTES;
    }

    /**
     * @public
     * @returns {Time}
     */

  }, {
    key: 'getRemainingTime',
    value: function getRemainingTime() {
      return this.time.setMilliseconds(this.getRemainingMilliseconds());
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
/* 82 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _DisplayManager = __webpack_require__(50);

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

var _RenderState = __webpack_require__(51);

Object.defineProperty(exports, 'RenderState', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_RenderState).default;
  }
});

var _Texture = __webpack_require__(16);

Object.defineProperty(exports, 'Texture', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Texture).default;
  }
});

var _View = __webpack_require__(59);

Object.defineProperty(exports, 'View', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_View).default;
  }
});

var _Renderer = __webpack_require__(30);

Object.defineProperty(exports, 'Renderer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Renderer).default;
  }
});

var _Renderable = __webpack_require__(20);

Object.defineProperty(exports, 'Renderable', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Renderable).default;
  }
});

var _Container = __webpack_require__(67);

Object.defineProperty(exports, 'Container', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Container).default;
  }
});

var _Text = __webpack_require__(83);

Object.defineProperty(exports, 'Text', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Text).default;
  }
});

var _Video = __webpack_require__(84);

Object.defineProperty(exports, 'Video', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Video).default;
  }
});

var _Shader = __webpack_require__(31);

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

var _Sprite = __webpack_require__(32);

Object.defineProperty(exports, 'Sprite', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Sprite).default;
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

var _const = __webpack_require__(0);

var _settings = __webpack_require__(3);

var _settings2 = _interopRequireDefault(_settings);

var _Sprite2 = __webpack_require__(32);

var _Sprite3 = _interopRequireDefault(_Sprite2);

var _Texture = __webpack_require__(16);

var _Texture2 = _interopRequireDefault(_Texture);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var heightCache = new Map();

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
        _this._dirty = true;

        _this.setText(text);
        _this.setStyle(style);

        _this.updateTexture();
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
         * @param {Object} style
         * @returns {Text}
         */

    }, {
        key: 'setStyle',
        value: function setStyle(style) {
            this._style = Object.assign({}, _settings2.default.TEXT_STYLE, style);
            this._dirty = true;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'updateTexture',
        value: function updateTexture() {
            if (this._dirty) {
                this._updateContext();

                var canvas = this._canvas,
                    context = this._context,
                    style = this._style,
                    text = style.wordWrap ? this._getWordWrappedText(style.wordWrapWidth) : this._text,
                    lineHeight = this._determineFontHeight(context.font) + style.strokeThickness,
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

                    this.localBounds.set(0, 0, canvasWidth, canvasHeight);
                    this.setTextureFrame(this.localBounds);
                    this.scale.set(1, 1);
                } else {
                    context.clearRect(0, 0, canvas.width, canvas.height);
                }

                this._updateContext();

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
                this.updateTexture();

                _get(Text.prototype.__proto__ || Object.getPrototypeOf(Text.prototype), 'render', this).call(this, displayManager);
            }

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
         * @private
         * @returns {String}
         */

    }, {
        key: '_getWordWrappedText',
        value: function _getWordWrappedText(wordWrapWidth) {
            var context = this._context,
                spaceWidth = context.measureText(' ').width,
                lines = this._text.split('\n');

            var spaceLeft = wordWrapWidth,
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

                        spaceLeft -= wordWidth;
                    } else {
                        spaceLeft -= pairWidth;
                    }

                    result += word + ' ';
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

        /**
         * @public
         * @returns {Text}
         */

    }, {
        key: '_updateContext',
        value: function _updateContext() {
            var context = this._context,
                style = this._style;

            context.font = style.fontWeight + ' ' + style.fontSize + 'px ' + style.fontFamily;
            context.fillStyle = style.fill;
            context.strokeStyle = style.stroke;
            context.lineWidth = style.strokeThickness;
            context.textBaseline = style.baseline;
            context.lineJoin = style.lineJoin;
            context.miterLimit = style.miterLimit;

            return this;
        }
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
         * @member {Object}
         */

    }, {
        key: 'style',
        get: function get() {
            return this._style;
        },
        set: function set(style) {
            this.setStyle(style);
        }
    }]);

    return Text;
}(_Sprite3.default);

exports.default = Text;

/***/ }),
/* 84 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _utils = __webpack_require__(1);

var _Sprite2 = __webpack_require__(32);

var _Sprite3 = _interopRequireDefault(_Sprite2);

var _Texture = __webpack_require__(16);

var _Texture2 = _interopRequireDefault(_Texture);

var _support = __webpack_require__(5);

var _support2 = _interopRequireDefault(_support);

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

        var _this = _possibleConstructorReturn(this, (Video.__proto__ || Object.getPrototypeOf(Video)).call(this, new _Texture2.default(videoElement)));

        if (!_support2.default.webAudio) {
            throw new Error('Web Audio API is not supported, use the fallback Audio instead.');
        }

        /**
         * @private
         * @member {HTMLVideoElement}
         */
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

        /**
         * @private
         * @member {Number}
         */
        _this._duration = videoElement.duration;

        /**
         * @private
         * @member {Number}
         */
        _this._volume = videoElement.volume;

        /**
         * @private
         * @member {Number}
         */
        _this._speed = videoElement.playbackRate;

        /**
         * @private
         * @member {Boolean}
         */
        _this._loop = videoElement.loop;
        return _this;
    }

    /**
     * @public
     * @readonly
     * @member {?AudioContext}
     */


    _createClass(Video, [{
        key: 'connect',


        /**
         * @public
         * @chainable
         * @param {MediaManager} mediaManager
         * @returns {Video}
         */
        value: function connect(mediaManager) {
            if (!this._audioContext) {
                this._audioContext = mediaManager.audioContext;

                this._gainNode = this._audioContext.createGain();
                this._gainNode.connect(mediaManager.videoGain);
                this._gainNode.gain.value = this._volume;

                this._sourceNode = this._audioContext.createMediaElementSource(this.source);
                this._sourceNode.connect(this._gainNode);
            }

            return this;
        }

        /**
         * @public
         * @param {Object} [options]
         * @param {Boolean} [options.loop]
         * @param {Number} [options.speed]
         * @param {Number} [options.volume]
         * @param {Number} [options.time]
         */

    }, {
        key: 'play',
        value: function play(options) {
            if (this.paused) {
                this.applyOptions(options);
                this._source.play();
                this.trigger('start');
            }
        }

        /**
         * @public
         */

    }, {
        key: 'pause',
        value: function pause() {
            if (this.playing) {
                this._source.pause();
                this.trigger('stop');
            }
        }

        /**
         * @public
         */

    }, {
        key: 'stop',
        value: function stop() {
            this.pause();
            this.currentTime = 0;
        }

        /**
         * @public
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
         * @param {Object} [options]
         * @param {Boolean} [options.loop]
         * @param {Number} [options.speed]
         * @param {Number} [options.volume]
         * @param {Number} [options.time]
         */

    }, {
        key: 'applyOptions',
        value: function applyOptions() {
            var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
                loop = _ref.loop,
                speed = _ref.speed,
                volume = _ref.volume,
                time = _ref.time;

            if (loop !== undefined) {
                this.loop = loop;
            }

            if (speed !== undefined) {
                this.speed = speed;
            }

            if (volume !== undefined) {
                this.volume = volume;
            }

            if (time !== undefined) {
                this.currentTime = time;
            }
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager) {
            if (this.active) {
                this._texture.updateSource();

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

            if (this._audioContext) {
                this._audioContext = null;

                this._sourceNode.disconnect();
                this._sourceNode = null;

                this._gainNode.disconnect();
                this._gainNode = null;
            }

            this._source = null;
            this._duration = null;
            this._volume = null;
            this._speed = null;
            this._loop = null;
        }
    }, {
        key: 'audioContext',
        get: function get() {
            return this._audioContext;
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
                    this._gainNode.gain.value = volume;
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
                this._source.loop = this._loop = loop;
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
                this._source.playbackRate = this._speed = speed;
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
    }]);

    return Video;
}(_Sprite3.default);

exports.default = Video;

/***/ }),
/* 85 */
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

var _ParticleEmitter = __webpack_require__(86);

Object.defineProperty(exports, 'ParticleEmitter', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleEmitter).default;
  }
});

var _ParticleOptions = __webpack_require__(69);

Object.defineProperty(exports, 'ParticleOptions', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleOptions).default;
  }
});

var _ParticleShader = __webpack_require__(58);

Object.defineProperty(exports, 'ParticleShader', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleShader).default;
  }
});

var _ParticleRenderer = __webpack_require__(57);

Object.defineProperty(exports, 'ParticleRenderer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleRenderer).default;
  }
});

var _ParticleModifier = __webpack_require__(21);

Object.defineProperty(exports, 'ParticleModifier', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ParticleModifier).default;
  }
});

var _ForceModifier = __webpack_require__(87);

Object.defineProperty(exports, 'ForceModifier', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ForceModifier).default;
  }
});

var _ScaleModifier = __webpack_require__(88);

Object.defineProperty(exports, 'ScaleModifier', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ScaleModifier).default;
  }
});

var _TorqueModifier = __webpack_require__(89);

Object.defineProperty(exports, 'TorqueModifier', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_TorqueModifier).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 86 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderable2 = __webpack_require__(20);

var _Renderable3 = _interopRequireDefault(_Renderable2);

var _Particle = __webpack_require__(68);

var _Particle2 = _interopRequireDefault(_Particle);

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Time = __webpack_require__(10);

var _Time2 = _interopRequireDefault(_Time);

var _ParticleOptions = __webpack_require__(69);

var _ParticleOptions2 = _interopRequireDefault(_ParticleOptions);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ParticleEmitter
 * @extends {Renderable}
 */
var ParticleEmitter = function (_Renderable) {
    _inherits(ParticleEmitter, _Renderable);

    /**
     * @constructor
     * @param {Texture} texture
     * @param {Object} [particleOptions = new ParticleOptions()]
     */
    function ParticleEmitter(texture, particleOptions) {
        _classCallCheck(this, ParticleEmitter);

        /**
         * @private
         * @member {Texture}
         */
        var _this = _possibleConstructorReturn(this, (ParticleEmitter.__proto__ || Object.getPrototypeOf(ParticleEmitter)).call(this));

        _this._texture = texture;

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
         * @member {Boolean}
         */
        _this._updateTexCoords = true;

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
         * @member {Set<Particle>}
         */
        _this._particles = new Set();

        /**
         * @private
         * @member {ParticleOptions}
         */
        _this._particleOptions = new _ParticleOptions2.default(particleOptions);

        if (texture) {
            _this.setTexture(texture);
        }
        return _this;
    }

    /**
     * @public
     * @member {Texture}
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
                this.setTextureFrame(texture.sourceFrame);
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
         * @param {Time} delta
         */

    }, {
        key: 'update',
        value: function update(delta) {
            var options = this._particleOptions,
                particles = this._particles,
                modifiers = this._modifiers,
                particleCount = this.computeParticleCount(delta);

            for (var i = 0; i < particleCount; i++) {
                particles.add(new _Particle2.default(options));
            }

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = particles[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var particle = _step.value;

                    particle.update(delta);

                    if (particle.elapsedLifetime.greaterThan(particle.totalLifetime)) {
                        particle.destroy();
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
         * @chainable
         * @param {DisplayManager} displayManager
         * @returns {ParticleEmitter}
         */

    }, {
        key: 'render',
        value: function render(displayManager) {
            if (this.active) {
                displayManager.render(this, 'particle');
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(ParticleEmitter.prototype.__proto__ || Object.getPrototypeOf(ParticleEmitter.prototype), 'destroy', this).call(this);

            this._texture = null;

            this._textureFrame.destroy();
            this._textureFrame = null;

            this._textureCoords.destroy();
            this._textureCoords = null;

            this._modifiers.length = 0;
            this._modifiers = null;

            this._particles.clear();
            this._particles = null;

            this._particleOptions.destroy();
            this._particleOptions = null;

            this._emissionRate = null;
            this._emissionDelta = null;
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
         * @member {Rectangle}
         */

    }, {
        key: 'textureCoords',
        get: function get() {
            if (this._updateTexCoords) {
                var _textureFrame = this._textureFrame,
                    left = _textureFrame.left,
                    top = _textureFrame.top,
                    right = _textureFrame.right,
                    bottom = _textureFrame.bottom,
                    _texture = this._texture,
                    width = _texture.width,
                    height = _texture.height;


                this._textureCoords.set(left / width, top / height, right / width, bottom / height);
                this._updateTexCoords = false;
            }

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
            this.setEmissionRate(particlesPerSecond);
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
         * @member {Set<Particle>}
         */

    }, {
        key: 'particles',
        get: function get() {
            return this._particles;
        }
    }]);

    return ParticleEmitter;
}(_Renderable3.default);

exports.default = ParticleEmitter;

/***/ }),
/* 87 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ParticleModifier2 = __webpack_require__(21);

var _ParticleModifier3 = _interopRequireDefault(_ParticleModifier2);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ForceModifier
 * @extends {ParticleModifier}
 */
var ForceModifier = function (_ParticleModifier) {
    _inherits(ForceModifier, _ParticleModifier);

    /**
     * @constructor
     * @param {Vector} acceleration
     */
    function ForceModifier() {
        var acceleration = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : _Vector2.default.Empty;

        _classCallCheck(this, ForceModifier);

        /**
         * @private
         * @member {Vector}
         */
        var _this = _possibleConstructorReturn(this, (ForceModifier.__proto__ || Object.getPrototypeOf(ForceModifier)).call(this));

        _this._acceleration = acceleration.clone();
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
/* 88 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ParticleModifier2 = __webpack_require__(21);

var _ParticleModifier3 = _interopRequireDefault(_ParticleModifier2);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ScaleModifier
 * @extends {ParticleModifier}
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
/* 89 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ParticleModifier2 = __webpack_require__(21);

var _ParticleModifier3 = _interopRequireDefault(_ParticleModifier2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class TorqueModifier
 * @extends {ParticleModifier}
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

/***/ }),
/* 90 */
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

var _Input = __webpack_require__(91);

Object.defineProperty(exports, 'Input', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Input).default;
  }
});

var _InputManager = __webpack_require__(61);

Object.defineProperty(exports, 'InputManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_InputManager).default;
  }
});

var _Keyboard = __webpack_require__(62);

Object.defineProperty(exports, 'Keyboard', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Keyboard).default;
  }
});

var _GamepadControl = __webpack_require__(46);

Object.defineProperty(exports, 'GamepadControl', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_GamepadControl).default;
  }
});

var _GamepadMapping = __webpack_require__(45);

Object.defineProperty(exports, 'GamepadMapping', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_GamepadMapping).default;
  }
});

var _DefaultGamepadMapping = __webpack_require__(44);

Object.defineProperty(exports, 'DefaultGamepadMapping', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_DefaultGamepadMapping).default;
  }
});

var _Gamepad = __webpack_require__(64);

Object.defineProperty(exports, 'Gamepad', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Gamepad).default;
  }
});

var _GamepadManager = __webpack_require__(63);

Object.defineProperty(exports, 'GamepadManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_GamepadManager).default;
  }
});

var _Pointer = __webpack_require__(66);

Object.defineProperty(exports, 'Pointer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Pointer).default;
  }
});

var _PointerManager = __webpack_require__(65);

Object.defineProperty(exports, 'PointerManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_PointerManager).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 91 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(6);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _settings = __webpack_require__(3);

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
     * @param {Number} [options.triggerThreshold=settings.INPUT_THRESHOLD]
     * @param {Function} [options.start]
     * @param {Function} [options.stop]
     * @param {Function} [options.active]
     * @param {Function} [options.trigger]
     * @param {*} [options.context]
     */
    function Input(channels) {
        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            _ref$triggerThreshold = _ref.triggerThreshold,
            triggerThreshold = _ref$triggerThreshold === undefined ? _settings2.default.INPUT_THRESHOLD : _ref$triggerThreshold,
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
/* 92 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _Vector = __webpack_require__(2);

Object.defineProperty(exports, 'Vector', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Vector).default;
  }
});

var _ObservableVector = __webpack_require__(28);

Object.defineProperty(exports, 'ObservableVector', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ObservableVector).default;
  }
});

var _Matrix = __webpack_require__(7);

Object.defineProperty(exports, 'Matrix', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Matrix).default;
  }
});

var _Transformable = __webpack_require__(49);

Object.defineProperty(exports, 'Transformable', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Transformable).default;
  }
});

var _Interval = __webpack_require__(25);

Object.defineProperty(exports, 'Interval', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Interval).default;
  }
});

var _Collision = __webpack_require__(18);

Object.defineProperty(exports, 'Collision', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Collision).default;
  }
});

var _RC = __webpack_require__(70);

Object.defineProperty(exports, 'RC4', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_RC).default;
  }
});

var _Random = __webpack_require__(93);

Object.defineProperty(exports, 'Random', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Random).default;
  }
});

var _Shape = __webpack_require__(17);

Object.defineProperty(exports, 'Shape', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Shape).default;
  }
});

var _Rectangle = __webpack_require__(4);

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

var _Polygon = __webpack_require__(43);

Object.defineProperty(exports, 'Polygon', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Polygon).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/***/ }),
/* 93 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _RC = __webpack_require__(70);

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
                    seed[i] = Math._random() * 256 & 255;
                }
            }

            return String.fromCharCode.apply(String, _toConsumableArray(seed));
        }
    }]);

    return Random;
}();

exports.default = Random;

/***/ }),
/* 94 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _const = __webpack_require__(0);

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Shape2 = __webpack_require__(17);

var _Shape3 = _interopRequireDefault(_Shape2);

var _Collision = __webpack_require__(18);

var _Collision2 = _interopRequireDefault(_Collision);

var _Vector = __webpack_require__(2);

var _Vector2 = _interopRequireDefault(_Vector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Circle
 * @extends {Shape}
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
         * @member {Number}
         */
        var _this = _possibleConstructorReturn(this, (Circle.__proto__ || Object.getPrototypeOf(Circle)).call(this, x, y));

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
            this.position.set(x, y);
            this._radius = radius;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(circle) {
            this.position.copy(circle.position);
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
        key: 'equals',
        value: function equals(circle) {
            return circle === this || this.position.equals(circle.position) && this._radius === circle.radius;
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
        value: function contains(x, y, transform) {
            var position = this.position;

            if (transform) {
                position = position.transform(transform, _Vector2.default.Temp);
            }

            return position.distanceTo(x, y) <= this._radius;
        }

        /**
         * @override
         */

    }, {
        key: 'getCollision',
        value: function getCollision(shape) {
            switch (shape.type) {
                case _const.SHAPE.RECTANGLE:
                    return _Collision2.default.checkCircleRectangle(this, shape);
                case _const.SHAPE.CIRCLE:
                    return _Collision2.default.checkCircleCircle(this, shape);
                case _const.SHAPE.POLYGON:
                    return _Collision2.default.checkPolygonCircle(shape, this);
                case _const.SHAPE.NONE:
                default:
                    throw new Error('Invalid Shape Type "' + shape.type + '".');
            }
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Circle.prototype.__proto__ || Object.getPrototypeOf(Circle.prototype), 'destroy', this).call(this);

            this._radius = null;
        }
    }, {
        key: 'type',
        get: function get() {
            return _const.SHAPE.CIRCLE;
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

var _Playable = __webpack_require__(15);

Object.defineProperty(exports, 'Playable', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Playable).default;
  }
});

var _Audio = __webpack_require__(96);

Object.defineProperty(exports, 'Audio', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Audio).default;
  }
});

var _Sound = __webpack_require__(40);

Object.defineProperty(exports, 'Sound', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Sound).default;
  }
});

var _Music = __webpack_require__(38);

Object.defineProperty(exports, 'Music', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Music).default;
  }
});

var _MediaManager = __webpack_require__(60);

Object.defineProperty(exports, 'MediaManager', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_MediaManager).default;
  }
});

var _AudioAnalyser = __webpack_require__(97);

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

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

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

        _this._parentVolume = 1;
        return _this;
    }

    /**
     * @override
     */


    _createClass(Audio, [{
        key: 'connect',


        /**
         * @override
         */
        value: function connect(mediaManager) {
            this.parentVolume = mediaManager.masterVolume;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Audio.prototype.__proto__ || Object.getPrototypeOf(Audio.prototype), 'destroy', this).call(this);

            this._parentVolume = null;
        }
    }, {
        key: 'audioContext',
        get: function get() {
            return null;
        }

        /**
         * @override
         */

    }, {
        key: 'analyserTarget',
        get: function get() {
            return null;
        }

        /**
         * @override
         */

    }, {
        key: 'volume',
        set: function set(value) {
            var volume = (0, _utils.clamp)(value, 0, 2);

            if (this.volume !== volume) {
                this._volume = volume;
                this.source.volume = volume * this._parentVolume;
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'parentVolume',
        get: function get() {
            return this._parentVolume;
        },
        set: function set(value) {
            var parentVolume = (0, _utils.clamp)(value, 0, 1);

            if (this.parentVolume !== parentVolume) {
                this._parentVolume = parentVolume;
                this.source.volume = this._volume * parentVolume;
            }
        }
    }]);

    return Audio;
}(_Playable3.default);

exports.default = Audio;

/***/ }),
/* 97 */
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

/***/ })
/******/ ]);
//# sourceMappingURL=exo.build.js.map