import {SCALE_MODE, WRAP_MODE, TEXT_GRADIENT} from './const';
import Color from './core/Color';

export default {

    /**
     * @static
     * @constant
     * @memberof Exo.settings
     * @type {Object}
     * @property {String} basePath=''
     * @property {Number} width=800
     * @property {Number} height=600
     * @property {Number} soundVolume=1
     * @property {Number} musicVolume=1
     * @property {Number} masterVolume=1
     * @property {?HTMLCanvasElement|?String} canvas=null
     * @property {?HTMLCanvasElement|?String} canvasParent=null
     * @property {Exo.Color} clearColor=Exo.Color.White
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
        masterVolume:  1,
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
     * @static
     * @memberof Exo.settings
     * @type {Number}
     * @default Exo.WRAP_MODE.CLAMP_TO_EDGE
     */
    WRAP_MODE: WRAP_MODE.CLAMP_TO_EDGE,

    /**
     * @static
     * @memberof Exo.settings
     * @type {Number}
     * @default Exo.SCALE_MODE.LINEAR
     */
    SCALE_MODE: SCALE_MODE.LINEAR,

    /**
     * @static
     * @memberof Exo.settings
     * @type {Boolean}
     * @default true
     */
    PREMULTIPLY_ALPHA: true,

    /**
     * @static
     * @memberof Exo.settings
     * @type {Object}
     */
    TEXT_STYLE: {
        align: 'left',
        color: 'black',
        outlineColor: 'black',
        outlineWidth: 0,
        fontSize: 20,
        fontWeight: 'bold',
        fontFamily: 'Arial',
        wordWrap: false,
        wordWrapWidth: 100,
        baseline: 'top',
    },
};
