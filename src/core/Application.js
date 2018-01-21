import Clock from './time/Clock';
import SceneManager from './SceneManager';
import RenderManager from '../rendering/RenderManager';
import InputManager from '../input/InputManager';
import Loader from '../resources/Loader';
import settings from '../settings';
import Signal from './Signal';

/**
 * @class Application
 */
export default class Application {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {String} [options.resourcePath='']
     * @param {Number} [options.width=800]
     * @param {Number} [options.height=600]
     * @param {?HTMLCanvasElement} [options.canvas=null]
     * @param {?HTMLElement} [options.canvasParent=null]
     * @param {Color} [options.clearColor=Color.Black]
     * @param {?Database} [options.database=null]
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
         * @member {HTMLCanvasElement}
         */
        this._canvas = (config.canvas instanceof HTMLCanvasElement) ? config.canvas : document.createElement('canvas');

        /**
         * @private
         * @member {HTMLElement}
         */
        this._canvasParent = (config.canvasParent instanceof HTMLElement) ? config.canvasParent : null;

        /**
         * @private
         * @member {Loader}
         */
        this._loader = new Loader({
            resourcePath: config.resourcePath,
            database: config.database,
        });

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
         * @member {Number}
         */
        this._updateId = 0;

        /**
         * @private
         * @member {Clock}
         */
        this._delta = new Clock();

        /**
         * @private
         * @member {Boolean}
         */
        this._running = false;

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
     * @member {Boolean}
     */
    get running() {
        return this._running;
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
     * @readonly
     * @member {Number}
     */
    get FPS() {
        return (1000 / this._delta.elapsedMilliseconds);
    }

    /**
     * @public
     * @chainable
     * @param {Scene} scene
     * @returns {Promise<Application>}
     */
    async start(scene) {
        if (!this._running) {
            await this._sceneManager.setScene(scene);
            this._updateId = requestAnimationFrame(this._updateHandler);
            this._delta.restart();
            this._running = true;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Application}
     */
    update() {
        if (this._running) {
            this._inputManager.update();
            this._sceneManager.update(this._delta.elapsedTime);
            this._updateId = requestAnimationFrame(this._updateHandler);
            this._delta.restart();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Application}
     */
    stop() {
        if (this._running) {
            cancelAnimationFrame(this._updateId);

            this._sceneManager.setScene(null);
            this._delta.stop();
            this._running = false;
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

        this._delta.destroy();
        this._delta = null;

        this._onResize.destroy();
        this._onResize = null;

        this._config = null;
        this._canvas = null;
        this._canvasParent = null;
        this._updateHandler = null;
        this._updateId = null;
        this._running = null;
    }
}
