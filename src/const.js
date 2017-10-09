/**
 * @typedef {Object} FileType
 * @property {String} mimeType
 * @property {Number[]} pattern
 * @property {Number[]} mask
 */

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
     * @name CHANNEL_OFFSET
     * @type {Object<String, Number>}
     * @property {Number} KEYBOARD
     * @property {Number} MOUSE
     * @property {Number} GAMEPAD
     * @property {Number} POINTER
     */
    CHANNEL_OFFSET = {
        KEYBOARD: (INPUT_DEVICE.KEYBOARD * CHANNEL_LENGTH.DEVICE),
        MOUSE: (INPUT_DEVICE.MOUSE * CHANNEL_LENGTH.DEVICE),
        GAMEPAD: (INPUT_DEVICE.GAMEPAD * CHANNEL_LENGTH.DEVICE),
        POINTER: (INPUT_DEVICE.POINTER * CHANNEL_LENGTH.DEVICE),
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
     * @property {Number} NORMAL
     * @property {Number} ADD
     * @property {Number} MULTIPLY
     * @property {Number} SCREEN
     */
    BLEND_MODE = {
        SOURCE_OVER: 0,
        ADD: 1,
        MULTIPLY: 2,
        SCREEN: 3,
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
    }],

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
        FaceButtonBottom: CHANNEL_OFFSET.GAMEPAD + 0,
        FaceButtonLeft: CHANNEL_OFFSET.GAMEPAD + 1,
        FaceButtonRight: CHANNEL_OFFSET.GAMEPAD + 2,
        FaceButtonTop: CHANNEL_OFFSET.GAMEPAD + 3,
        LeftTriggerBottom: CHANNEL_OFFSET.GAMEPAD + 4,
        RightTriggerBottom: CHANNEL_OFFSET.GAMEPAD + 5,
        LeftTriggerTop: CHANNEL_OFFSET.GAMEPAD + 6,
        RightTriggerTop: CHANNEL_OFFSET.GAMEPAD + 7,
        Select: CHANNEL_OFFSET.GAMEPAD + 8,
        Start: CHANNEL_OFFSET.GAMEPAD + 9,
        LeftStickButton: CHANNEL_OFFSET.GAMEPAD + 10,
        RightStickButton: CHANNEL_OFFSET.GAMEPAD + 11,
        DPadUp: CHANNEL_OFFSET.GAMEPAD + 12,
        DPadDown: CHANNEL_OFFSET.GAMEPAD + 13,
        DPadLeft: CHANNEL_OFFSET.GAMEPAD + 14,
        DPadRight: CHANNEL_OFFSET.GAMEPAD + 15,
        Special: CHANNEL_OFFSET.GAMEPAD + 16,
        LeftStickLeft: CHANNEL_OFFSET.GAMEPAD + 17,
        LeftStickRight: CHANNEL_OFFSET.GAMEPAD + 18,
        LeftStickUp: CHANNEL_OFFSET.GAMEPAD + 19,
        LeftStickDown: CHANNEL_OFFSET.GAMEPAD + 20,
        RightStickLeft: CHANNEL_OFFSET.GAMEPAD + 21,
        RightStickRight: CHANNEL_OFFSET.GAMEPAD + 22,
        RightStickUp: CHANNEL_OFFSET.GAMEPAD + 23,
        RightStickDown: CHANNEL_OFFSET.GAMEPAD + 24,
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
        LeftButton: CHANNEL_OFFSET.MOUSE + 0,
        MiddleButton: CHANNEL_OFFSET.MOUSE + 1,
        RightButton: CHANNEL_OFFSET.MOUSE + 2,
        BackButton: CHANNEL_OFFSET.MOUSE + 3,
        ForwardButton: CHANNEL_OFFSET.MOUSE + 4,
        Move: CHANNEL_OFFSET.MOUSE + 5,
        MoveLeft: CHANNEL_OFFSET.MOUSE + 6,
        MoveRight: CHANNEL_OFFSET.MOUSE + 7,
        MoveUp: CHANNEL_OFFSET.MOUSE + 8,
        MoveDown: CHANNEL_OFFSET.MOUSE + 9,
        Scroll: CHANNEL_OFFSET.MOUSE + 10,
        ScrollLeft: CHANNEL_OFFSET.MOUSE + 11,
        ScrollRight: CHANNEL_OFFSET.MOUSE + 12,
        ScrollUp: CHANNEL_OFFSET.MOUSE + 13,
        ScrollDown: CHANNEL_OFFSET.MOUSE + 14,
        EnterWindow: CHANNEL_OFFSET.MOUSE + 15,
        LeaveWindow: CHANNEL_OFFSET.MOUSE + 16,
    };
