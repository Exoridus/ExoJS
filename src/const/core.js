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
