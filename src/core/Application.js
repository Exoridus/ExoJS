import Clock from './Clock';
import SceneManager from './SceneManager';
import RenderManager from '../display/RenderManager';
import InputManager from '../input/InputManager';
import Loader from '../content/Loader';
import Signal from './Signal';
import { APP_STATUS } from '../const';
import Screen from '../display/Screen';

/**
 * @class Application
 */
export default class Application {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Screen} [options.screen=new Screen()]
     * @param {Loader} [options.loader=new Loader()]
     */
    constructor({
        screen = new Screen(),
        loader = new Loader(),
    } = {}) {

        /**
         * @private
         * @member {Screen}
         */
        this._screen = screen;

        /**
         * @private
         * @member {Loader}
         */
        this._loader = loader;

        /**
         * @private
         * @member {RenderManager}
         */
        this._renderManager = new RenderManager(screen);

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
         * @member {Number}
         */
        this._status = APP_STATUS.STOPPED;
    }

    /**
     * @public
     * @readonly
     * @member {Screen}
     */
    get screen() {
        return this._screen;
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
     */
    destroy() {
        this.stop();

        this._screen.destroy();
        this._screen = null;

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

        this._updateHandler = null;
        this._frameRequest = null;
        this._frameCount = null;
        this._status = null;
    }
}
