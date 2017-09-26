import EventEmitter from './EventEmitter';
import Clock from './time/Clock';
import SceneManager from './SceneManager';
import DisplayManager from '../display/DisplayManager';
import MediaManager from '../media/MediaManager';
import InputManager from '../input/InputManager';
import ResourceLoader from '../content/ResourceLoader';
import settings from '../settings';

/**
 * @class Application
 * @extends {EventEmitter}
 */
export default class Application extends EventEmitter {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {String} [options.basePath='']
     * @param {Number} [options.width=800]
     * @param {Number} [options.height=600]
     * @param {Number} [options.soundVolume=1]
     * @param {Number} [options.musicVolume=1]
     * @param {Number} [options.masterVolume=1]
     * @param {?HTMLCanvasElement|?String} [options.canvas=null]
     * @param {?HTMLCanvasElement|?String} [options.canvasParent=null]
     * @param {Color} [options.clearColor=Color.White]
     * @param {Boolean} [options.clearBeforeRender=true]
     * @param {Object} [options.contextOptions]
     */
    constructor(options) {
        super();

        /**
         * @private
         * @member {Object}
         */
        this._config = Object.assign({}, settings.GAME_CONFIG, options);

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = this._getElement(this._config.canvas) || document.createElement('canvas');

        /**
         * @private
         * @member {HTMLElement}
         */
        this._canvasParent = this._getElement(this._config.canvasParent);

        /**
         * @private
         * @member {ResourceLoader}
         */
        this._loader = new ResourceLoader(this._config);

        /**
         * @private
         * @member {DisplayManager}
         */
        this._displayManager = new DisplayManager(this, this._config);

        /**
         * @private
         * @member {MediaManager}
         */
        this._mediaManager = new MediaManager(this, this._config);

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
        this._updateHandler = this._updateGameLoop.bind(this);

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
     * @member {MediaManager}
     */
    get mediaManager() {
        return this._mediaManager;
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
     * @param {Scene} scene
     */
    start(scene) {
        if (this._isRunning) {
            throw new Error('Game instance is already running!');
        }

        this._isRunning = true;

        this.trigger('scene:change', scene);
        this._startGameLoop();
    }

    /**
     * @public
     */
    stop() {
        if (!this._isRunning) {
            throw new Error('Game instance is not running.');
        }

        this._isRunning = false;

        this.trigger('scene:stop');
        this._stopGameLoop();
    }

    /**
     * @private
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

        this._mediaManager.destroy();
        this._mediaManager = null;

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

    /**
     * @private
     * @param {?String|?HTMLElement} element
     * @returns {?HTMLElement|?HTMLCanvasElement}
     */
    _getElement(element) {
        if (!element) {
            return null;
        }

        if (element instanceof HTMLElement) {
            return element;
        }

        return (typeof element === 'string' && document.querySelector(element)) || null;
    }

    /**
     * @private
     */
    _startGameLoop() {
        this._updateId = requestAnimationFrame(this._updateHandler);
        this._delta.restart();
    }

    /**
     * @private
     */
    _updateGameLoop() {
        this._inputManager.update();
        this._sceneManager.update(this._delta.getElapsedTime());
        this._delta.restart();

        this._updateId = requestAnimationFrame(this._updateHandler);
    }

    /**
     * @private
     */
    _stopGameLoop() {
        cancelAnimationFrame(this._updateId);
        this._delta.stop();
    }
}
