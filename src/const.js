export const

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @memberof Exo
     * @type {String}
     */
    VERSION = __VERSION__,

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @memberof Exo
     * @type {Number}
     */
    TAU = Math.PI * 2,

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @memberof Exo
     * @type {Number}
     */
    DEG_TO_RAD = Math.PI / 180,

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @memberof Exo
     * @type {Number}
     */
    RAD_TO_DEG = 180 / Math.PI,

    /**
     * @public
     * @constant
     * @memberOf Exo
     * @name SHAPE
     * @type {Object.<String, Number>}
     * @property {Number} POLYGON
     * @property {Number} RECTANGLE
     * @property {Number} CIRCLE
     * @property {Number} ELLIPSIS
     * @property {Number} POINT
     */
    SHAPE = {
        POLYGON: 0,
        RECTANGLE: 1,
        CIRCLE: 2,
        ELLIPSIS: 3,
        POINT: 4,
    },

    /**
     * @public
     * @constant
     * @memberOf Exo
     * @name SCALE_MODE
     * @type {Object.<String, Number>}
     * @property {Number} LINEAR
     * @property {Number} NEAREST
     */
    SCALE_MODE = {
        LINEAR: 0,
        NEAREST: 1,
    },

    /**
     * @public
     * @constant
     * @memberOf Exo
     * @name WRAP_MODE
     * @type {Object.<String, Number>}
     * @property {Number} CLAMP_TO_EDGE
     * @property {Number} REPEAT
     * @property {Number} MIRRORED_REPEAT
     */
    WRAP_MODE = {
        CLAMP_TO_EDGE: 0,
        REPEAT: 1,
        MIRRORED_REPEAT: 2,
    },

    /**
     * @public
     * @constant
     * @memberOf Exo
     * @name INPUT_DEVICE
     * @type {Object.<String, Number>}
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
     * @memberOf Exo
     * @name CHANNEL_OFFSET
     * @type {Object.<String, Number>}
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
     * @memberOf Exo
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
     * @memberOf Exo
     * @name UNIFORM_TYPE
     * @type {Object.<String, Number>}
     * @property {Number} INT
     * @property {Number} FLOAT
     * @property {Number} VECTOR
     * @property {Number} VECTOR_INT
     * @property {Number} MATRIX
     * @property {Number} TEXTURE
     */
    UNIFORM_TYPE = {
        INT: 0,
        FLOAT: 1,
        VECTOR: 2,
        VECTOR_INT: 3,
        MATRIX: 4,
        TEXTURE: 5,
    },

    /**
     * @public
     * @constant
     * @memberOf Exo
     * @name BLEND_MODE
     * @type {Object.<String, Number>}
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
     * @memberOf Exo
     * @name QUAD_TREE_MAX_LEVEL
     * @type {Number}
     */
    QUAD_TREE_MAX_LEVEL = 5,

    /**
     * @public
     * @constant
     * @memberOf Exo
     * @name QUAD_TREE_MAX_ENTITIES
     * @type {Number}
     */
    QUAD_TREE_MAX_ENTITIES = 10,

    /**
     * @public
     * @constant
     * @memberOf Exo
     * @name CODEC_NOT_SUPPORTED
     * @type {RegExp}
     */
    CODEC_NOT_SUPPORTED = /^no$/;
