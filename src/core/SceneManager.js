import Signal from './Signal';

/**
 * @class SceneManager
 */
export default class SceneManager {

    /**
     * @constructor
     * @param {Application} app
     */
    constructor(app) {

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

        /**
         * @private
         * @member {?Scene}
         */
        this._scene = null;

        /**
         * @private
         * @member {Signal}
         */
        this._onChangeScene = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onStartScene = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onUpdateScene = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onStopScene = new Signal();
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
     * @member {Signal}
     */
    get onChangeScene() {
        return this._onChangeScene;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onStartScene() {
        return this._onStartScene;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onUpdateScene() {
        return this._onUpdateScene;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onStopScene() {
        return this._onStopScene;
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
            this._onChangeScene.dispatch(scene);

            if (scene) {
                scene.app = this._app;
                scene.load(this._app.loader);
                scene.init(await this._app.loader.load());

                this._onStartScene.dispatch(scene);
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
        if (this._scene) {
            this._scene.update(delta);
            this._scene.draw(this._app.renderManager);
            this._onUpdateScene.dispatch(this._scene);
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._unloadScene();

        this._onChangeScene.destroy();
        this._onChangeScene = null;

        this._onStartScene.destroy();
        this._onStartScene = null;

        this._onUpdateScene.destroy();
        this._onUpdateScene = null;

        this._onStopScene.destroy();
        this._onStopScene = null;

        this._scene = null;
        this._app = null;
    }

    /**
     * @private
     */
    _unloadScene() {
        if (this._scene) {
            this._onStopScene.dispatch(this._scene);
            this._scene.unload();
            this._scene.destroy();
            this._scene = null;
        }
    }
}
