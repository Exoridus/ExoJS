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
        this._isSceneActive = false;

        app
            .on('scene:change', this.onSceneChange, this)
            .on('scene:start', this.onSceneStart, this)
            .on('scene:stop', this.onSceneStop, this);
    }

    /**
     * @public
     * @param {Time} delta
     */
    update(delta) {
        if (!this._currentScene || !this._isSceneActive) {
            return;
        }

        const displayManager = this._app.displayManager;

        this._currentScene.update(delta);

        displayManager.begin();

        for (const node of this._currentScene.nodes) {
            displayManager.render(node);
        }

        displayManager.end();
    }

    /**
     * @private
     * @param {Scene} scene
     */
    onSceneChange(scene) {
        this._app.trigger('scene:stop');

        this._currentScene = scene;
        this._currentScene.app = this._app;
        this._currentScene.load(this._app.loader);
    }

    /**
     * @private
     */
    onSceneStart() {
        if (!this._currentScene) {
            throw new Error('No scene was specified, use scene:change!');
        }

        if (this._isSceneActive) {
            throw new Error('Scene can only be started once!');
        }

        this._isSceneActive = true;
        this._currentScene.init();
    }

    /**
     * @private
     */
    onSceneStop() {
        if (!this._currentScene) {
            return;
        }

        if (this._isSceneActive) {
            this._currentScene.unload();
            this._isSceneActive = false;
        }

        this._currentScene.destroy();
        this._currentScene = null;

        this._app.loader.off();
    }

    /**
     * @public
     */
    destroy() {
        this._app.trigger('scene:stop')
            .off('scene:change', this.onSceneChange, this)
            .off('scene:start', this.onSceneStart, this)
            .off('scene:stop', this.onSceneStop, this);

        this._app = null;
    }
}
