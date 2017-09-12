/**
 * @class SceneManager
 */
export default class SceneManager {

    /**
     * @constructor
     * @param {Game} game
     */
    constructor(game) {

        /**
         * @private
         * @member {Game}
         */
        this._game = game;

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

        game.on('scene:change', this.onSceneChange, this)
            .on('scene:start', this.onSceneStart, this)
            .on('scene:stop', this.onSceneStop, this);
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
     * @private
     * @param {Scene} scene
     */
    onSceneChange(scene) {
        this._game.trigger('scene:stop');

        this._currentScene = scene;
        this._currentScene.game = this._game;
        this._currentScene.load(this._game.loader);
    }

    /**
     * @private
     */
    onSceneStart() {
        if (!this._currentScene) {
            throw new Error('No scene was specified, use scene:change!');
        }

        if (this._sceneActive) {
            throw new Error('Scene can only be started once!');
        }

        this._sceneActive = true;
        this._currentScene.init();
    }

    /**
     * @private
     */
    onSceneStop() {
        if (!this._currentScene) {
            return;
        }

        if (this._sceneActive) {
            this._currentScene.unload();
            this._sceneActive = false;
        }

        this._currentScene.destroy();
        this._currentScene = null;

        this._game.loader.off();
    }

    /**
     * @public
     */
    destroy() {
        this._game.trigger('scene:stop')
            .off('scene:change', this.onSceneChange, this)
            .off('scene:start', this.onSceneStart, this)
            .off('scene:stop', this.onSceneStop, this);

        this._game = null;
    }
}
