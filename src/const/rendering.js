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
     * @name ATTRIBUTE_TYPES
     * @type {Object<String, Number>}
     * @property {Number} BYTE
     * @property {Number} UNSIGNED_BYTE
     * @property {Number} SHORT
     * @property {Number} UNSIGNED_SHORT
     * @property {Number} INT
     * @property {Number} UNSIGNED_INT
     * @property {Number} FLOAT
     */
    ATTRIBUTE_TYPES = {
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
     * @name UNIFORM_TYPES
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
    UNIFORM_TYPES = {
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
     * @name PRIMITIVE_TYPES
     * @type {Object<String, Number>}
     * @property {Number} POINTS
     * @property {Number} LINES
     * @property {Number} LINE_LOOP
     * @property {Number} LINE_STRIP
     * @property {Number} TRIANGLES
     * @property {Number} TRIANGLE_STRIP
     * @property {Number} TRIANGLE_FAN
     */
    PRIMITIVE_TYPES = {
        POINTS: 0x0000,
        LINES: 0x0001,
        LINE_LOOP: 0x0002,
        LINE_STRIP: 0x0003,
        TRIANGLES: 0x0004,
        TRIANGLE_STRIP: 0x0005,
        TRIANGLE_FAN: 0x0006,
    },

    /**
     * @public
     * @constant
     * @name TYPE_SIZES
     * @type {Object<Number, Number>}
     */
    TYPE_SIZES = {
        [UNIFORM_TYPES.FLOAT]: 1,
        [UNIFORM_TYPES.FLOAT_VEC2]: 2,
        [UNIFORM_TYPES.FLOAT_VEC3]: 3,
        [UNIFORM_TYPES.FLOAT_VEC4]: 4,

        [UNIFORM_TYPES.INT]: 1,
        [UNIFORM_TYPES.INT_VEC2]: 2,
        [UNIFORM_TYPES.INT_VEC3]: 3,
        [UNIFORM_TYPES.INT_VEC4]: 4,

        [UNIFORM_TYPES.BOOL]: 1,
        [UNIFORM_TYPES.BOOL_VEC2]: 2,
        [UNIFORM_TYPES.BOOL_VEC3]: 3,
        [UNIFORM_TYPES.BOOL_VEC4]: 4,

        [UNIFORM_TYPES.FLOAT_MAT2]: 4,
        [UNIFORM_TYPES.FLOAT_MAT3]: 9,
        [UNIFORM_TYPES.FLOAT_MAT4]: 16,

        [UNIFORM_TYPES.SAMPLER_2D]: 1,
    },

    /**
     * @public
     * @constant
     * @name TYPE_CLASSES
     * @type {Object<Number, Function>}
     */
    TYPE_CLASSES = {
        [UNIFORM_TYPES.FLOAT]: Float32Array,
        [UNIFORM_TYPES.FLOAT_VEC2]: Float32Array,
        [UNIFORM_TYPES.FLOAT_VEC3]: Float32Array,
        [UNIFORM_TYPES.FLOAT_VEC4]: Float32Array,

        [UNIFORM_TYPES.INT]: Int32Array,
        [UNIFORM_TYPES.INT_VEC2]: Int32Array,
        [UNIFORM_TYPES.INT_VEC3]: Int32Array,
        [UNIFORM_TYPES.INT_VEC4]: Int32Array,

        [UNIFORM_TYPES.BOOL]: Uint8Array,
        [UNIFORM_TYPES.BOOL_VEC2]: Uint8Array,
        [UNIFORM_TYPES.BOOL_VEC3]: Uint8Array,
        [UNIFORM_TYPES.BOOL_VEC4]: Uint8Array,

        [UNIFORM_TYPES.FLOAT_MAT2]: Float32Array,
        [UNIFORM_TYPES.FLOAT_MAT3]: Float32Array,
        [UNIFORM_TYPES.FLOAT_MAT4]: Float32Array,

        [UNIFORM_TYPES.SAMPLER_2D]: Uint8Array,
    },

    /**
     * @public
     * @constant
     * @name TYPE_UPLOADS
     * @type {Object<Number, Function>}
     */
    TYPE_UPLOADS = {
        [UNIFORM_TYPES.FLOAT]: (gl, location, value) => gl.uniform1f(location, value[0]),
        [UNIFORM_TYPES.FLOAT_VEC2]: (gl, location, value) => gl.uniform2fv(location, value),
        [UNIFORM_TYPES.FLOAT_VEC3]: (gl, location, value) => gl.uniform3fv(location, value),
        [UNIFORM_TYPES.FLOAT_VEC4]: (gl, location, value) => gl.uniform4fv(location, value),

        [UNIFORM_TYPES.INT]: (gl, location, value) => gl.uniform1i(location, value[0]),
        [UNIFORM_TYPES.INT_VEC2]: (gl, location, value) => gl.uniform2iv(location, value),
        [UNIFORM_TYPES.INT_VEC3]: (gl, location, value) => gl.uniform3iv(location, value),
        [UNIFORM_TYPES.INT_VEC4]: (gl, location, value) => gl.uniform4iv(location, value),

        [UNIFORM_TYPES.BOOL]: (gl, location, value) => gl.uniform1i(location, value[0]),
        [UNIFORM_TYPES.BOOL_VEC2]: (gl, location, value) => gl.uniform2iv(location, value),
        [UNIFORM_TYPES.BOOL_VEC3]: (gl, location, value) => gl.uniform3iv(location, value),
        [UNIFORM_TYPES.BOOL_VEC4]: (gl, location, value) => gl.uniform4iv(location, value),

        [UNIFORM_TYPES.FLOAT_MAT2]: (gl, location, value) => gl.uniformMatrix2fv(location, false, value),
        [UNIFORM_TYPES.FLOAT_MAT3]: (gl, location, value) => gl.uniformMatrix3fv(location, false, value),
        [UNIFORM_TYPES.FLOAT_MAT4]: (gl, location, value) => gl.uniformMatrix4fv(location, false, value),

        [UNIFORM_TYPES.SAMPLER_2D]: (gl, location, value) => gl.uniform1i(location, value[0]),
    },

    /**
     * @public
     * @constant
     * @name TYPE_NAMES
     * @type {Object<Number, String>}
     */
    TYPE_NAMES = {
        [UNIFORM_TYPES.FLOAT]: 'FLOAT',
        [UNIFORM_TYPES.FLOAT_VEC2]: 'FLOAT_VEC2',
        [UNIFORM_TYPES.FLOAT_VEC3]: 'FLOAT_VEC3',
        [UNIFORM_TYPES.FLOAT_VEC4]: 'FLOAT_VEC4',

        [UNIFORM_TYPES.INT]: 'INT',
        [UNIFORM_TYPES.INT_VEC2]: 'INT_VEC2',
        [UNIFORM_TYPES.INT_VEC3]: 'INT_VEC3',
        [UNIFORM_TYPES.INT_VEC4]: 'INT_VEC4',

        [UNIFORM_TYPES.BOOL]: 'BOOL',
        [UNIFORM_TYPES.BOOL_VEC2]: 'BOOL_VEC2',
        [UNIFORM_TYPES.BOOL_VEC3]: 'BOOL_VEC3',
        [UNIFORM_TYPES.BOOL_VEC4]: 'BOOL_VEC4',

        [UNIFORM_TYPES.FLOAT_MAT2]: 'FLOAT_MAT2',
        [UNIFORM_TYPES.FLOAT_MAT3]: 'FLOAT_MAT3',
        [UNIFORM_TYPES.FLOAT_MAT4]: 'FLOAT_MAT4',

        [UNIFORM_TYPES.SAMPLER_2D]: 'SAMPLER_2D',
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
    },

    /**
     * @public
     * @constant
     * @name TEXTURE_FLAGS
     * @type {Float32Array}
     */
    MAT2_PATTERN = new Float32Array([
        1, 0,
        0, 1,
    ]),

    /**
     * @public
     * @constant
     * @name TEXTURE_FLAGS
     * @type {Float32Array}
     */
    MAT3_PATTERN = new Float32Array([
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
    ]),

    /**
     * @public
     * @constant
     * @name TEXTURE_FLAGS
     * @type {Float32Array}
     */
    MAT4_PATTERN = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    ]);
