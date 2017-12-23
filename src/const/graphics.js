export const

    /**
     * @public
     * @constant
     * @name BLEND_MODES
     * @type {Object<String, Number>}
     * @property {Number} NORMAL
     * @property {Number} ADD
     * @property {Number} SUBTRACT
     * @property {Number} MULTIPLY
     * @property {Number} SCREEN
     */
    BLEND_MODES = {
        NORMAL: 0,
        ADDITIVE: 1,
        SUBTRACT: 2,
        MULTIPLY: 3,
        SCREEN: 4,
    },

    /**
     * @public
     * @constant
     * @name SCALE_MODES
     * @type {Object<String, Number>}
     * @property {Number} NEAREST
     * @property {Number} LINEAR
     * @property {Number} NEAREST_MIPMAP_NEAREST
     * @property {Number} LINEAR_MIPMAP_NEAREST
     * @property {Number} NEAREST_MIPMAP_LINEAR
     * @property {Number} LINEAR_MIPMAP_LINEAR
     */
    SCALE_MODES = {
        NEAREST: 0x2600,
        LINEAR: 0x2601,
        NEAREST_MIPMAP_NEAREST: 0x2700,
        LINEAR_MIPMAP_NEAREST: 0x2701,
        NEAREST_MIPMAP_LINEAR: 0x2702,
        LINEAR_MIPMAP_LINEAR: 0x2703,
    },

    /**
     * @public
     * @constant
     * @name WRAP_MODES
     * @type {Object<String, Number>}
     * @property {Number} REPEAT
     * @property {Number} CLAMP_TO_EDGE
     * @property {Number} MIRRORED_REPEAT
     */
    WRAP_MODES = {
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
        SHORT: 0x1402,
        INT: 0x1404,
        FLOAT: 0x1406,
        UNSIGNED_BYTE: 0x1401,
        UNSIGNED_SHORT: 0x1403,
        UNSIGNED_INT: 0x1405,
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
     * @name TYPE_SIZES
     * @type {Object<Number, Number>}
     */
    TYPE_SIZES = {
        [UNIFORM_TYPE.FLOAT]: 1,
        [UNIFORM_TYPE.FLOAT_VEC2]: 2,
        [UNIFORM_TYPE.FLOAT_VEC3]: 3,
        [UNIFORM_TYPE.FLOAT_VEC4]: 4,
        [UNIFORM_TYPE.INT]: 1,
        [UNIFORM_TYPE.INT_VEC2]: 2,
        [UNIFORM_TYPE.INT_VEC3]: 3,
        [UNIFORM_TYPE.INT_VEC4]: 4,
        [UNIFORM_TYPE.BOOL]: 1,
        [UNIFORM_TYPE.BOOL_VEC2]: 2,
        [UNIFORM_TYPE.BOOL_VEC3]: 3,
        [UNIFORM_TYPE.BOOL_VEC4]: 4,
        [UNIFORM_TYPE.FLOAT_MAT2]: 4,
        [UNIFORM_TYPE.FLOAT_MAT3]: 9,
        [UNIFORM_TYPE.FLOAT_MAT4]: 16,
        [UNIFORM_TYPE.SAMPLER_2D]: 1,
    },

    /**
     * @public
     * @constant
     * @name TEXTURE_FLAGS
     * @type {Object<String, Number>}
     * @property {Number} SCALE_MODE
     * @property {Number} WRAP_MODE
     * @property {Number} PREMULTIPLY_ALPHA
     * @property {Number} SOURCE
     * @property {Number} SIZE
     */
    TEXTURE_FLAGS = {
        SCALE_MODE: 0x001,
        WRAP_MODE: 0x002,
        PREMULTIPLY_ALPHA: 0x004,
        SOURCE: 0x008,
        SIZE: 0x010,
    };
