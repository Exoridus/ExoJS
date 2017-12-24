/**
 * @inner
 * @type {Object<String, Number>}
 */
import EventEmitter from './EventEmitter';

/**
 * @inner
 * @type {Object<String, Number>}
 */
const STATUS = {
    NONE: 0,
    LOADING: 1,
    RUNNING: 2,
};

/**
 * @class SceneManager
 * @extends EventEmitter
 */
export default class SceneManager extends EventEmitter {

    /**
     * @constructor
     * @param {Application} app
     */
    constructor(app) {
        super();

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

        /**
         * @private
         * @member {Number}
         */
        this._status = STATUS.NONE;

        /**
         * @private
         * @member {?Scene}
         */
        this._scene = null;
    }

    /**
     * @public
     * @member {?Scene}
     */
    get scene() {
        return this._scene;
    }

    set scene(scene) {
        this.setScene(scene);
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get sceneLoading() {
        return (this._status === STATUS.LOADING);
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get sceneRunning() {
        return (this._status === STATUS.RUNNING);
    }

    /**
     * @public
     * @chainable
     * @param {?Scene} scene
     * @returns {Promise<SceneManager>}
     */
    async setScene(scene) {
        if (scene !== this._scene) {
            this._unloadScene();

            this._scene = scene;

            if (scene) {
                this._status = STATUS.LOADING;

                this.trigger('scene:load');

                scene.app = this._app;
                scene.load(this._app.loader);
                scene.init(await this._app.loader.load());

                this._status = STATUS.RUNNING;

                this.trigger('scene:start');
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Time} delta
     * @returns {SceneManager}
     */
    update(delta) {
        if (this.sceneRunning) {
            this._scene.update(delta);
            this._scene.draw(this._app.renderManager);
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        this._unloadScene();

        this._scene = null;
        this._status = null;
        this._app = null;
    }

    /**
     * @private
     */
    _unloadScene() {
        if (this._scene) {
            if (this.sceneRunning) {
                this._scene.unload();

                this.trigger('scene:unloaded');
            }

            this._scene.destroy();
            this._scene = null;
            this._status = STATUS.NONE;

            this.trigger('scene:destroyed');
        }
    }
}
