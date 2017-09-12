export const

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @type {String}
     */
    VERSION = __VERSION__,

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @type {Number}
     */
    TAU = Math.PI * 2,

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @type {Number}
     */
    DEG_TO_RAD = Math.PI / 180,

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @type {Number}
     */
    RAD_TO_DEG = 180 / Math.PI,

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
    SHAPE = {
        NONE: 0,
        POLYGON: 1,
        RECTANGLE: 2,
        CIRCLE: 3,
        ELLIPSIS: 4,
        POINT: 5,
    },

    /**
     * @public
     * @constant
     * @name SCALE_MODE
     * @type {Object<String, Number>}
     * @property {Number} NEAREST
     * @property {Number} LINEAR
     */
    SCALE_MODE = {
        NEAREST: 0x2600,
        LINEAR: 0x2601,
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
    WRAP_MODE = {
        REPEAT: 0x2901,
        CLAMP_TO_EDGE: 0x812F,
        MIRRORED_REPEAT: 0x8370,
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
    ATTRIBUTE_TYPE = {
        BYTE: 0x1400,
        UNSIGNED_BYTE: 0x1401,
        SHORT: 0x1402,
        UNSIGNED_SHORT: 0x1403,
        INT: 0x1404,
        UNSIGNED_INT: 0x1405,
        FLOAT: 0x1406,
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
    INPUT_DEVICE = {
        KEYBOARD: 0,
        MOUSE: 1,
        GAMEPAD: 2,
        POINTER: 3,
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
    CHANNEL_OFFSET = {
        KEYBOARD: INPUT_DEVICE.KEYBOARD << 8,
        MOUSE: INPUT_DEVICE.MOUSE << 8,
        GAMEPAD: INPUT_DEVICE.GAMEPAD << 8,
        POINTER: INPUT_DEVICE.POINTER << 8,
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
    CHANNEL_LENGTH = {
        GLOBAL: 1024,
        DEVICE: 256,
        CHILD: 32,
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
    UNIFORM_TYPE = {
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

        SAMPLER_2D: 0x8B5E,
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
    BLEND_MODE = {
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
        LUMINOSITY: 16,
    },

    /**
     * @public
     * @constant
     * @name DATABASE_TYPES
     * @type {String[]}
     */
    DATABASE_TYPES = [
        'arrayBuffer',
        'audioBuffer',
        'audio',
        'blob',
        'font',
        'image',
        'json',
        'music',
        'sound',
        'string',
    ],

    /**
     * @public
     * @constant
     * @name CODEC_NOT_SUPPORTED
     * @type {RegExp}
     */
    CODEC_NOT_SUPPORTED = /^no$/,

    /**
     * @public
     * @constant
     * @name NEWLINE
     * @type {RegExp}
     */
    NEWLINE = /(?:\r\n|\r|\n)/;
