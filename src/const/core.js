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
     * @type {Window}
     */
    GLOBAL = (global.parent || global),

    /**
     * @inner
     * @constant
     * @type {Audio}
     */
    AUDIO_ELEMENT = document.createElement('audio'),

    /**
     * @public
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
     * @type {CanvasRenderingContext2D}
     */
    CANVAS_CONTEXT = CANVAS_ELEMENT.getContext('2d'),

    /**
     * @public
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