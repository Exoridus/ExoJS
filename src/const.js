import support from './support';

export const

    /**
     * @public
     * @constant
     * @type {String}
     */
    VERSION = __VERSION__,

    /**
     * @public
     * @constant
     * @type {Window}
     */
    GLOBAL = (global.parent || global),

    /**
     * @public
     * @constant
     * @type {Date|Performance}
     */
    TIMING = (typeof performance === 'undefined' ? Date : performance),

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
    RAD_PER_DEG = Math.PI / 180,

    /**
     * @public
     * @static
     * @readonly
     * @constant
     * @type {Number}
     */
    DEG_PER_RAD = 180 / Math.PI,

    /**
     * @public
     * @constant
     * @type {Object}
     */
    VORONOI_REGION = {
        LEFT: -1,
        MIDDLE: 0,
        RIGHT: 1,
    },

    /**
     * @public
     * @constant
     * @type {Audio}
     */
    AUDIO_ELEMENT = document.createElement('audio'),

    /**
     * @public
     * @constant
     * @type {?AudioContext}
     */
    AUDIO_CONTEXT = support.webAudio ? new AudioContext() : null,

    /**
     * @public
     * @constant
     * @type {HTMLCanvasElement}
     */
    CANVAS_ELEMENT = document.createElement('canvas'),

    /**
     * @public
     * @constant
     * @type {CanvasRenderingContext2D}
     */
    CANVAS_CONTEXT = CANVAS_ELEMENT.getContext('2d'),

    /**
     * @public
     * @constant
     * @type {RegExp}
     */
    CODEC_NOT_SUPPORTED = /^no$/,

    /**
     * @public
     * @constant
     * @type {ArrayBuffer}
     */
    EMPTY_ARRAY_BUFFER = new ArrayBuffer(0),

    /**
     * @public
     * @constant
     * @type {Object}
     */
    APP_STATUS = {
        UNKNOWN: 0,
        LOADING: 1,
        RUNNING: 2,
        HALTING: 3,
        STOPPED: 4,
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    TIME = {
        MILLISECONDS: 1,
        SECONDS: 1000,
        MINUTES: 60000,
        HOURS: 3600000,
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    FLAGS = {
        NONE:           0x00,
        TRANSLATION:    0x01,
        ROTATION:       0x02,
        SCALING:        0x04,
        ORIGIN:         0x08,
        TRANSFORM:      0x0F,
        TRANSFORM_INV:  0x10,
        BOUNDING_BOX:   0x20,
        TEXTURE_COORDS: 0x40,
        VERTEX_TINT:    0x80,
    },

    /**
     * @public
     * @constant
     * @type {String[]}
     */
    DATABASE_TYPES = [
        'arrayBuffer',
        'blob',
        'font',
        'media',
        'audio',
        'video',
        'music',
        'sound',
        'image',
        'texture',
        'text',
        'json',
        'svg',
    ],

    /**
     * @public
     * @constant
     * @type {Object}
     */
    BUFFER_TYPES = {
        ARRAY_BUFFER: 0x8892,
        INDEX_BUFFER: 0x8893,
        UNIFORM_BUFFER: 0x8A11,
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    BUFFER_MODES = {
        STATIC_DRAW: 0x88E4,
        STREAM_DRAW: 0x88E0,
        DYNAMIC_DRAW: 0x88E8,
    },

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
    TYPES = {
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
     * @type {Object}
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
        SAMPLER_CUBE: 0x8B60,
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    UNIFORM_SIZES = {
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
     * @type {Object}
     */
    UNIFORM_VALUES = {
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

        [UNIFORM_TYPES.SAMPLER_2D]: Float32Array,
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    UNIFORM_UPLOADS = {
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

        [UNIFORM_TYPES.SAMPLER_2D]: (gl, location, value) => gl.uniform1f(location, value[0]),
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
     * @type {Object}
     */
    CHANNEL_OFFSET = {
        KEYBOARD: 0x000,
        POINTERS: 0x100,
        GAMEPADS: 0x200,
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    CHANNEL_RANGE = {
        GAMEPAD:    0x020,
        CATEGORY:   0x100,
        GLOBAL:     0x300,
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    KEYBOARD = {
        Backspace: CHANNEL_OFFSET.KEYBOARD + 8,
        Tab: CHANNEL_OFFSET.KEYBOARD + 9,
        Clear: CHANNEL_OFFSET.KEYBOARD + 12,
        Enter: CHANNEL_OFFSET.KEYBOARD + 13,
        Shift: CHANNEL_OFFSET.KEYBOARD + 16,
        Control: CHANNEL_OFFSET.KEYBOARD + 17,
        Alt: CHANNEL_OFFSET.KEYBOARD + 18,
        Pause: CHANNEL_OFFSET.KEYBOARD + 19,
        CapsLock: CHANNEL_OFFSET.KEYBOARD + 20,
        Escape: CHANNEL_OFFSET.KEYBOARD + 27,
        Space: CHANNEL_OFFSET.KEYBOARD + 32,
        PageUp: CHANNEL_OFFSET.KEYBOARD + 33,
        PageDown: CHANNEL_OFFSET.KEYBOARD + 34,
        End: CHANNEL_OFFSET.KEYBOARD + 35,
        Home: CHANNEL_OFFSET.KEYBOARD + 36,
        Left: CHANNEL_OFFSET.KEYBOARD + 37,
        Up: CHANNEL_OFFSET.KEYBOARD + 38,
        Right: CHANNEL_OFFSET.KEYBOARD + 39,
        Down: CHANNEL_OFFSET.KEYBOARD + 40,
        Insert: CHANNEL_OFFSET.KEYBOARD + 45,
        Delete: CHANNEL_OFFSET.KEYBOARD + 46,
        Help: CHANNEL_OFFSET.KEYBOARD + 47,
        Zero: CHANNEL_OFFSET.KEYBOARD + 48,
        One: CHANNEL_OFFSET.KEYBOARD + 49,
        Two: CHANNEL_OFFSET.KEYBOARD + 50,
        Three: CHANNEL_OFFSET.KEYBOARD + 51,
        Four: CHANNEL_OFFSET.KEYBOARD + 52,
        Five: CHANNEL_OFFSET.KEYBOARD + 53,
        Six: CHANNEL_OFFSET.KEYBOARD + 54,
        Seven: CHANNEL_OFFSET.KEYBOARD + 55,
        Eight: CHANNEL_OFFSET.KEYBOARD + 56,
        Nine: CHANNEL_OFFSET.KEYBOARD + 57,
        A: CHANNEL_OFFSET.KEYBOARD + 65,
        B: CHANNEL_OFFSET.KEYBOARD + 66,
        C: CHANNEL_OFFSET.KEYBOARD + 67,
        D: CHANNEL_OFFSET.KEYBOARD + 68,
        E: CHANNEL_OFFSET.KEYBOARD + 69,
        F: CHANNEL_OFFSET.KEYBOARD + 70,
        G: CHANNEL_OFFSET.KEYBOARD + 71,
        H: CHANNEL_OFFSET.KEYBOARD + 72,
        I: CHANNEL_OFFSET.KEYBOARD + 73,
        J: CHANNEL_OFFSET.KEYBOARD + 74,
        K: CHANNEL_OFFSET.KEYBOARD + 75,
        L: CHANNEL_OFFSET.KEYBOARD + 76,
        M: CHANNEL_OFFSET.KEYBOARD + 77,
        N: CHANNEL_OFFSET.KEYBOARD + 78,
        O: CHANNEL_OFFSET.KEYBOARD + 79,
        P: CHANNEL_OFFSET.KEYBOARD + 80,
        Q: CHANNEL_OFFSET.KEYBOARD + 81,
        R: CHANNEL_OFFSET.KEYBOARD + 82,
        S: CHANNEL_OFFSET.KEYBOARD + 83,
        T: CHANNEL_OFFSET.KEYBOARD + 84,
        U: CHANNEL_OFFSET.KEYBOARD + 85,
        V: CHANNEL_OFFSET.KEYBOARD + 86,
        W: CHANNEL_OFFSET.KEYBOARD + 87,
        X: CHANNEL_OFFSET.KEYBOARD + 88,
        Y: CHANNEL_OFFSET.KEYBOARD + 89,
        Z: CHANNEL_OFFSET.KEYBOARD + 90,
        NumPad0: CHANNEL_OFFSET.KEYBOARD + 96,
        NumPad1: CHANNEL_OFFSET.KEYBOARD + 97,
        NumPad2: CHANNEL_OFFSET.KEYBOARD + 98,
        NumPad3: CHANNEL_OFFSET.KEYBOARD + 99,
        NumPad4: CHANNEL_OFFSET.KEYBOARD + 100,
        NumPad5: CHANNEL_OFFSET.KEYBOARD + 101,
        NumPad6: CHANNEL_OFFSET.KEYBOARD + 102,
        NumPad7: CHANNEL_OFFSET.KEYBOARD + 103,
        NumPad8: CHANNEL_OFFSET.KEYBOARD + 104,
        NumPad9: CHANNEL_OFFSET.KEYBOARD + 105,
        NumPadMultiply: CHANNEL_OFFSET.KEYBOARD + 106,
        NumPadAdd: CHANNEL_OFFSET.KEYBOARD + 107,
        NumPadEnter: CHANNEL_OFFSET.KEYBOARD + 108,
        NumPadSubtract: CHANNEL_OFFSET.KEYBOARD + 109,
        NumPadDecimal: CHANNEL_OFFSET.KEYBOARD + 110,
        NumPadDivide: CHANNEL_OFFSET.KEYBOARD + 111,
        F1: CHANNEL_OFFSET.KEYBOARD + 112,
        F2: CHANNEL_OFFSET.KEYBOARD + 113,
        F3: CHANNEL_OFFSET.KEYBOARD + 114,
        F4: CHANNEL_OFFSET.KEYBOARD + 115,
        F5: CHANNEL_OFFSET.KEYBOARD + 116,
        F6: CHANNEL_OFFSET.KEYBOARD + 117,
        F7: CHANNEL_OFFSET.KEYBOARD + 118,
        F8: CHANNEL_OFFSET.KEYBOARD + 119,
        F9: CHANNEL_OFFSET.KEYBOARD + 120,
        F10: CHANNEL_OFFSET.KEYBOARD + 121,
        F11: CHANNEL_OFFSET.KEYBOARD + 122,
        F12: CHANNEL_OFFSET.KEYBOARD + 123,
        NumLock: CHANNEL_OFFSET.KEYBOARD + 144,
        ScrollLock: CHANNEL_OFFSET.KEYBOARD + 145,
        Colon: CHANNEL_OFFSET.KEYBOARD + 186,
        Equals: CHANNEL_OFFSET.KEYBOARD + 187,
        Comma: CHANNEL_OFFSET.KEYBOARD + 188,
        Dash: CHANNEL_OFFSET.KEYBOARD + 189,
        Period: CHANNEL_OFFSET.KEYBOARD + 190,
        QuestionMark: CHANNEL_OFFSET.KEYBOARD + 191,
        Tilde: CHANNEL_OFFSET.KEYBOARD + 192,
        OpenBracket: CHANNEL_OFFSET.KEYBOARD + 219,
        BackwardSlash: CHANNEL_OFFSET.KEYBOARD + 220,
        ClosedBracket: CHANNEL_OFFSET.KEYBOARD + 221,
        Quotes: CHANNEL_OFFSET.KEYBOARD + 222,
    },

    /**
     * @public
     * @constant
     * @type {Object}
     */
    GAMEPAD = {
        FaceBottom: CHANNEL_OFFSET.GAMEPADS + 0,
        FaceLeft: CHANNEL_OFFSET.GAMEPADS + 1,
        FaceRight: CHANNEL_OFFSET.GAMEPADS + 2,
        FaceTop: CHANNEL_OFFSET.GAMEPADS + 3,
        ShoulderLeftBottom: CHANNEL_OFFSET.GAMEPADS + 4,
        ShoulderRightBottom: CHANNEL_OFFSET.GAMEPADS + 5,
        ShoulderLeftTop: CHANNEL_OFFSET.GAMEPADS + 6,
        ShoulderRightTop: CHANNEL_OFFSET.GAMEPADS + 7,
        Select: CHANNEL_OFFSET.GAMEPADS + 8,
        Start: CHANNEL_OFFSET.GAMEPADS + 9,
        LeftStick: CHANNEL_OFFSET.GAMEPADS + 10,
        RightStick: CHANNEL_OFFSET.GAMEPADS + 11,
        DPadUp: CHANNEL_OFFSET.GAMEPADS + 12,
        DPadDown: CHANNEL_OFFSET.GAMEPADS + 13,
        DPadLeft: CHANNEL_OFFSET.GAMEPADS + 14,
        DPadRight: CHANNEL_OFFSET.GAMEPADS + 15,
        Home: CHANNEL_OFFSET.GAMEPADS + 16,
        LeftStickLeft: CHANNEL_OFFSET.GAMEPADS + 17,
        LeftStickRight: CHANNEL_OFFSET.GAMEPADS + 18,
        LeftStickUp: CHANNEL_OFFSET.GAMEPADS + 19,
        LeftStickDown: CHANNEL_OFFSET.GAMEPADS + 20,
        RightStickLeft: CHANNEL_OFFSET.GAMEPADS + 21,
        RightStickRight: CHANNEL_OFFSET.GAMEPADS + 22,
        RightStickUp: CHANNEL_OFFSET.GAMEPADS + 23,
        RightStickDown: CHANNEL_OFFSET.GAMEPADS + 24,
    };
