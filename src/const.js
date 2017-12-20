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
     * @name VORONOI_REGION
     * @type {Object<String, Number>}
     * @property {Number} LEFT
     * @property {Number} MIDDLE
     * @property {Number} RIGHT
     */
    VORONOI_REGION = {
        LEFT: -1,
        MIDDLE: 0,
        RIGHT: 1,
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
     * @name TEXTURE_FLAGS
     * @type {Object<String, Number>}
     * @property {Number} NONE
     * @property {Number} SCALE_MODE
     * @property {Number} WRAP_MODE
     * @property {Number} PREMULTIPLY_ALPHA
     * @property {Number} SOURCE
     * @property {Number} SIZE
     * @property {Number} FLIP_Y
     */
    TEXTURE_FLAGS = {
        NONE: 0,
        SCALE_MODE: 1 << 0,
        WRAP_MODE: 1 << 1,
        PREMULTIPLY_ALPHA: 1 << 2,
        SOURCE: 1 << 3,
        SIZE: 1 << 4,
    },

    /**
     * @public
     * @constant
     * @name SCALE_MODES
     * @type {Object<String, Number>}
     * @property {Number} LINEAR
     * @property {Number} NEAREST
     */
    SCALE_MODES = {
        LINEAR: 0,
        NEAREST: 1,
    },

    /**
     * @public
     * @constant
     * @name WRAP_MODES
     * @type {Object<String, Number>}
     * @property {Number} CLAMP_TO_EDGE
     * @property {Number} REPEAT
     * @property {Number} MIRRORED_REPEAT
     */
    WRAP_MODES = {
        CLAMP_TO_EDGE: 0,
        REPEAT: 1,
        MIRRORED_REPEAT: 2,
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
     * @name CHANNEL_OFFSET
     * @type {Object<String, Number>}
     * @property {Number} KEYBOARD
     * @property {Number} POINTERS
     * @property {Number} GAMEPADS
     */
    CHANNEL_OFFSET = {
        KEYBOARD: 0x000,
        POINTERS: 0x100,
        GAMEPADS: 0x200,
    },

    /**
     * @public
     * @constant
     * @name CHANNEL_RANGE
     * @type {Object<String, Number>}
     * @property {Number} GAMEPAD
     * @property {Number} DEVICE
     * @property {Number} CATEGORY
     * @property {Number} OVERALL
     */
    CHANNEL_RANGE = {
        GAMEPAD: 0x020,
        CATEGORY: 0x100,
        OVERALL: 0x300,
    },

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
     * @name TYPE_NAMES
     * @type {Object<Number, String>}
     */
    TYPE_NAMES = {
        [UNIFORM_TYPE.INT]: 'INT',
        [UNIFORM_TYPE.FLOAT]: 'FLOAT',
        [UNIFORM_TYPE.FLOAT_VEC2]: 'FLOAT_VEC2',
        [UNIFORM_TYPE.FLOAT_VEC3]: 'FLOAT_VEC3',
        [UNIFORM_TYPE.FLOAT_VEC4]: 'FLOAT_VEC4',
        [UNIFORM_TYPE.INT_VEC2]: 'INT_VEC2',
        [UNIFORM_TYPE.INT_VEC3]: 'INT_VEC3',
        [UNIFORM_TYPE.INT_VEC4]: 'INT_VEC4',
        [UNIFORM_TYPE.BOOL]: 'BOOL',
        [UNIFORM_TYPE.BOOL_VEC2]: 'BOOL_VEC2',
        [UNIFORM_TYPE.BOOL_VEC3]: 'BOOL_VEC3',
        [UNIFORM_TYPE.BOOL_VEC4]: 'BOOL_VEC4',
        [UNIFORM_TYPE.FLOAT_MAT2]: 'FLOAT_MAT2',
        [UNIFORM_TYPE.FLOAT_MAT3]: 'FLOAT_MAT3',
        [UNIFORM_TYPE.FLOAT_MAT4]: 'FLOAT_MAT4',
        [UNIFORM_TYPE.SAMPLER_2D]: 'SAMPLER_2D',
    },

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
        'text',
        'json',
    ],

    /**
     * @public
     * @constant
     * @name EMPTY_ARRAY_BUFFER
     * @type {ArrayBuffer}
     */
    EMPTY_ARRAY_BUFFER = new ArrayBuffer(0);
