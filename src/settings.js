import { SCALE_MODE, WRAP_MODE } from './const';
import Color from './core/Color';
import DefaultGamepadMapping from './input/gamepad/DefaultGamepadMapping';

export default {

    /**
     * @static
     * @type {Object}
     * @property {String} basePath=''
     * @property {Number} width=800
     * @property {Number} height=600
     * @property {Number} soundVolume=1
     * @property {Number} musicVolume=1
     * @property {Number} masterVolume=1
     * @property {Number} videoVolume=1
     * @property {?HTMLCanvasElement|?String} canvas=null
     * @property {?HTMLCanvasElement|?String} canvasParent=null
     * @property {Color} clearColor=Color.White
     * @property {Boolean} clearBeforeRender=true
     * @property {Object} contextOptions
     * @property {Boolean} contextOptions.alpha=false
     * @property {Boolean} contextOptions.antialias=false
     * @property {Boolean} contextOptions.premultipliedAlpha=false
     * @property {Boolean} contextOptions.preserveDrawingBuffer=false
     * @property {Boolean} contextOptions.stencil=false
     * @property {Boolean} contextOptions.depth=false
     */
    GAME_CONFIG: {
        basePath: '',
        width: 800,
        height: 600,
        soundVolume: 1,
        musicVolume: 1,
        masterVolume: 1,
        videoVolume: 1,
        canvas: null,
        canvasParent: null,
        clearColor: Color.White,
        clearBeforeRender: true,
        contextOptions: {
            alpha: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            stencil: false,
            depth: false,
        },
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
     * @type {Object}
     */
    TEXT_STYLE: {
        align: 'left',
        fill: 'black',
        stroke: 'black',
        strokeThickness: 0,
        fontSize: 20,
        fontWeight: 'bold',
        fontFamily: 'Arial',
        wordWrap: false,
        wordWrapWidth: 100,
        baseline: 'alphabetic',
        lineJoin: 'miter',
        miterLimit: 10,
        padding: 0,
    },

    /**
     * @public
     * @static
     * @type {String}
     * @default 'image/png'
     */
    MIME_TYPE_IMAGE: 'image/png',

    /**
     * @public
     * @static
     * @type {String}
     * @default 'audio/ogg'
     */
    MIME_TYPE_AUDIO: 'audio/ogg',

    /**
     * @public
     * @static
     * @type {String}
     * @default 'video/ogg'
     */
    MIME_TYPE_VIDEO: 'video/ogg',

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
     * @default 10
     */
    QUAD_TREE_MAX_ENTITIES: 10,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 2500
     */
    SPRITE_BATCH_SIZE: 2500,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 5000
     */
    PARTICLE_BATCH_SIZE: 5000,

    /**
     * @public
     * @static
     * @type {Number}
     * @default 300
     */
    TRIGGER_THRESHOLD: 300,

    /**
     * @public
     * @static
     * @type {GamepadMapping}
     * @default {DefaultGamepadMapping}
     */
    GAMEPAD_MAPPING: new DefaultGamepadMapping(),
};
