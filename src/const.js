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
     * @name RANGE_NODE
     * @type {Number}
     */
    RANGE_NODE = 32,

    /**
     * @public
     * @constant
     * @name RANGE_DEVICE
     * @type {Number}
     */
    RANGE_DEVICE = 256,

    /**
     * @public
     * @constant
     * @name RANGE_GLOBAL
     * @type {Number}
     */
    RANGE_GLOBAL = 1024,

    /**
     * @public
     * @constant
     * @name OFFSET_KEYBOARD
     * @type {Number}
     */
    OFFSET_KEYBOARD = 0,

    /**
     * @public
     * @constant
     * @name OFFSET_MOUSE
     * @type {Number}
     */
    OFFSET_MOUSE = RANGE_DEVICE,

    /**
     * @public
     * @constant
     * @name OFFSET_GAMEPAD
     * @type {Number}
     */
    OFFSET_GAMEPAD = RANGE_DEVICE * 2,

    /**
     * @public
     * @constant
     * @name OFFSET_POINTER
     * @type {Number}
     */
    OFFSET_POINTER = RANGE_DEVICE * 3,

    /**
     * @public
     * @constant
     * @name KEYS
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
    KEYS = {
        Backspace: OFFSET_KEYBOARD + 8,
        Tab: OFFSET_KEYBOARD + 9,
        Clear: OFFSET_KEYBOARD + 12,
        Enter: OFFSET_KEYBOARD + 13,
        Shift: OFFSET_KEYBOARD + 16,
        Control: OFFSET_KEYBOARD + 17,
        Alt: OFFSET_KEYBOARD + 18,
        Pause: OFFSET_KEYBOARD + 19,
        CapsLock: OFFSET_KEYBOARD + 20,
        Escape: OFFSET_KEYBOARD + 27,
        Space: OFFSET_KEYBOARD + 32,
        PageUp: OFFSET_KEYBOARD + 33,
        PageDown: OFFSET_KEYBOARD + 34,
        End: OFFSET_KEYBOARD + 35,
        Home: OFFSET_KEYBOARD + 36,
        Left: OFFSET_KEYBOARD + 37,
        Up: OFFSET_KEYBOARD + 38,
        Right: OFFSET_KEYBOARD + 39,
        Down: OFFSET_KEYBOARD + 40,
        Insert: OFFSET_KEYBOARD + 45,
        Delete: OFFSET_KEYBOARD + 46,
        Help: OFFSET_KEYBOARD + 47,
        Zero: OFFSET_KEYBOARD + 48,
        One: OFFSET_KEYBOARD + 49,
        Two: OFFSET_KEYBOARD + 50,
        Three: OFFSET_KEYBOARD + 51,
        Four: OFFSET_KEYBOARD + 52,
        Five: OFFSET_KEYBOARD + 53,
        Six: OFFSET_KEYBOARD + 54,
        Seven: OFFSET_KEYBOARD + 55,
        Eight: OFFSET_KEYBOARD + 56,
        Nine: OFFSET_KEYBOARD + 57,
        A: OFFSET_KEYBOARD + 65,
        B: OFFSET_KEYBOARD + 66,
        C: OFFSET_KEYBOARD + 67,
        D: OFFSET_KEYBOARD + 68,
        E: OFFSET_KEYBOARD + 69,
        F: OFFSET_KEYBOARD + 70,
        G: OFFSET_KEYBOARD + 71,
        H: OFFSET_KEYBOARD + 72,
        I: OFFSET_KEYBOARD + 73,
        J: OFFSET_KEYBOARD + 74,
        K: OFFSET_KEYBOARD + 75,
        L: OFFSET_KEYBOARD + 76,
        M: OFFSET_KEYBOARD + 77,
        N: OFFSET_KEYBOARD + 78,
        O: OFFSET_KEYBOARD + 79,
        P: OFFSET_KEYBOARD + 80,
        Q: OFFSET_KEYBOARD + 81,
        R: OFFSET_KEYBOARD + 82,
        S: OFFSET_KEYBOARD + 83,
        T: OFFSET_KEYBOARD + 84,
        U: OFFSET_KEYBOARD + 85,
        V: OFFSET_KEYBOARD + 86,
        W: OFFSET_KEYBOARD + 87,
        X: OFFSET_KEYBOARD + 88,
        Y: OFFSET_KEYBOARD + 89,
        Z: OFFSET_KEYBOARD + 90,
        NumPad0: OFFSET_KEYBOARD + 96,
        NumPad1: OFFSET_KEYBOARD + 97,
        NumPad2: OFFSET_KEYBOARD + 98,
        NumPad3: OFFSET_KEYBOARD + 99,
        NumPad4: OFFSET_KEYBOARD + 100,
        NumPad5: OFFSET_KEYBOARD + 101,
        NumPad6: OFFSET_KEYBOARD + 102,
        NumPad7: OFFSET_KEYBOARD + 103,
        NumPad8: OFFSET_KEYBOARD + 104,
        NumPad9: OFFSET_KEYBOARD + 105,
        NumPadMultiply: OFFSET_KEYBOARD + 106,
        NumPadAdd: OFFSET_KEYBOARD + 107,
        NumPadEnter: OFFSET_KEYBOARD + 108,
        NumPadSubtract: OFFSET_KEYBOARD + 109,
        NumPadDecimal: OFFSET_KEYBOARD + 110,
        NumPadDivide: OFFSET_KEYBOARD + 111,
        F1: OFFSET_KEYBOARD + 112,
        F2: OFFSET_KEYBOARD + 113,
        F3: OFFSET_KEYBOARD + 114,
        F4: OFFSET_KEYBOARD + 115,
        F5: OFFSET_KEYBOARD + 116,
        F6: OFFSET_KEYBOARD + 117,
        F7: OFFSET_KEYBOARD + 118,
        F8: OFFSET_KEYBOARD + 119,
        F9: OFFSET_KEYBOARD + 120,
        F10: OFFSET_KEYBOARD + 121,
        F11: OFFSET_KEYBOARD + 122,
        F12: OFFSET_KEYBOARD + 123,
        NumLock: OFFSET_KEYBOARD + 144,
        ScrollLock: OFFSET_KEYBOARD + 145,
        Colon: OFFSET_KEYBOARD + 186,
        Equals: OFFSET_KEYBOARD + 187,
        Comma: OFFSET_KEYBOARD + 188,
        Dash: OFFSET_KEYBOARD + 189,
        Period: OFFSET_KEYBOARD + 190,
        QuestionMark: OFFSET_KEYBOARD + 191,
        Tilde: OFFSET_KEYBOARD + 192,
        OpenBracket: OFFSET_KEYBOARD + 219,
        BackwardSlash: OFFSET_KEYBOARD + 220,
        ClosedBracket: OFFSET_KEYBOARD + 221,
        Quotes: OFFSET_KEYBOARD + 222,
    },

    /**
     * @public
     * @constant
     * @name GAMEPAD
     * @type {Object<String, Number>}
     * @property {Number} FaceButtonBottom
     * @property {Number} FaceButtonLeft
     * @property {Number} FaceButtonRight
     * @property {Number} FaceButtonTop
     * @property {Number} LeftTriggerBottom
     * @property {Number} RightTriggerBottom
     * @property {Number} LeftTriggerTop
     * @property {Number} RightTriggerTop
     * @property {Number} Select
     * @property {Number} Start
     * @property {Number} LeftStickButton
     * @property {Number} RightStickButton
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
    GAMEPAD = {
        FaceButtonBottom: OFFSET_GAMEPAD + 0,
        FaceButtonLeft: OFFSET_GAMEPAD + 1,
        FaceButtonRight: OFFSET_GAMEPAD + 2,
        FaceButtonTop: OFFSET_GAMEPAD + 3,
        LeftTriggerBottom: OFFSET_GAMEPAD + 4,
        RightTriggerBottom: OFFSET_GAMEPAD + 5,
        LeftTriggerTop: OFFSET_GAMEPAD + 6,
        RightTriggerTop: OFFSET_GAMEPAD + 7,
        Select: OFFSET_GAMEPAD + 8,
        Start: OFFSET_GAMEPAD + 9,
        LeftStickButton: OFFSET_GAMEPAD + 10,
        RightStickButton: OFFSET_GAMEPAD + 11,
        DPadUp: OFFSET_GAMEPAD + 12,
        DPadDown: OFFSET_GAMEPAD + 13,
        DPadLeft: OFFSET_GAMEPAD + 14,
        DPadRight: OFFSET_GAMEPAD + 15,
        Special: OFFSET_GAMEPAD + 16,
        LeftStickLeft: OFFSET_GAMEPAD + 17,
        LeftStickRight: OFFSET_GAMEPAD + 18,
        LeftStickUp: OFFSET_GAMEPAD + 19,
        LeftStickDown: OFFSET_GAMEPAD + 20,
        RightStickLeft: OFFSET_GAMEPAD + 21,
        RightStickRight: OFFSET_GAMEPAD + 22,
        RightStickUp: OFFSET_GAMEPAD + 23,
        RightStickDown: OFFSET_GAMEPAD + 24,
    },

    /**
     * @public
     * @constant
     * @name MOUSE
     * @type {Object<String, Number>}
     * @property {Number} LeftButton
     * @property {Number} MiddleButton
     * @property {Number} RightButton
     * @property {Number} BackButton
     * @property {Number} ForwardButton
     * @property {Number} Move
     * @property {Number} MoveLeft
     * @property {Number} MoveRight
     * @property {Number} MoveUp
     * @property {Number} MoveDown
     * @property {Number} Scroll
     * @property {Number} ScrollLeft
     * @property {Number} ScrollRight
     * @property {Number} ScrollUp
     * @property {Number} ScrollDown
     * @property {Number} EnterWindow
     * @property {Number} LeaveWindow
     */
    MOUSE = {
        LeftButton: OFFSET_MOUSE + 0,
        MiddleButton: OFFSET_MOUSE + 1,
        RightButton: OFFSET_MOUSE + 2,
        BackButton: OFFSET_MOUSE + 3,
        ForwardButton: OFFSET_MOUSE + 4,
        Move: OFFSET_MOUSE + 5,
        MoveLeft: OFFSET_MOUSE + 6,
        MoveRight: OFFSET_MOUSE + 7,
        MoveUp: OFFSET_MOUSE + 8,
        MoveDown: OFFSET_MOUSE + 9,
        Scroll: OFFSET_MOUSE + 10,
        ScrollLeft: OFFSET_MOUSE + 11,
        ScrollRight: OFFSET_MOUSE + 12,
        ScrollUp: OFFSET_MOUSE + 13,
        ScrollDown: OFFSET_MOUSE + 14,
        EnterWindow: OFFSET_MOUSE + 15,
        LeaveWindow: OFFSET_MOUSE + 16,
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
     * @name BLEND_MODE
     * @type {Object<String, Object>}
     * @property {Object<String, Number>} NORMAL
     * @property {Object<String, Number>} ADD
     * @property {Object<String, Number>} MULTIPLY
     * @property {Object<String, Number>} SCREEN
     */
    BLEND_MODE = {
        NORMAL: {
            src: 0x0001,
            dst: 0x0303,
        },
        ADD: {
            src: 0x0302,
            dst: 0x0304,
        },
        MULTIPLY: {
            src: 0x0304,
            dst: 0x0303,
        },
        SCREEN: {
            src: 0x0302,
            dst: 0x0001,
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
