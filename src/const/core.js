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
     * @constant
     * @type {Audio}
     */
    AUDIO_ELEMENT = document.createElement('audio'),

    /**
     * @public
     * @constant
     * @type {HTMLCanvasElement}
     */
    CANVAS_ELEMENT = document.createElement('canvas'),

    /**
     * @public
     * @constant
     * @type {AudioContext}
     */
    AUDIO_CONTEXT = ('AudioContext' in window) ? new AudioContext() : null,

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
    ];
