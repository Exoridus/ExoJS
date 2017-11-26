import EventEmitter from './EventEmitter';
import Clock from './Clock';
import SceneManager from './SceneManager';
import DisplayManager from '../graphics/DisplayManager';
import InputManager from '../input/InputManager';
import ResourceLoader from '../content/ResourceLoader';
import settings from '../settings';

/**
 * @class Application
 * @extends EventEmitter
 */
export default class Application extends EventEmitter {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {String} [options.basePath='']
     * @param {Number} [options.width=800]
     * @param {Number} [options.height=600]
     * @param {?HTMLCanvasElement|?String} [options.canvas=null]
     * @param {?HTMLCanvasElement|?String} [options.canvasParent=null]
     * @param {Color} [options.blendMode=BLEND_MODES.NORMAL]
     * @param {Color} [options.clearColor=Color.White]
     * @param {Boolean} [options.clearBeforeRender=true]
     * @param {Object} [options.contextOptions]
     */
    constructor(options) {
        super();

        const config = Object.assign({}, settings.GAME_CONFIG, options);

        /**
         * @private
         * @member {Object}
         */
        this._config = config;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = (config.canvas instanceof HTMLCanvasElement) ? config.canvas : document.createElement('canvas');

        /**
         * @private
         * @member {HTMLElement}
         */
        this._canvasParent = (typeof config.canvasParent === 'string' ? document.querySelector(config.canvasParent) : config.canvasParent) || null;

        /**
         * @private
         * @member {ResourceLoader}
         */
        this._loader = new ResourceLoader(config);

        /**
         * @private
         * @member {DisplayManager}
         */
        this._displayManager = new DisplayManager(this, config);

        /**
         * @private
         * @member {InputManager}
         */
        this._inputManager = new InputManager(this);

        /**
         * @private
         * @member {SceneManager}
         */
        this._sceneManager = new SceneManager(this);

        /**
         * @private
         * @member {Function}
         */
        this._updateHandler = this.update.bind(this);

        /**
         * @private
         * @member {Number}
         */
        this._updateId = 0;

        /**
         * @private
         * @member {Clock}
         */
        this._delta = new Clock(false);

        /**
         * @private
         * @member {Boolean}
         */
        this._isRunning = false;

        if (this._canvasParent) {
            this._canvasParent.appendChild(this._canvas);
        }
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
     * @member {Object}
     */
    get config() {
        return this._config;
    }

    /**
     * @public
     * @readonly
     * @member {ResourceLoader}
     */
    get loader() {
        return this._loader;
    }

    /**
     * @public
     * @readonly
     * @member {DisplayManager}
     */
    get displayManager() {
        return this._displayManager;
    }

    /**
     * @public
     * @readonly
     * @member {InputManager}
     */
    get inputManager() {
        return this._inputManager;
    }

    /**
     * @public
     * @readonly
     * @member {SceneManager}
     */
    get sceneManager() {
        return this._sceneManager;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get FPS() {
        return (1000 / this._delta.elapsedTime.milliseconds);
    }

    /**
     * @public
     * @chainable
     * @param {Scene} scene
     * @returns {Application}
     */
    start(scene) {
        if (!this._isRunning) {
            this._isRunning = true;
            this._sceneManager.changeScene(scene);
            this._delta.restart();

            this._updateId = requestAnimationFrame(this._updateHandler);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Application}
     */
    stop() {
        if (this._isRunning) {
            this._isRunning = false;
            this._sceneManager.stopScene();
            this._delta.stop();

            cancelAnimationFrame(this._updateId);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Application}
     */
    update() {
        if (this._isRunning) {
            this._inputManager.update();
            this._sceneManager.update(this._delta.elapsedTime);
            this._delta.restart();

            this._updateId = requestAnimationFrame(this._updateHandler);
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        if (this._isRunning) {
            this.stop();
        }

        if (this._canvasParent) {
            this._canvasParent.removeChild(this._canvas);
        }

        this._loader.destroy();
        this._loader = null;

        this._inputManager.destroy();
        this._inputManager = null;

        this._displayManager.destroy();
        this._displayManager = null;

        this._sceneManager.destroy();
        this._sceneManager = null;

        this._delta.destroy();
        this._delta = null;

        this._config = null;
        this._canvas = null;
        this._canvasParent = null;
        this._updateHandler = null;
        this._updateId = null;
        this._isRunning = null;
    }
}
