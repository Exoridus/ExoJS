import EventEmitter from './EventEmitter';
import Clock from './Clock';
import SceneManager from './SceneManager';
import DisplayManager from '../display/DisplayManager';
import AudioManager from '../audio/AudioManager';
import InputManager from '../input/InputManager';
import ResourceLoader from '../content/ResourceLoader';
import settings from '../settings';

/**
 * @class Game
 * @extends {Exo.EventEmitter}
 * @memberof Exo
 */
export default class Game extends EventEmitter {

    /**
     * @constructor
     * @param {Object} [config]
     * @param {String} [config.basePath='']
     * @param {Number} [config.width=800]
     * @param {Number} [config.height=600]
     * @param {Number} [config.soundVolume=1]
     * @param {Number} [config.musicVolume=1]
     * @param {Number} [config.masterVolume=1]
     * @param {?HTMLCanvasElement|?String} [config.canvas=null]
     * @param {?HTMLCanvasElement|?String} [config.canvasParent=null]
     * @param {Exo.Color} [config.clearColor=Exo.Color.White]
     * @param {Boolean} [config.clearBeforeRender=true]
     * @param {Object} [config.contextOptions]
     */
    constructor(config) {
        super();

        /**
         * @private
         * @member {Object}
         */
        this._config = Object.assign({}, settings.GAME_CONFIG, config);

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = (typeof this._config.canvas === 'string' && document.querySelector(this._config.canvas)) || this._config.canvas || document.createElement('canvas');

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvasParent = (typeof this._config.canvasParent === 'string' && document.querySelector(this._config.canvasParent)) || this._config.canvasParent;

        /**
         * @private
         * @member {Exo.ResourceLoader}
         */
        this._loader = new ResourceLoader(this._config.basePath);

        /**
         * @private
         * @member {Exo.DisplayManager}
         */
        this._displayManager = new DisplayManager(this);

        /**
         * @private
         * @member {Exo.AudioManager}
         */
        this._audioManager = new AudioManager(this);

        /**
         * @private
         * @member {Exo.InputManager}
         */
        this._inputManager = new InputManager(this);

        /**
         * @private
         * @member {Exo.SceneManager}
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
         * @member {Exo.Clock}
         */
        this._delta = new Clock(false);

        /**
         * @private
         * @member {Boolean}
         */
        this._running = false;

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
     * @member {Exo.ResourceLoader}
     */
    get loader() {
        return this._loader;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.DisplayManager}
     */
    get displayManager() {
        return this._displayManager;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.AudioManager}
     */
    get audioManager() {
        return this._audioManager;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.InputManager}
     */
    get inputManager() {
        return this._inputManager;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.SceneManager}
     */
    get sceneManager() {
        return this._sceneManager;
    }

    /**
     * @public
     * @param {Exo.Scene} scene
     */
    start(scene) {
        if (this._running) {
            throw new Error('Game instance is already running!');
        }

        this._running = true;

        this.trigger('scene:change', scene);
        this._startGameLoop();
    }

    /**
     * @public
     */
    stop() {
        if (!this._running) {
            throw new Error('Game instance is not running.');
        }

        this._running = false;

        this.trigger('scene:stop');
        this._stopGameLoop();
    }

    /**
     * @private
     */
    destroy() {
        super.destroy();

        this._stopGameLoop();

        if (this._canvasParent) {
            this._canvasParent.removeChild(this._canvas);
        }

        this._loader.destroy();
        this._loader = null;

        this._inputManager.destroy();
        this._inputManager = null;

        this._audioManager.destroy();
        this._audioManager = null;

        this._displayManager.destroy();
        this._displayManager = null;

        this._sceneManager.destroy();
        this._sceneManager = null;

        this._config.destroy();
        this._config = null;

        this._delta.destroy();
        this._delta = null;

        this._canvas = null;
        this._canvasParent = null;
        this._updateHandler = null;
        this._updateId = null;
        this._running = null;
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
