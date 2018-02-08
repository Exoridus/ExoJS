export const

    /**
     * @public
     * @constant
     * @type {Object}
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
     * @type {Object}
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
     * @type {Object}
     */
    WRAP_MODES = {
        REPEAT: 0x2901,
        CLAMP_TO_EDGE: 0x812F,
        MIRRORED_REPEAT: 0x8370,
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    SHADER_TYPES = {
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
     * @type {Object}
     */
    DRAW_MODES = {
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
     * @type {Object}
     */
    TYPE_SIZES = {
        [SHADER_TYPES.FLOAT]: 1,
        [SHADER_TYPES.FLOAT_VEC2]: 2,
        [SHADER_TYPES.FLOAT_VEC3]: 3,
        [SHADER_TYPES.FLOAT_VEC4]: 4,

        [SHADER_TYPES.INT]: 1,
        [SHADER_TYPES.INT_VEC2]: 2,
        [SHADER_TYPES.INT_VEC3]: 3,
        [SHADER_TYPES.INT_VEC4]: 4,

        [SHADER_TYPES.BOOL]: 1,
        [SHADER_TYPES.BOOL_VEC2]: 2,
        [SHADER_TYPES.BOOL_VEC3]: 3,
        [SHADER_TYPES.BOOL_VEC4]: 4,

        [SHADER_TYPES.FLOAT_MAT2]: 4,
        [SHADER_TYPES.FLOAT_MAT3]: 9,
        [SHADER_TYPES.FLOAT_MAT4]: 16,

        [SHADER_TYPES.SAMPLER_2D]: 1,
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    TYPE_CLASSES = {
        [SHADER_TYPES.FLOAT]: Float32Array,
        [SHADER_TYPES.FLOAT_VEC2]: Float32Array,
        [SHADER_TYPES.FLOAT_VEC3]: Float32Array,
        [SHADER_TYPES.FLOAT_VEC4]: Float32Array,

        [SHADER_TYPES.INT]: Int32Array,
        [SHADER_TYPES.INT_VEC2]: Int32Array,
        [SHADER_TYPES.INT_VEC3]: Int32Array,
        [SHADER_TYPES.INT_VEC4]: Int32Array,

        [SHADER_TYPES.BOOL]: Uint8Array,
        [SHADER_TYPES.BOOL_VEC2]: Uint8Array,
        [SHADER_TYPES.BOOL_VEC3]: Uint8Array,
        [SHADER_TYPES.BOOL_VEC4]: Uint8Array,

        [SHADER_TYPES.FLOAT_MAT2]: Float32Array,
        [SHADER_TYPES.FLOAT_MAT3]: Float32Array,
        [SHADER_TYPES.FLOAT_MAT4]: Float32Array,

        [SHADER_TYPES.SAMPLER_2D]: Uint8Array,
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    TYPE_UPLOADS = {
        [SHADER_TYPES.FLOAT]: (gl, location, value) => gl.uniform1f(location, value[0]),
        [SHADER_TYPES.FLOAT_VEC2]: (gl, location, value) => gl.uniform2fv(location, value),
        [SHADER_TYPES.FLOAT_VEC3]: (gl, location, value) => gl.uniform3fv(location, value),
        [SHADER_TYPES.FLOAT_VEC4]: (gl, location, value) => gl.uniform4fv(location, value),

        [SHADER_TYPES.INT]: (gl, location, value) => gl.uniform1i(location, value[0]),
        [SHADER_TYPES.INT_VEC2]: (gl, location, value) => gl.uniform2iv(location, value),
        [SHADER_TYPES.INT_VEC3]: (gl, location, value) => gl.uniform3iv(location, value),
        [SHADER_TYPES.INT_VEC4]: (gl, location, value) => gl.uniform4iv(location, value),

        [SHADER_TYPES.BOOL]: (gl, location, value) => gl.uniform1i(location, value[0]),
        [SHADER_TYPES.BOOL_VEC2]: (gl, location, value) => gl.uniform2iv(location, value),
        [SHADER_TYPES.BOOL_VEC3]: (gl, location, value) => gl.uniform3iv(location, value),
        [SHADER_TYPES.BOOL_VEC4]: (gl, location, value) => gl.uniform4iv(location, value),

        [SHADER_TYPES.FLOAT_MAT2]: (gl, location, value) => gl.uniformMatrix2fv(location, false, value),
        [SHADER_TYPES.FLOAT_MAT3]: (gl, location, value) => gl.uniformMatrix3fv(location, false, value),
        [SHADER_TYPES.FLOAT_MAT4]: (gl, location, value) => gl.uniformMatrix4fv(location, false, value),

        [SHADER_TYPES.SAMPLER_2D]: (gl, location, value) => gl.uniform1f(location, value[0]),
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    TYPE_NAMES = {
        [SHADER_TYPES.FLOAT]: 'FLOAT',
        [SHADER_TYPES.FLOAT_VEC2]: 'FLOAT_VEC2',
        [SHADER_TYPES.FLOAT_VEC3]: 'FLOAT_VEC3',
        [SHADER_TYPES.FLOAT_VEC4]: 'FLOAT_VEC4',

        [SHADER_TYPES.INT]: 'INT',
        [SHADER_TYPES.INT_VEC2]: 'INT_VEC2',
        [SHADER_TYPES.INT_VEC3]: 'INT_VEC3',
        [SHADER_TYPES.INT_VEC4]: 'INT_VEC4',

        [SHADER_TYPES.BOOL]: 'BOOL',
        [SHADER_TYPES.BOOL_VEC2]: 'BOOL_VEC2',
        [SHADER_TYPES.BOOL_VEC3]: 'BOOL_VEC3',
        [SHADER_TYPES.BOOL_VEC4]: 'BOOL_VEC4',

        [SHADER_TYPES.FLOAT_MAT2]: 'FLOAT_MAT2',
        [SHADER_TYPES.FLOAT_MAT3]: 'FLOAT_MAT3',
        [SHADER_TYPES.FLOAT_MAT4]: 'FLOAT_MAT4',

        [SHADER_TYPES.SAMPLER_2D]: 'SAMPLER_2D',
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    TEXTURE_FLAGS = {
        SCALE_MODE: 0x001,
        WRAP_MODE: 0x002,
        PREMULTIPLY_ALPHA: 0x004,
        SOURCE: 0x008,
        SIZE: 0x010,
    };
