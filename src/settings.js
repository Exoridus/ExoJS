import { SCALE_MODES, WRAP_MODES } from './const/rendering';
import Color from './core/Color';
import GamepadMapping from './input/GamepadMapping';

export default {

    /**
     * @static
     * @type {Object}
     * @name APP_OPTIONS
     * @property {String} resourcePath=''
     * @property {Number} width=800
     * @property {Number} height=600
     * @property {?HTMLCanvasElement} canvas=null
     * @property {?HTMLElement} canvasParent=null
     * @property {Color} clearColor=Color.Black
     * @property {?Database} database=null
     */
    APP_OPTIONS: {
        resourcePath: '',
        width: 800,
        height: 600,
        canvas: null,
        canvasParent: null,
        clearColor: Color.Black,
        database: null,
    },

    /**
     * @static
     * @type {Object}
     * @name CONTEXT_OPTIONS
     * @property {Boolean} alpha=false
     * @property {Boolean} antialias=false
     * @property {Boolean} premultipliedAlpha=false
     * @property {Boolean} preserveDrawingBuffer=false
     * @property {Boolean} stencil=false
     * @property {Boolean} depth=false
     */
    CONTEXT_OPTIONS: {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        stencil: false,
        depth: false,
    },

    /**
     * @public
     * @static
     * @type {String}
     * @default 'GET'
     */
    REQUEST_METHOD: 'GET',

    /**
     * @public
     * @static
     * @type {String}
     * @default 'cors'
     */
    REQUEST_MODE: 'cors',

    /**
     * @public
     * @static
     * @type {String}
     * @default 'default'
     */
    REQUEST_CACHE: 'default',

    /**
     * @public
     * @static
     * @type {Number}
     * @default SCALE_MODES.LINEAR
     */
    SCALE_MODE: SCALE_MODES.LINEAR,

    /**
     * @public
     * @static
     * @type {Number}
     * @default WRAP_MODES.CLAMP_TO_EDGE
     */
    WRAP_MODE: WRAP_MODES.CLAMP_TO_EDGE,

    /**
     * @public
     * @static
     * @type {Boolean}
     * @default true
     */
    PREMULTIPLY_ALPHA: true,

    /**
     * @public
     * @static
     * @type {Boolean}
     * @default true
     */
    GENERATE_MIPMAP: true,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 1.0
     */
    MEDIA_SPEED: 1.0,

    /**
     * @public
     * @static
     * @type {Boolean}
     * @default false
     */
    MEDIA_LOOP: false,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 0
     */
    MEDIA_TIME: 0,

    /**
     * @public
     * @static
     * @type {Boolean}
     * @default false
     */
    MEDIA_MUTED: false,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 1.0
     */
    VOLUME_MUSIC: 1.0,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 1.0
     */
    VOLUME_SOUND: 1.0,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 1.0
     */
    VOLUME_VIDEO: 1.0,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 5
     */
    QUAD_TREE_MAX_LEVEL: 5,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 20
     */
    QUAD_TREE_MAX_OBJECTS: 20,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 4096
     */
    BATCH_SIZE_SPRITES: 4096, // ~ 262kb

    /**
     * @public
     * @static
     * @type {Number}
     * @default 8192
     */
    BATCH_SIZE_PARTICLES: 8192, // ~ 1.18mb

    /**
     * @public
     * @static
     * @type {Number}
     * @default 65536
     */
    BATCH_SIZE_PRIMITIVES: 65536, // ~ 786kb

    /**
     * @public
     * @static
     * @type {Number}
     * @default 300
     */
    INPUT_THRESHOLD: 300,

    /**
     * @public
     * @static
     * @type {GamepadMapping}
     * @default {GamepadMapping}
     */
    GAMEPAD_MAPPING: new GamepadMapping(),
};
