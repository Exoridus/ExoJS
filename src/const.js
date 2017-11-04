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
     * @name SHAPE
     * @type {Object<String, Number>}
     * @property {Number} NONE
     * @property {Number} POLYGON
     * @property {Number} RECTANGLE
     * @property {Number} CIRCLE
     */
    SHAPE = {
        NONE: 0,
        POLYGON: 1,
        RECTANGLE: 2,
        CIRCLE: 3,
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
    TIME = {
        MILLISECONDS: 1,
        SECONDS: 1000,
        MINUTES: 60000,
        HOURS: 3600000,
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
     * @name INPUT_DEVICE_KEYBOARD
     * @type {Number}
     */
    INPUT_DEVICE_KEYBOARD = 0,

    /**
     * @public
     * @constant
     * @name INPUT_DEVICE_POINTER
     * @type {Number}
     */
    INPUT_DEVICE_POINTER = 1,

    /**
     * @public
     * @constant
     * @name INPUT_DEVICE_GAMEPAD
     * @type {Number}
     */
    INPUT_DEVICE_GAMEPAD = 2,

    /**
     * @public
     * @constant
     * @name INPUT_DEVICE_COUNT
     * @type {Number}
     */
    INPUT_DEVICE_COUNT = 3,

    /**
     * @public
     * @constant
     * @name INPUT_CHANNELS_HANDLER
     * @type {Number}
     */
    INPUT_CHANNELS_HANDLER = 32,

    /**
     * @public
     * @constant
     * @name INPUT_CHANNELS_DEVICE
     * @type {Number}
     */
    INPUT_CHANNELS_DEVICE = 256,

    /**
     * @public
     * @constant
     * @name INPUT_CHANNELS_GLOBAL
     * @type {Number}
     */
    INPUT_CHANNELS_GLOBAL = (INPUT_CHANNELS_DEVICE * INPUT_DEVICE_COUNT),

    /**
     * @public
     * @constant
     * @name INPUT_OFFSET_KEYBOARD
     * @type {Number}
     */
    INPUT_OFFSET_KEYBOARD = (INPUT_DEVICE_KEYBOARD * INPUT_CHANNELS_DEVICE),

    /**
     * @public
     * @constant
     * @name INPUT_OFFSET_POINTER
     * @type {Number}
     */
    INPUT_OFFSET_POINTER = (INPUT_DEVICE_POINTER * INPUT_CHANNELS_DEVICE),

    /**
     * @public
     * @constant
     * @name INPUT_OFFSET_GAMEPAD
     * @type {Number}
     */
    INPUT_OFFSET_GAMEPAD = (INPUT_DEVICE_GAMEPAD * INPUT_CHANNELS_DEVICE),

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
    KEYBOARD = {
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
        Quotes: INPUT_OFFSET_KEYBOARD + 222,
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
    POINTER = {
        MouseLeft: INPUT_OFFSET_POINTER,
        MouseMiddle: INPUT_OFFSET_POINTER + 1,
        MouseRight: INPUT_OFFSET_POINTER + 2,
        MouseBack: INPUT_OFFSET_POINTER + 3,
        MouseForward: INPUT_OFFSET_POINTER + 4,
        MouseMove: INPUT_OFFSET_POINTER + 5,
        MouseScroll: INPUT_OFFSET_POINTER + 6,
        PenContact: INPUT_OFFSET_POINTER + 7,
        PenBarrel: INPUT_OFFSET_POINTER + 8,
        PenEraser: INPUT_OFFSET_POINTER + 9,
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
    GAMEPAD = {
        FaceBottom: INPUT_OFFSET_GAMEPAD,
        FaceLeft: INPUT_OFFSET_GAMEPAD + 1,
        FaceRight: INPUT_OFFSET_GAMEPAD + 2,
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
        RightStickDown: INPUT_OFFSET_GAMEPAD + 24,
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
     * @typedef {Object} BlendMode
     * @property {Number} sFactor
     * @property {Number} dFactor
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
    BLEND_MODE = {
        NORMAL: {
            sFactor: 0x0001,
            dFactor: 0x0303,
        },
        ADD: {
            sFactor: 0x0001,
            dFactor: 0x0304,
        },
        MULTIPLY: {
            sFactor: 0x0306,
            dFactor: 0x0303,
        },
        SCREEN: {
            sFactor: 0x0001,
            dFactor: 0x0301,
        },
    },

    /**
     * @public
     * @constant
     * @name DATABASE_TYPES
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
        'string',
        'json',
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
    NEWLINE = /(?:\r\n|\r|\n)/,

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
    FILE_TYPES = [{
        mimeType: 'image/x-icon',
        pattern: [0x00, 0x00, 0x01, 0x00],
        mask: [0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'image/x-icon',
        pattern: [0x00, 0x00, 0x02, 0x00],
        mask: [0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'image/bmp',
        pattern: [0x42, 0x4D],
        mask: [0xFF, 0xFF],
    }, {
        mimeType: 'image/gif',
        pattern: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'image/gif',
        pattern: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'image/webp',
        pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'image/png',
        pattern: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'image/jpeg',
        pattern: [0xFF, 0xD8, 0xFF],
        mask: [0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'audio/basic',
        pattern: [0x2E, 0x73, 0x6E, 0x64],
        mask: [0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'audio/mpeg',
        pattern: [0x49, 0x44, 0x33],
        mask: [0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'audio/wave',
        pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'audio/midi',
        pattern: [0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'audio/aiff',
        pattern: [0x46, 0x4F, 0x52, 0x4D, 0x00, 0x00, 0x00, 0x00, 0x41, 0x49, 0x46, 0x46],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'video/avi',
        pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF],
    }, {
        mimeType: 'application/ogg',
        pattern: [0x4F, 0x67, 0x67, 0x53, 0x00],
        mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    }];
