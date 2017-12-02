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
        this._currentScene = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._sceneActive = false;
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
        this._currentScene.draw(this._app.renderManager);
    }

    /**
     * @public
     */
    startScene() {
        if (!this._currentScene) {
            throw new Error('No scene was specified, use changeScene()!');
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

        this._app.loader.load(() => this.startScene());
    }

    /**
     * @public
     */
    destroy() {
        this.stopScene();

        this._currentScene = null;
        this._sceneActive = null;
        this._app = null;
    }
}
