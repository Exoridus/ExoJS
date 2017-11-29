import { BLEND_MODE, SCALE_MODE, WRAP_MODE } from './const';
import Color from './core/Color';
import DefaultGamepadMapping from './input/gamepad/DefaultGamepadMapping';

export default {

    /**
     * @static
     * @type {Object}
     * @name APP_OPTIONS
     * @property {String} assetsPath=''
     * @property {Number} width=800
     * @property {Number} height=600
     * @property {?HTMLCanvasElement} canvas=null
     * @property {?HTMLElement} canvasParent=null
     * @property {Color} clearColor=Color.Black
     * @property {?Database} database=null
     */
    APP_OPTIONS: {
        assetsPath: '',
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
     * @type {Number}
     * @default WRAP_MODE.CLAMP_TO_EDGE
     */
    WRAP_MODE: WRAP_MODE.CLAMP_TO_EDGE,

    /**
     * @public
     * @static
     * @type {Number}
     * @default SCALE_MODE.LINEAR
     */
    SCALE_MODE: SCALE_MODE.LINEAR,

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
     * @default 2500
     */
    BATCH_SIZE_SPRITES: 2500, // ~ 160kb

    /**
     * @public
     * @static
     * @type {Number}
     * @default 5000
     */
    BATCH_SIZE_PARTICLES: 5000, // ~ 800kb

    /**
     * @public
     * @static
     * @type {Number}
     * @default 300
     */
    THRESHOLD_INPUT: 300,

    /**
     * @public
     * @static
     * @type {GamepadMapping}
     * @default {DefaultGamepadMapping}
     */
    GAMEPAD_MAPPING: new DefaultGamepadMapping(),
};
