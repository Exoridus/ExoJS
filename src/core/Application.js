import Clock from './time/Clock';
import SceneManager from './SceneManager';
import RenderManager from '../rendering/RenderManager';
import InputManager from '../input/InputManager';
import Loader from '../resources/Loader';
import settings from '../settings';
import Signal from './Signal';
import { APP_STATUS } from '../const/core';

/**
 * @class Application
 */
export default class Application {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Number} [options.width]
     * @param {Number} [options.height]
     * @param {Color} [options.clearColor]
     * @param {?HTMLElement} [options.canvasParent]
     * @param {?HTMLCanvasElement} [options.canvas]
     * @param {Object} [options.context]
     * @param {Boolean} [options.context.alpha]
     * @param {Boolean} [options.context.antialias]
     * @param {Boolean} [options.context.premultipliedAlpha]
     * @param {Boolean} [options.context.preserveDrawingBuffer]
     * @param {Boolean} [options.context.stencil]
     * @param {Boolean} [options.context.depth]
     * @param {Object} [options.loader]
     * @param {?Database} [options.loader.database]
     * @param {String} [options.loader.resourcePath]
     * @param {String} [options.loader.method]
     * @param {String} [options.loader.mode]
     * @param {String} [options.loader.cache]
     */
    constructor(options) {
        const config = Object.assign({}, settings.APP_OPTIONS, options);

        /**
         * @private
         * @member {Object}
         */
        this._config = config;

        /**
         * @private
         * @member {HTMLElement}
         */
        this._canvasParent = (config.canvasParent instanceof HTMLElement) ? config.canvasParent : null;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = (config.canvas instanceof HTMLCanvasElement) ? config.canvas : document.createElement('canvas');

        /**
         * @private
         * @member {Number}
         */
        this._status = APP_STATUS.STOPPED;

        /**
         * @private
         * @member {Loader}
         */
        this._loader = new Loader(config.loader);

        /**
         * @private
         * @member {RenderManager}
         */
        this._renderManager = new RenderManager(this);

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
         * @member {Clock}
         */
        this._startupClock = new Clock({ autoStart: true });

        /**
         * @private
         * @member {Clock}
         */
        this._activeClock = new Clock();

        /**
         * @private
         * @member {Clock}
         */
        this._frameClock = new Clock();

        /**
         * @private
         * @member {Number}
         */
        this._frameCount = 0;

        /**
         * @private
         * @member {Number}
         */
        this._frameRequest = 0;

        /**
         * @private
         * @member {Signal}
         */
        this._onResize = new Signal();

        if (this._canvasParent) {
            this._canvasParent.appendChild(this._canvas);
        }
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
     * @member {HTMLCanvasElement}
     */
    get canvas() {
        return this._canvas;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get status() {
        return this._status;
    }

    /**
     * @public
     * @readonly
     * @member {Loader}
     */
    get loader() {
        return this._loader;
    }

    /**
     * @public
     * @readonly
     * @member {RenderManager}
     */
    get renderManager() {
        return this._renderManager;
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
     * @member {Time}
     */
    get startupTime() {
        return this._startupClock.elapsedTime;
    }

    /**
     * @public
     * @readonly
     * @member {Time}
     */
    get activeTime() {
        return this._activeClock.elapsedTime;
    }

    /**
     * @public
     * @readonly
     * @member {Time}
     */
    get frameTime() {
        return this._frameClock.elapsedTime;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get frameCount() {
        return this._frameCount;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onResize() {
        return this._onResize;
    }

    /**
     * @public
     * @chainable
     * @param {Scene} scene
     * @returns {Promise<Application>}
     */
    async start(scene) {
        if (this._status === APP_STATUS.STOPPED) {
            this._status = APP_STATUS.LOADING;
            await this._sceneManager.setScene(scene);
            this._frameRequest = requestAnimationFrame(this._updateHandler);
            this._frameClock.restart();
            this._activeClock.start();
            this._status = APP_STATUS.RUNNING;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Application}
     */
    update() {
        if (this._status === APP_STATUS.RUNNING) {
            this._inputManager.update();
            this._sceneManager.update(this._frameClock.elapsedTime);
            this._frameRequest = requestAnimationFrame(this._updateHandler);
            this._frameClock.restart();
            this._frameCount++;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Application}
     */
    stop() {
        if (this._status === APP_STATUS.RUNNING) {
            this._status = APP_STATUS.HALTING;
            cancelAnimationFrame(this._frameRequest);
            this._sceneManager.setScene(null);
            this._activeClock.stop();
            this._frameClock.stop();
            this._status = APP_STATUS.STOPPED;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} height
     * @returns {Application}
     */
    resize(width, height) {
        this._renderManager.resize(width, height);
        this._onResize.dispatch(width, height, this);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.stop();

        if (this._canvasParent) {
            this._canvasParent.removeChild(this._canvas);
        }

        this._loader.destroy();
        this._loader = null;

        this._inputManager.destroy();
        this._inputManager = null;

        this._renderManager.destroy();
        this._renderManager = null;

        this._sceneManager.destroy();
        this._sceneManager = null;

        this._startupClock.destroy();
        this._startupClock = null;

        this._activeClock.destroy();
        this._activeClock = null;

        this._frameClock.destroy();
        this._frameClock = null;

        this._onResize.destroy();
        this._onResize = null;

        this._config = null;
        this._canvas = null;
        this._canvasParent = null;
        this._updateHandler = null;
        this._frameRequest = null;
        this._frameCount = null;
        this._status = null;
    }
}
