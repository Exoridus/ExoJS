/**
 * @class SceneManager
 */
export default class SceneManager {

    /**
     * @constructs SceneManager
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
        this._currentScene = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._sceneActive = false;

        app
            .on('scene:change', this.changeScene, this)
            .on('scene:start', this.startScene, this)
            .on('scene:stop', this.stopScene, this);
    }

    /**
     * @public
     * @param {Time} delta
     */
    update(delta) {
        if (!this._currentScene || !this._sceneActive) {
            return;
        }

        this._currentScene.update(delta);
    }

    /**
     * @public
     */
    startScene() {
        if (!this._currentScene) {
            throw new Error('No scene was specified, use scene:change!');
        }

        if (this._sceneActive) {
            throw new Error('Scene can only be started once!');
        }

        this._sceneActive = true;
        this._currentScene.init(this._app.loader.resources);
    }

    /**
     * @public
     */
    stopScene() {
        if (!this._currentScene) {
            return;
        }

        if (this._sceneActive) {
            this._currentScene.unload();
            this._sceneActive = false;
        }

        this._currentScene.destroy();
        this._currentScene = null;

        this._app.loader.off();
    }

    /**
     * @public
     * @param {Scene} scene
     */
    changeScene(scene) {
        this.stopScene();

        this._currentScene = scene;
        this._currentScene.app = this._app;
        this._currentScene.load(this._app.loader);
    }

    /**
     * @public
     */
    destroy() {
        this._app.trigger('scene:stop')
            .off('scene:change', this.changeScene, this)
            .off('scene:start', this.startScene, this)
            .off('scene:stop', this.stopScene, this);

        this._app = null;
    }
}
