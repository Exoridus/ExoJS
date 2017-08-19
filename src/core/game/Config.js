import Color from '../Color';

/**
 * @class Config
 * @memberof Exo
 */
export default class Config {

    /**
     * @constructor
     * @param {Object} settings
     */
    constructor(settings) {
        const config = Object.assign({
            basepath: '',
            width: 1280,
            height: 720,
            soundVolume: 1.0,
            musicVolume: 1.0,
            masterVolume: 1.0,
            canvas: null,
            canvasParent: null,
            clearColor: Color.Black,
            clearBeforeRender: true,
            contextOptions: {
                alpha: false,
                antialias: false,
                premultipliedAlpha: false,
                preserveDrawingBuffer: false,
                stencil: false,
                depth: false,
            },
        }, settings);

        /**
         * @private
         * @member {String}
         */
        this._basePath = config.basePath;

        /**
         * @private
         * @member {Number}
         */
        this._width = config.width;

        /**
         * @private
         * @member {Number}
         */
        this._height = config.height;

        /**
         * @private
         * @member {Number}
         */
        this._soundVolume = config.soundVolume;

        /**
         * @private
         * @member {Number}
         */
        this._musicVolume = config.musicVolume;

        /**
         * @private
         * @member {Number}
         */
        this._masterVolume = config.masterVolume;

        /**
         * @private
         * @member {HTMLElement}
         */
        this._canvasParent = (typeof config.canvasParent === 'string')
            ? document.querySelector(config.canvasParent)
            : config.canvasParent;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = (typeof config.canvas === 'string') ? document.querySelector(config.canvas) : config.canvas;

        /**
         * @private
         * @member {Exo.Color}
         */
        this._clearColor = config.clearColor;

        /**
         * @private
         * @member {Boolean}
         */
        this._clearBeforeRender = config.clearBeforeRender;

        /**
         * @private
         * @member {Object}
         */
        this._contextOptions = config.contextOptions;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get basePath() {
        return this._basePath;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get width() {
        return this._width;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get height() {
        return this._height;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get soundVolume() {
        return this._soundVolume;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get musicVolume() {
        return this._musicVolume;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get masterVolume() {
        return this._masterVolume;
    }

    /**
     * @public
     * @readonly
     * @member {HTMLElement}
     */
    get canvasParent() {
        return this._canvasParent;
    }

    /**
     * @public
     * @readonly
     * @member {HTMLCanvasElement}
     */
    get canvas() {
        return this._canvas;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Color}
     */
    get clearColor() {
        return this._clearColor;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get clearBeforeRender() {
        return this._clearBeforeRender;
    }
    
    /**
     * @public
     * @readonly
     * @member {Object}
     */
    get contextOptions() {
        return this._contextOptions;
    }

    /**
     * @public
     */
    destroy() {
        this._width = null;
        this._height = null;
        this._soundVolume = null;
        this._musicVolume = null;
        this._masterVolume = null;
        this._canvasParent = null;
        this._canvas = null;
        this._clearColor = null;
        this._contextOptions = null;
    }
}
